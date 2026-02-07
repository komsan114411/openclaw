import { Injectable, Logger } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SmartAiIntent } from './types/smart-ai.types';

interface ClassificationResult {
  intent: SmartAiIntent;
  confidence: number;
}

const VALID_INTENTS: SmartAiIntent[] = [
  'deposit_issue',
  'duplicate_request',
  'frustrated',
  'abusive',
  'ask_link',
  'ask_game_recommend',
  'general',
];

const CLASSIFICATION_PROMPT = `คุณเป็น intent classifier สำหรับระบบแชทเว็บพนัน/เกมออนไลน์
วิเคราะห์ข้อความของผู้ใช้แล้วจำแนกเป็น intent ด้านล่าง

Intent ที่เป็นไปได้:
- deposit_issue: ปัญหาการฝากเงิน/เติมเงิน/โอนเงิน (เช่น "เติมเงินไม่เข้า", "โอนแล้วยังไม่ได้เครดิต")
- frustrated: หงุดหงิด/ผิดหวัง/เสียเงิน (เช่น "เล่นแล้วเสียตลอด", "ไม่แจ็คพ็อตเลย")
- abusive: คำหยาบคาย/ด่า/ข้อความก้าวร้าว
- ask_link: ขอลิงก์เข้าเล่น/ทางเข้า/URL (เช่น "ขอทางเข้า", "ลิงก์เล่น")
- ask_game_recommend: ถามเกมแนะนำ/เกมไหนดี/เกมแตก (เช่น "เกมไหนแตก", "แนะนำเกม")
- general: อื่นๆ ทั่วไป

ตอบเป็น JSON เท่านั้น: {"intent":"<name>","confidence":<0.0-1.0>}
ห้ามตอบอย่างอื่น`;

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(private chatbotService: ChatbotService) {}

  /**
   * Classify the intent of a user message using a lightweight AI model
   */
  async classifyIntent(
    message: string,
    model: string,
  ): Promise<ClassificationResult> {
    try {
      const raw = await this.chatbotService.classifyWithModel(
        CLASSIFICATION_PROMPT,
        message,
        model,
        50,
        0,
      );

      // Parse JSON response
      const cleaned = raw.trim();
      const parsed = JSON.parse(cleaned);

      const intent = VALID_INTENTS.includes(parsed.intent)
        ? (parsed.intent as SmartAiIntent)
        : 'general';
      const confidence =
        typeof parsed.confidence === 'number'
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5;

      return { intent, confidence };
    } catch (error) {
      this.logger.warn('Intent classification failed, defaulting to general:', error);
      return { intent: 'general', confidence: 0.3 };
    }
  }
}
