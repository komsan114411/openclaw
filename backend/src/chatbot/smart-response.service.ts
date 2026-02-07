import { Injectable, Logger } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SpamDetectorService } from './spam-detector.service';
import { DuplicateDetectorService } from './duplicate-detector.service';
import { IntentClassifierService } from './intent-classifier.service';
import { WebSearchService } from './web-search.service';
import {
  SmartAiIntent,
  IntentRuleConfig,
  SmartResponseResult,
  GameLink,
} from './types/smart-ai.types';

interface SmartAiSettings {
  enableSmartAi: boolean;
  smartAiClassifierModel: string;
  duplicateDetectionWindowMinutes: number;
  spamThresholdMessagesPerMinute: number;
  gameLinks: GameLink[];
  intentRules: Record<string, IntentRuleConfig>;
  aiSystemPrompt?: string;
  aiModel?: string;
}

@Injectable()
export class SmartResponseService {
  private readonly logger = new Logger(SmartResponseService.name);

  constructor(
    private chatbotService: ChatbotService,
    private spamDetector: SpamDetectorService,
    private duplicateDetector: DuplicateDetectorService,
    private intentClassifier: IntentClassifierService,
    private webSearchService: WebSearchService,
  ) {}

  async processMessage(
    message: string,
    userId: string,
    lineAccountId: string,
    settings: SmartAiSettings,
  ): Promise<SmartResponseResult> {
    const startTime = Date.now();
    let wasSpamDetected = false;
    let wasDuplicateDetected = false;
    let intent: SmartAiIntent = 'general';
    let confidence = 0;

    try {
      // 1. Record message for spam tracking
      await this.spamDetector.recordMessage(lineAccountId, userId);

      // 2. Check spam
      const isSpam = await this.spamDetector.isSpamming(
        lineAccountId,
        userId,
        settings.spamThresholdMessagesPerMinute,
        60,
      );
      if (isSpam) {
        wasSpamDetected = true;
        intent = 'abusive';
        this.logger.log(`[SMART-AI] Spam detected for user ${userId}`);
        return this.applyIntentRule(
          intent,
          1.0,
          message,
          userId,
          lineAccountId,
          settings,
          startTime,
          wasSpamDetected,
          wasDuplicateDetected,
        );
      }

      // 3. Check duplicate
      const isDuplicate = await this.duplicateDetector.isDuplicate(
        lineAccountId,
        userId,
        message,
        settings.duplicateDetectionWindowMinutes,
      );
      if (isDuplicate) {
        wasDuplicateDetected = true;
        intent = 'duplicate_request';
        this.logger.log(`[SMART-AI] Duplicate detected for user ${userId}`);
        // Record after check so the first message isn't flagged
        await this.duplicateDetector.recordMessage(
          lineAccountId,
          userId,
          message,
          settings.duplicateDetectionWindowMinutes,
        );
        return this.applyIntentRule(
          intent,
          1.0,
          message,
          userId,
          lineAccountId,
          settings,
          startTime,
          wasSpamDetected,
          wasDuplicateDetected,
        );
      }

      // Record message for future duplicate detection
      await this.duplicateDetector.recordMessage(
        lineAccountId,
        userId,
        message,
        settings.duplicateDetectionWindowMinutes,
      );

      // 4. Stage 1: Intent Classification
      const classificationResult = await this.intentClassifier.classifyIntent(
        message,
        settings.smartAiClassifierModel || 'gpt-3.5-turbo',
      );
      intent = classificationResult.intent;
      confidence = classificationResult.confidence;
      this.logger.log(
        `[SMART-AI] Intent: ${intent}, confidence: ${confidence} for message: "${message.substring(0, 50)}"`,
      );

      // 5. Stage 2: Apply intent rule
      return this.applyIntentRule(
        intent,
        confidence,
        message,
        userId,
        lineAccountId,
        settings,
        startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      );
    } catch (error) {
      this.logger.error('[SMART-AI] Error processing message:', error);
      // Fallback to general AI response
      return {
        shouldRespond: true,
        response: null, // Let the caller use the legacy response
        intent: 'general',
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      };
    }
  }

