import { Injectable, Logger } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SmartAiIntent } from './types/smart-ai.types';

interface ClassificationResult {
  intent: SmartAiIntent;
  confidence: number;
}

const VALID_INTENTS: SmartAiIntent[] = [
  'deposit_issue',
  'frustrated',
  'abusive',
  'ask_link',
  'ask_game_recommend',
  'general',
];

const CLASSIFICATION_PROMPT = `คุณเป็น intent classifier สำหรับระบบแชทบริการลูกค้า
วิเคราะห์ข้อความของผู้ใช้แล้วจำแนกเป็น intent ที่ตรงที่สุด

กฎสำคัญ:
- เลือก intent ที่ตรงกับเนื้อหาข้อความมากที่สุดเท่านั้น
- ถ้าไม่แน่ใจ หรือข้อความเป็นคำถามทั่วไป/สนทนาปกติ ให้เลือก general
- ให้ confidence ต่ำถ้าข้อความคลุมเครือหรืออาจเป็นได้หลาย intent

Intent ที่เป็นไปได้:
- deposit_issue: ปัญหาการฝากเงิน/เติมเงิน/โอนเงิน/เครดิตไม่เข้า (เช่น "เติมเงินไม่เข้า", "โอนแล้วยังไม่ได้เครดิต")
- frustrated: แสดงอารมณ์หงุดหงิด/ผิดหวัง/โกรธ โดยไม่ได้ถามคำถามชัดเจน (เช่น "เล่นแล้วเสียตลอด", "ไม่แจ็คพ็อตเลย")
- abusive: คำหยาบคาย/ด่า/ข้อความก้าวร้าวชัดเจน
- ask_link: ขอลิงก์เข้าเล่น/ทางเข้า/URL (เช่น "ขอทางเข้า", "ลิงก์เล่น")
- ask_game_recommend: ถามแนะนำเกม/เกมไหนดี (เช่น "เกมไหนแตก", "แนะนำเกม")
- general: คำถามทั่วไป สนทนาปกติ หรือเรื่องอื่นๆ ที่ไม่เข้า intent ข้างบน

ตอบเป็น JSON เท่านั้น: {"intent":"<name>","confidence":<0.0-1.0>}
ห้ามตอบอย่างอื่นนอกจาก JSON`;

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
