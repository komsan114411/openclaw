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
- ถ้ามีบริบทการสนทนาก่อนหน้า ให้ใช้ประกอบการตัดสินใจด้วย

Intent ที่เป็นไปได้:
- deposit_issue: ปัญหาการฝากเงิน/เติมเงิน/โอนเงิน/เครดิตไม่เข้า (เช่น "เติมเงินไม่เข้า", "โอนแล้วยังไม่ได้เครดิต", "ยอดไม่เข้า")
- frustrated: แสดงอารมณ์หงุดหงิด/ผิดหวัง/โกรธ โดยไม่ได้ถามคำถามชัดเจน (เช่น "เล่นแล้วเสียตลอด", "ไม่แจ็คพ็อตเลย", "ผิดหวังมาก")
- abusive: คำหยาบคาย/ด่า/ข้อความก้าวร้าวชัดเจน (เช่น คำด่า, คำหยาบ, ข่มขู่)
- ask_link: ขอลิงก์เข้าเล่น/ทางเข้า/URL (เช่น "ขอทางเข้า", "ลิงก์เล่น", "สมัครยังไง", "เข้าเล่นตรงไหน")
- ask_game_recommend: ถามแนะนำเกม/เกมไหนดี (เช่น "เกมไหนแตก", "แนะนำเกม", "เกมอะไรดี", "มีเกมอะไรบ้าง")
- general: คำถามทั่วไป สนทนาปกติ ทักทาย หรือเรื่องอื่นๆ ที่ไม่เข้า intent ข้างบน

ตัวอย่าง:
"โอนเงินไปแล้ว 500 แต่ยอดยังไม่เข้า" → {"intent":"deposit_issue","confidence":0.95}
"สวัสดีครับ" → {"intent":"general","confidence":0.9}
"มีเกมสล็อตอะไรแนะนำบ้าง" → {"intent":"ask_game_recommend","confidence":0.9}
"ขอลิงก์เข้าเล่นหน่อย" → {"intent":"ask_link","confidence":0.95}
"เล่นมาเดือนนึงไม่เคยได้เลย หมดไปเยอะแล้ว" → {"intent":"frustrated","confidence":0.85}
"โปรโมชั่นมีอะไรบ้าง" → {"intent":"general","confidence":0.85}
"ยังไม่เข้า" (หลังจากคุยเรื่องฝากเงิน) → {"intent":"deposit_issue","confidence":0.8}
"โอเค ขอบคุณ" → {"intent":"general","confidence":0.9}

ตอบเป็น JSON เท่านั้น: {"intent":"<name>","confidence":<0.0-1.0>}
ห้ามตอบอย่างอื่นนอกจาก JSON`;

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(private chatbotService: ChatbotService) {}

  /**
   * Classify the intent of a user message using a lightweight AI model.
   * Optionally includes recent conversation context for better accuracy.
   */
  async classifyIntent(
    message: string,
    model: string,
    recentContext?: string[],
  ): Promise<ClassificationResult> {
    try {
      // Build the user message with optional conversation context
      let userInput = message;
      if (recentContext && recentContext.length > 0) {
        const contextLines = recentContext
          .slice(-3) // Last 3 messages for context
          .map((m, i) => `[ข้อความก่อนหน้า ${i + 1}]: ${m}`)
          .join('\n');
        userInput = `${contextLines}\n[ข้อความปัจจุบัน]: ${message}`;
      }

      const raw = await this.chatbotService.classifyWithModel(
        CLASSIFICATION_PROMPT,
        userInput,
        model,
        80, // Increased from 50 for longer JSON with context
        0,
      );

      // Parse JSON response — handle markdown code blocks from some models
      let cleaned = raw.trim();
      // Strip markdown code fences if present (e.g., ```json ... ```)
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }
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
