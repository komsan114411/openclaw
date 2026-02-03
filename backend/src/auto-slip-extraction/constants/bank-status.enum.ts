/**
 * Bank Account Status - State Machine States
 *
 * State transitions:
 * DISABLED → INIT
 * INIT → LOGIN_REQUIRED, KEYS_READY
 * LOGIN_REQUIRED → LOGGING_IN, AWAITING_PIN, ERROR_SOFT
 * LOGGING_IN → AWAITING_PIN, LOGGED_IN, ERROR_SOFT
 * AWAITING_PIN → LOGGED_IN, ERROR_SOFT, LOGIN_REQUIRED
 * LOGGED_IN → KEYS_READY, ERROR_SOFT
 * KEYS_READY → ACTIVE, ERROR_SOFT
 * ACTIVE → ERROR_SOFT, LOGIN_REQUIRED
 * ERROR_SOFT → LOGIN_REQUIRED, ERROR_FATAL
 * ERROR_FATAL → INIT (manual reset only)
 */
export enum BankStatus {
  /** Bank account is disabled, no automation */
  DISABLED = 'DISABLED',

  /** Initial state - bank account created but not configured */
  INIT = 'INIT',

  /** Credentials available, login required */
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',

  /** Browser login in progress */
  LOGGING_IN = 'LOGGING_IN',

  /** Waiting for user to verify PIN on mobile */
  AWAITING_PIN = 'AWAITING_PIN',

  /** Successfully logged in, extracting keys */
  LOGGED_IN = 'LOGGED_IN',

  /** Keys extracted and validated */
  KEYS_READY = 'KEYS_READY',

  /** Actively monitoring for transactions */
  ACTIVE = 'ACTIVE',

  /** Recoverable error - will retry automatically */
  ERROR_SOFT = 'ERROR_SOFT',

  /** Fatal error - requires manual intervention */
  ERROR_FATAL = 'ERROR_FATAL',
}

/**
 * Valid state transitions map
 */
export const VALID_TRANSITIONS: Record<BankStatus, BankStatus[]> = {
  [BankStatus.DISABLED]: [BankStatus.INIT],
  [BankStatus.INIT]: [BankStatus.LOGIN_REQUIRED, BankStatus.KEYS_READY, BankStatus.DISABLED],
  [BankStatus.LOGIN_REQUIRED]: [BankStatus.LOGGING_IN, BankStatus.AWAITING_PIN, BankStatus.ERROR_SOFT, BankStatus.DISABLED],
  [BankStatus.LOGGING_IN]: [BankStatus.AWAITING_PIN, BankStatus.LOGGED_IN, BankStatus.ERROR_SOFT, BankStatus.DISABLED],
  [BankStatus.AWAITING_PIN]: [BankStatus.LOGGED_IN, BankStatus.ERROR_SOFT, BankStatus.LOGIN_REQUIRED, BankStatus.DISABLED],
  [BankStatus.LOGGED_IN]: [BankStatus.KEYS_READY, BankStatus.ERROR_SOFT, BankStatus.DISABLED],
  [BankStatus.KEYS_READY]: [BankStatus.ACTIVE, BankStatus.ERROR_SOFT, BankStatus.DISABLED],
  [BankStatus.ACTIVE]: [BankStatus.ERROR_SOFT, BankStatus.LOGIN_REQUIRED, BankStatus.DISABLED],
  [BankStatus.ERROR_SOFT]: [BankStatus.LOGIN_REQUIRED, BankStatus.ERROR_FATAL, BankStatus.DISABLED],
  [BankStatus.ERROR_FATAL]: [BankStatus.INIT, BankStatus.DISABLED],
};

/**
 * Human-readable status labels (Thai)
 */
export const STATUS_LABELS_TH: Record<BankStatus, string> = {
  [BankStatus.DISABLED]: 'ปิดการใช้งาน',
  [BankStatus.INIT]: 'เริ่มต้น',
  [BankStatus.LOGIN_REQUIRED]: 'ต้องเข้าสู่ระบบ',
  [BankStatus.LOGGING_IN]: 'กำลังเข้าสู่ระบบ',
  [BankStatus.AWAITING_PIN]: 'รอยืนยัน PIN',
  [BankStatus.LOGGED_IN]: 'เข้าสู่ระบบแล้ว',
  [BankStatus.KEYS_READY]: 'พร้อมใช้งาน Keys',
  [BankStatus.ACTIVE]: 'กำลังทำงาน',
  [BankStatus.ERROR_SOFT]: 'เกิดข้อผิดพลาด (กำลังลองใหม่)',
  [BankStatus.ERROR_FATAL]: 'เกิดข้อผิดพลาดร้ายแรง',
};

/**
 * Human-readable status labels (English)
 */
export const STATUS_LABELS_EN: Record<BankStatus, string> = {
  [BankStatus.DISABLED]: 'Disabled',
  [BankStatus.INIT]: 'Initializing',
  [BankStatus.LOGIN_REQUIRED]: 'Login Required',
  [BankStatus.LOGGING_IN]: 'Logging In',
  [BankStatus.AWAITING_PIN]: 'Awaiting PIN',
  [BankStatus.LOGGED_IN]: 'Logged In',
  [BankStatus.KEYS_READY]: 'Keys Ready',
  [BankStatus.ACTIVE]: 'Active',
  [BankStatus.ERROR_SOFT]: 'Error (Retrying)',
  [BankStatus.ERROR_FATAL]: 'Fatal Error',
};