  private async applyIntentRule(
    intent: SmartAiIntent,
    confidence: number,
    message: string,
    userId: string,
    lineAccountId: string,
    settings: SmartAiSettings,
    startTime: number,
    wasSpamDetected: boolean,
    wasDuplicateDetected: boolean,
  ): Promise<SmartResponseResult> {
    const rules = settings.intentRules || {};
    const rule: IntentRuleConfig = rules[intent] || {
      enabled: true,
      useAi: true,
      customPrompt: '',
      responseTemplate: '',
    };

    // If rule is disabled, don't respond
    if (!rule.enabled) {
      return {
        shouldRespond: false,
        response: null,
        intent,
        confidence,
        processingTimeMs: Date.now() - startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      };
    }

    const template = rule.responseTemplate || '';

    // Handle __NO_RESPONSE__
    if (template === '__NO_RESPONSE__') {
      return {
        shouldRespond: false,
        response: null,
        intent,
        confidence,
        processingTimeMs: Date.now() - startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      };
    }

    // Handle __SEND_LINKS__
    if (template === '__SEND_LINKS__') {
      const links = settings.gameLinks || [];
      let responseText: string;
      if (links.length === 0) {
        responseText = 'ขออภัยค่ะ ยังไม่มีลิงก์ที่ตั้งค่าไว้ กรุณาติดต่อแอดมินค่ะ';
      } else {
        responseText = '🔗 ลิงก์เข้าเล่น:\n' +
          links.map((l) => `▸ ${l.name}: ${l.url}`).join('\n');
      }
      return {
        shouldRespond: true,
        response: responseText,
        intent,
        confidence,
        processingTimeMs: Date.now() - startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      };
    }

    // If useAi is false, return the template
    if (!rule.useAi && template) {
      return {
        shouldRespond: true,
        response: template,
        intent,
        confidence,
        processingTimeMs: Date.now() - startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      };
    }

    // useAi is true — build specialized prompt and call AI
    let contextPrompt = '';
    switch (intent) {
      case 'deposit_issue':
        contextPrompt =
          'ลูกค้ามีปัญหาเรื่องการฝากเงิน ให้ขอสลิปโอนเงินจากลูกค้า แล้วแจ้งว่าแอดมินกำลังตรวจสอบ ตอบสุภาพและให้กำลังใจ';
        break;
      case 'frustrated':
        contextPrompt =
          'ลูกค้ารู้สึกหงุดหงิดหรือผิดหวัง ให้กำลังใจ แนะนำให้ลองเปลี่ยนเกม หรือพักผ่อนสักครู่แล้วกลับมาเล่นใหม่';
        break;
      case 'ask_game_recommend': {
        const webResults = await this.webSearchService.searchGameRecommendations(message);
        contextPrompt = `ลูกค้าถามแนะนำเกม ให้แนะนำเกมที่น่าสนใจ โดยอ้างอิงข้อมูลด้านล่าง:\n\n${webResults}`;
        break;
      }
      default:
        contextPrompt = '';
    }

    // Combine system prompt with context
    const basePrompt =
      settings.aiSystemPrompt ||
      'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น';
    const fullPrompt = contextPrompt
      ? `${basePrompt}\n\nบริบทเพิ่มเติม: ${rule.customPrompt || contextPrompt}`
      : rule.customPrompt
        ? `${basePrompt}\n\nบริบทเพิ่มเติม: ${rule.customPrompt}`
        : basePrompt;

    try {
      const aiResponse = await this.chatbotService.getResponse(
        message,
        userId,
        lineAccountId,
        fullPrompt,
        settings.aiModel,
      );

      return {
        shouldRespond: true,
        response: aiResponse,
        intent,
        confidence,
        processingTimeMs: Date.now() - startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      };
    } catch (error) {
      this.logger.error('[SMART-AI] AI response failed:', error);
      return {
        shouldRespond: true,
        response: null, // Let the caller handle with fallback
        intent,
        confidence,
        processingTimeMs: Date.now() - startTime,
        wasSpamDetected,
        wasDuplicateDetected,
      };
    }
  }
}
