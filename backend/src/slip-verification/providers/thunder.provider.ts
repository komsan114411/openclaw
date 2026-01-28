/**
 * Thunder API Provider
 *
 * Provider สำหรับตรวจสอบสลิปผ่าน Thunder API (api.thunder.in.th)
 * Extract logic จาก slip-verification.service.ts เดิม
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
export class ThunderProvider implements SlipVerificationProvider {
  readonly providerName = SlipProvider.THUNDER;
  private readonly logger = new Logger(ThunderProvider.name);
  private readonly BASE_URL = 'https://api.thunder.in.th';
  private readonly TIMEOUT = 60000; // 60 seconds

  async verify(imageData: Buffer, apiKey: string): Promise<NormalizedVerificationResult> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new ProviderUnavailableError(
        SlipProvider.THUNDER,
        'API key not configured',
      );
    }

    if (!imageData || imageData.length === 0) {
      return {
        status: 'error',
        provider: SlipProvider.THUNDER,
        message: 'ไม่พบข้อมูลรูปภาพ',
        shouldFailover: false,
      };
    }

    // Try bank slip verification first
    const bankResult = await this.verifyWithEndpoint(imageData, apiKey, '/v1/verify');

    // If bank verification fails with specific errors, try TrueMoney Wallet endpoint
    if (bankResult.status === 'error' || bankResult.status === 'not_found') {
      const errorMsg = (bankResult.message || '').toLowerCase();
      // Try TrueMoney endpoint if bank endpoint can't read QR or returns error
      if (
        errorMsg.includes('qr') ||
        errorMsg.includes('invalid') ||
        errorMsg.includes('ไม่พบ') ||
        errorMsg.includes('ไม่สามารถ') ||
        bankResult.status === 'not_found'
      ) {
        this.logger.log('[THUNDER] Bank endpoint failed, trying TrueMoney Wallet endpoint...');
        const trueMoneyResult = await this.verifyWithEndpoint(imageData, apiKey, '/v1/verify/truewallet');

        // If TrueMoney endpoint succeeds, return that result
        if (trueMoneyResult.status === 'success' || trueMoneyResult.status === 'duplicate') {
          this.logger.log('[THUNDER] TrueMoney Wallet endpoint succeeded');
          return trueMoneyResult;
        }
      }
    }

    return bankResult;
  }

  private async verifyWithEndpoint(
    imageData: Buffer,
    apiKey: string,
    endpoint: string,
  ): Promise<NormalizedVerificationResult> {
    const formData = new FormData();
    formData.append('file', imageData, {
      filename: 'slip.jpg',
      contentType: 'image/jpeg',
    });
    formData.append('checkDuplicate', 'true');

    try {
      this.logger.log(`[THUNDER] Sending request to ${endpoint}...`);

      const response = await axios.post(
        `${this.BASE_URL}${endpoint}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: this.TIMEOUT,
          maxContentLength: 15 * 1024 * 1024,
        },
      );

      return this.normalizeResponse(response.data, endpoint);
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
      const response = await axios.get(`${this.BASE_URL}/v1/me`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      });

      if (response.status === 200) {
        const data = response.data.data;
        return {
          success: true,
          message: 'เชื่อมต่อ Thunder API สำเร็จ',
          remainingQuota: data.remainingQuota,
          expiresAt: data.expiredAt,
        };
      }

      return {
        success: false,
        message: 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    }
  }

  private normalizeResponse(data: any, endpoint: string = '/v1/verify'): NormalizedVerificationResult {
    const isTrueWallet = endpoint.includes('truewallet');

    // Success case
    if (data.status === 200 && data.data) {
      const slipData = data.data;
      this.logger.log(`[THUNDER] Success via ${endpoint}`);
      return {
        status: 'success',
        provider: SlipProvider.THUNDER,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: this.extractSlipData(slipData, isTrueWallet),
        shouldFailover: false,
      };
    }

    // Duplicate case (status 400 with message "duplicate_slip")
    if (data.status === 400 && data.message === 'duplicate_slip') {
      this.logger.log(`[THUNDER] Duplicate slip detected via ${endpoint}`);
      const slipData = data.data || {};
      return {
        status: 'duplicate',
        provider: SlipProvider.THUNDER,
        message: 'สลิปนี้เคยถูกใช้แล้ว',
        data: this.extractSlipData(slipData, isTrueWallet),
        shouldFailover: false,
      };
    }

    // Other errors
    return {
      status: 'error',
      provider: SlipProvider.THUNDER,
      message: data.message || 'ไม่สามารถตรวจสอบสลิปได้',
      shouldFailover: false,
    };
  }

  private extractSlipData(slipData: any, isTrueWallet: boolean = false): NormalizedSlipData {
    // TrueMoney Wallet has different response format
    if (isTrueWallet) {
      return this.extractTrueWalletSlipData(slipData);
    }

    // Bank slip format
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

  /**
   * Extract slip data from TrueMoney Wallet response
   * TrueMoney Wallet has different format than bank slips
   */
  private extractTrueWalletSlipData(slipData: any): NormalizedSlipData {
    // TrueMoney Wallet format:
    // { transactionId, date, amount, senderName, receiverName, receiverMobileNumber }
    this.logger.log(`[THUNDER] Extracting TrueMoney Wallet data: ${JSON.stringify(slipData).substring(0, 500)}`);

    const amount = parseFloat(slipData.amount || 0);

    return {
      transRef: slipData.transactionId || slipData.transRef || '',
      amount: amount,
      amountFormatted: this.formatAmount(amount),
      date: this.formatDate(slipData.date),
      time: this.formatTime(slipData.date),
      // Sender - TrueMoney uses senderName directly
      senderName: slipData.senderName || '',
      senderNameEn: '',
      senderBank: 'ทรูมันนี่ วอลเล็ท',
      senderBankCode: 'TRUEMONEY',
      senderAccount: slipData.senderMobileNumber || '',
      // Receiver - TrueMoney uses receiverName and receiverMobileNumber
      receiverName: slipData.receiverName || '',
      receiverNameEn: '',
      receiverBank: 'ทรูมันนี่ วอลเล็ท',
      receiverBankCode: 'TRUEMONEY',
      receiverAccount: slipData.receiverMobileNumber || '',
      receiverAccountNumber: slipData.receiverMobileNumber || '',
      // Additional
      countryCode: 'TH',
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
      } else if (status === 402) {
        reason = 'Insufficient credits';
      } else if (status === 403) {
        reason = 'Forbidden';
      } else if (status >= 500) {
        reason = 'Server error';
      }

      this.logger.warn(`[THUNDER] Provider unavailable: ${reason}`);
      throw new ProviderUnavailableError(SlipProvider.THUNDER, reason, error);
    }

    // Handle specific error responses
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 400) {
        const message = data.message || '';

        // Duplicate slip
        if (message === 'duplicate_slip' || message.includes('duplicate')) {
          const slipData = data.data || {};
          return {
            status: 'duplicate',
            provider: SlipProvider.THUNDER,
            message: 'สลิปนี้เคยถูกใช้แล้ว',
            data: this.extractSlipData(slipData),
            shouldFailover: false,
          };
        }

        // Invalid payload
        if (message === 'invalid_payload' || message.includes('invalid')) {
          return {
            status: 'error',
            provider: SlipProvider.THUNDER,
            message: 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปให้ชัดเจน',
            shouldFailover: false,
          };
        }

        // QR not found
        if (message.includes('qr') || message.includes('QR')) {
          return {
            status: 'not_found',
            provider: SlipProvider.THUNDER,
            message: 'ไม่พบ QR Code ในสลิป กรุณาถ่ายรูปให้ครบทั้งใบ',
            shouldFailover: false,
          };
        }

        return {
          status: 'error',
          provider: SlipProvider.THUNDER,
          message: message || 'รูปแบบสลิปไม่ถูกต้อง',
          shouldFailover: false,
        };
      }

      if (status === 404) {
        return {
          status: 'not_found',
          provider: SlipProvider.THUNDER,
          message: 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
          shouldFailover: false,
        };
      }

      if (status === 429) {
        return {
          status: 'error',
          provider: SlipProvider.THUNDER,
          message: 'ระบบตรวจสอบสลิปมีผู้ใช้มากเกินไป กรุณาลองใหม่อีกครั้ง',
          shouldFailover: true,
        };
      }
    }

    // Generic error
    this.logger.error('[THUNDER] Unexpected error:', error);
    return {
      status: 'error',
      provider: SlipProvider.THUNDER,
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
