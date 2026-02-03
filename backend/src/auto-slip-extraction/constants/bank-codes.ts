/**
 * Thai Bank Codes and Configuration
 */

export enum BankCode {
  SCB = '014',
  KBANK = '004',
  GSB = '030',
  BBL = '002',
  KTB = '006',
  TMB = '011',
  BAY = '025',
}

export interface BankConfig {
  code: string;
  nameTh: string;
  nameEn: string;
  swift: string;
  defaultChatMid?: string;
  reloginIntervalMins: number;
  messagePattern: RegExp;
  logoUrl?: string;
}

/**
 * Bank configurations for Thai banks
 */
export const BANK_CONFIGS: Record<string, BankConfig> = {
  [BankCode.SCB]: {
    code: '014',
    nameTh: 'ธนาคารไทยพาณิชย์',
    nameEn: 'Siam Commercial Bank',
    swift: 'SICOTHBK',
    reloginIntervalMins: 20,
    messagePattern: /(เงินเข้า|เงินออก)\s+([\d,]+\.\d{2})\s+บาท/,
    logoUrl: '/images/banks/scb.png',
  },
  [BankCode.KBANK]: {
    code: '004',
    nameTh: 'ธนาคารกสิกรไทย',
    nameEn: 'KASIKORNBANK',
    swift: 'KASITHBK',
    reloginIntervalMins: 20,
    messagePattern: /(เงินเข้า|โอน\/ถอน)\s+จำนวนเงิน\s+([\d,]+\.\d{2})\s+บาท/,
    logoUrl: '/images/banks/kbank.png',
  },
  [BankCode.GSB]: {
    code: '030',
    nameTh: 'ธนาคารออมสิน',
    nameEn: 'Government Savings Bank',
    swift: 'GABOROTH',
    reloginIntervalMins: 20,
    messagePattern: /(เงินเข้า|เงินออก)\s+([\d,]+\.\d{2})\s+บาท/,
    logoUrl: '/images/banks/gsb.png',
  },
  [BankCode.BBL]: {
    code: '002',
    nameTh: 'ธนาคารกรุงเทพ',
    nameEn: 'Bangkok Bank',
    swift: 'BKKBTHBK',
    reloginIntervalMins: 20,
    messagePattern: /(รับโอน|โอนออก)\s+([\d,]+\.\d{2})\s+บาท/,
    logoUrl: '/images/banks/bbl.png',
  },
  [BankCode.KTB]: {
    code: '006',
    nameTh: 'ธนาคารกรุงไทย',
    nameEn: 'Krung Thai Bank',
    swift: 'KRTHTHBK',
    reloginIntervalMins: 20,
    messagePattern: /(เงินเข้า|เงินออก)\s+([\d,]+\.\d{2})\s+บาท/,
    logoUrl: '/images/banks/ktb.png',
  },
  [BankCode.TMB]: {
    code: '011',
    nameTh: 'ธนาคารทหารไทยธนชาต',
    nameEn: 'TMBThanachart Bank',
    swift: 'TABOROTH',
    reloginIntervalMins: 20,
    messagePattern: /(รับเงิน|จ่ายเงิน)\s+([\d,]+\.\d{2})\s+บาท/,
    logoUrl: '/images/banks/ttb.png',
  },
  [BankCode.BAY]: {
    code: '025',
    nameTh: 'ธนาคารกรุงศรีอยุธยา',
    nameEn: 'Bank of Ayudhya',
    swift: 'AYUDTHBK',
    reloginIntervalMins: 20,
    messagePattern: /(เงินเข้า|เงินออก)\s+([\d,]+\.\d{2})\s+บาท/,
    logoUrl: '/images/banks/bay.png',
  },
};

/**
 * Get bank config by code
 */
export function getBankConfig(code: string): BankConfig | undefined {
  return BANK_CONFIGS[code];
}

/**
 * Get all bank codes
 */
export function getAllBankCodes(): string[] {
  return Object.keys(BANK_CONFIGS);
}

/**
 * Validate bank code
 */
export function isValidBankCode(code: string): boolean {
  return code in BANK_CONFIGS;
}
