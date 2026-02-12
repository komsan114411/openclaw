import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { AngpaoHistory, AngpaoHistoryDocument } from './schemas/angpao-history.schema';
import { RedisService } from '../redis/redis.service';
import {
  AngpaoRedeemParams,
  AngpaoRedeemResult,
  TruewalletApiResponse,
  TRUEWALLET_STATUS_MAP,
} from './types/angpao.types';

@Injectable()
export class AngpaoService {
  private readonly logger = new Logger(AngpaoService.name);

  // ========================================
  // SECURITY: Strict URL pattern — only gift.truemoney.com
  // Hash: alphanumeric, 10-100 chars (covers all known formats)
  // ========================================
  private readonly ANGPAO_URL_REGEX =
    /https?:\/\/gift\.truemoney\.com\/campaign\/\?v=([a-zA-Z0-9]{10,100})/;

  // Thai mobile: 0xxxxxxxxx (exactly 10 digits, starts with 0)
  private readonly THAI_PHONE_REGEX = /^0[0-9]{9}$/;

  // Hardcoded API base — NEVER allow user-controlled URL (SSRF prevention)
  private readonly API_BASE = 'https://gift.truemoney.com/campaign/vouchers';

  // Rate limits
  private readonly RATE_LIMIT_PER_ACCOUNT = 10; // per minute
  private readonly RATE_LIMIT_PER_USER = 5; // per minute
  private readonly API_TIMEOUT_MS = 15000;

  constructor(
    @InjectModel(AngpaoHistory.name)
    private angpaoHistoryModel: Model<AngpaoHistoryDocument>,
    private redisService: RedisService,
  ) {}

  /**
   * Detect angpao link in text message.
   * Returns voucher hash if found, null otherwise.
   * SECURITY: Only matches exact truemoney.com domain — no open redirect/SSRF risk.
   */
  detectAngpaoLink(text: string): string | null {
    if (!text || typeof text !== 'string') return null;
    // Limit input length to prevent ReDoS
    if (text.length > 2000) return null;
    const match = text.match(this.ANGPAO_URL_REGEX);
    return match ? match[1] : null;
  }

  /**
   * Validate Thai phone number format.
   */
  validatePhoneNumber(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false;
    return this.THAI_PHONE_REGEX.test(phone);
  }

  /**
   * Mask phone number for storage/logging.
   * 0812345678 → 08X-XXXX-5678
   * SECURITY: Full phone number is NEVER stored or logged.
   */
  maskPhoneNumber(phone: string): string {
    if (!phone || phone.length < 10) return '***-****-****';
    return `${phone.slice(0, 2)}X-XXXX-${phone.slice(-4)}`;
  }

