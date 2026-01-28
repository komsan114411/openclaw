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
    // SlipMate uses 'file' field name (same as Thunder)
    formData.append('file', imageData, {
      filename: 'slip.jpg',
      contentType: 'image/jpeg',
    });
    // Allow duplicate to get full slip data - we check duplicate ourselves in database
    // SlipMate returns 409 without slip data when allowDuplicate=false
    formData.append('allowDuplicate', 'true');

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
          // Don't throw on 4xx responses - we handle them in normalizeResponse
          validateStatus: (status) => status < 500,
        },
      );

      this.logger.log(`[SLIPMATE] Response status: ${response.status}`);
      this.logger.log(`[SLIPMATE] Response data: ${JSON.stringify(response.data).substring(0, 500)}`);

      return this.normalizeResponse(response.data, response.status);
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
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        success: false,
        message: 'ยังไม่ได้ตั้งค่า API Key',
      };
    }

    try {
      // SlipMate doesn't have a /me endpoint, try quota endpoint or just validate the key format
      // Try the quota endpoint first
      const response = await axios.get(`${this.BASE_URL}/v1/quota`, {
        headers: { 'X-API-KEY': apiKey },
        timeout: 10000,
      });

      if (response.status === 200) {
        const data = response.data;
        return {
          success: true,
          message: 'เชื่อมต่อ SlipMate API สำเร็จ',
          remainingQuota: data.remainingQuota || data.quota?.remaining || data.remaining,
          expiresAt: data.expiresAt || data.expiredAt,
        };
      }

      return {
        success: true,
        message: 'เชื่อมต่อ SlipMate API สำเร็จ',
      };
    } catch (error: any) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.message || error.response?.data?.error;

      this.logger.log(`[SLIPMATE] Test connection error: status=${status}, message=${errorMessage}`);

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

      // If endpoint not found (404), the API key might still be valid
      // SlipMate might not have a quota check endpoint
      if (status === 404) {
        // Validate by checking if key looks valid (has correct format)
        if (apiKey.length >= 20) {
          return {
            success: true,
            message: 'API Key ถูกตั้งค่าแล้ว (ไม่สามารถตรวจสอบ quota ได้)',
          };
        }
      }

      // Network error or timeout - might still be valid
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

  private normalizeResponse(data: any, httpStatus: number = 200): NormalizedVerificationResult {
    // Log full response for debugging
    this.logger.log(`[SLIPMATE] Response: httpStatus=${httpStatus}, body=${JSON.stringify(data).substring(0, 1000)}`);

    const statusCode = data?.statusCode ?? data?.status;
    const message = data?.message || data?.error || '';
    const code = data?.code || '';

    // ===== CHECK FOR DUPLICATE FIRST =====
    // SlipMate API returns duplicate in these ways:
    // 1. HTTP 409 Conflict
    // 2. statusCode 409 in body
    // 3. code === 'OPENAPI_FAILURE' with message "Transaction Reference already exist"
    // 4. code === 'DUPLICATE_SLIP' or 'duplicate'
    // 5. message contains 'duplicate' or 'already exist'
    const messageStr = typeof message === 'string' ? message.toLowerCase() : '';
    const isDuplicate =
      httpStatus === 409 ||
      statusCode === 409 ||
      (code === 'OPENAPI_FAILURE' && messageStr.includes('already exist')) ||
      (code === 'OPENAPI_FAILURE' && messageStr.includes('transaction reference')) ||
      code === 'DUPLICATE_SLIP' ||
      code === 'duplicate' ||
      code === 'DUPLICATE' ||
      messageStr.includes('duplicate') ||
      messageStr.includes('already exist') ||
      data?.duplicate === true ||
      data?.isDuplicate === true;

    if (isDuplicate) {
      this.logger.log(`[SLIPMATE] Duplicate slip detected! httpStatus=${httpStatus}, statusCode=${statusCode}, code=${code}, message=${message}`);

      // Try to find slip data in response - SlipMate may include it in different locations
      let slipData: any = null;

      // Check if data contains slip info directly (transRef is the key indicator)
      if (data?.transRef) {
        slipData = data;
      } else if (data?.data?.transRef) {
        slipData = data.data;
      } else if (data?.slip?.transRef) {
        slipData = data.slip;
      } else if (data?.slipData?.transRef) {
        slipData = data.slipData;
      }

      this.logger.log(`[SLIPMATE] Duplicate slip data found: ${slipData ? 'YES' : 'NO'}, transRef=${slipData?.transRef || 'none'}`);

      return {
        status: 'duplicate',
        provider: SlipProvider.SLIPMATE,
        message: 'สลิปนี้เคยถูกใช้แล้ว',
        data: slipData ? this.extractSlipData(slipData) : undefined,
        shouldFailover: false,
      };
    }

    // ===== FORBIDDEN / NO CREDITS (HTTP 403 or statusCode 403) =====
    if (httpStatus === 403 || statusCode === 403) {
      this.logger.warn('[SLIPMATE] Forbidden or no credits (403)');
      throw new ProviderUnavailableError(SlipProvider.SLIPMATE, 'Insufficient credits');
    }

    // ===== UNAUTHORIZED (HTTP 401 or statusCode 401) =====
    if (httpStatus === 401 || statusCode === 401) {
      this.logger.warn('[SLIPMATE] Unauthorized (401)');
      throw new ProviderUnavailableError(SlipProvider.SLIPMATE, 'Invalid API key');
    }

    // ===== BAD REQUEST (HTTP 400 or statusCode 400) =====
    if (httpStatus === 400 || statusCode === 400) {
      // Invalid QR or payload
      if (typeof message === 'string' && (message.toLowerCase().includes('qr') || message.toLowerCase().includes('invalid'))) {
        return {
          status: 'error',
          provider: SlipProvider.SLIPMATE,
          message: 'ไม่สามารถอ่าน QR Code จากสลิปได้ กรุณาถ่ายรูปให้ชัดเจน',
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

    // ===== NOT FOUND (HTTP 404 or statusCode 404) =====
    if (httpStatus === 404 || statusCode === 404) {
      return {
        status: 'not_found',
        provider: SlipProvider.SLIPMATE,
        message: 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
        shouldFailover: false,
      };
    }

    // ===== CHECK FOR SUCCESS - Multiple formats =====
    // Format 1: Direct transRef in response
    if (data?.transRef) {
      this.logger.log(`[SLIPMATE] Success (direct): transRef=${data.transRef}`);
      return {
        status: 'success',
        provider: SlipProvider.SLIPMATE,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: this.extractSlipData(data),
        shouldFailover: false,
      };
    }

    // Format 2: Wrapped response { data: { transRef: ... } }
    if (data?.data?.transRef) {
      this.logger.log(`[SLIPMATE] Success (wrapped): transRef=${data.data.transRef}`);
      return {
        status: 'success',
        provider: SlipProvider.SLIPMATE,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: this.extractSlipData(data.data),
        shouldFailover: false,
      };
    }

    // Format 3: success: true flag
    if (data?.success === true && data?.data) {
      const slipData = data.data;
      this.logger.log(`[SLIPMATE] Success (success flag): transRef=${slipData.transRef}`);
      return {
        status: 'success',
        provider: SlipProvider.SLIPMATE,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: this.extractSlipData(slipData),
        shouldFailover: false,
      };
    }

    // Format 4: statusCode 200 with data
    if ((statusCode === 200 || httpStatus === 200) && data?.data) {
      const slipData = data.data;
      if (slipData.transRef) {
        this.logger.log(`[SLIPMATE] Success (statusCode 200): transRef=${slipData.transRef}`);
        return {
          status: 'success',
          provider: SlipProvider.SLIPMATE,
          message: 'ตรวจสอบสลิปสำเร็จ',
          data: this.extractSlipData(slipData),
          shouldFailover: false,
        };
      }
    }

    // ===== ERROR IN BODY (success: false or has error message) =====
    if (data?.success === false || data?.error || (message && !data?.transRef && !data?.data?.transRef)) {
      const errMsg = typeof message === 'string' ? message : (data?.error || 'ไม่สามารถตรวจสอบสลิปได้');
      this.logger.warn(`[SLIPMATE] Error in response body: ${errMsg}`);
      return {
        status: 'error',
        provider: SlipProvider.SLIPMATE,
        message: errMsg,
        shouldFailover: false,
      };
    }

    // ===== UNKNOWN STATUS =====
    this.logger.warn(`[SLIPMATE] Unknown response format: httpStatus=${httpStatus}, statusCode=${statusCode}`);
    return {
      status: 'error',
      provider: SlipProvider.SLIPMATE,
      message: message || 'ไม่สามารถตรวจสอบสลิปได้',
      shouldFailover: false,
    };
  }

  private extractSlipData(slipData: any): NormalizedSlipData {
    // SlipMate response format:
    // { transRef, transDate, transTime, transDateTime, amount,
    //   sendingBank, sendingBankName, sendingBankLogo,
    //   receivingBank, receivingBankName, receivingBankLogo,
    //   sender: { displayName, name, proxy: {type, value}, account: {type, value} },
    //   receiver: { displayName, name, proxy: {type, value}, account: {type, value} },
    //   ref1, ref2, ref3, ... }

    const sender = slipData.sender || {};
    const receiver = slipData.receiver || {};

    // Extract sender info - SlipMate uses displayName
    const senderName = sender.displayName || sender.name || sender.account?.name?.th || '';
    const senderAccountValue = sender.account?.value || sender.proxy?.value || sender.account || '';

    // Extract receiver info
    const receiverName = receiver.displayName || receiver.name || receiver.account?.name?.th || '';
    const receiverAccountValue = receiver.account?.value || receiver.proxy?.value || receiver.account || '';

    // Detect payment type (PromptPay, TrueMoney, etc.) for sender
    const senderPaymentType = this.detectPaymentType(sender, {
      short: slipData.sendingBank,
      name: slipData.sendingBankName,
    });

    // Detect payment type for receiver
    const receiverPaymentType = this.detectPaymentType(receiver, {
      short: slipData.receivingBank,
      name: slipData.receivingBankName,
    });

    // Extract amount - handle both number and object format
    let amount = 0;
    if (typeof slipData.amount === 'number') {
      amount = slipData.amount;
    } else if (slipData.amount?.amount) {
      amount = parseFloat(slipData.amount.amount);
    } else if (slipData.paidLocalAmount) {
      amount = parseFloat(slipData.paidLocalAmount);
    }

    // Extract date/time
    const transDateTime = slipData.transDateTime || slipData.transDate || slipData.date;

    this.logger.log(`[SLIPMATE] Extracted: amount=${amount}, sender=${senderName}, senderBank=${senderPaymentType.bankCode}, receiver=${receiverName}, receiverBank=${receiverPaymentType.bankCode}`);

    return {
      transRef: slipData.transRef || '',
      amount: amount,
      amountFormatted: this.formatAmount(amount),
      date: this.formatDate(transDateTime),
      time: slipData.transTime || this.formatTime(transDateTime),
      // Sender
      senderName: senderName,
      senderNameEn: sender.name || '',
      senderBank: senderPaymentType.bankName,
      senderBankCode: senderPaymentType.bankCode,
      senderAccount: senderAccountValue,
      // Receiver
      receiverName: receiverName,
      receiverNameEn: receiver.name || '',
      receiverBank: receiverPaymentType.bankName,
      receiverBankCode: receiverPaymentType.bankCode,
      receiverAccount: receiverAccountValue,
      receiverAccountNumber: receiverAccountValue,
      // Additional
      countryCode: slipData.countryCode || slipData.language || 'TH',
      fee: slipData.transFeeAmount || slipData.fee || 0,
      ref1: slipData.ref1 || '',
      ref2: slipData.ref2 || '',
      ref3: slipData.ref3 || '',
      rawData: slipData,
    };
  }

  private detectPaymentType(account: any, bank: any): { bankName: string; bankCode: string } {
    // SlipMate format: { displayName, name, proxy: {type, value}, account: {type, value} }
    const proxyType = (account.proxy?.type || '').toUpperCase();
    const proxyValue = account.proxy?.value || '';
    const accountType = (account.account?.type || '').toUpperCase();
    const bankName = (bank.name || '').toLowerCase();
    const bankShort = (bank.short || '').toUpperCase();
    const displayName = (account.displayName || '').toLowerCase();
    const accountName = (account.name || '').toLowerCase();

    this.logger.debug(`[SLIPMATE] detectPaymentType: proxyType=${proxyType}, accountType=${accountType}, bankShort=${bankShort}, bankName=${bankName}, displayName=${displayName}`);

    // TrueMoney Wallet detection
    if (
      proxyType === 'EWALLETID' ||
      accountType === 'EWALLETID' ||
      bankName.includes('truemoney') ||
      bankName.includes('ทรูมันนี่') ||
      bankShort === 'TMN' ||
      bankShort === 'TRUEMONEY' ||
      displayName.includes('truemoney') ||
      displayName.includes('ทรูมันนี่') ||
      accountName.includes('truemoney')
    ) {
      this.logger.debug('[SLIPMATE] Detected: TrueMoney');
      return { bankName: 'ทรูมันนี่ วอลเล็ท', bankCode: 'TRUEMONEY' };
    }

    // PromptPay detection - check proxy type
    if (proxyType === 'MOBILE' || proxyType === 'NATID' || proxyType === 'BILLERID' || proxyType === 'MSISDN') {
      this.logger.debug('[SLIPMATE] Detected: PromptPay');
      return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
    }

    // PromptPay detection - check if proxy exists with value (phone number or ID)
    if (proxyValue && (proxyValue.match(/^0\d{9}$/) || proxyValue.match(/^\d{13}$/))) {
      this.logger.debug('[SLIPMATE] Detected: PromptPay (by proxy value pattern)');
      return { bankName: 'พร้อมเพย์', bankCode: 'PROMPTPAY' };
    }

    // Default: use bank info
    this.logger.debug(`[SLIPMATE] Using default bank: ${bankShort || bankName}`);
    return {
      bankName: bankShort || bank.name || '',
      bankCode: bankShort || bank.id || '',
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
