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
  IntentTestResult,
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
  smartAiConfidenceThreshold?: number;
  smartAiMaxTokens?: number;
  smartAiResponseDelayMs?: number;
  smartAiMaxRetries?: number;
  smartAiRetryDelayMs?: number;
  smartAiFallbackAction?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    let currentRule: IntentRuleConfig = rules[intent] || {
      enabled: true,
      useAi: true,
      customPrompt: '',
      responseTemplate: '',
    };

    // Confidence threshold check: per-intent override > global threshold
    const globalThreshold = settings.smartAiConfidenceThreshold ?? 0.6;
    const threshold = currentRule.confidenceThreshold ?? globalThreshold;
    let fellBelowThreshold = false;

    if (intent !== 'general' && confidence < threshold) {
      this.logger.log(
        `[SMART-AI] Confidence ${confidence} below threshold ${threshold} for intent ${intent}, falling back to general`,
      );
      fellBelowThreshold = true;
      intent = 'general';
      currentRule = rules['general'] || { enabled: true, useAi: true, customPrompt: '', responseTemplate: '' };
    }

    const makeResult = (shouldRespond: boolean, response: string | null): SmartResponseResult => ({
      shouldRespond,
      response,
      intent,
      confidence,
      processingTimeMs: Date.now() - startTime,
      wasSpamDetected,
      wasDuplicateDetected,
      fellBelowThreshold,
    });

    // If rule is disabled, don't respond
    if (!currentRule.enabled) {
      return makeResult(false, null);
    }

    const template = currentRule.responseTemplate || '';

    // Handle __NO_RESPONSE__
    if (template === '__NO_RESPONSE__') {
      return makeResult(false, null);
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
      return makeResult(true, responseText);
    }

    // If useAi is false, return the template
    if (!currentRule.useAi && template) {
      return makeResult(true, template);
    }

    // Response delay (simulate typing)
    const delayMs = settings.smartAiResponseDelayMs ?? 0;
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    // useAi is true — build specialized prompt and call AI
    const fullPrompt = this.buildPrompt(intent, currentRule, settings, message);

    // Retry logic for AI call
    const maxRetries = settings.smartAiMaxRetries ?? 2;
    const retryDelay = settings.smartAiRetryDelayMs ?? 1000;
    const maxTokens = settings.smartAiMaxTokens ?? 500;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const aiResponse = await this.chatbotService.getResponse(
          message,
          userId,
          lineAccountId,
          fullPrompt,
          settings.aiModel,
          maxTokens,
        );
        return makeResult(true, aiResponse);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`[SMART-AI] AI attempt ${attempt}/${maxRetries} failed:`, error);
        if (attempt < maxRetries) {
          await sleep(retryDelay);
        }
      }
    }

    // All retries failed — apply fallback action
    this.logger.error('[SMART-AI] All AI retries failed:', lastError);
    const fallbackAction = settings.smartAiFallbackAction || 'fallback_message';

    switch (fallbackAction) {
      case 'legacy_ai':
        // Return null response — caller will use legacy chatbot.getResponse()
        return makeResult(true, null);
      case 'no_response':
        return makeResult(false, null);
      case 'fallback_message':
      default:
        // Return null to let caller use the aiFallbackMessage
        return makeResult(true, null);
    }
  }

  private buildPrompt(
    intent: SmartAiIntent,
    rule: IntentRuleConfig,
    settings: SmartAiSettings,
    message: string,
  ): string {
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
      case 'ask_game_recommend':
        contextPrompt = 'ลูกค้าถามแนะนำเกม ให้แนะนำเกมที่น่าสนใจ';
        break;
      default:
        contextPrompt = '';
    }

    const basePrompt =
      settings.aiSystemPrompt ||
      'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น';

    if (contextPrompt) {
      return `${basePrompt}\n\nบริบทเพิ่มเติม: ${rule.customPrompt || contextPrompt}`;
    }
    if (rule.customPrompt) {
      return `${basePrompt}\n\nบริบทเพิ่มเติม: ${rule.customPrompt}`;
    }
    return basePrompt;
  }

  /**
   * Test classification without sending LINE message.
   * Used by the admin test-classification endpoint.
   */
  async testClassification(
    message: string,
    settings: SmartAiSettings,
  ): Promise<IntentTestResult> {
    const startTime = Date.now();

    try {
      // Stage 1: Classify intent
      const classificationResult = await this.intentClassifier.classifyIntent(
        message,
        settings.smartAiClassifierModel || 'gpt-3.5-turbo',
      );

      const originalIntent = classificationResult.intent;
      const confidence = classificationResult.confidence;
      let intent: SmartAiIntent = originalIntent;

      // Determine threshold
      const rules = settings.intentRules || {};
      const rule = rules[intent] || { enabled: true, useAi: true, customPrompt: '', responseTemplate: '' };
      const globalThreshold = settings.smartAiConfidenceThreshold ?? 0.6;
      const threshold = rule.confidenceThreshold ?? globalThreshold;
      let fellBelowThreshold = false;

      if (intent !== 'general' && confidence < threshold) {
        fellBelowThreshold = true;
        intent = 'general';
      }

      // Determine if it would respond
      const finalRule = rules[intent] || { enabled: true, useAi: true, customPrompt: '', responseTemplate: '' };
      let wouldRespond = finalRule.enabled;
      const template = finalRule.responseTemplate || '';
      if (template === '__NO_RESPONSE__') wouldRespond = false;

      // Generate sample response
      let sampleResponse: string | null = null;
      if (wouldRespond) {
        if (template === '__SEND_LINKS__') {
          const links = settings.gameLinks || [];
          sampleResponse = links.length === 0
            ? 'ขออภัยค่ะ ยังไม่มีลิงก์ที่ตั้งค่าไว้'
            : '🔗 ลิงก์เข้าเล่น:\n' + links.map((l) => `▸ ${l.name}: ${l.url}`).join('\n');
        } else if (!finalRule.useAi && template) {
          sampleResponse = template;
        } else if (finalRule.useAi) {
          // Build prompt and get sample AI response (use test user)
          const fullPrompt = this.buildPrompt(intent, finalRule, settings, message);
          try {
            sampleResponse = await this.chatbotService.getResponse(
              message,
              'test-user',
              'test-classification',
              fullPrompt,
              settings.aiModel,
              settings.smartAiMaxTokens ?? 500,
            );
          } catch {
            sampleResponse = '[AI ไม่สามารถสร้างตัวอย่างได้]';
          }
        }
      }

      return {
        intent,
        confidence,
        thresholdUsed: threshold,
        fellBelowThreshold,
        wouldRespond,
        sampleResponse,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error('[SMART-AI] Test classification error:', error);
      return {
        intent: 'general',
        confidence: 0,
        thresholdUsed: settings.smartAiConfidenceThreshold ?? 0.6,
        fellBelowThreshold: false,
        wouldRespond: false,
        sampleResponse: null,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }
}
