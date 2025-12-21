import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import * as FormData from 'form-data';
import { SlipHistory, SlipHistoryDocument, SlipStatus } from '../database/schemas/slip-history.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { RedisService } from '../redis/redis.service';

export interface SlipVerificationResult {
  status: 'success' | 'duplicate' | 'error' | 'not_found';
  message: string;
  data?: {
    transRef: string;
    amount: number;
    amountFormatted: string;
    date: string;
    time: string;
    senderName: string;
    senderBank: string;
    receiverName: string;
    receiverBank: string;
    receiverAccountNumber: string;
    [key: string]: any;
  };
}

@Injectable()
export class SlipVerificationService {
  private readonly logger = new Logger(SlipVerificationService.name);

  constructor(
    @InjectModel(SlipHistory.name) private slipHistoryModel: Model<SlipHistoryDocument>,
    private systemSettingsService: SystemSettingsService,
    private redisService: RedisService,
  ) {}

  async verifySlip(
    imageData: Buffer,
    lineAccountId: string,
    lineUserId: string,
    messageId?: string,
  ): Promise<SlipVerificationResult> {
    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings?.slipApiKey;

    if (!apiKey) {
      return {
        status: 'error',
        message: 'ยังไม่ได้ตั้งค่า API Key สำหรับตรวจสอบสลิป',
      };
    }

    try {
      const result = await this.verifyWithThunderAPI(imageData, apiKey);

      // Save to history
      await this.saveSlipHistory(lineAccountId, lineUserId, messageId, result);

      return result;
    } catch (error) {
      this.logger.error('Slip verification error:', error);
      return {
        status: 'error',
        message: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป',
      };
    }
  }

  private async verifyWithThunderAPI(
    imageData: Buffer,
    apiKey: string,
  ): Promise<SlipVerificationResult> {
    const endpoint = 'https://api.thunder.in.th/v1/verify';

    const formData = new FormData();
    formData.append('file', imageData, {
      filename: 'slip.jpg',
      contentType: 'image/jpeg',
    });
    formData.append('checkDuplicate', 'true');

    try {
      const response = await axios.post(endpoint, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
      });

      const data = response.data;

      if (data.status === 200) {
        const slipData = data.data;
        const senderAccount = slipData.sender?.account || {};
        const receiverAccount = slipData.receiver?.account || {};
        const senderBank = slipData.sender?.bank || {};
        const receiverBank = slipData.receiver?.bank || {};

        return {
          status: 'success',
          message: 'ตรวจสอบสลิปสำเร็จ',
          data: {
            transRef: slipData.transRef || '',
            amount: parseFloat(slipData.amount?.amount || 0),
            amountFormatted: this.formatAmount(slipData.amount?.amount || 0),
            date: this.formatDate(slipData.date),
            time: this.formatTime(slipData.date),
            senderName: senderAccount.name?.th || senderAccount.name?.en || '',
            senderBank: senderBank.short || senderBank.name || '',
            receiverName: receiverAccount.name?.th || receiverAccount.name?.en || '',
            receiverBank: receiverBank.short || receiverBank.name || '',
            receiverAccountNumber: receiverAccount.bank?.account || '',
            rawData: slipData,
          },
        };
      } else if (data.status === 409) {
        return {
          status: 'duplicate',
          message: 'สลิปนี้เคยถูกใช้แล้ว',
          data: data.data,
        };
      } else {
        return {
          status: 'error',
          message: data.message || 'ไม่สามารถตรวจสอบสลิปได้',
        };
      }
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 400) {
          if (data.message === 'duplicate_slip') {
            return {
              status: 'duplicate',
              message: 'สลิปนี้เคยถูกตรวจสอบแล้ว',
            };
          } else if (data.message === 'invalid_payload') {
            return {
              status: 'error',
              message: 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปให้ชัดเจน',
            };
          }
        } else if (status === 401 || status === 403) {
          return {
            status: 'error',
            message: 'API Key ไม่ถูกต้องหรือหมดอายุ',
          };
        } else if (status === 404) {
          return {
            status: 'not_found',
            message: 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
          };
        }
      }

      throw error;
    }
  }

  async testConnection(apiKey: string): Promise<{
    status: string;
    message: string;
    remainingQuota?: number;
    expiresAt?: string;
  }> {
    try {
      const response = await axios.get('https://api.thunder.in.th/v1/me', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      });

      if (response.status === 200) {
        const data = response.data.data;
        return {
          status: 'success',
          message: 'เชื่อมต่อ Thunder API สำเร็จ',
          remainingQuota: data.remainingQuota,
          expiresAt: data.expiredAt,
        };
      }

      return {
        status: 'error',
        message: 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: error.response?.data?.message || 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    }
  }

  private async saveSlipHistory(
    lineAccountId: string,
    lineUserId: string,
    messageId: string | undefined,
    result: SlipVerificationResult,
  ): Promise<void> {
    await this.slipHistoryModel.create({
      lineAccountId,
      lineUserId,
      messageId,
      status: result.status as SlipStatus,
      transRef: result.data?.transRef,
      amount: result.data?.amount,
      senderName: result.data?.senderName,
      senderBank: result.data?.senderBank,
      receiverName: result.data?.receiverName,
      receiverBank: result.data?.receiverBank,
      receiverAccountNumber: result.data?.receiverAccountNumber,
      rawData: result.data,
      errorMessage: result.status === 'error' ? result.message : undefined,
      verifiedBy: 'Thunder API',
    });
  }

  formatSlipResponse(result: SlipVerificationResult): any {
    if (result.status === 'success' && result.data) {
      return {
        type: 'flex',
        altText: 'ผลการตรวจสอบสลิป',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '✅ ตรวจสอบสลิปสำเร็จ',
                weight: 'bold',
                size: 'lg',
                color: '#00C851',
              },
              {
                type: 'separator',
                margin: 'md',
              },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'md',
                spacing: 'sm',
                contents: [
                  this.createInfoRow('จำนวนเงิน', result.data.amountFormatted),
                  this.createInfoRow('วันที่', result.data.date),
                  this.createInfoRow('เวลา', result.data.time),
                  this.createInfoRow('ผู้โอน', result.data.senderName),
                  this.createInfoRow('ธนาคารผู้โอน', result.data.senderBank),
                  this.createInfoRow('ผู้รับ', result.data.receiverName),
                  this.createInfoRow('ธนาคารผู้รับ', result.data.receiverBank),
                  this.createInfoRow('เลขอ้างอิง', result.data.transRef),
                ],
              },
            ],
          },
        },
      };
    } else if (result.status === 'duplicate') {
      return {
        type: 'text',
        text: '⚠️ สลิปนี้เคยถูกใช้แล้ว',
      };
    } else {
      return {
        type: 'text',
        text: `❌ ${result.message}`,
      };
    }
  }

  private createInfoRow(label: string, value: string): any {
    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: label,
          size: 'sm',
          color: '#666666',
          flex: 2,
        },
        {
          type: 'text',
          text: value || '-',
          size: 'sm',
          color: '#333333',
          flex: 3,
          wrap: true,
        },
      ],
    };
  }

  private formatAmount(amount: any): string {
    const num = parseFloat(amount) || 0;
    return `฿${num.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`;
  }

  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('th-TH');
    } catch {
      return isoDate || '-';
    }
  }

  private formatTime(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleTimeString('th-TH');
    } catch {
      return '-';
    }
  }

  async getSlipHistory(
    lineAccountId: string,
    limit = 50,
  ): Promise<SlipHistoryDocument[]> {
    return this.slipHistoryModel
      .find({ lineAccountId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
