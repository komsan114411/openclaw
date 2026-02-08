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
  confidenceThreshold?: number; // per-intent override (0.0-1.0), empty = use global
}

export interface SmartResponseResult {
  shouldRespond: boolean;
  response: string | null;
  intent: SmartAiIntent;
  confidence: number;
  processingTimeMs: number;
  wasSpamDetected: boolean;
  wasDuplicateDetected: boolean;
  fellBelowThreshold?: boolean;
}

export interface IntentTestResult {
  intent: SmartAiIntent;
  confidence: number;
  thresholdUsed: number;
  fellBelowThreshold: boolean;
  wouldRespond: boolean;
  sampleResponse: string | null;
  processingTimeMs: number;
}

export interface GameLink {
  name: string;
  url: string;
}

export interface KnowledgeEntry {
  topic: string;
  answer: string;
  enabled: boolean;
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

export interface SmartAiSettings {
  enableSmartAi: boolean;
  smartAiClassifierModel: string;
  duplicateDetectionWindowMinutes: number;
  spamThresholdMessagesPerMinute: number;
  gameLinks: GameLink[];
  knowledgeBase: KnowledgeEntry[];
  intentRules: Record<string, IntentRuleConfig>;
  aiSystemPrompt?: string;
  aiModel?: string;
  aiTemperature?: number;
  smartAiConfidenceThreshold?: number;
  smartAiMaxTokens?: number;
  smartAiResponseDelayMs?: number;
  smartAiMaxRetries?: number;
  smartAiRetryDelayMs?: number;
  smartAiFallbackAction?: string;
}

/** Build SmartAiSettings from account.settings with defaults */
export function buildSmartAiSettings(s: Record<string, unknown>): SmartAiSettings {
  return {
    enableSmartAi: true,
    smartAiClassifierModel: (s?.smartAiClassifierModel as string) || 'gpt-3.5-turbo',
    duplicateDetectionWindowMinutes: (s?.duplicateDetectionWindowMinutes as number) ?? 5,
    spamThresholdMessagesPerMinute: (s?.spamThresholdMessagesPerMinute as number) ?? 5,
    gameLinks: (s?.gameLinks as GameLink[]) || [],
    knowledgeBase: (s?.knowledgeBase as KnowledgeEntry[]) || [],
    intentRules: (s?.intentRules as Record<string, IntentRuleConfig>) || {},
    aiSystemPrompt: s?.aiSystemPrompt as string | undefined,
    aiModel: s?.aiModel as string | undefined,
    aiTemperature: s?.aiTemperature as number | undefined,
    smartAiConfidenceThreshold: (s?.smartAiConfidenceThreshold as number) ?? 0.6,
    smartAiMaxTokens: (s?.smartAiMaxTokens as number) ?? 500,
    smartAiResponseDelayMs: (s?.smartAiResponseDelayMs as number) ?? 0,
    smartAiMaxRetries: (s?.smartAiMaxRetries as number) ?? 2,
    smartAiRetryDelayMs: (s?.smartAiRetryDelayMs as number) ?? 1000,
    smartAiFallbackAction: (s?.smartAiFallbackAction as string) || 'fallback_message',
  };
}
