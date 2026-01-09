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
import { SystemResponseTemplatesService } from '../system-response-templates/system-response-templates.service';
import { SystemResponseType } from '../database/schemas/system-response-template.schema';
import { SlipTemplatesService } from '../slip-templates/slip-templates.service';
import { TemplateType } from '../database/schemas/slip-template.schema';
import { BanksService } from '../banks/banks.service';

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
    private systemResponseTemplatesService: SystemResponseTemplatesService,
    private slipTemplatesService: SlipTemplatesService,
    private banksService: BanksService,
  ) { }

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

  /**
   * Get original slip data from slip_history by transRef
   * Used to retrieve slip details when duplicate is detected
   */
  async getOriginalSlipByTransRef(transRef: string): Promise<SlipHistoryDocument | null> {
    if (!transRef) return null;

    try {
      const originalSlip = await this.slipHistoryModel.findOne({
        transRef,
        status: 'success' // Only get successful slips
      }).sort({ createdAt: -1 }).lean().exec();

      return originalSlip as SlipHistoryDocument | null;
    } catch (error) {
      this.logger.warn(`Failed to get original slip by transRef: ${transRef}`, error);
      return null;
    }
  }

  /**
   * Build slip data from SlipHistory document for template rendering
   */
  buildSlipDataFromHistory(slip: SlipHistoryDocument): Record<string, any> {
    if (!slip) return {};

    const rawData = slip.rawData || {};
    return {
      transRef: slip.transRef || '',
      amount: slip.amount,
      amountFormatted: slip.amount ? this.formatAmount(slip.amount) : '',
      senderName: slip.senderName || rawData.sender?.displayName || '',
      senderBank: slip.senderBank || rawData.sender?.bank?.name || '',
      senderBankCode: rawData.sender?.bank?.short || '',
      receiverName: slip.receiverName || rawData.receiver?.displayName || '',
      receiverBank: slip.receiverBank || rawData.receiver?.bank?.name || '',
      receiverBankCode: rawData.receiver?.bank?.short || '',
      receiverAccountNumber: slip.receiverAccountNumber || '',
      date: slip.transactionDate ? this.formatDate(new Date(slip.transactionDate)) : '',
      time: slip.transactionDate ? this.formatTime(new Date(slip.transactionDate)) : '',
      isDuplicate: true,
      originalDate: slip.createdAt ? this.formatDate(new Date(slip.createdAt)) : '',
    };
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

  // ============================================
  // ปรับให้ใช้ templates ใหม่ที่เรียบง่าย
  // ============================================

  async formatQuotaExhaustedResponse(): Promise<any> {
    const response = await this.systemResponseTemplatesService.getResponse(
      SystemResponseType.QUOTA_EXHAUSTED
    );
    return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
  }

  /** @deprecated ใช้ formatQuotaExhaustedResponse แทน */
  async formatQuotaExceededResponse(): Promise<any> {
    return this.formatQuotaExhaustedResponse();
  }

  async formatSlipNotFoundResponse(): Promise<any> {
    const response = await this.systemResponseTemplatesService.getResponse(
      SystemResponseType.SLIP_NOT_FOUND
    );
    return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatNoSlipFoundResponse(): Promise<any> {
    return this.formatSlipNotFoundResponse();
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatQrUnclearResponse(): Promise<any> {
    return this.formatSlipNotFoundResponse();
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatInvalidImageResponse(): Promise<any> {
    return this.formatSlipNotFoundResponse();
  }

  async formatSystemErrorResponse(): Promise<any> {
    const response = await this.systemResponseTemplatesService.getResponse(
      SystemResponseType.SYSTEM_ERROR
    );
    return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
  }

  /** @deprecated ใช้ formatSystemErrorResponse แทน */
  async formatGeneralErrorResponse(): Promise<any> {
    return this.formatSystemErrorResponse();
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatImageDownloadErrorResponse(): Promise<any> {
    return this.formatSlipNotFoundResponse();
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
    // Use getDecryptedSettings to get actual API key, not masked version
    const settings = await this.systemSettingsService.getDecryptedSettings();
    const apiKey = settings?.slipApiKey;

    if (!apiKey) {
      return {
        status: 'error',
        message: 'ยังไม่ได้ตั้งค่า API Key สำหรับตรวจสอบสลิป',
      };
    }

    try {
      const result = await this.verifyWithThunderAPI(imageData, apiKey);

      this.logger.log(`Slip verification result: status=${result.status}, transRef=${result.data?.transRef || 'none'}`);

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

    // Validate inputs
    if (!imageData || imageData.length === 0) {
      return {
        status: 'error',
        message: 'ไม่พบข้อมูลรูปภาพ',
      };
    }

    if (!apiKey || apiKey.trim().length === 0) {
      return {
        status: 'error',
        message: 'ยังไม่ได้ตั้งค่า API Key',
      };
    }

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
        maxContentLength: 15 * 1024 * 1024, // 15MB max
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
            // Local currency amount (if available)
            localAmount: parseFloat(slipData.amount?.local?.amount || 0),
            localAmountFormatted: slipData.amount?.local?.amount ? this.formatAmount(slipData.amount.local.amount) : '',
            localCurrency: slipData.amount?.local?.currency || '',
            date: this.formatDate(slipData.date),
            time: this.formatTime(slipData.date),
            // Sender info with both Thai and English names
            senderName: senderAccount.name?.th || senderAccount.name?.en || '',
            senderNameEn: senderAccount.name?.en || '',
            senderBank: senderBank.short || senderBank.name || '',
            // Prefer short code (e.g. KBANK) for mapping to our `banks.code`
            senderBankCode: senderBank.short || senderBank.id || '',
            senderBankId: senderBank.id || '',
            senderBankName: senderBank.name || '',
            senderAccount: senderAccount.bank?.account || '',
            senderAccountType: senderAccount.bank?.type || '',
            // Receiver info with both Thai and English names
            receiverName: receiverAccount.name?.th || receiverAccount.name?.en || '',
            receiverNameEn: receiverAccount.name?.en || '',
            receiverBank: receiverBank.short || receiverBank.name || '',
            receiverBankCode: receiverBank.short || receiverBank.id || '',
            receiverBankId: receiverBank.id || '',
            receiverBankName: receiverBank.name || '',
            receiverAccount: receiverAccount.bank?.account || receiverAccount.proxy?.account || '',
            receiverAccountNumber: receiverAccount.bank?.account || '',
            receiverAccountType: receiverAccount.bank?.type || '',
            receiverProxyType: receiverAccount.proxy?.type || '',
            receiverProxyAccount: receiverAccount.proxy?.account || '',
            countryCode: slipData.countryCode || '',
            fee: slipData.fee ?? 0,
            feeFormatted: this.formatAmount(slipData.fee ?? 0),
            ref1: slipData.ref1 || '',
            ref2: slipData.ref2 || '',
            ref3: slipData.ref3 || '',
            payload: slipData.payload || '',
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
      // Handle timeout
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        this.logger.error('Thunder API timeout');
        return {
          status: 'error',
          message: 'การตรวจสอบสลิปใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง',
        };
      }

      // Handle network errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        this.logger.error('Thunder API connection error:', error.code);
        return {
          status: 'error',
          message: 'ไม่สามารถเชื่อมต่อระบบตรวจสอบสลิปได้ กรุณาลองใหม่อีกครั้ง',
        };
      }

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 400) {
          const message = data.message || '';
          if (message === 'duplicate_slip' || message.includes('duplicate')) {
            return {
              status: 'duplicate',
              message: 'สลิปนี้เคยถูกตรวจสอบแล้ว',
            };
          } else if (message === 'invalid_payload' || message.includes('invalid')) {
            return {
              status: 'error',
              message: 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปให้ชัดเจน',
            };
          } else if (message.includes('qr') || message.includes('QR')) {
            return {
              status: 'error',
              message: 'ไม่พบ QR Code ในสลิป กรุณาถ่ายรูปให้ครบทั้งใบ',
            };
          }
          return {
            status: 'error',
            message: message || 'รูปแบบสลิปไม่ถูกต้อง',
          };
        } else if (status === 401 || status === 403) {
          this.logger.error('Thunder API authentication error');
          return {
            status: 'error',
            message: 'API Key ไม่ถูกต้องหรือหมดอายุ',
          };
        } else if (status === 404) {
          return {
            status: 'not_found',
            message: 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
          };
        } else if (status === 429) {
          this.logger.error('Thunder API rate limited');
          return {
            status: 'error',
            message: 'ระบบตรวจสอบสลิปมีผู้ใช้มากเกินไป กรุณาลองใหม่อีกครั้ง',
          };
        } else if (status >= 500) {
          this.logger.error(`Thunder API server error: ${status}`);
          return {
            status: 'error',
            message: 'ระบบตรวจสอบสลิปขัดข้อง กรุณาลองใหม่อีกครั้ง',
          };
        }
      }

      this.logger.error('Unexpected Thunder API error:', error);
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

  /**
   * Format slip response with configurable success message and templates
   * รวมบล็อกเตือนโควต้าใกล้หมดด้วย (ถ้ามี)
   */
  async formatSlipResponseWithConfig(
    result: SlipVerificationResult,
    context?: { account?: any; quotaRemaining?: number }
  ): Promise<any> {
    this.logger.log(`[SLIP RESPONSE] formatSlipResponseWithConfig called: status=${result.status}, message=${result.message}, hasData=${!!result.data}`);

    // Log account info for debugging
    const accountId = context?.account?._id?.toString();
    const accountName = context?.account?.accountName;
    this.logger.log(`[SLIP RESPONSE] Account: id=${accountId}, name=${accountName}`);

    // Get settings - handle both Mongoose document and plain object
    const rawSettings = context?.account?.settings;
    const accountSettings = rawSettings?.toObject ? rawSettings.toObject() : (rawSettings || {});

    // Log settings for debugging template selection
    this.logger.log(`[SLIP RESPONSE] Template settings: slipTemplateIds=${JSON.stringify(accountSettings.slipTemplateIds || {})}, slipTemplateId=${accountSettings.slipTemplateId || 'none'}`);
    this.logger.log(`[SLIP RESPONSE] Settings keys: ${Object.keys(accountSettings).join(',')}`);

    const settings = await this.systemSettingsService.getSettings();
    const quotaRemaining = context?.quotaRemaining;
    const quotaWarningThreshold = settings?.quotaWarningThreshold || 10;
    const showQuotaWarning = quotaRemaining !== undefined && quotaRemaining <= quotaWarningThreshold;

    const toTemplateType = (status: SlipVerificationResult['status']): TemplateType => {
      switch (status) {
        case 'success':
          return TemplateType.SUCCESS;
        case 'duplicate':
          return TemplateType.DUPLICATE;
        case 'not_found':
          return TemplateType.NOT_FOUND;
        case 'error':
        default:
          return TemplateType.ERROR;
      }
    };

    const buildSlipData = async (data: Record<string, any>): Promise<Record<string, any>> => {
      const senderCode = (data.senderBankCode || data.senderBank || '').toString().toUpperCase();
      const receiverCode = (data.receiverBankCode || data.receiverBank || '').toString().toUpperCase();

      const senderBank = senderCode ? await this.banksService.getByCode(senderCode).catch(() => null) : null;
      const receiverBank = receiverCode ? await this.banksService.getByCode(receiverCode).catch(() => null) : null;

      return {
        ...data,
        senderBankLogoUrl: senderBank?.logoBase64 || senderBank?.logoUrl || '',
        receiverBankLogoUrl: receiverBank?.logoBase64 || receiverBank?.logoUrl || '',
      };
    };

    // สร้างบล็อกเตือนโควต้าใกล้หมด
    const createQuotaWarningBlock = (): any => {
      if (!showQuotaWarning) return null;
      return {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: '#FFF3CD',
        cornerRadius: 'lg',
        paddingAll: 'md',
        margin: 'lg',
        contents: [
          {
            type: 'text',
            text: '⚠️',
            size: 'lg',
            flex: 0,
          },
          {
            type: 'box',
            layout: 'vertical',
            flex: 1,
            paddingStart: 'sm',
            contents: [
              {
                type: 'text',
                text: 'โควต้าใกล้หมด',
                weight: 'bold',
                size: 'sm',
                color: '#856404',
              },
              {
                type: 'text',
                text: `เหลืออีก ${quotaRemaining} สลิป`,
                size: 'xs',
                color: '#856404',
                wrap: true,
              },
            ],
          },
        ],
      };
    };

    // ฟังก์ชันเพิ่มบล็อกเตือนเข้าไปใน flex message
    const addWarningToFlexMessage = (flexMsg: any): any => {
      if (!showQuotaWarning || !flexMsg) return flexMsg;

      const warningBlock = createQuotaWarningBlock();
      if (!warningBlock) return flexMsg;

      // ถ้าเป็น flex message bubble ให้เพิ่ม warning block ที่ footer
      if (flexMsg.type === 'flex' && flexMsg.contents?.type === 'bubble') {
        const bubble = flexMsg.contents;

        // เพิ่ม warning ใน body ถ้ามี
        if (bubble.body?.contents) {
          bubble.body.contents.push(warningBlock);
        } else if (!bubble.footer) {
          // หรือเพิ่มใน footer ถ้าไม่มี
          bubble.footer = {
            type: 'box',
            layout: 'vertical',
            contents: [warningBlock],
          };
        }

        return flexMsg;
      }

      return flexMsg;
    };

    const tryUseSlipTemplate = async (
      templateType: TemplateType,
      data: Record<string, any>,
    ): Promise<any | null> => {
      // Get LINE account ID from context
      const lineAccountId = context?.account?._id?.toString();
      const idsByType = (accountSettings.slipTemplateIds || {}) as Record<string, string>;
      // Only use slipTemplateId if it's for the specific type, not as fallback for all types
      const selectedId = idsByType[templateType] || '';

      this.logger.log(`[TEMPLATE] Looking for template: type=${templateType}, lineAccountId=${lineAccountId || 'none'}`);
      this.logger.log(`[TEMPLATE] idsByType=${JSON.stringify(idsByType)}, selectedId=${selectedId || 'none'}`);

      let template: Awaited<ReturnType<typeof this.slipTemplatesService.getById>> | null = null;

      // 1. Try user-selected template for this specific type
      if (selectedId) {
        this.logger.log(`[TEMPLATE] Step 1: Looking for selected template ID: ${selectedId}`);
        template = await this.slipTemplatesService.getById(selectedId).catch((e) => {
          this.logger.warn(`[TEMPLATE] Failed to get template by ID ${selectedId}:`, e);
          return null;
        });
        // Verify template type matches
        if (template && (template as any).type !== templateType) {
          this.logger.warn(`[TEMPLATE] Selected template type mismatch: expected ${templateType}, got ${(template as any).type}`);
          template = null;
        }
        if (template) {
          this.logger.log(`[TEMPLATE] ✓ Found selected template: ${(template as any).name}`);
        }
      }


      // 2. If no selected template, try account-specific default template
      if (!template && lineAccountId) {
        this.logger.log(`[TEMPLATE] Step 2: Looking for account default template`);
        template = await this.slipTemplatesService.getDefaultTemplate(lineAccountId, templateType).catch((e) => {
          this.logger.debug(`[TEMPLATE] No account default template for ${templateType}`);
          return null;
        });
        if (template) {
          this.logger.log(`[TEMPLATE] ✓ Found account default template: ${(template as any).name}`);
        }
      }

      // 3. Fall back to global default template
      if (!template) {
        this.logger.log(`[TEMPLATE] Step 3: Looking for global default template`);
        template = await this.slipTemplatesService.getGlobalDefaultTemplate(templateType).catch((e) => {
          this.logger.warn(`[TEMPLATE] Failed to get global default template for ${templateType}:`, e);
          return null;
        });
        if (template) {
          this.logger.log(`[TEMPLATE] ✓ Found global default template: ${(template as any).name}`);
        }
      }

      if (!template) {
        this.logger.warn(`[TEMPLATE] ✗ No template found for type ${templateType}, will use fallback`);
        return null;
      }

      this.logger.log(`[TEMPLATE] Using template: ${(template as any).name} (ID: ${(template as any)._id}, isGlobal: ${(template as any).isGlobal})`);

      const slipData = await buildSlipData(data);
      const bubble = this.slipTemplatesService.generateFlexMessage(template as any, slipData as any);

      const flexMsg = {
        type: 'flex',
        altText: templateType === TemplateType.DUPLICATE ? 'สลิปซ้ำ' : 'ผลการตรวจสอบสลิป',
        contents: bubble,
      };

      // เพิ่มบล็อกเตือนโควต้าถ้าเหลือน้อย
      return addWarningToFlexMessage(flexMsg);
    };

    if (result.status === 'success' && result.data) {
      // Check for custom template first
      if (accountSettings.slipSuccessTemplate && Object.keys(accountSettings.slipSuccessTemplate).length > 0) {
        return this.applyTemplateVariables(accountSettings.slipSuccessTemplate, result.data);
      }

      // Prefer slip templates (selected per account or global default)
      const templated = await tryUseSlipTemplate(TemplateType.SUCCESS, result.data);
      if (templated) return templated;

      // Check for custom success message
      const customSuccessMessage = accountSettings.customSlipSuccessMessage;

      // Build default flex message (รวมบล็อกเตือนโควต้า)
      const bodyContents: any[] = [
        {
          type: 'text',
          text: customSuccessMessage || '✅ ตรวจสอบสลิปสำเร็จ',
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
      ];

      // เพิ่มบล็อกเตือนโควต้าถ้าเหลือน้อย
      const warningBlock = createQuotaWarningBlock();
      if (warningBlock) bodyContents.push(warningBlock);

      return {
        type: 'flex',
        altText: 'ผลการตรวจสอบสลิป',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: bodyContents,
          },
        },
      };
    } else if (result.status === 'duplicate') {
      // Try to get original slip data from database if not provided by API
      let duplicateData = result.data || {};

      // If we have transRef, try to get original slip data from slip_history
      const transRef = duplicateData.transRef || result.transRef;
      if (transRef && (!duplicateData.amount || !duplicateData.senderName)) {
        this.logger.log(`[DUPLICATE] Looking for original slip data with transRef: ${transRef}`);
        const originalSlip = await this.getOriginalSlipByTransRef(transRef);
        if (originalSlip) {
          this.logger.log(`[DUPLICATE] Found original slip data: amount=${originalSlip.amount}, sender=${originalSlip.senderName}`);
          duplicateData = {
            ...this.buildSlipDataFromHistory(originalSlip),
            ...duplicateData, // Keep any data from API response
            isDuplicate: true,
          };
        }
      }

      // Check for custom template first
      if (accountSettings.slipDuplicateTemplate && Object.keys(accountSettings.slipDuplicateTemplate).length > 0) {
        const customTemplate = this.applyTemplateVariables(accountSettings.slipDuplicateTemplate, duplicateData);
        return addWarningToFlexMessage(customTemplate);
      }

      // Try to use slip template with enriched duplicate data
      const templated = await tryUseSlipTemplate(TemplateType.DUPLICATE, duplicateData);
      if (templated) {
        this.logger.log('[DUPLICATE] Using slip template for duplicate');
        return templated;
      }
      this.logger.debug('No template found for duplicate, using fallback');


      // Fallback: สร้าง flex message สำหรับสลิปซ้ำ (รวมบล็อกเตือน)
      const duplicateMessage = accountSettings.customDuplicateSlipMessage ||
        settings?.duplicateSlipMessage || 'สลิปนี้เคยถูกใช้แล้ว';

      const bodyContents: any[] = [
        {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: '#FFF3CD',
          cornerRadius: 'lg',
          paddingAll: 'md',
          contents: [
            {
              type: 'text',
              text: '⚠️',
              size: 'xxl',
              flex: 0,
              gravity: 'center',
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: 'สลิปซ้ำ',
                  weight: 'bold',
                  size: 'lg',
                  color: '#856404',
                },
                {
                  type: 'text',
                  text: duplicateMessage,
                  size: 'sm',
                  color: '#856404',
                  wrap: true,
                },
              ],
            },
          ],
        },
      ];

      // เพิ่มบล็อกเตือนโควต้าถ้าเหลือน้อย
      const warningBlock = createQuotaWarningBlock();
      if (warningBlock) bodyContents.push(warningBlock);

      return {
        type: 'flex',
        altText: 'สลิปซ้ำ',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: bodyContents,
          },
        },
      };
    } else {
      // Check for custom template first
      if (accountSettings.slipErrorTemplate && Object.keys(accountSettings.slipErrorTemplate).length > 0) {
        return this.applyTemplateVariables(accountSettings.slipErrorTemplate, { message: result.message });
      }

      const templated = await tryUseSlipTemplate(toTemplateType(result.status), { message: result.message, ...(result.data || {}) });
      if (templated) return templated;

      const errorMessage = accountSettings.customSlipErrorMessage ||
        settings?.slipErrorMessage || result.message;
      return {
        type: 'text',
        text: `❌ ${errorMessage}`,
      };
    }
  }

  /**
   * Apply template variables to a Flex Message template
   * Supports placeholders like {{amount}}, {{senderName}}, etc.
   */
  private applyTemplateVariables(template: any, data: Record<string, any>): any {
    const jsonString = JSON.stringify(template);
    const replacedString = jsonString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = data[key];
      if (value !== undefined && value !== null) {
        return String(value).replace(/"/g, '\\"');
      }
      return match;
    });

    try {
      return JSON.parse(replacedString);
    } catch {
      this.logger.warn('Failed to parse template with variables, returning original');
      return template;
    }
  }

  /**
   * Get default success template for reference
   */
  getDefaultSuccessTemplate(): any {
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
            { type: 'separator', margin: 'md' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                this.createInfoRow('จำนวนเงิน', '{{amountFormatted}}'),
                this.createInfoRow('วันที่', '{{date}}'),
                this.createInfoRow('เวลา', '{{time}}'),
                this.createInfoRow('ผู้โอน', '{{senderName}}'),
                this.createInfoRow('ธนาคารผู้โอน', '{{senderBank}}'),
                this.createInfoRow('ผู้รับ', '{{receiverName}}'),
                this.createInfoRow('ธนาคารผู้รับ', '{{receiverBank}}'),
                this.createInfoRow('เลขอ้างอิง', '{{transRef}}'),
              ],
            },
          ],
        },
      },
    };
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