  /**
   * Main entry point: Redeem an angpao voucher.
   * Includes all security checks: validation, rate limiting, locking, history check.
   */
  async redeemAngpao(params: AngpaoRedeemParams): Promise<AngpaoRedeemResult> {
    const { voucherHash, phoneNumber, lineAccountId, lineUserId } = params;

    // ========================================
    // 1. Input validation
    // ========================================
    if (!voucherHash || !/^[a-zA-Z0-9]{10,100}$/.test(voucherHash)) {
      this.logger.warn(`[ANGPAO] Invalid voucher hash format`);
      return {
        success: false,
        status: 'not_found',
        message: 'ลิงก์อังเปาไม่ถูกต้อง',
        voucherHash: voucherHash || '',
      };
    }

    if (!this.validatePhoneNumber(phoneNumber)) {
      this.logger.warn(`[ANGPAO] Invalid phone number format`);
      return {
        success: false,
        status: 'invalid_phone',
        message: 'เบอร์โทรศัพท์ที่ตั้งค่าไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า',
        voucherHash,
      };
    }

    // ========================================
    // 2. Rate limiting (per-account + per-user)
    // ========================================
    const accountRateKey = `angpao:rate:account:${lineAccountId}`;
    const accountAllowed = await this.redisService.rateLimit(
      accountRateKey, this.RATE_LIMIT_PER_ACCOUNT, 60,
    );
    if (!accountAllowed) {
      this.logger.warn(`[ANGPAO] Rate limit exceeded for account ${lineAccountId}`);
      return {
        success: false,
        status: 'rate_limited',
        message: 'ระบบกำลังทำงานหนัก กรุณาลองใหม่ภายหลัง',
        voucherHash,
      };
    }

    const userRateKey = `angpao:rate:user:${lineAccountId}:${lineUserId}`;
    const userAllowed = await this.redisService.rateLimit(
      userRateKey, this.RATE_LIMIT_PER_USER, 60,
    );
    if (!userAllowed) {
      this.logger.warn(`[ANGPAO] Rate limit exceeded for user ${lineUserId}`);
      return {
        success: false,
        status: 'rate_limited',
        message: 'คุณส่งลิงก์อังเปาบ่อยเกินไป กรุณารอสักครู่',
        voucherHash,
      };
    }

    // ========================================
    // 3. Distributed lock — prevent duplicate concurrent redemption
    // ========================================
    const lockKey = `angpao:lock:${voucherHash}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 30);
    if (!lockToken) {
      this.logger.log(`[ANGPAO] Duplicate processing blocked for voucher hash`);
      return {
        success: false,
        status: 'already_redeemed',
        message: 'อังเปานี้กำลังถูกประมวลผลอยู่ กรุณารอสักครู่',
        voucherHash,
      };
    }

    try {
      // ========================================
      // 4. Check existing history — skip API call if already redeemed
      // ========================================
      const existing = await this.angpaoHistoryModel.findOne({
        voucherHash,
        status: 'success',
      });
      if (existing) {
        this.logger.log(`[ANGPAO] Voucher already redeemed (from history)`);
        return {
          success: false,
          status: 'already_redeemed',
          message: `อังเปานี้ถูกรับไปแล้ว (${existing.amount?.toFixed(2) || '?'} บาท)`,
          voucherHash,
          amount: existing.amount,
        };
      }

      // ========================================
      // 5. Call TrueWallet redeem API
      // ========================================
      this.logger.log(`[ANGPAO] Calling redeem API for account=${lineAccountId}, phone=${this.maskPhoneNumber(phoneNumber)}`);
      const result = await this.callRedeemApi(voucherHash, phoneNumber);

      // ========================================
      // 6. Save history (with sanitized data)
      // ========================================
      try {
        await this.angpaoHistoryModel.create({
          voucherHash,
          lineAccountId,
          lineUserId,
          phoneNumberMasked: this.maskPhoneNumber(phoneNumber),
          amount: result.amount,
          status: result.status,
          ownerName: result.ownerName,
          rawResponse: this.sanitizeResponse(result),
        });
      } catch (dbError) {
        // Non-critical — don't fail the redemption if history save fails
        this.logger.error(`[ANGPAO] Failed to save history:`, dbError);
      }

      return result;
    } finally {
      // ========================================
      // 7. Always release lock
      // ========================================
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Call TrueWallet redeem API.
   * SECURITY: URL is hardcoded, hash is encoded, timeout enforced.
   */
  private async callRedeemApi(
    voucherHash: string,
    phoneNumber: string,
  ): Promise<AngpaoRedeemResult> {
    const encodedHash = encodeURIComponent(voucherHash);
    const url = `${this.API_BASE}/${encodedHash}/redeem`;

    try {
      const response = await axios.post<TruewalletApiResponse>(
        url,
        {
          mobile: phoneNumber,
          voucher_hash: voucherHash,
        },
        {
          timeout: this.API_TIMEOUT_MS,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Origin': 'https://gift.truemoney.com',
            'Referer': `https://gift.truemoney.com/campaign/?v=${encodedHash}`,
          },
          // Accept all status codes — TrueWallet returns errors in body
          validateStatus: () => true,
          // SECURITY: Prevent redirects to arbitrary hosts
          maxRedirects: 0,
        },
      );

      // Runtime type: response.data may be string (HTML/Cloudflare) instead of JSON object
      const data = response.data as unknown;
      const httpStatus = response.status;

      // ========================================
      // Check if response is actually JSON (not HTML/Cloudflare block)
      // ========================================
      if (typeof data === 'string') {
        const bodySnippet = data.replace(/[\r\n\t]/g, ' ').slice(0, 300);
        this.logger.warn(`[ANGPAO] Non-JSON response (httpStatus=${httpStatus}): ${bodySnippet}`);

        if (httpStatus === 403) {
          return {
            success: false,
            status: 'error',
            message: 'ระบบ TrueMoney ปฏิเสธการเชื่อมต่อ (403) กรุณาลองใหม่ภายหลัง',
            voucherHash,
          };
        }

        return {
          success: false,
          status: 'error',
          message: 'ระบบ TrueMoney ตอบกลับผิดปกติ กรุณาลองใหม่ภายหลัง',
          voucherHash,
        };
      }

      // ========================================
      // Handle HTTP-level errors (403, 5xx) with JSON body but no status.code
      // ========================================
      if (!data || typeof data !== 'object') {
        this.logger.warn(`[ANGPAO] Empty/invalid response body (httpStatus=${httpStatus})`);
        return {
          success: false,
          status: 'error',
          message: 'ระบบ TrueMoney ไม่ตอบกลับ กรุณาลองใหม่ภายหลัง',
          voucherHash,
        };
      }

      // After guards: data is a JSON object — safe to cast
      const jsonData = data as TruewalletApiResponse;

      // SECURITY: Sanitize statusCode for logging — prevent log injection
      const rawStatusCode = String(jsonData?.status?.code || 'UNKNOWN');
      const statusCode = rawStatusCode.replace(/[\r\n\t]/g, '').slice(0, 50);

      this.logger.log(`[ANGPAO] API response: statusCode=${statusCode}, httpStatus=${httpStatus}`);

      // Map status code to our result
      const mapping = TRUEWALLET_STATUS_MAP[statusCode];
      if (mapping && mapping.status === 'success') {
        const rawAmount = parseFloat(jsonData?.data?.voucher?.redeemed_amount_baht || jsonData?.data?.voucher?.amount_baht || '0');
        // SECURITY: Validate amount is a finite number — prevent NaN display
        const amount = Number.isFinite(rawAmount) && rawAmount >= 0 ? rawAmount : 0;
        // SECURITY: Sanitize ownerName — prevent XSS when displayed in admin dashboard
        const rawOwnerName = jsonData?.data?.owner_profile?.full_name || jsonData?.data?.voucher?.member?.name || '';
        const ownerName = String(rawOwnerName).replace(/[<>"'&]/g, '').slice(0, 100);
        return {
          success: true,
          status: 'success',
          amount,
          ownerName,
          message: `รับอังเปาสำเร็จ ${amount.toFixed(2)} บาท`,
          voucherHash,
        };
      }

      if (mapping) {
        return {
          success: false,
          status: mapping.status,
          message: mapping.message,
          voucherHash,
        };
      }

      // Unknown status code — log body for debugging
      const debugBody = JSON.stringify(jsonData).slice(0, 500);
      this.logger.warn(`[ANGPAO] Unknown TrueWallet status code: ${statusCode}, httpStatus=${httpStatus}, body=${debugBody}`);

      // Specific message for HTTP 403
      if (httpStatus === 403) {
        return {
          success: false,
          status: 'error',
          message: 'ระบบ TrueMoney ปฏิเสธการเชื่อมต่อ (403) กรุณาลองใหม่ภายหลัง',
          voucherHash,
        };
      }

      return {
        success: false,
        status: 'error',
        message: 'เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง',
        voucherHash,
      };
    } catch (error: unknown) {
      const axiosError = error as { code?: string; message?: string };
      if (axiosError.code === 'ECONNABORTED') {
        this.logger.error(`[ANGPAO] API timeout after ${this.API_TIMEOUT_MS}ms`);
        return {
          success: false,
          status: 'error',
          message: 'ระบบ TrueMoney ไม่ตอบสนอง กรุณาลองใหม่ภายหลัง',
          voucherHash,
        };
      }

      this.logger.error(`[ANGPAO] API call failed: ${axiosError.message || 'Unknown error'}`);
      return {
        success: false,
        status: 'error',
        message: 'ไม่สามารถเชื่อมต่อระบบ TrueMoney ได้ กรุณาลองใหม่ภายหลัง',
        voucherHash,
      };
    }
  }

  /**
   * Sanitize API response for storage — remove sensitive data.
   */
  private sanitizeResponse(result: AngpaoRedeemResult): Record<string, unknown> {
    return {
      status: result.status,
      amount: result.amount,
      ownerName: result.ownerName,
      message: result.message,
    };
  }

  /**
   * Get angpao history for a LINE account (paginated).
   */
  async getHistory(
    lineAccountId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: unknown[]; total: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.angpaoHistoryModel
        .find({ lineAccountId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.angpaoHistoryModel.countDocuments({ lineAccountId }),
    ]);

    return { items, total };
  }
}
