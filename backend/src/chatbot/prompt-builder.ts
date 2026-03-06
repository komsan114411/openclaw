import { SmartAiIntent, IntentRuleConfig, KnowledgeEntry } from './types/smart-ai.types';

export const DEFAULT_SYSTEM_PROMPT =
  'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น';

export const CORE_RULES =
  'กฎสำคัญ:\n' +
  '1. ตอบคำถามของลูกค้าโดยตรงก่อนเสมอ อย่าเปลี่ยนเรื่อง อย่าข้ามคำถาม\n' +
  '2. ตอบเฉพาะสิ่งที่คุณมีข้อมูล (จาก System Prompt และคลังความรู้) เท่านั้น ห้ามแต่งเรื่องหรือเดาข้อมูลที่ไม่มี\n' +
  '3. ถ้าคำถามอยู่นอกเหนือขอบเขตข้อมูลที่มี ให้ตอบสั้นๆ ว่าไม่มีข้อมูลในส่วนนี้ แนะนำให้ติดต่อแอดมินโดยตรง\n' +
  '4. ถ้าข้อความไม่ใช่คำถามหรือไม่ต้องการคำตอบ (เช่น "ขอบคุณ", "โอเค") ให้ตอบสั้นๆ สุภาพ\n' +
  '5. ห้ามให้ข้อมูลที่อาจไม่ถูกต้อง เช่น ตัวเลข จำนวนเงิน ลิงก์ ที่ไม่มีในคลังความรู้\n' +
  '6. ตอบกระชับ ไม่เกิน 2-3 ประโยค ยกเว้นคำถามที่ต้องอธิบายยาว\n' +
  '7. ใช้ภาษาสุภาพ เป็นกันเอง ใส่ค่ะ/ครับ ท้ายประโยค\n' +
  '8. ห้ามบอกว่าตัวเองเป็น AI หรือ chatbot ถ้าลูกค้าไม่ได้ถาม';

export function buildKnowledgeSection(knowledgeBase: KnowledgeEntry[]): string {
  const enabled = knowledgeBase.filter((k) => k.enabled);
  if (enabled.length === 0) return '';
  const entries = enabled.map((k) => `- ${k.topic}: ${k.answer}`).join('\n');
  return `คลังความรู้ (ข้อมูลจริงของธุรกิจ — ใช้ข้อมูลนี้ตอบลูกค้าเท่านั้น ห้ามแต่งเพิ่มเอง ถ้าลูกค้าถามเรื่องที่ไม่มีในนี้ให้แจ้งว่าไม่มีข้อมูลและแนะนำติดต่อแอดมิน):\n${entries}`;
}

const INTENT_GUIDANCE: Partial<Record<SmartAiIntent, string>> = {
  deposit_issue:
    'ลูกค้ากำลังถามเรื่องเกี่ยวกับการฝากเงิน/โอนเงิน — ตอบคำถามที่ถามก่อน ถ้าลูกค้าบอกว่ามีปัญหาจริง ค่อยแนะนำให้ส่งสลิปมาให้ตรวจสอบ ถ้ายังไม่ได้รับเครดิตให้แจ้งว่าแอดมินจะตรวจสอบให้',
  frustrated:
    'ลูกค้าดูหงุดหงิดหรือผิดหวัง — ขอโทษและรับฟังปัญหาของลูกค้าก่อน ตอบด้วยความเข้าใจ แล้วค่อยเสนอทางช่วยเหลือ ห้ามโต้แย้งหรือเพิกเฉย',
  ask_game_recommend:
    'ลูกค้าสนใจเรื่องเกม — ตอบคำถามที่ถามตรงๆ ก่อน แนะนำเกมจากข้อมูลในคลังความรู้ ถ้าไม่มีข้อมูลเกมให้แนะนำติดต่อแอดมิน',
  general:
    'คำถามทั่วไป — ตอบตามข้อมูลที่มี ถ้าเป็นการทักทายให้ทักทายกลับสั้นๆ ถ้าเป็นคำถามที่ไม่มีข้อมูลให้แนะนำติดต่อแอดมิน',
};

export interface BuildPromptOptions {
  userSystemPrompt?: string;
  knowledgeBase?: KnowledgeEntry[];
  intent?: SmartAiIntent;
  intentRule?: IntentRuleConfig;
}

export function buildFullPrompt(options: BuildPromptOptions): string {
  const base = options.userSystemPrompt || DEFAULT_SYSTEM_PROMPT;
  const parts = [base];

  const kb = buildKnowledgeSection(options.knowledgeBase || []);
  if (kb) parts.push(kb);

  parts.push(CORE_RULES);

  if (options.intent && options.intentRule?.customPrompt) {
    parts.push(`บริบทเพิ่มเติม: ${options.intentRule.customPrompt}`);
  } else if (options.intent) {
    const guidance = INTENT_GUIDANCE[options.intent];
    if (guidance) parts.push(`บริบทเพิ่มเติม: ${guidance}`);
  }

  return parts.join('\n\n');
}
