/**
 * Multi-Provider Slip Verification System
 *
 * Interface และ Types สำหรับระบบตรวจสอบสลิปหลาย Provider
 * รองรับ Auto-Failover เมื่อ Provider หลักล้มเหลว
 */

export enum SlipProvider {
  THUNDER = 'thunder',
  SLIPMATE = 'slipmate',
}

/**
 * ผลลัพธ์การตรวจสอบสลิปที่ Normalize แล้ว
 * ทุก Provider จะ return format เดียวกัน
 */
export interface NormalizedSlipData {
  transRef: string;
  amount: number;
  amountFormatted: string;
  date: string;
  time: string;
  // Sender info
  senderName: string;
  senderNameEn?: string;
  senderBank: string;
  senderBankCode: string;
  senderAccount?: string;
  // Receiver info
  receiverName: string;
  receiverNameEn?: string;
  receiverBank: string;
  receiverBankCode: string;
  receiverAccount: string;
  receiverAccountNumber: string;
  // Additional fields
  countryCode?: string;
  fee?: number;
  ref1?: string;
  ref2?: string;
  ref3?: string;
  // Raw data for debugging
  rawData?: any;
}

export interface NormalizedVerificationResult {
  status: 'success' | 'duplicate' | 'not_found' | 'error';
  provider: SlipProvider;
  message: string;
  data?: NormalizedSlipData;
  error?: any;
  // Flag to indicate if failover should be attempted
  shouldFailover?: boolean;
}

/**
 * Interface สำหรับ Slip Verification Provider
 * ทุก Provider ต้อง implement interface นี้
 */
export interface SlipVerificationProvider {
  /**
   * ชื่อ Provider
   */
  readonly providerName: SlipProvider;

  /**
   * ตรวจสอบสลิปจากรูปภาพ
   * @param imageData Buffer ของรูปภาพสลิป
   * @param apiKey API Key สำหรับ Provider นี้
   * @returns ผลลัพธ์การตรวจสอบที่ Normalize แล้ว
   */
  verify(imageData: Buffer, apiKey: string): Promise<NormalizedVerificationResult>;

  /**
   * ทดสอบการเชื่อมต่อและตรวจสอบ quota
   * @param apiKey API Key สำหรับ Provider นี้
   * @returns สถานะการเชื่อมต่อและ quota ที่เหลือ
   */
  testConnection(apiKey: string): Promise<{
    success: boolean;
    message: string;
    remainingQuota?: number;
    expiresAt?: string;
  }>;
}

/**
 * Error class สำหรับ Provider ที่ไม่พร้อมใช้งาน
 * เมื่อ throw error นี้ ระบบจะ failover ไป Provider ถัดไป
 */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly provider: SlipProvider,
    public readonly reason: string,
    public readonly originalError?: any,
  ) {
    super(`Provider ${provider} unavailable: ${reason}`);
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * สถานการณ์ที่ควร Failover
 */
export const FAILOVER_CONDITIONS = {
  // HTTP Status codes ที่ควร failover
  HTTP_STATUS: [401, 402, 403, 500, 502, 503, 504],
  // Error codes ที่ควร failover
  ERROR_CODES: ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'],
};

/**
 * Helper function: ตรวจสอบว่าควร failover หรือไม่
 */
export function shouldTriggerFailover(error: any): boolean {
  // Network errors
  if (FAILOVER_CONDITIONS.ERROR_CODES.includes(error.code)) {
    return true;
  }

  // HTTP errors
  const status = error.response?.status;
  if (status && FAILOVER_CONDITIONS.HTTP_STATUS.includes(status)) {
    return true;
  }

  // No response (server down)
  if (!error.response && error.request) {
    return true;
  }

  return false;
}
