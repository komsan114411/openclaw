/**
 * TrueWallet Angpao Types
 * ============================
 * Types for the TrueWallet Angpao (Red Envelope) redemption feature.
 * API: https://gift.truemoney.com/campaign/vouchers/{hash}/redeem
 */

/** Status codes returned by TrueWallet API */
export type TruewalletStatusCode =
  | 'SUCCESS'
  | 'VOUCHER_NOT_FOUND'
  | 'VOUCHER_OUT_OF_STOCK'
  | 'VOUCHER_EXPIRED'
  | 'CANNOT_GET_OWN_VOUCHER'
  | 'TARGET_USER_NOT_FOUND'
  | 'TARGET_USER_REDEEMED'
  | 'INTERNAL_ERROR';

/** Raw response from TrueWallet redeem API */
export interface TruewalletApiResponse {
  status: {
    code: string;
    message: string;
  };
  data: {
    voucher: {
      voucher_id: string;
      amount_baht: string;
      redeemed_amount_baht: string;
      available_amount_baht?: string;
      member?: {
        name?: string;
      };
    };
    owner_profile?: {
      full_name?: string;
    };
  } | null;
}

/** Our internal redemption result */
export interface AngpaoRedeemResult {
  success: boolean;
  status: 'success' | 'already_redeemed' | 'expired' | 'not_found'
    | 'own_voucher' | 'invalid_phone' | 'out_of_stock' | 'rate_limited' | 'error';
  amount?: number;
  ownerName?: string;
  message: string;
  voucherHash: string;
  /** Set when voucher was already redeemed by another LINE account in our system */
  redeemedByOtherAccount?: {
    amount?: number;
    ownerName?: string;
    /** true = same phone across accounts, false = different phone */
    samePhone: boolean;
  };
}

/** Parameters for redeem operation */
export interface AngpaoRedeemParams {
  voucherHash: string;
  phoneNumber: string;
  lineAccountId: string;
  lineUserId: string;
}

/** Map TrueWallet status code to our internal status + Thai message */
export const TRUEWALLET_STATUS_MAP: Record<string, { status: AngpaoRedeemResult['status']; message: string }> = {
  SUCCESS: { status: 'success', message: 'รับอังเปาสำเร็จ' },
  VOUCHER_NOT_FOUND: { status: 'not_found', message: 'ไม่พบอังเปานี้ กรุณาตรวจสอบลิงก์' },
  VOUCHER_OUT_OF_STOCK: { status: 'out_of_stock', message: 'อังเปานี้ถูกรับหมดแล้ว' },
  VOUCHER_EXPIRED: { status: 'expired', message: 'อังเปานี้หมดอายุแล้ว' },
  CANNOT_GET_OWN_VOUCHER: { status: 'own_voucher', message: 'ไม่สามารถรับอังเปาของตัวเองได้' },
  TARGET_USER_NOT_FOUND: { status: 'invalid_phone', message: 'เบอร์โทรศัพท์ไม่ถูกต้องหรือไม่ได้ลงทะเบียน TrueMoney' },
  TARGET_USER_REDEEMED: { status: 'already_redeemed', message: 'เบอร์นี้เคยรับอังเปานี้ไปแล้ว' },
  INTERNAL_ERROR: { status: 'error', message: 'ระบบ TrueMoney ขัดข้อง กรุณาลองใหม่ภายหลัง' },
};
