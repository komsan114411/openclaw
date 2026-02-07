export type SmartAiIntent =
  | 'deposit_issue'
  | 'duplicate_request'
  | 'frustrated'
  | 'abusive'
  | 'ask_link'
  | 'ask_game_recommend'
  | 'general';

export interface IntentRuleConfig {
  enabled: boolean;
  useAi: boolean;
  customPrompt: string;
  responseTemplate: string; // '__NO_RESPONSE__' | '__SEND_LINKS__' | custom text
}

export interface SmartResponseResult {
  shouldRespond: boolean;
  response: string | null;
  intent: SmartAiIntent;
  confidence: number;
  processingTimeMs: number;
  wasSpamDetected: boolean;
  wasDuplicateDetected: boolean;
}

export interface GameLink {
  name: string;
  url: string;
}

export const DEFAULT_INTENT_RULES: Record<SmartAiIntent, IntentRuleConfig> = {
  deposit_issue: {
    enabled: true,
    useAi: true,
    customPrompt: '',
    responseTemplate: '',
  },
  duplicate_request: {
    enabled: true,
    useAi: false,
    customPrompt: '',
    responseTemplate: 'แอดมินกำลังตรวจสอบอยู่ค่ะ กรุณารอสักครู่นะคะ',
  },
  frustrated: {
    enabled: true,
    useAi: true,
    customPrompt: '',
    responseTemplate: '',
  },
  abusive: {
    enabled: true,
    useAi: false,
    customPrompt: '',
    responseTemplate: '__NO_RESPONSE__',
  },
  ask_link: {
    enabled: true,
    useAi: false,
    customPrompt: '',
    responseTemplate: '__SEND_LINKS__',
  },
  ask_game_recommend: {
    enabled: true,
    useAi: true,
    customPrompt: '',
    responseTemplate: '',
  },
  general: {
    enabled: true,
    useAi: true,
    customPrompt: '',
    responseTemplate: '',
  },
};

export const INTENT_LABELS: Record<SmartAiIntent, string> = {
  deposit_issue: 'ปัญหาการฝากเงิน 💰',
  duplicate_request: 'ส่งซ้ำ/ถามซ้ำ 🔄',
  frustrated: 'หงุดหงิด/ผิดหวัง 😤',
  abusive: 'ก้าวร้าว/สแปม 🚫',
  ask_link: 'ขอลิงก์เข้าเล่น 🔗',
  ask_game_recommend: 'แนะนำเกม 🎮',
  general: 'ทั่วไป 💬',
};
