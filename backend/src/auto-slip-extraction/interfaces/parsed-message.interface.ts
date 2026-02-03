/**
 * Parsed bank transaction message interface
 */
export interface ParsedMessage {
  /** Transaction type */
  type: 'deposit' | 'withdraw' | 'transfer' | 'unknown';

  /** Transaction amount */
  amount: number;

  /** Balance after transaction */
  balance?: number;

  /** Counterparty name or account */
  counterparty?: string;

  /** Transaction reference number */
  reference?: string;

  /** Transaction date */
  transactionDate?: Date;

  /** Transaction time */
  transactionTime?: string;

  /** Bank code that sent the message */
  bankCode: string;

  /** Raw message text */
  rawMessage: string;

  /** Parse success flag */
  success: boolean;

  /** Parse error if failed */
  error?: string;
}

/**
 * Bank message patterns for Thai banks
 */
export interface BankMessagePattern {
  bankCode: string;
  depositPattern: RegExp;
  withdrawPattern: RegExp;
  balancePattern: RegExp;
  datePattern: RegExp;
  timePattern?: RegExp;
  counterpartyPattern?: RegExp;
  referencePattern?: RegExp;
}

/**
 * Thai month abbreviations mapping
 */
export const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1,
  'ก.พ.': 2,
  'มี.ค.': 3,
  'เม.ย.': 4,
  'พ.ค.': 5,
  'มิ.ย.': 6,
  'ก.ค.': 7,
  'ส.ค.': 8,
  'ก.ย.': 9,
  'ต.ค.': 10,
  'พ.ย.': 11,
  'ธ.ค.': 12,
};

/**
 * Convert Thai Buddhist year to Christian year
 * Thai year 2568 = Christian year 2025
 */
export function convertThaiYear(thaiYear: number): number {
  return thaiYear - 543;
}

/**
 * Parse Thai month abbreviation to month number (1-12)
 */
export function parseThaiMonth(monthAbbrev: string): number | undefined {
  return THAI_MONTHS[monthAbbrev];
}
