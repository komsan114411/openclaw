import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

// Multi-Provider System
import { SlipVerificationManager } from './slip-verification.manager';
import { NormalizedVerificationResult, SlipProvider } from './providers';

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
    // Multi-Provider Manager (Auto-Failover)
    @Optional() private slipVerificationManager?: SlipVerificationManager,
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
   * Get original slip from slip_history by QR decode payload.
   * Used when Slip2Go returns duplicate without transRef.
   * The 'decode' field (QR payload) is the same for identical slip images,
   * so it uniquely identifies the original transaction.
   */
  async getOriginalSlipByDecode(decode: string): Promise<SlipHistoryDocument | null> {
    if (!decode) return null;

    try {
      // Search rawData.rawData.decode (nested: slip_history.rawData = NormalizedSlipData which has rawData = provider response)
      const originalSlip = await this.slipHistoryModel.findOne({
        status: 'success',
        $or: [
          { 'rawData.rawData.decode': decode },
          { 'rawData.decode': decode },
        ],
      }).sort({ createdAt: -1 }).lean().exec();

      return originalSlip as SlipHistoryDocument | null;
    } catch (error) {
      this.logger.warn(`Failed to get original slip by decode: ${error}`);
      return null;
    }
  }

  /**
   * Build slip data from SlipHistory document for template rendering
   */
  buildSlipDataFromHistory(slip: SlipHistoryDocument): Record<string, any> {
    if (!slip) return {};

    const rawData = slip.rawData || {};

    // Detect bank code from senderBank/receiverBank fields
    // For TrueMoney slips, the bank name contains "ทรูมันนี่"
    const detectBankCode = (bankName: string | undefined): string => {
      if (!bankName) return '';
      const name = bankName.toLowerCase();
      if (name.includes('truemoney') || name.includes('ทรูมันนี่')) return 'TRUEMONEY';
      if (name.includes('promptpay') || name.includes('พร้อมเพย์')) return 'PROMPTPAY';
      // Return the bank name as code if no specific match
      return bankName.toUpperCase().replace(/\s+/g, '');
    };

    const senderBankCode = rawData.sender?.bank?.short || rawData.senderBankCode || detectBankCode(slip.senderBank);
    const receiverBankCode = rawData.receiver?.bank?.short || rawData.receiverBankCode || detectBankCode(slip.receiverBank);

    return {
      transRef: slip.transRef || '',
      amount: slip.amount,
      amountFormatted: slip.amount ? this.formatAmount(slip.amount) : '',
      senderName: slip.senderName || rawData.sender?.displayName || rawData.sender?.name || '',
      senderBank: slip.senderBank || rawData.sender?.bank?.name || '',
      senderBankCode: senderBankCode,
      receiverName: slip.receiverName || rawData.receiver?.displayName || rawData.receiver?.name || '',
      receiverBank: slip.receiverBank || rawData.receiver?.bank?.name || '',
      receiverBankCode: receiverBankCode,
      receiverAccountNumber: slip.receiverAccountNumber || rawData.receiver?.phone || '',
      date: slip.transactionDate ? this.formatDate(new Date(slip.transactionDate)) : '',
      time: slip.transactionDate ? this.formatTime(new Date(slip.transactionDate)) : '',
      isDuplicate: true,
      originalDate: (slip as any).createdAt ? this.formatDate(new Date((slip as any).createdAt)) : '',
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
    try {
      let result: SlipVerificationResult;

      // Use Multi-Provider Manager if available (with Auto-Failover)
      if (this.slipVerificationManager) {
        const managerResult = await this.slipVerificationManager.verifySlip(imageData, {
          lineAccountId,
          lineUserId,
          messageId,
          ownerId: meta?.ownerId,
          subscriptionId: meta?.subscriptionId,
        });

        // Convert NormalizedVerificationResult to SlipVerificationResult
        result = this.convertToSlipVerificationResult(managerResult);

        // Only log essential info (not provider - user shouldn't see)
        this.logger.debug(`[VERIFY] Status: ${result.status}, TransRef: ${result.data?.transRef || 'none'}`);
      } else {
        // Fallback to legacy Thunder API (backward compatibility)
        this.logger.log('[VERIFY] Using legacy Thunder API (no manager)');

        const settings = await this.systemSettingsService.getDecryptedSettings();
        const apiKey = settings?.slipApiKey;

        if (!apiKey) {
          return {
            status: 'error',
            message: 'ยังไม่ได้ตั้งค่า API Key สำหรับตรวจสอบสลิป',
          };
        }

        result = await this.verifyWithThunderAPI(imageData, apiKey);

        this.logger.log(`[VERIFY] Legacy result: status=${result.status}, transRef=${result.data?.transRef || 'none'}`);
      }

      // Check for duplicate in our database (for providers that don't check duplicate themselves)
      // This ensures we always have slip data even for duplicates
      if (result.status === 'success' && result.data?.transRef) {
        const isDuplicate = await this.checkDuplicateByTransRef(result.data.transRef);
        if (isDuplicate) {
          this.logger.log(`[VERIFY] Duplicate slip detected in database: transRef=${result.data.transRef}`);
          result = {
            ...result,
            status: 'duplicate',
            message: 'สลิปนี้เคยถูกใช้แล้ว',
          };
        }
      }

      // Save to history
      await this.saveSlipHistory(lineAccountId, lineUserId, messageId, result, meta);

      return result;
    } catch (error) {
      this.logger.error('[VERIFY] Slip verification error:', error);
      return {
        status: 'error',
        message: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป',
      };
    }
  }

  /**
   * Check if a slip with the same transRef already exists in database
   * Used for providers that don't check duplicate themselves (e.g., SlipMate with allowDuplicate=true)
   */
  private async checkDuplicateByTransRef(transRef: string): Promise<boolean> {
    if (!transRef) return false;

    try {
      const existingSlip = await this.slipHistoryModel.findOne({
        transRef: transRef,
        status: { $in: ['success', 'duplicate'] }, // Only count successful or duplicate slips
      }).exec();

      return !!existingSlip;
    } catch (error) {
      this.logger.error(`[DUPLICATE CHECK] Error checking duplicate: ${error}`);
      return false;
    }
  }

  /**
   * Convert NormalizedVerificationResult to SlipVerificationResult
   * เพื่อให้ format เข้ากันได้กับโค้ดเดิม
   *
   * IMPORTANT: ไม่รวม provider info เพื่อให้ผู้ใช้ไม่รู้ว่าใช้ provider ไหน
   */
  private convertToSlipVerificationResult(result: NormalizedVerificationResult): SlipVerificationResult {
    // Log provider internally for debugging (not exposed to user)
    this.logger.debug(`[CONVERT] Provider used: ${result.provider}`);

    return {
      status: result.status,
      message: result.message,
      data: result.data
        ? {
            transRef: result.data.transRef,
            amount: result.data.amount,
            amountFormatted: result.data.amountFormatted,
            date: result.data.date,
            time: result.data.time,
            senderName: result.data.senderName,
            senderNameEn: result.data.senderNameEn,
            senderBank: result.data.senderBank,
            senderBankCode: result.data.senderBankCode,
            senderAccount: result.data.senderAccount,
            receiverName: result.data.receiverName,
            receiverNameEn: result.data.receiverNameEn,
            receiverBank: result.data.receiverBank,
            receiverBankCode: result.data.receiverBankCode,
            receiverAccount: result.data.receiverAccount,
            receiverAccountNumber: result.data.receiverAccountNumber,
            countryCode: result.data.countryCode,
            fee: result.data.fee,
            ref1: result.data.ref1,
            ref2: result.data.ref2,
            ref3: result.data.ref3,
            rawData: result.data.rawData,
            // NOTE: ไม่รวม _provider - ผู้ใช้ไม่ควรรู้ว่าใช้ provider ไหน
          }
        : undefined,
    };
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

        // Helper function to detect payment type from proxy or bank info
        const detectPaymentType = (account: any, bank: any): { bankName: string; bankCode: string } => {
          const proxyType = account.proxy?.type?.toUpperCase() || '';
          const bankName = bank.name?.toLowerCase() || '';
          const bankShort = bank.short?.toUpperCase() || '';
          // Also check account name for TrueMoney detection (Thunder API returns "TrueMoney W" in account name)
          const accountNameTh = (account.name?.th || '').toLowerCase();
          const accountNameEn = (account.name?.en || '').toLowerCase();

          // TrueMoney Wallet detection - check bank info AND account name
          if (proxyType === 'EWALLETID' ||
              bankName.includes('truemoney') ||
              bankName.includes('ทรูมันนี่') ||
              bankShort === 'TMN' ||
              bankShort === 'TRUEMONEY' ||
              accountNameTh.includes('truemoney') ||
              accountNameTh.includes('ทรูมันนี่') ||
              accountNameEn.includes('truemoney')) {
            return { bankName: 'ทรูมันนี่ วอลเล็ท', bankCode: 'TRUEMONEY' };
          }

          // PromptPay detection - check if has proxy (MOBILE, NATID, etc.)
          if (account.proxy && (proxyType === 'MOBILE' || proxyType === 'NATID' || proxyType === 'BILLERID')) {
            return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
          }

          // Default: use bank info
          return {
            bankName: bank.short || bank.name || '',
            bankCode: bank.short || bank.id || ''
          };
        };

        const senderPaymentType = detectPaymentType(senderAccount, senderBank);
        const receiverPaymentType = detectPaymentType(receiverAccount, receiverBank);

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
            senderBank: senderPaymentType.bankName,
            // Use detected payment type code for proper logo mapping
            senderBankCode: senderPaymentType.bankCode,
            senderBankId: senderBank.id || '',
            senderBankName: senderBank.name || '',
            senderAccount: senderAccount.bank?.account || senderAccount.proxy?.account || '',
            senderAccountType: senderAccount.bank?.type || '',
            senderProxyType: senderAccount.proxy?.type || '',
            senderProxyAccount: senderAccount.proxy?.account || '',
            // Receiver info with both Thai and English names
            receiverName: receiverAccount.name?.th || receiverAccount.name?.en || '',
            receiverNameEn: receiverAccount.name?.en || '',
            receiverBank: receiverPaymentType.bankName,
            receiverBankCode: receiverPaymentType.bankCode,
            receiverBankId: receiverBank.id || '',
            receiverBankName: receiverBank.name || '',
            // IMPORTANT: Include proxy account for TrueMoney/PromptPay (phone number display)
            receiverAccount: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
            receiverAccountNumber: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
            receiverAccountType: receiverAccount.bank?.type || '',
            receiverProxyType: receiverAccount.proxy?.type || '',
            receiverProxyAccount: receiverAccount.proxy?.account || receiverAccount.proxy || '',
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
      } else if (data.status === 400 && data.message === 'duplicate_slip') {
        // ===========================================================
        // Thunder API: Duplicate slip returns status 400 with message "duplicate_slip"
        // and includes full slip data in data.data
        // ===========================================================
        this.logger.log('[DUPLICATE] Thunder API detected duplicate slip (status 400, message: duplicate_slip)');

        // Parse duplicate response data - Thunder API sends full slip data for duplicates
        const slipData = data.data || {};
        const senderAccount = slipData.sender?.account || {};
        const receiverAccount = slipData.receiver?.account || {};
        const senderBank = slipData.sender?.bank || {};
        const receiverBank = slipData.receiver?.bank || {};

        this.logger.log(`[DUPLICATE] transRef: ${slipData.transRef}, amount: ${slipData.amount?.amount}`);
        this.logger.log(`[DUPLICATE] sender: ${senderAccount.name?.th}, receiver: ${receiverAccount.name?.th}`);
        // Debug: Log full receiver structure to understand TrueMoney format
        this.logger.log(`[DUPLICATE] receiverAccount structure: ${JSON.stringify(receiverAccount)}`);
        this.logger.log(`[DUPLICATE] receiverBank structure: ${JSON.stringify(receiverBank)}`);

        // Helper function to detect payment type from proxy or bank info
        const detectPaymentType = (account: any, bank: any): { bankName: string; bankCode: string } => {
          const proxyType = account.proxy?.type?.toUpperCase() || '';
          const bankName = bank.name?.toLowerCase() || '';
          const bankShort = bank.short?.toUpperCase() || '';
          // Also check account name for TrueMoney detection (Thunder API returns "TrueMoney W" in account name)
          const accountNameTh = (account.name?.th || '').toLowerCase();
          const accountNameEn = (account.name?.en || '').toLowerCase();

          // TrueMoney Wallet detection - check bank info AND account name
          if (proxyType === 'EWALLETID' ||
              bankName.includes('truemoney') ||
              bankName.includes('ทรูมันนี่') ||
              bankShort === 'TMN' ||
              bankShort === 'TRUEMONEY' ||
              accountNameTh.includes('truemoney') ||
              accountNameTh.includes('ทรูมันนี่') ||
              accountNameEn.includes('truemoney')) {
            return { bankName: 'ทรูมันนี่ วอลเล็ท', bankCode: 'TRUEMONEY' };
          }

          // PromptPay detection - check if has proxy (MOBILE, NATID, etc.)
          if (account.proxy && (proxyType === 'MOBILE' || proxyType === 'NATID' || proxyType === 'BILLERID')) {
            return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
          }

          // Default: use bank info
          return {
            bankName: bank.short || bank.name || '',
            bankCode: bank.short || bank.id || ''
          };
        };

        const senderPaymentType = detectPaymentType(senderAccount, senderBank);
        const receiverPaymentType = detectPaymentType(receiverAccount, receiverBank);

        return {
          status: 'duplicate',
          message: 'สลิปนี้เคยถูกใช้แล้ว',
          data: {
            transRef: slipData.transRef || '',
            amount: parseFloat(slipData.amount?.amount || 0),
            amountFormatted: slipData.amount?.amount ? this.formatAmount(slipData.amount.amount) : '',
            date: slipData.date ? this.formatDate(slipData.date) : '',
            time: slipData.date ? this.formatTime(slipData.date) : '',
            senderName: senderAccount.name?.th || senderAccount.name?.en || '',
            senderNameEn: senderAccount.name?.en || '',
            senderBank: senderPaymentType.bankName,
            senderBankCode: senderPaymentType.bankCode,
            senderBankId: senderBank.id || '',
            senderAccount: senderAccount.bank?.account || senderAccount.proxy?.account || '',
            senderProxyType: senderAccount.proxy?.type || '',
            senderProxyAccount: senderAccount.proxy?.account || '',
            receiverName: receiverAccount.name?.th || receiverAccount.name?.en || '',
            receiverNameEn: receiverAccount.name?.en || '',
            receiverBank: receiverPaymentType.bankName,
            receiverBankCode: receiverPaymentType.bankCode,
            receiverBankId: receiverBank.id || '',
            // IMPORTANT: Set both receiverAccount and receiverAccountNumber for template compatibility
            receiverAccount: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
            receiverAccountNumber: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
            receiverProxyType: receiverAccount.proxy?.type || '',
            receiverProxyAccount: receiverAccount.proxy?.account || receiverAccount.proxy || '',
            countryCode: slipData.countryCode || 'TH',
            fee: slipData.fee || 0,
            feeFormatted: this.formatAmount(slipData.fee ?? 0),
            ref1: slipData.ref1 || '',
            ref2: slipData.ref2 || '',
            ref3: slipData.ref3 || '',
            payload: slipData.payload || '',
            isDuplicate: true,
            rawData: slipData,
          },
        };
      } else if (data.status === 409) {
        // Legacy: Some systems might still use 409 for duplicates (fallback)
        this.logger.warn('[DUPLICATE] Received 409 status (legacy) - parsing as duplicate');
        const slipData = data.data || {};
        const senderAccount = slipData.sender?.account || {};
        const receiverAccount = slipData.receiver?.account || {};
        const senderBank = slipData.sender?.bank || {};
        const receiverBank = slipData.receiver?.bank || {};

        // Helper function to detect payment type from proxy or bank info
        const detectPaymentType = (account: any, bank: any): { bankName: string; bankCode: string } => {
          const proxyType = account.proxy?.type?.toUpperCase() || '';
          const bankName = bank.name?.toLowerCase() || '';
          const bankShort = bank.short?.toUpperCase() || '';
          // Also check account name for TrueMoney detection (Thunder API returns "TrueMoney W" in account name)
          const accountNameTh = (account.name?.th || '').toLowerCase();
          const accountNameEn = (account.name?.en || '').toLowerCase();

          // TrueMoney Wallet detection - check bank info AND account name
          if (proxyType === 'EWALLETID' ||
              bankName.includes('truemoney') ||
              bankName.includes('ทรูมันนี่') ||
              bankShort === 'TMN' ||
              bankShort === 'TRUEMONEY' ||
              accountNameTh.includes('truemoney') ||
              accountNameTh.includes('ทรูมันนี่') ||
              accountNameEn.includes('truemoney')) {
            return { bankName: 'ทรูมันนี่ วอลเล็ท', bankCode: 'TRUEMONEY' };
          }

          // PromptPay detection
          if (account.proxy && (proxyType === 'MOBILE' || proxyType === 'NATID' || proxyType === 'BILLERID')) {
            return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
          }

          return {
            bankName: bank.short || bank.name || '',
            bankCode: bank.short || bank.id || ''
          };
        };

        const senderPaymentType = detectPaymentType(senderAccount, senderBank);
        const receiverPaymentType = detectPaymentType(receiverAccount, receiverBank);

        return {
          status: 'duplicate',
          message: 'สลิปนี้เคยถูกใช้แล้ว',
          data: {
            transRef: slipData.transRef || '',
            amount: parseFloat(slipData.amount?.amount || 0),
            amountFormatted: slipData.amount?.amount ? this.formatAmount(slipData.amount.amount) : '',
            date: slipData.date ? this.formatDate(slipData.date) : '',
            time: slipData.date ? this.formatTime(slipData.date) : '',
            senderName: senderAccount.name?.th || senderAccount.name?.en || '',
            senderBank: senderPaymentType.bankName,
            senderBankCode: senderPaymentType.bankCode,
            receiverName: receiverAccount.name?.th || receiverAccount.name?.en || '',
            receiverBank: receiverPaymentType.bankName,
            receiverBankCode: receiverPaymentType.bankCode,
            // IMPORTANT: Include proxy account for TrueMoney/PromptPay (phone number display)
            receiverAccount: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
            receiverAccountNumber: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
            receiverProxyAccount: receiverAccount.proxy?.account || receiverAccount.proxy || '',
            isDuplicate: true,
            rawData: slipData,
          },
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
            // Thunder API returns full slip data even for duplicate slips
            // Extract slip data from data.data
            const slipData = data.data || {};
            const senderAccount = slipData.sender?.account || {};
            const receiverAccount = slipData.receiver?.account || {};
            const senderBank = slipData.sender?.bank || {};
            const receiverBank = slipData.receiver?.bank || {};

            this.logger.log('[DUPLICATE] Thunder API 400 duplicate_slip detected');
            this.logger.log(`[DUPLICATE] transRef: ${slipData.transRef}, amount: ${slipData.amount?.amount}`);
            this.logger.log(`[DUPLICATE] sender: ${senderAccount.name?.th}, receiver: ${receiverAccount.name?.th}`);

            // Helper function to detect payment type from proxy or bank info
            const detectPaymentType = (account: any, bank: any): { bankName: string; bankCode: string } => {
              const proxyType = account.proxy?.type?.toUpperCase() || '';
              const bankName = bank.name?.toLowerCase() || '';
              const bankShort = bank.short?.toUpperCase() || '';
              // Also check account name for TrueMoney detection (Thunder API returns "TrueMoney W" in account name)
              const accountNameTh = (account.name?.th || '').toLowerCase();
              const accountNameEn = (account.name?.en || '').toLowerCase();

              // TrueMoney Wallet detection - check bank info AND account name
              if (proxyType === 'EWALLETID' ||
                  bankName.includes('truemoney') ||
                  bankName.includes('ทรูมันนี่') ||
                  bankShort === 'TMN' ||
                  bankShort === 'TRUEMONEY' ||
                  accountNameTh.includes('truemoney') ||
                  accountNameTh.includes('ทรูมันนี่') ||
                  accountNameEn.includes('truemoney')) {
                return { bankName: 'ทรูมันนี่ วอลเล็ท', bankCode: 'TRUEMONEY' };
              }

              // PromptPay detection
              if (account.proxy && (proxyType === 'MOBILE' || proxyType === 'NATID' || proxyType === 'BILLERID')) {
                return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
              }

              return {
                bankName: bank.short || bank.name || '',
                bankCode: bank.short || bank.id || ''
              };
            };

            const senderPaymentType = detectPaymentType(senderAccount, senderBank);
            const receiverPaymentType = detectPaymentType(receiverAccount, receiverBank);

            return {
              status: 'duplicate',
              message: 'สลิปนี้เคยถูกใช้แล้ว',
              data: {
                transRef: slipData.transRef || '',
                amount: parseFloat(slipData.amount?.amount || 0),
                amountFormatted: slipData.amount?.amount ? this.formatAmount(slipData.amount.amount) : '',
                date: slipData.date ? this.formatDate(slipData.date) : '',
                time: slipData.date ? this.formatTime(slipData.date) : '',
                senderName: senderAccount.name?.th || senderAccount.name?.en || '',
                senderNameEn: senderAccount.name?.en || '',
                senderBank: senderPaymentType.bankName,
                senderBankCode: senderPaymentType.bankCode,
                senderBankId: senderBank.id || '',
                senderAccount: senderAccount.bank?.account || senderAccount.proxy?.account || '',
                senderProxyType: senderAccount.proxy?.type || '',
                receiverName: receiverAccount.name?.th || receiverAccount.name?.en || '',
                receiverNameEn: receiverAccount.name?.en || '',
                receiverBank: receiverPaymentType.bankName,
                receiverBankCode: receiverPaymentType.bankCode,
                receiverBankId: receiverBank.id || '',
                // IMPORTANT: Include proxy account for TrueMoney/PromptPay (phone number display)
                receiverAccount: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
                receiverAccountNumber: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
                receiverProxyType: receiverAccount.proxy?.type || '',
                receiverProxyAccount: receiverAccount.proxy?.account || receiverAccount.proxy || '',
                countryCode: slipData.countryCode || 'TH',
                fee: slipData.fee || 0,
                feeFormatted: this.formatAmount(slipData.fee ?? 0),
                ref1: slipData.ref1 || '',
                ref2: slipData.ref2 || '',
                ref3: slipData.ref3 || '',
                payload: slipData.payload || '',
                isDuplicate: true,
                rawData: slipData,
              },
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

  /**
   * Test connection to Thunder API (legacy method - backward compatible)
   */
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

  /**
   * Test connection to a specific provider
   * ใช้สำหรับทดสอบการเชื่อมต่อจาก Admin Dashboard
   */
  async testProviderConnection(provider: SlipProvider): Promise<{
    success: boolean;
    message: string;
    remainingQuota?: number;
    expiresAt?: string;
  }> {
    if (!this.slipVerificationManager) {
      return {
        success: false,
        message: 'Multi-Provider Manager ไม่พร้อมใช้งาน',
      };
    }

    return this.slipVerificationManager.testProviderConnection(provider);
  }

  /**
   * Test connection to all providers
   * ใช้สำหรับแสดงสถานะทุก Provider ใน Admin Dashboard
   */
  async testAllProviders(): Promise<
    Array<{
      provider: SlipProvider;
      success: boolean;
      message: string;
      remainingQuota?: number;
      expiresAt?: string;
    }>
  > {
    if (!this.slipVerificationManager) {
      return [
        {
          provider: SlipProvider.THUNDER,
          success: false,
          message: 'Multi-Provider Manager ไม่พร้อมใช้งาน',
        },
      ];
    }

    const results = await this.slipVerificationManager.testAllProviders();
    return Array.from(results.entries()).map(([provider, result]) => ({
      provider,
      ...result,
    }));
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): SlipProvider[] {
    if (!this.slipVerificationManager) {
      return [SlipProvider.THUNDER];
    }
    return this.slipVerificationManager.getAvailableProviders();
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
    context?: { account?: any; quotaRemaining?: number; lineUserId?: string; lineAccountId?: string }
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

      // Use backend API endpoint for bank logos (LINE only accepts https:// URLs)
      // Priority: 1. publicBaseUrl from DB settings, 2. BACKEND_URL env, 3. Default API URL
      const baseUrl = settings?.publicBaseUrl || process.env.BACKEND_URL || 'https://api.dooslip.com';

      // Only add logo URLs if we have valid bank codes
      const senderLogoUrl = senderCode ? `${baseUrl}/api/bank-logo/${senderCode}` : '';
      const receiverLogoUrl = receiverCode ? `${baseUrl}/api/bank-logo/${receiverCode}` : '';

      this.logger.log(`[BANK LOGO] baseUrl=${baseUrl}, sender=${senderCode}, receiver=${receiverCode}`);

      // IMPORTANT: Normalize receiver account fields for consistency
      // Template uses receiverAccount, but API may provide receiverAccountNumber
      const receiverAccountNormalized = data.receiverAccount || data.receiverAccountNumber || data.receiverProxyAccount || '';

      // Get proper bank names from database if available
      const senderBankName = senderBank?.nameTh || senderBank?.name || data.senderBank || '';
      const receiverBankName = receiverBank?.nameTh || receiverBank?.name || data.receiverBank || '';

      this.logger.log(`[SLIP DATA] Building slip data: senderBank=${senderBankName}, receiverBank=${receiverBankName}, receiverAccount=${receiverAccountNormalized}`);

      return {
        ...data,
        // Ensure consistent field naming
        receiverAccount: receiverAccountNormalized,
        receiverAccountNumber: receiverAccountNormalized,
        // Add proper bank names
        senderBankName: senderBankName,
        receiverBankName: receiverBankName,
        // Bank logos
        senderBankLogoUrl: senderLogoUrl,
        receiverBankLogoUrl: receiverLogoUrl,
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
        // Validate that selectedId is a valid ObjectId
        if (!Types.ObjectId.isValid(selectedId)) {
          this.logger.warn(`[TEMPLATE] Invalid template ID format: ${selectedId}, skipping`);
        } else {
          this.logger.log(`[TEMPLATE] Step 1: Looking for selected template ID: ${selectedId}`);
          template = await this.slipTemplatesService.getById(selectedId).catch((e) => {
            this.logger.warn(`[TEMPLATE] Failed to get template by ID ${selectedId}:`, e);
            return null;
          });
        }
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
      this.logger.log(`[TEMPLATE] Template config: headerText="${(template as any).headerText}", primaryColor="${(template as any).primaryColor}", showAmount=${(template as any).showAmount}`);

      const slipData = await buildSlipData(data);
      this.logger.log(`[TEMPLATE] SlipData for render: amount=${slipData.amountFormatted}, sender=${slipData.senderName}, receiver=${slipData.receiverName}`);

      const bubble = await this.slipTemplatesService.generateFlexMessage(template as any, slipData as any);

      // Validate bubble structure
      if (!bubble || !bubble.type || bubble.type !== 'bubble') {
        this.logger.error(`[TEMPLATE] Invalid bubble structure: ${JSON.stringify(bubble)?.substring(0, 200)}`);
        return null;
      }

      const flexMsg = {
        type: 'flex',
        altText: templateType === TemplateType.DUPLICATE ? 'สลิปซ้ำ' : 'ผลการตรวจสอบสลิป',
        contents: bubble,
      };

      this.logger.log(`[TEMPLATE] Generated flex message: altText="${flexMsg.altText}", bubbleType="${bubble.type}", hasBody=${!!bubble.body}`);

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
      let duplicateData: Record<string, any> = result.data || {};

      this.logger.log(`[DUPLICATE] Initial data from API: transRef=${duplicateData.transRef}, amount=${duplicateData.amount}, amountFormatted=${duplicateData.amountFormatted}, senderName=${duplicateData.senderName}`);

      // If we have transRef, ALWAYS try to enrich from slip_history (Thunder API may not send full data)
      const transRef = duplicateData.transRef || (result as any).transRef;
      const needsEnrichment = !duplicateData.amountFormatted || !duplicateData.senderName;

      this.logger.log(`[DUPLICATE] transRef=${transRef}, needsEnrichment=${needsEnrichment}`);
      this.logger.log(`[DUPLICATE] Context: lineUserId=${context?.lineUserId}, lineAccountId=${context?.lineAccountId}`);

      if (transRef && needsEnrichment) {
        // Method 1: Lookup by transRef
        this.logger.log(`[DUPLICATE] Looking for original slip data with transRef: ${transRef}`);
        const originalSlip = await this.getOriginalSlipByTransRef(transRef);
        if (originalSlip) {
          this.logger.log(`[DUPLICATE] Found original slip data: amount=${originalSlip.amount}, sender=${originalSlip.senderName}`);
          const historyData = this.buildSlipDataFromHistory(originalSlip);

          // Helper to check if value is meaningful (not empty, not zero)
          const isMeaningful = (val: any): boolean => {
            if (val === null || val === undefined || val === '') return false;
            if (typeof val === 'number' && val === 0) return false;
            if (typeof val === 'string' && (val === '฿0' || val === '0' || val.trim() === '')) return false;
            return true;
          };

          // Prefer history data over API data for empty/zero values
          duplicateData = {
            ...historyData,
            transRef: isMeaningful(duplicateData.transRef) ? duplicateData.transRef : historyData.transRef,
            amount: isMeaningful(duplicateData.amount) ? duplicateData.amount : historyData.amount,
            amountFormatted: isMeaningful(duplicateData.amountFormatted) ? duplicateData.amountFormatted : historyData.amountFormatted,
            senderName: isMeaningful(duplicateData.senderName) ? duplicateData.senderName : historyData.senderName,
            senderBank: isMeaningful(duplicateData.senderBank) ? duplicateData.senderBank : historyData.senderBank,
            senderBankCode: isMeaningful(duplicateData.senderBankCode) ? duplicateData.senderBankCode : historyData.senderBankCode,
            receiverName: isMeaningful(duplicateData.receiverName) ? duplicateData.receiverName : historyData.receiverName,
            receiverBank: isMeaningful(duplicateData.receiverBank) ? duplicateData.receiverBank : historyData.receiverBank,
            receiverBankCode: isMeaningful(duplicateData.receiverBankCode) ? duplicateData.receiverBankCode : historyData.receiverBankCode,
            receiverAccountNumber: isMeaningful(duplicateData.receiverAccountNumber) ? duplicateData.receiverAccountNumber : historyData.receiverAccountNumber,
            isDuplicate: true,
          };
          this.logger.log(`[DUPLICATE] Enriched data: amountFormatted=${duplicateData.amountFormatted}, senderName=${duplicateData.senderName}, senderBankCode=${duplicateData.senderBankCode}`);
        } else {
          this.logger.warn(`[DUPLICATE] No original slip found in slip_history for transRef: ${transRef}`);
        }
      } else if (!transRef && needsEnrichment) {
        // Method 2: Match by QR decode payload (Slip2Go duplicate returns decode but not transRef)
        // The decode field is the raw QR/barcode content — same slip always produces the same decode
        const decodeValue = duplicateData.rawData?.decode || (result.data as any)?.rawData?.decode;
        if (decodeValue) {
          this.logger.log(`[DUPLICATE] No transRef, trying to match by decode payload: ${decodeValue.substring(0, 40)}...`);
          const originalSlip = await this.getOriginalSlipByDecode(decodeValue);
          if (originalSlip) {
            this.logger.log(`[DUPLICATE] Found original slip by decode: amount=${originalSlip.amount}, sender=${originalSlip.senderName}, transRef=${originalSlip.transRef}`);
            const historyData = this.buildSlipDataFromHistory(originalSlip);

            const isMeaningful = (val: any): boolean => {
              if (val === null || val === undefined || val === '') return false;
              if (typeof val === 'number' && val === 0) return false;
              if (typeof val === 'string' && (val === '฿0' || val === '0' || val.trim() === '')) return false;
              return true;
            };

            duplicateData = {
              ...historyData,
              transRef: isMeaningful(duplicateData.transRef) ? duplicateData.transRef : historyData.transRef,
              amount: isMeaningful(duplicateData.amount) ? duplicateData.amount : historyData.amount,
              amountFormatted: isMeaningful(duplicateData.amountFormatted) ? duplicateData.amountFormatted : historyData.amountFormatted,
              senderName: isMeaningful(duplicateData.senderName) ? duplicateData.senderName : historyData.senderName,
              senderBank: isMeaningful(duplicateData.senderBank) ? duplicateData.senderBank : historyData.senderBank,
              senderBankCode: isMeaningful(duplicateData.senderBankCode) ? duplicateData.senderBankCode : historyData.senderBankCode,
              receiverName: isMeaningful(duplicateData.receiverName) ? duplicateData.receiverName : historyData.receiverName,
              receiverBank: isMeaningful(duplicateData.receiverBank) ? duplicateData.receiverBank : historyData.receiverBank,
              receiverBankCode: isMeaningful(duplicateData.receiverBankCode) ? duplicateData.receiverBankCode : historyData.receiverBankCode,
              receiverAccountNumber: isMeaningful(duplicateData.receiverAccountNumber) ? duplicateData.receiverAccountNumber : historyData.receiverAccountNumber,
              isDuplicate: true,
            };
            this.logger.log(`[DUPLICATE] Enriched from decode match: amountFormatted=${duplicateData.amountFormatted}, senderName=${duplicateData.senderName}, senderBankCode=${duplicateData.senderBankCode}`);
          } else {
            this.logger.warn(`[DUPLICATE] No original slip found by decode payload — showing generic duplicate message`);
            duplicateData = { isDuplicate: true };
          }
        } else {
          // No transRef and no decode — cannot identify original slip, show generic message
          this.logger.warn(`[DUPLICATE] No transRef and no decode available — showing generic duplicate message`);
          duplicateData = { isDuplicate: true };
        }
      } else {
        this.logger.warn(`[DUPLICATE] Cannot enrich - conditions not met: transRef=${!!transRef}, needsEnrichment=${needsEnrichment}, hasLineUserId=${!!context?.lineUserId}, hasLineAccountId=${!!context?.lineAccountId}`);
      }

      // Check for custom template first
      if (accountSettings.slipDuplicateTemplate && Object.keys(accountSettings.slipDuplicateTemplate).length > 0) {
        const customTemplate = this.applyTemplateVariables(accountSettings.slipDuplicateTemplate, duplicateData);
        return addWarningToFlexMessage(customTemplate);
      }

      // IMPORTANT: Build slip data to add bank logo URLs (senderBankLogoUrl, receiverBankLogoUrl)
      const enrichedDuplicateData = await buildSlipData(duplicateData);
      this.logger.log(`[DUPLICATE] Enriched with logos: sender=${enrichedDuplicateData.senderBankLogoUrl}, receiver=${enrichedDuplicateData.receiverBankLogoUrl}`);

      // Try to use slip template with enriched duplicate data
      const templated = await tryUseSlipTemplate(TemplateType.DUPLICATE, enrichedDuplicateData);
      if (templated) {
        this.logger.log('[DUPLICATE] Using slip template for duplicate');
        return templated;
      }
      this.logger.debug('No template found for duplicate, using fallback');


      // Fallback: สร้าง flex message สำหรับสลิปซ้ำ (รวมบล็อกเตือน)
      const duplicateMessage = accountSettings.customDuplicateSlipMessage ||
        'สลิปนี้เคยถูกใช้แล้ว';

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
        result.message;
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

  private formatDate(isoDate: string | Date): string {
    try {
      const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
      // Use Asia/Bangkok timezone explicitly to match Thai bank slips
      return date.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
    } catch {
      return typeof isoDate === 'string' ? isoDate : '-';
    }
  }

  private formatTime(isoDate: string | Date): string {
    try {
      const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
      // Use Asia/Bangkok timezone explicitly to match Thai bank slips
      return date.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
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
