import {
  Controller,
  Post,
  Body,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { LineAccountsService } from './line-accounts.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MessageDirection, MessageType } from '../database/schemas/chat-message.schema';
import { RedisService } from '../redis/redis.service';
import { ConfigurableMessagesService } from '../common/configurable-messages.service';

@ApiTags('LINE Webhook')
@Controller('webhook/line')
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private lineAccountsService: LineAccountsService,
    private slipVerificationService: SlipVerificationService,
    private chatbotService: ChatbotService,
    private subscriptionsService: SubscriptionsService,
    private redisService: RedisService,
    private configurableMessagesService: ConfigurableMessagesService,
  ) {}

  @Post(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LINE Webhook endpoint (supports both webhookSlug and channelId)' })
  async handleWebhook(
    @Param('slug') slug: string,
    @Headers('x-line-signature') signature: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    try {
      // Find LINE account by webhookSlug first, then fallback to channelId (backward compatibility)
      let account = await this.lineAccountsService.findByWebhookSlug(slug);
      if (!account) {
        // Fallback: try finding by channelId for old webhook URLs
        account = await this.lineAccountsService.findByChannelId(slug);
      }
      
      if (!account) {
        this.logger.warn(`LINE account not found for slug/channelId: ${slug}`);
        return { success: false };
      }

      // Verify signature
      const rawBody: Buffer | undefined = req?.rawBody;
      const payloadToSign = rawBody && rawBody.length > 0 ? rawBody : Buffer.from(JSON.stringify(body));
      const expectedSignature = crypto
        .createHmac('sha256', account.channelSecret)
        .update(payloadToSign)
        .digest('base64');

      if (!this.timingSafeEqualBase64(signature, expectedSignature)) {
        this.logger.warn('Invalid LINE signature');
        return { success: false };
      }

      // Update webhook timestamp
      await this.lineAccountsService.updateWebhookTimestamp(account._id.toString());

      // Process events
      const events = body.events || [];
      for (const event of events) {
        await this.processEvent(account, event);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Webhook error:', error);
      return { success: false };
    }
  }

  private async processEvent(account: any, event: any): Promise<void> {
    const { type, source, replyToken, message } = event;
    const lineUserId = source?.userId;
    const accountId = account._id.toString();
    const accessToken = account.accessToken;

    if (type !== 'message' || !lineUserId) return;

    // Increment message count
    await this.lineAccountsService.incrementStatistics(accountId, 'totalMessages');

    // Helper function to safely send messages
    const safeSendReply = async (text: string) => {
      try {
        if (replyToken) {
          await this.lineAccountsService.sendReply(replyToken, [{ type: 'text', text }], accessToken);
        }
      } catch (error) {
        this.logger.error('Failed to send reply:', error);
      }
    };

    // Check if webhook is enabled
    if (!account.settings?.webhookEnabled) return;

    // Check if bot is enabled (ผู้ใช้เลือกได้ว่าจะส่งข้อความหรือไม่)
    if (!account.settings?.enableBot) {
      const disabledMsg = await this.configurableMessagesService.formatBotDisabledResponse({ account });
      if (disabledMsg) {
        try {
          if (replyToken) {
            await this.lineAccountsService.sendReply(replyToken, [disabledMsg], accessToken);
          }
        } catch (error) {
          this.logger.error('Failed to send bot disabled reply:', error);
        }
      }
      return;
    }

    // Handle different message types
    if (message.type === 'image') {
      // Handle image - slip verification
      if (account.settings?.enableSlipVerification) {
        await this.handleSlipVerification(account, event);
      } else {
        // Send slip disabled message if configured (ผู้ใช้เลือกได้ว่าจะส่งหรือไม่)
        const slipDisabledMsg = await this.configurableMessagesService.formatBotDisabledResponse({ account });
        if (slipDisabledMsg) {
          await safeSendReply(typeof slipDisabledMsg === 'string' ? slipDisabledMsg : slipDisabledMsg.text || '');
        }
      }
    } else if (message.type === 'text') {
      // Save message
      await this.lineAccountsService.saveChatMessage(
        accountId,
        lineUserId,
        MessageDirection.IN,
        MessageType.TEXT,
        message.text,
        message.id,
        replyToken,
        event,
      );

      // Handle AI response if enabled
      if (account.settings?.enableAi) {
        await this.handleAIResponse(account, event);
      } else {
        // Send AI disabled message if configured
        const aiDisabledMessage = await this.configurableMessagesService.getAiDisabledMessage({ account });
        if (aiDisabledMessage) {
          await safeSendReply(aiDisabledMessage);
        }
      }
    }
  }

  private async handleSlipVerification(account: any, event: any): Promise<void> {
    const { source, replyToken, message } = event;
    const lineUserId = source.userId;
    const accessToken = account.accessToken;
    const accountId = account._id.toString();
    const ownerId = account.ownerId;
    const messageId = message.id;
    const lockKey = `slip:processing:${accountId}:${messageId}`;

    let subscriptionId: string | null = null;
    let reservationId: string | null = null;
    let replyTokenUsed = false;

    // Helper to safely send message (handles reply token expiration)
    const safeSendMessage = async (messages: any[], useReply = false) => {
      try {
        if (useReply && replyToken && !replyTokenUsed) {
          await this.lineAccountsService.sendReply(replyToken, messages, accessToken);
          replyTokenUsed = true;
        } else {
          await this.lineAccountsService.sendPush(lineUserId, messages, accessToken);
        }
      } catch (sendError) {
        this.logger.error('Failed to send LINE message:', sendError);
      }
    };

    // Helper for retry logic
    const retryWithBackoff = async <T>(
      fn: () => Promise<T>,
      maxRetries: number,
      baseDelayMs: number,
      operationName: string,
    ): Promise<T> => {
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
          this.logger.warn(`${operationName} attempt ${attempt}/${maxRetries} failed:`, error);
          if (attempt < maxRetries) {
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError;
    };

    try {
      // Prevent duplicate concurrent processing per message
      if (await this.redisService.exists(lockKey)) {
        this.logger.log(`Duplicate slip processing blocked: ${messageId}`);
        return;
      }
      await this.redisService.set(lockKey, '1', 300); // 5 minutes lock

      // ============================================
      // ตรวจสอบโควต้าก่อนส่งตรวจสอบสลิป (ใช้ logic ใหม่ที่เรียบง่าย)
      // ============================================
      const ownerQuotaDetail = await this.subscriptionsService.checkQuotaDetailed(ownerId);
      
      // สถานะ: no_subscription หรือ quota_exhausted = ใช้ template โควต้าหมด
      if (ownerQuotaDetail.status === 'no_subscription' || ownerQuotaDetail.status === 'quota_exhausted') {
        const quotaMsg = await this.configurableMessagesService.formatQuotaExhaustedResponse({ account });
        await safeSendMessage([quotaMsg], true);
        return;
      }
      
      // สถานะ: package_expired = ใช้ template แพ็คเกจหมดอายุ
      if (ownerQuotaDetail.status === 'package_expired') {
        const expiredMsg = await this.configurableMessagesService.formatPackageExpiredResponse({ account });
        await safeSendMessage([expiredMsg], true);
        return;
      }
      
      // status is 'has_quota' - proceed with verification
      const ownerQuota = ownerQuotaDetail;

      // ============================================
      // ส่งข้อความกำลังประมวลผล (ผู้ใช้เลือกได้ว่าจะส่งหรือไม่)
      // ============================================
      const processingMsg = await this.configurableMessagesService.formatProcessingResponse({ account });
      if (processingMsg) {
        await safeSendMessage([processingMsg], true);
      }

      // Get retry settings
      const retrySettings = await this.configurableMessagesService.getRetrySettings();

      // ============================================
      // ดาวน์โหลดรูปภาพ (ใช้ template ไม่พบสลิป รวมทุกกรณีอ่านสลิปไม่ได้)
      // ============================================
      let imageData: Buffer;
      try {
        imageData = await retryWithBackoff(
          () => this.lineAccountsService.getMessageContent(messageId, accessToken),
          retrySettings.maxAttempts,
          retrySettings.delayMs,
          'Get image content',
        );
      } catch (imageError) {
        this.logger.error('Failed to get image content after retries:', imageError);
        const errorMsg = await this.configurableMessagesService.formatSlipNotFoundResponse({ account });
        await safeSendMessage([errorMsg]);
        return;
      }

      // Phase 1: Pre-screen (validate) before reserving quota
      const validation = this.slipVerificationService.validateSlipImage(imageData);
      if (!validation.ok) {
        const invalidMsg = await this.configurableMessagesService.formatSlipNotFoundResponse({ account });
        await safeSendMessage([invalidMsg]);
        return;
      }

      // Phase 2: Check and reserve quota (atomic operation)
      if (!ownerQuota.hasQuota) {
        const quotaMsg = await this.configurableMessagesService.formatQuotaExhaustedResponse({ account });
        await safeSendMessage([quotaMsg]);
        return;
      }

      subscriptionId = await this.subscriptionsService.reserveQuota(ownerId, 1);
      if (!subscriptionId) {
        const quotaMsg = await this.configurableMessagesService.formatQuotaExhaustedResponse({ account });
        await safeSendMessage([quotaMsg]);
        return;
      }

      // Create reservation record
      const reservation = await this.slipVerificationService.createReservation({
        ownerId,
        subscriptionId,
        lineAccountId: accountId,
        lineUserId,
        messageId,
        amount: 1,
      });
      reservationId = reservation._id.toString();

      // Phase 3: Verify slip with retry (ใช้ template ใหม่เมื่อเกิดข้อผิดพลาด)
      const result = await retryWithBackoff(
        () => this.slipVerificationService.verifySlip(
          imageData,
          accountId,
          lineUserId,
          messageId,
          { ownerId, subscriptionId: subscriptionId || undefined, reservationId: reservationId || undefined },
        ),
        retrySettings.maxAttempts,
        retrySettings.delayMs,
        'Slip verification',
      ).catch(async (error) => {
        this.logger.error('Slip verification failed after retries:', error);
        // ใช้ template ข้อผิดพลาดระบบ
        const errorResponse = await this.configurableMessagesService.formatSystemErrorResponse({ account });
        return {
          status: 'error' as const,
          message: typeof errorResponse === 'string' ? errorResponse : errorResponse?.text || 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        };
      });

      // Phase 4: Finalize quota (commit or rollback)
      // ตรวจสอบโควต้าเหลือน้อย (จะแสดงในบล็อกผลสลิปเลย)
      let quotaRemaining: number | undefined;
      
      if (result.status === 'success') {
        await this.subscriptionsService.confirmReservation(subscriptionId, 1);
        await this.slipVerificationService.confirmReservation(reservationId);

        // ดึงโควต้าเหลือเพื่อแสดงในบล็อกสลิป
        const newQuota = await this.subscriptionsService.checkQuota(ownerId);
        quotaRemaining = newQuota.remainingQuota;
      } else if (result.status === 'duplicate') {
        const refund = await this.configurableMessagesService.shouldRefundDuplicate();
        if (refund) {
          await this.subscriptionsService.rollbackReservation(subscriptionId, 1);
          await this.slipVerificationService.rollbackReservation(reservationId, 'duplicate_refunded');
        } else {
          await this.subscriptionsService.confirmReservation(subscriptionId, 1);
          await this.slipVerificationService.confirmReservation(reservationId);
        }
        
        // ตรวจสอบโควต้าเหลือน้อย (แสดงในบล็อกเดียวกับสลิปซ้ำ)
        const newQuota = await this.subscriptionsService.checkQuota(ownerId);
        
        // ใช้ Slip Template สำหรับสลิปซ้ำ (ส่ง quota info ไปด้วย)
        const duplicateMsg = await this.slipVerificationService.formatSlipResponseWithConfig(
          result, 
          { account, quotaRemaining: newQuota.remainingQuota }
        );
        await safeSendMessage([duplicateMsg]);
        
        // Increment slip count and return early
        await this.lineAccountsService.incrementStatistics(accountId, 'totalSlipsVerified');
        return;
      } else {
        // Error or not_found - rollback
        await this.subscriptionsService.rollbackReservation(subscriptionId, 1);
        await this.slipVerificationService.rollbackReservation(reservationId, result.status);
        // Clear subscriptionId/reservationId to prevent double rollback in catch block
        subscriptionId = null;
        reservationId = null;
      }

      // Send result message (รวมบล็อกเตือนโควต้าถ้าเหลือน้อย)
      const responseMessage = await this.slipVerificationService.formatSlipResponseWithConfig(
        result, 
        { account, quotaRemaining }
      );
      await safeSendMessage([responseMessage]);

      // Increment slip count
      if (result.status === 'success') {
        await this.lineAccountsService.incrementStatistics(
          accountId,
          'totalSlipsVerified',
        );
      }
    } catch (error) {
      this.logger.error('Slip verification error:', error);

      // Best-effort rollback if we already reserved quota
      if (subscriptionId) {
        await this.subscriptionsService.rollbackReservation(subscriptionId, 1).catch((e) => {
          this.logger.error('Failed to rollback subscription quota:', e);
        });
      }
      if (reservationId) {
        await this.slipVerificationService.rollbackReservation(reservationId, 'exception').catch((e) => {
          this.logger.error('Failed to rollback reservation:', e);
        });
      }

      // ส่งข้อความข้อผิดพลาดระบบ (ใช้ template ใหม่)
      try {
        const errorMsg = await this.configurableMessagesService.formatSystemErrorResponse({ account });
        await this.lineAccountsService.sendPush(
          lineUserId,
          [errorMsg],
          accessToken,
        );
      } catch (sendError) {
        this.logger.error('Failed to send error message:', sendError);
      }
    } finally {
      await this.redisService.del(lockKey).catch(() => undefined);
    }
  }

  private async handleAIResponse(account: any, event: any): Promise<void> {
    const { source, message } = event;
    const lineUserId = source.userId;
    const accessToken = account.accessToken;
    const accountId = account._id.toString();

    // Get retry settings
    const retrySettings = await this.configurableMessagesService.getRetrySettings();

    // Helper for retry logic
    const retryWithBackoff = async <T>(
      fn: () => Promise<T>,
      maxRetries: number,
      baseDelayMs: number,
    ): Promise<T> => {
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
          this.logger.warn(`AI response attempt ${attempt}/${maxRetries} failed:`, error);
          if (attempt < maxRetries) {
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError;
    };

    try {
      // Get AI response with retry
      const response = await retryWithBackoff(
        () => this.chatbotService.getResponse(
          message.text,
          lineUserId,
          accountId,
          account.settings?.aiSystemPrompt,
        ),
        retrySettings.maxAttempts,
        retrySettings.delayMs,
      );

      // Save outgoing message
      await this.lineAccountsService.saveChatMessage(
        accountId,
        lineUserId,
        MessageDirection.OUT,
        MessageType.TEXT,
        response,
      );

      // Send response
      await this.lineAccountsService.sendPush(
        lineUserId,
        [{ type: 'text', text: response }],
        accessToken,
      );

      // Increment AI response count
      await this.lineAccountsService.incrementStatistics(accountId, 'totalAiResponses');
    } catch (error) {
      this.logger.error('AI response error:', error);
      const fallbackMessage = account.settings?.aiFallbackMessage || 'ขอบคุณสำหรับข้อความของคุณ';
      try {
        await this.lineAccountsService.sendPush(
          lineUserId,
          [{ type: 'text', text: fallbackMessage }],
          accessToken,
        );
      } catch (sendError) {
        this.logger.error('Failed to send AI fallback message:', sendError);
      }
    }
  }

  private timingSafeEqualBase64(a: string, b: string): boolean {
    try {
      if (!a || !b) return false;
      const aBuf = Buffer.from(a, 'base64');
      const bBuf = Buffer.from(b, 'base64');
      if (aBuf.length !== bBuf.length) return false;
      return crypto.timingSafeEqual(aBuf, bBuf);
    } catch {
      return false;
    }
  }
}
