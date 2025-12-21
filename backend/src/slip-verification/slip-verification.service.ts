import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import * as FormData from 'form-data';
import { SlipHistory, SlipHistoryDocument, SlipStatus } from '../database/schemas/slip-history.schema';
import {
  QuotaReservation,
  QuotaReservationDocument,
  QuotaReservationStatus,
} from '../database/schemas/quota-reservation.schema';
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
    @InjectModel(QuotaReservation.name)
    private quotaReservationModel: Model<QuotaReservationDocument>,
    private systemSettingsService: SystemSettingsService,
    private redisService: RedisService,
  ) {}

  validateSlipImage(imageData: Buffer): { ok: boolean; message?: string } {
    if (!imageData || imageData.length === 0) {
      return { ok: false, message: 'ไม่พบข้อมูลรูปภาพ' };
    }

    // Basic size limit (LINE content can be large; keep conservative)
    const maxBytes = 10 * 1024 * 1024; // 10 MB
    if (imageData.length > maxBytes) {
      return { ok: false, message: 'ไฟล์รูปภาพมีขนาดใหญ่เกินไป กรุณาส่งรูปที่เล็กลง' };
    }

    // Simple magic-number check: JPEG / PNG
    const isJpeg = imageData.length > 3 && imageData[0] === 0xff && imageData[1] === 0xd8 && imageData[2] === 0xff;
    const isPng =
      imageData.length > 8 &&
      imageData[0] === 0x89 &&
      imageData[1] === 0x50 &&
      imageData[2] === 0x4e &&
      imageData[3] === 0x47 &&
      imageData[4] === 0x0d &&
      imageData[5] === 0x0a &&
      imageData[6] === 0x1a &&
      imageData[7] === 0x0a;

    if (!isJpeg && !isPng) {
      return { ok: false, message: 'ไฟล์ที่ส่งมาไม่ใช่รูปภาพที่รองรับ (รองรับ JPG/PNG)' };
    }

    return { ok: true };
  }

  async createReservation(params: {
    ownerId: string;
    subscriptionId: string;
    lineAccountId: string;
    lineUserId: string;
    messageId?: string;
    amount?: number;
  }): Promise<QuotaReservationDocument> {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    return this.quotaReservationModel.create({
      ownerId: params.ownerId,
      subscriptionId: params.subscriptionId,
      lineAccountId: params.lineAccountId,
      lineUserId: params.lineUserId,
      messageId: params.messageId,
      amount: params.amount ?? 1,
      status: QuotaReservationStatus.RESERVED,
      expiresAt,
    });
  }

  async confirmReservation(reservationId: string): Promise<void> {
    await this.quotaReservationModel.updateOne(
      { _id: reservationId },
      { status: QuotaReservationStatus.CONFIRMED, confirmedAt: new Date() },
    );
  }

  async rollbackReservation(reservationId: string, reason?: string): Promise<void> {
    await this.quotaReservationModel.updateOne(
      { _id: reservationId },
      { status: QuotaReservationStatus.ROLLED_BACK, rolledBackAt: new Date(), reason },
    );
  }

  async formatQuotaExceededResponse(): Promise<any> {
    const settings = await this.systemSettingsService.getSettings();
    const responseType = settings?.quotaExceededResponseType || 'text';
    const message =
      settings?.quotaExceededMessage ||
      '⚠️ โควต้าการตรวจสอบสลิปของร้านค้านี้หมดแล้ว กรุณาติดต่อผู้ดูแลหรือเติมแพ็คเกจ';

    if (responseType === 'flex') {
      return {
        type: 'flex',
        altText: 'โควต้าหมด',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '⚠️ โควต้าหมด', weight: 'bold', size: 'lg', color: '#FF8800' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: message, margin: 'md', wrap: true },
            ],
          },
        },
      };
    }

    return { type: 'text', text: message };
  }

  async shouldRefundDuplicate(): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    return settings?.duplicateRefundEnabled ?? true;
  }

  async verifySlip(
    imageData: Buffer,
    lineAccountId: string,
    lineUserId: string,
    messageId?: string,
    meta?: { ownerId?: string; subscriptionId?: string; reservationId?: string },
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
      await this.saveSlipHistory(lineAccountId, lineUserId, messageId, result, meta);

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
    meta?: { ownerId?: string; subscriptionId?: string; reservationId?: string },
  ): Promise<void> {
    await this.slipHistoryModel.create({
      ownerId: meta?.ownerId,
      subscriptionId: meta?.subscriptionId,
      reservationId: meta?.reservationId,
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
