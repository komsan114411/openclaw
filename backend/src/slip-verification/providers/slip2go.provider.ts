/**
 * Slip2Go API Provider
 *
 * Provider สำหรับตรวจสอบสลิปผ่าน Slip2Go API (connect.slip2go.com)
 * รองรับการตรวจสอบสลิปด้วย QR-Code
 *
 * @see https://connect.slip2go.com/api
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
export class Slip2GoProvider implements SlipVerificationProvider {
  readonly providerName = SlipProvider.SLIP2GO;
  private readonly logger = new Logger(Slip2GoProvider.name);
  private readonly BASE_URL = 'https://connect.slip2go.com/api';
  private readonly TIMEOUT = 30000; // 30 seconds

  /**
   * ตรวจสอบสลิปจากรูปภาพ
   * ใช้ endpoint /verify-slip/qr-image/info
   */
  async verify(imageData: Buffer, apiKey: string): Promise<NormalizedVerificationResult> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new ProviderUnavailableError(
        SlipProvider.SLIP2GO,
        'API key not configured',
      );
    }

    if (!imageData || imageData.length === 0) {
      return {
        status: 'error',
        provider: SlipProvider.SLIP2GO,
        message: 'ไม่พบข้อมูลรูปภาพ',
        shouldFailover: false,
      };
    }

    const formData = new FormData();
    // Slip2Go uses 'file' field name for image upload
    formData.append('file', imageData, {
      filename: 'slip.jpg',
      contentType: 'image/jpeg',
    });

    // Add payload for duplicate check
    const payload = JSON.stringify({
      checkDuplicate: true,
    });
    formData.append('payload', payload);

    try {
      this.logger.log('[SLIP2GO] Sending verification request...');

      const response = await axios.post(
        `${this.BASE_URL}/verify-slip/qr-image/info`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${apiKey}`,
          },
          timeout: this.TIMEOUT,
          maxContentLength: 15 * 1024 * 1024,
          // Don't throw on 4xx responses - we handle them in normalizeResponse
          validateStatus: (status) => status < 500,
        },
      );

      this.logger.log(`[SLIP2GO] Response status: ${response.status}`);
      this.logger.log(`[SLIP2GO] Response data: ${JSON.stringify(response.data).substring(0, 500)}`);

      return this.normalizeResponse(response.data, response.status);
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * ทดสอบการเชื่อมต่อและตรวจสอบ quota
   * ใช้ endpoint /account/info
   */
  async testConnection(apiKey: string): Promise<{
    success: boolean;
    message: string;
    remainingQuota?: number;
    expiresAt?: string;
  }> {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        success: false,
        message: 'ยังไม่ได้ตั้งค่า API Key',
      };
    }

    try {
      const response = await axios.get(`${this.BASE_URL}/account/info`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 10000,
      });

      if (response.status === 200 && response.data.code === '200001') {
        const data = response.data.data;
        return {
          success: true,
          message: `เชื่อมต่อ Slip2Go API สำเร็จ (${data.shopName || 'Shop'})`,
          remainingQuota: data.quotaRemaining,
          expiresAt: data.packageExpiredDate,
        };
      }

      return {
        success: false,
        message: response.data.message || 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    } catch (error: any) {
      const status = error.response?.status;
      const errorCode = error.response?.data?.code;
      const errorMessage = error.response?.data?.message;

      this.logger.log(`[SLIP2GO] Test connection error: status=${status}, code=${errorCode}, message=${errorMessage}`);

      if (status === 401 || errorCode === '401001') {
        return {
          success: false,
          message: 'API Key ไม่ถูกต้อง',
        };
      }

      if (errorCode === '401002') {
        return {
          success: false,
          message: 'ไม่พบ Shop',
        };
      }

      if (errorCode === '401003') {
        return {
          success: false,
          message: 'บัญชีถูกระงับ',
        };
      }

      if (errorCode === '401004') {
        return {
          success: false,
          message: 'Package หมดอายุ',
        };
      }

      if (errorCode === '401005') {
        return {
          success: false,
          message: 'Quota ไม่เพียงพอ',
        };
      }

      if (errorCode === '401007') {
        return {
          success: false,
          message: 'IP ไม่อยู่ใน Whitelist',
        };
      }

      // Network error or timeout
      if (!status && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
        return {
          success: false,
          message: 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่',
        };
      }

      return {
        success: false,
        message: errorMessage || 'ไม่สามารถเชื่อมต่อ API ได้',
      };
    }
  }

  /**
   * Normalize Slip2Go response to standard format
   */
  private normalizeResponse(data: any, httpStatus: number = 200): NormalizedVerificationResult {
    this.logger.log(`[SLIP2GO] Response: httpStatus=${httpStatus}, code=${data?.code}, message=${data?.message}`);

    const code = data?.code || '';
    const message = data?.message || '';

    // ===== SUCCESS: Slip found (200000) =====
    if (code === '200000' && data?.data) {
      this.logger.log(`[SLIP2GO] Success: transRef=${data.data.transRef}`);
      return {
        status: 'success',
        provider: SlipProvider.SLIP2GO,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: this.extractSlipData(data.data),
        shouldFailover: false,
      };
    }

    // ===== VALID SLIP (200200) =====
    if (code === '200200' && data?.data) {
      this.logger.log(`[SLIP2GO] Valid slip: transRef=${data.data.transRef}`);
      return {
        status: 'success',
        provider: SlipProvider.SLIP2GO,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: this.extractSlipData(data.data),
        shouldFailover: false,
      };
    }

    // ===== DUPLICATE SLIP (200501) =====
    if (code === '200501') {
      this.logger.log('[SLIP2GO] Duplicate slip detected');
      return {
        status: 'duplicate',
        provider: SlipProvider.SLIP2GO,
        message: 'สลิปนี้เคยถูกใช้แล้ว',
        data: data?.data ? this.extractSlipData(data.data) : undefined,
        shouldFailover: false,
      };
    }

    // ===== SLIP NOT FOUND (200404) =====
    if (code === '200404') {
      this.logger.log('[SLIP2GO] Slip not found');
      return {
        status: 'not_found',
        provider: SlipProvider.SLIP2GO,
        message: 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
        shouldFailover: true, // Try other providers
      };
    }

    // ===== RECIPIENT NOT MATCH (200401) =====
    if (code === '200401') {
      this.logger.log('[SLIP2GO] Recipient account not match');
      return {
        status: 'success', // Still return data
        provider: SlipProvider.SLIP2GO,
        message: 'บัญชีผู้รับไม่ตรงกับที่กำหนด',
        data: data?.data ? this.extractSlipData(data.data) : undefined,
        shouldFailover: false,
      };
    }

    // ===== AMOUNT NOT MATCH (200402) =====
    if (code === '200402') {
      this.logger.log('[SLIP2GO] Transfer amount not match');
      return {
        status: 'success', // Still return data
        provider: SlipProvider.SLIP2GO,
        message: 'จำนวนเงินไม่ตรงกับที่กำหนด',
        data: data?.data ? this.extractSlipData(data.data) : undefined,
        shouldFailover: false,
      };
    }

    // ===== DATE NOT MATCH (200403) =====
    if (code === '200403') {
      this.logger.log('[SLIP2GO] Transfer date not match');
      return {
        status: 'success', // Still return data
        provider: SlipProvider.SLIP2GO,
        message: 'วันที่โอนไม่ตรงกับที่กำหนด',
        data: data?.data ? this.extractSlipData(data.data) : undefined,
        shouldFailover: false,
      };
    }

    // ===== QR CODE INCORRECT (400001) =====
    if (code === '400001' || httpStatus === 400) {
      this.logger.log('[SLIP2GO] QR Code incorrect - will try failover');
      return {
        status: 'error',
        provider: SlipProvider.SLIP2GO,
        message: 'ไม่สามารถอ่าน QR Code จากสลิปได้',
        shouldFailover: true, // Try other providers (might be TrueMoney Wallet)
      };
    }

    // ===== FILE INCORRECT (400002) =====
    if (code === '400002') {
      this.logger.log('[SLIP2GO] File incorrect');
      return {
        status: 'error',
        provider: SlipProvider.SLIP2GO,
        message: 'ไฟล์รูปภาพไม่ถูกต้อง',
        shouldFailover: true,
      };
    }

    // ===== REQUEST INVALID (400400) =====
    if (code === '400400') {
      this.logger.log('[SLIP2GO] Request object invalid');
      return {
        status: 'error',
        provider: SlipProvider.SLIP2GO,
        message: 'รูปแบบคำขอไม่ถูกต้อง',
        shouldFailover: false,
      };
    }

    // ===== AUTH ERRORS (401xxx) =====
    if (code.startsWith('401')) {
      const reason = this.getAuthErrorReason(code);
      this.logger.warn(`[SLIP2GO] Auth error: ${reason}`);
      throw new ProviderUnavailableError(SlipProvider.SLIP2GO, reason);
    }

    // ===== SERVER ERROR (500xxx) =====
    if (code.startsWith('500') || httpStatus >= 500) {
      this.logger.warn('[SLIP2GO] Server error');
      throw new ProviderUnavailableError(SlipProvider.SLIP2GO, 'Server error');
    }

    // ===== UNKNOWN ERROR =====
    this.logger.warn(`[SLIP2GO] Unknown response: code=${code}, message=${message}`);
    return {
      status: 'error',
      provider: SlipProvider.SLIP2GO,
      message: message || 'ไม่สามารถตรวจสอบสลิปได้',
      shouldFailover: true,
    };
  }

  /**
   * Get auth error reason from code
   */
  private getAuthErrorReason(code: string): string {
    switch (code) {
      case '401001': return 'Invalid API key';
      case '401002': return 'Shop not found';
      case '401003': return 'Account suspended';
      case '401004': return 'Package expired';
      case '401005': return 'Insufficient quota';
      case '401006': return 'Insufficient credit';
      case '401007': return 'IP not in whitelist';
      default: return 'Authentication failed';
    }
  }

  /**
   * Extract and normalize slip data from Slip2Go response
   */
  private extractSlipData(slipData: any): NormalizedSlipData {
    this.logger.log(`[SLIP2GO] Extracting slip data: ${JSON.stringify(slipData).substring(0, 500)}`);

    const amount = parseFloat(slipData.amount || 0);
    const dateTime = slipData.dateTime || new Date().toISOString();

    // Extract sender info
    const sender = slipData.sender || {};
    const senderAccount = sender.account || {};
    const senderBank = sender.bank || {};
    const senderName = senderAccount.name || '';
    const senderBankAccount = senderAccount.bank?.account || '';

    // Extract receiver info
    const receiver = slipData.receiver || {};
    const receiverAccount = receiver.account || {};
    const receiverBank = receiver.bank || {};
    const receiverName = receiverAccount.name || '';
    const receiverBankAccount = receiverAccount.bank?.account || receiverAccount.proxy?.account || '';

    // Detect payment type (PromptPay, TrueMoney, etc.)
    const senderPaymentType = this.detectPaymentType(senderAccount, senderBank);
    const receiverPaymentType = this.detectPaymentType(receiverAccount, receiverBank);

    return {
      transRef: slipData.transRef || '',
      amount: amount,
      amountFormatted: this.formatAmount(amount),
      date: this.formatDate(dateTime),
      time: this.formatTime(dateTime),
      // Sender
      senderName: senderName,
      senderNameEn: '',
      senderBank: senderPaymentType.bankName,
      senderBankCode: senderPaymentType.bankCode,
      senderAccount: senderBankAccount,
      // Receiver
      receiverName: receiverName,
      receiverNameEn: '',
      receiverBank: receiverPaymentType.bankName,
      receiverBankCode: receiverPaymentType.bankCode,
      receiverAccount: receiverBankAccount,
      receiverAccountNumber: receiverBankAccount,
      // Additional
      countryCode: 'TH',
      fee: slipData.fee || 0,
      ref1: slipData.ref1 || '',
      ref2: slipData.ref2 || '',
      ref3: slipData.ref3 || '',
      rawData: slipData,
    };
  }

  /**
   * Detect payment type from account and bank info
   */
  private detectPaymentType(account: any, bank: any): { bankName: string; bankCode: string } {
    const proxyType = (account.proxy?.type || '').toUpperCase();
    const bankId = bank.id || '';
    const bankName = (bank.name || '').toLowerCase();

    this.logger.debug(`[SLIP2GO] detectPaymentType: proxyType=${proxyType}, bankId=${bankId}, bankName=${bankName}`);

    // TrueMoney Wallet detection
    if (
      proxyType === 'EWALLTID' ||
      proxyType === 'EWALLETID' ||
      bankName.includes('truemoney') ||
      bankName.includes('ทรูมันนี่')
    ) {
      return { bankName: 'ทรูมันนี่ วอลเล็ท', bankCode: 'TRUEMONEY' };
    }

    // PromptPay detection
    if (
      proxyType === 'NATID' ||
      proxyType === 'MSISDN' ||
      proxyType === 'EMAIL' ||
      proxyType === 'BILLERID'
    ) {
      return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
    }

    // เป๋าตัง (GSB Wallet)
    if (proxyType === 'ORFT') {
      return { bankName: 'เป๋าตัง', bankCode: 'PAOTANG' };
    }

    // Map bank ID to bank code
    const bankCodeMap: Record<string, { name: string; code: string }> = {
      '002': { name: 'ธนาคารกรุงเทพ', code: 'BBL' },
      '004': { name: 'ธนาคารกสิกรไทย', code: 'KBANK' },
      '006': { name: 'ธนาคารกรุงไทย', code: 'KTB' },
      '011': { name: 'ธนาคารทหารไทยธนชาต', code: 'TTB' },
      '014': { name: 'ธนาคารไทยพาณิชย์', code: 'SCB' },
      '017': { name: 'ธนาคารซิตี้แบงก์', code: 'CITI' },
      '020': { name: 'ธนาคารสแตนดาร์ดชาร์เตอร์ด', code: 'SCBT' },
      '022': { name: 'ธนาคารซีไอเอ็มบี ไทย', code: 'CIMBT' },
      '024': { name: 'ธนาคารยูโอบี', code: 'UOBT' },
      '025': { name: 'ธนาคารกรุงศรีอยุธยา', code: 'BAY' },
      '030': { name: 'ธนาคารออมสิน', code: 'GSB' },
      '033': { name: 'ธนาคารอาคารสงเคราะห์', code: 'GHB' },
      '034': { name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร', code: 'BAAC' },
      '065': { name: 'ธนาคารธนชาต', code: 'TBANK' },
      '066': { name: 'ธนาคารอิสลามแห่งประเทศไทย', code: 'ISBT' },
      '067': { name: 'ธนาคารทิสโก้', code: 'TISCO' },
      '069': { name: 'ธนาคารเกียรตินาคินภัทร', code: 'KKP' },
      '070': { name: 'ธนาคารไอซีบีซี (ไทย)', code: 'ICBCT' },
      '071': { name: 'ธนาคารไทยเครดิต', code: 'TCR' },
      '073': { name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', code: 'LHFG' },
    };

    if (bankId && bankCodeMap[bankId]) {
      return {
        bankName: bankCodeMap[bankId].name,
        bankCode: bankCodeMap[bankId].code,
      };
    }

    // Default: use bank name from response
    return {
      bankName: bank.name || '',
      bankCode: bankId || '',
    };
  }

  /**
   * Handle errors from API call
   */
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
        reason = 'Forbidden';
      } else if (status >= 500) {
        reason = 'Server error';
      }

      this.logger.warn(`[SLIP2GO] Provider unavailable: ${reason}`);
      throw new ProviderUnavailableError(SlipProvider.SLIP2GO, reason, error);
    }

    // Handle specific error responses
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const code = data?.code || '';

      // Use normalizeResponse for known error codes
      if (code) {
        return this.normalizeResponse(data, status);
      }

      // Generic HTTP errors
      if (status === 400) {
        return {
          status: 'error',
          provider: SlipProvider.SLIP2GO,
          message: data?.message || 'รูปแบบคำขอไม่ถูกต้อง',
          shouldFailover: true,
        };
      }

      if (status === 404) {
        return {
          status: 'not_found',
          provider: SlipProvider.SLIP2GO,
          message: 'ไม่พบข้อมูลสลิป',
          shouldFailover: true,
        };
      }

      if (status === 429) {
        return {
          status: 'error',
          provider: SlipProvider.SLIP2GO,
          message: 'ระบบมีผู้ใช้มากเกินไป กรุณาลองใหม่อีกครั้ง',
          shouldFailover: true,
        };
      }
    }

    // Generic error
    this.logger.error('[SLIP2GO] Unexpected error:', error);
    return {
      status: 'error',
      provider: SlipProvider.SLIP2GO,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป',
      error,
      shouldFailover: true,
    };
  }

  /**
   * Format amount with Thai Baht symbol
   */
  private formatAmount(amount: any): string {
    const num = parseFloat(amount) || 0;
    return `฿${num.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`;
  }

  /**
   * Format date to Thai locale
   */
  private formatDate(isoDate: string | Date): string {
    try {
      const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
      return date.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
    } catch {
      return typeof isoDate === 'string' ? isoDate : '-';
    }
  }

  /**
   * Format time to Thai locale
   */
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
