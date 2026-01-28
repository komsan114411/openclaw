/**
 * SlipMate API Provider
 *
 * Provider สำหรับตรวจสอบสลิปผ่าน SlipMate API (api.slipmate.ai)
 * ใช้ KBank Slip Verification เป็น Backend
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import {
  SlipProvider,
  SlipVerificationProvider,
  NormalizedVerificationResult,
  NormalizedSlipData,
  ProviderUnavailableError,
  shouldTriggerFailover,
} from './slip-provider.interface';

@Injectable()
export class SlipMateProvider implements SlipVerificationProvider {
  readonly providerName = SlipProvider.SLIPMATE;
  private readonly logger = new Logger(SlipMateProvider.name);
  private readonly BASE_URL = 'https://api.slipmate.ai/open-api';
  private readonly TIMEOUT = 30000; // 30 seconds

  async verify(imageData: Buffer, apiKey: string): Promise<NormalizedVerificationResult> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new ProviderUnavailableError(
        SlipProvider.SLIPMATE,
        'API key not configured',
      );
    }

    if (!imageData || imageData.length === 0) {
      return {
        status: 'error',
        provider: SlipProvider.SLIPMATE,
        message: 'ไม่พบข้อมูลรูปภาพ',
        shouldFailover: false,
      };
    }

    const formData = new FormData();
    formData.append('file', imageData, {
      filename: 'slip.jpg',
      contentType: 'image/jpeg',
    });

    try {
      this.logger.log('[SLIPMATE] Sending verification request...');

      const response = await axios.post(
        `${this.BASE_URL}/v1/verify`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'X-API-KEY': apiKey,
          },
          timeout: this.TIMEOUT,
          maxContentLength: 15 * 1024 * 1024,
        },
      );

      return this.normalizeResponse(response.data);
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async testConnection(apiKey: string): Promise<{
    success: boolean;
    message: string;
    remainingQuota?: number;
    expiresAt?: string;
  }> {
    try {
      // SlipMate อาจไม่มี endpoint สำหรับ check quota โดยตรง
      // ลองเรียก API ด้วย empty request เพื่อเช็ค API key
      const response = await axios.get(`${this.BASE_URL}/v1/me`, {
        headers: { 'X-API-KEY': apiKey },
        timeout: 10000,
      });

      if (response.status === 200) {
        const data = response.data;
        return {
          success: true,
          message: 'เชื่อมต่อ SlipMate API สำเร็จ',
          remainingQuota: data.remainingQuota || data.quota?.remaining,
          expiresAt: data.expiresAt || data.expiredAt,
        };
      }

      return {
        success: false,
        message: 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    } catch (error: any) {
      const status = error.response?.status;

      if (status === 401) {
        return {
          success: false,
          message: 'API Key ไม่ถูกต้อง',
        };
      }

      if (status === 403) {
        return {
          success: false,
          message: 'เครดิตหมดหรือ API Key ถูกระงับ',
        };
      }

      // ถ้าไม่มี /v1/me endpoint ลอง validate ด้วยวิธีอื่น
      if (status === 404) {
        // Assume API key is valid if endpoint not found
        return {
          success: true,
          message: 'เชื่อมต่อ SlipMate API สำเร็จ (ไม่สามารถตรวจสอบ quota)',
        };
      }

      return {
        success: false,
        message: error.response?.data?.message || 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    }
  }

  private normalizeResponse(data: any): NormalizedVerificationResult {
    // SlipMate success response (statusCode: 200 in response body)
    const statusCode = data.statusCode || data.status;

    if (statusCode === 200 && data.data) {
      const slipData = data.data;
      this.logger.log(`[SLIPMATE] Success: transRef=${slipData.transRef}`);

      return {
        status: 'success',
        provider: SlipProvider.SLIPMATE,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: this.extractSlipData(slipData),
        shouldFailover: false,
      };
    }

    // Not found
    if (statusCode === 404) {
      return {
        status: 'not_found',
        provider: SlipProvider.SLIPMATE,
        message: 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
        shouldFailover: false,
      };
    }

    // Other errors from response body
    return {
      status: 'error',
      provider: SlipProvider.SLIPMATE,
      message: data.message || 'ไม่สามารถตรวจสอบสลิปได้',
      shouldFailover: false,
    };
  }

  private extractSlipData(slipData: any): NormalizedSlipData {
    const senderAccount = slipData.sender?.account || {};
    const receiverAccount = slipData.receiver?.account || {};
    const senderBank = slipData.sender?.bank || {};
    const receiverBank = slipData.receiver?.bank || {};

    const senderPaymentType = this.detectPaymentType(senderAccount, senderBank);
    const receiverPaymentType = this.detectPaymentType(receiverAccount, receiverBank);

    return {
      transRef: slipData.transRef || '',
      amount: parseFloat(slipData.amount?.amount || 0),
      amountFormatted: this.formatAmount(slipData.amount?.amount || 0),
      date: this.formatDate(slipData.date),
      time: this.formatTime(slipData.date),
      // Sender
      senderName: senderAccount.name?.th || senderAccount.name?.en || '',
      senderNameEn: senderAccount.name?.en || '',
      senderBank: senderPaymentType.bankName,
      senderBankCode: senderPaymentType.bankCode,
      senderAccount: senderAccount.bank?.account || senderAccount.proxy?.account || '',
      // Receiver
      receiverName: receiverAccount.name?.th || receiverAccount.name?.en || '',
      receiverNameEn: receiverAccount.name?.en || '',
      receiverBank: receiverPaymentType.bankName,
      receiverBankCode: receiverPaymentType.bankCode,
      receiverAccount: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
      receiverAccountNumber: receiverAccount.bank?.account || receiverAccount.proxy?.account || receiverAccount.proxy || '',
      // Additional
      countryCode: slipData.countryCode || 'TH',
      fee: slipData.fee ?? 0,
      ref1: slipData.ref1 || '',
      ref2: slipData.ref2 || '',
      ref3: slipData.ref3 || '',
      rawData: slipData,
    };
  }

  private detectPaymentType(account: any, bank: any): { bankName: string; bankCode: string } {
    const proxyType = account.proxy?.type?.toUpperCase() || '';
    const bankName = bank.name?.toLowerCase() || '';
    const bankShort = bank.short?.toUpperCase() || '';
    const accountNameTh = (account.name?.th || '').toLowerCase();
    const accountNameEn = (account.name?.en || '').toLowerCase();

    // TrueMoney Wallet detection
    if (
      proxyType === 'EWALLETID' ||
      bankName.includes('truemoney') ||
      bankName.includes('ทรูมันนี่') ||
      bankShort === 'TMN' ||
      bankShort === 'TRUEMONEY' ||
      accountNameTh.includes('truemoney') ||
      accountNameTh.includes('ทรูมันนี่') ||
      accountNameEn.includes('truemoney')
    ) {
      return { bankName: 'ทรูมันนี่ วอลเล็ท', bankCode: 'TRUEMONEY' };
    }

    // PromptPay detection
    if (account.proxy && (proxyType === 'MOBILE' || proxyType === 'NATID' || proxyType === 'BILLERID')) {
      return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
    }

    // Default: use bank info
    return {
      bankName: bank.short || bank.name || '',
      bankCode: bank.short || bank.id || '',
    };
  }

  private handleError(error: any): NormalizedVerificationResult {
    // Check if should failover
    if (shouldTriggerFailover(error)) {
      const status = error.response?.status;
      let reason = 'Unknown error';

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        reason = 'Timeout';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        reason = 'Connection refused';
      } else if (status === 401) {
        reason = 'Invalid API key';
      } else if (status === 403) {
        reason = 'Insufficient credits';
      } else if (status >= 500) {
        reason = 'Server error';
      }

      this.logger.warn(`[SLIPMATE] Provider unavailable: ${reason}`);
      throw new ProviderUnavailableError(SlipProvider.SLIPMATE, reason, error);
    }

    // Handle specific error responses
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // Duplicate slip (SlipMate uses 409 Conflict)
      if (status === 409) {
        this.logger.log('[SLIPMATE] Duplicate slip detected (409)');
        const slipData = data.data || {};
        return {
          status: 'duplicate',
          provider: SlipProvider.SLIPMATE,
          message: 'สลิปนี้เคยถูกใช้แล้ว',
          data: Object.keys(slipData).length > 0 ? this.extractSlipData(slipData) : undefined,
          shouldFailover: false,
        };
      }

      // Also check for duplicate_slip message in 400
      if (status === 400) {
        const message = data.message || '';

        if (message === 'duplicate_slip' || message.includes('duplicate')) {
          const slipData = data.data || {};
          return {
            status: 'duplicate',
            provider: SlipProvider.SLIPMATE,
            message: 'สลิปนี้เคยถูกใช้แล้ว',
            data: Object.keys(slipData).length > 0 ? this.extractSlipData(slipData) : undefined,
            shouldFailover: false,
          };
        }

        // Invalid payload
        if (message.includes('invalid') || message.includes('payload')) {
          return {
            status: 'error',
            provider: SlipProvider.SLIPMATE,
            message: 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปให้ชัดเจน',
            shouldFailover: false,
          };
        }

        // QR not found
        if (message.includes('qr') || message.includes('QR')) {
          return {
            status: 'not_found',
            provider: SlipProvider.SLIPMATE,
            message: 'ไม่พบ QR Code ในสลิป กรุณาถ่ายรูปให้ครบทั้งใบ',
            shouldFailover: false,
          };
        }

        return {
          status: 'error',
          provider: SlipProvider.SLIPMATE,
          message: message || 'รูปแบบสลิปไม่ถูกต้อง',
          shouldFailover: false,
        };
      }

      if (status === 404) {
        return {
          status: 'not_found',
          provider: SlipProvider.SLIPMATE,
          message: 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
          shouldFailover: false,
        };
      }

      if (status === 429) {
        return {
          status: 'error',
          provider: SlipProvider.SLIPMATE,
          message: 'ระบบตรวจสอบสลิปมีผู้ใช้มากเกินไป กรุณาลองใหม่อีกครั้ง',
          shouldFailover: true,
        };
      }
    }

    // Generic error
    this.logger.error('[SLIPMATE] Unexpected error:', error);
    return {
      status: 'error',
      provider: SlipProvider.SLIPMATE,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป',
      error,
      shouldFailover: false,
    };
  }

  private formatAmount(amount: any): string {
    const num = parseFloat(amount) || 0;
    return `฿${num.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`;
  }

  private formatDate(isoDate: string | Date): string {
    try {
      const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
      return date.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
    } catch {
      return typeof isoDate === 'string' ? isoDate : '-';
    }
  }

  private formatTime(isoDate: string | Date): string {
    try {
      const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
      return date.toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  }
}
