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
import axios from 'axios';
import { LineAccountsService } from './line-accounts.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MessageDirection, MessageType } from '../database/schemas/chat-message.schema';
import { RedisService } from '../redis/redis.service';
import { ConfigurableMessagesService } from '../common/configurable-messages.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

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
    private websocketGateway: WebsocketGateway,
  ) { }

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

    // Check if webhook is enabled (default to true if not explicitly set)
    // This ensures existing accounts without this setting still work
    const webhookEnabled = account.settings?.webhookEnabled ?? true;
    if (!webhookEnabled) return;

    // ============================================
    // ALWAYS save incoming messages FIRST (before any bot checks)
    // This ensures all messages appear in chat UI regardless of settings
    // ============================================

    // Fetch LINE user profile for display in chat UI
    let lineUserName: string | undefined;
    let lineUserPicture: string | undefined;
    try {
      const profileResponse = await axios.get(
        `https://api.line.me/v2/bot/profile/${lineUserId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 5000,
        }
      );
      lineUserName = profileResponse.data.displayName;
      lineUserPicture = profileResponse.data.pictureUrl;
    } catch (profileError) {
      this.logger.debug(`Could not fetch user profile: ${lineUserId}`);
    }

    if (message.type === 'text') {
      await this.lineAccountsService.saveChatMessage(
        accountId,
        lineUserId,
        MessageDirection.IN,
        MessageType.TEXT,
        message.text,
        message.id,
        replyToken,
        event,
        lineUserName,
        lineUserPicture,
      );

      // Emit real-time event to frontend
      const messageData = {
        _id: message.id,
        lineAccountId: accountId,
        lineUserId,
        lineUserName,
        lineUserPicture,
        direction: 'in',
        messageType: 'text',
        messageText: message.text,
        messageId: message.id,
        createdAt: new Date().toISOString(),
      };

      // Emit to user room (owner of LINE account)
      this.websocketGateway.broadcastToRoom(`chat:${accountId}`, 'message_received', messageData);
      // Emit to admins
      this.websocketGateway.broadcastToAdmins('message_received', messageData);
    } else if (message.type === 'image') {
      // Also save image messages
      await this.lineAccountsService.saveChatMessage(
        accountId,
        lineUserId,
        MessageDirection.IN,
        MessageType.IMAGE,
        '[รูปภาพ]',
        message.id,
        replyToken,
        event,
        lineUserName,
        lineUserPicture,
      );

      // Emit real-time event for image
      const imageMessageData = {
        _id: message.id,
        lineAccountId: accountId,
        lineUserId,
        lineUserName,
        lineUserPicture,
        direction: 'in',
        messageType: 'image',
        messageText: '[รูปภาพ]',
        messageId: message.id,
        createdAt: new Date().toISOString(),
      };
      this.websocketGateway.broadcastToRoom(`chat:${accountId}`, 'message_received', imageMessageData);
      this.websocketGateway.broadcastToAdmins('message_received', imageMessageData);
    }

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

    // Handle different message types (bot is enabled at this point)
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

    // Helper to safely send message (handles reply token expiration and Flex fallback)
    const safeSendMessage = async (messages: any[], useReply = false) => {
      const sendMessages = async (msgs: any[]) => {
        if (useReply && replyToken && !replyTokenUsed) {
          await this.lineAccountsService.sendReply(replyToken, msgs, accessToken);
          replyTokenUsed = true;
        } else {
          await this.lineAccountsService.sendPush(lineUserId, msgs, accessToken);
        }
      };

      try {
        await sendMessages(messages);
      } catch (sendError: any) {
        this.logger.error('Failed to send LINE message:', sendError);

        // If sending fails (e.g. invalid Flex format), try fallback to text message
        if (sendError?.response?.status === 400) {
          this.logger.warn('[SLIP] Flex message failed, trying text fallback...');
          try {
            // Extract text from first message's altText or use default
            const firstMsg = messages[0];
            const fallbackText = firstMsg?.altText || firstMsg?.text || 'ระบบตรวจสอบสลิปเรียบร้อยแล้ว';
            await sendMessages([{ type: 'text', text: fallbackText }]);
            this.logger.log('[SLIP] Text fallback sent successfully');
          } catch (fallbackError) {
            this.logger.error('[SLIP] Text fallback also failed:', fallbackError);
          }
        }
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
      this.logger.log(`[SLIP] Starting verification for messageId=${messageId}, accountId=${accountId}`);

      // Prevent duplicate concurrent processing per message
      if (await this.redisService.exists(lockKey)) {
        this.logger.log(`[SLIP] Duplicate slip processing blocked: ${messageId}`);
        return;
      }
      await this.redisService.set(lockKey, '1', 300); // 5 minutes lock
      this.logger.log(`[SLIP] Lock acquired for ${messageId}`);

      // ============================================
      // ตรวจสอบโควต้าก่อนส่งตรวจสอบสลิป (ใช้ logic ใหม่ที่เรียบง่าย)
      // ============================================
      const ownerQuotaDetail = await this.subscriptionsService.checkQuotaDetailed(ownerId);
      this.logger.log(`[SLIP] Quota check: status=${ownerQuotaDetail.status}, remaining=${ownerQuotaDetail.remainingQuota}`);

      // สถานะ: no_subscription หรือ quota_exhausted = ใช้ template โควต้าหมด
      if (ownerQuotaDetail.status === 'no_subscription' || ownerQuotaDetail.status === 'quota_exhausted') {
        this.logger.log(`[SLIP] No quota - sending quota exhausted message`);
        const quotaMsg = await this.configurableMessagesService.formatQuotaExhaustedResponse({ account });
        await safeSendMessage([quotaMsg], true);
        return;
      }

      // สถานะ: package_expired = ใช้ template แพ็คเกจหมดอายุ
      if (ownerQuotaDetail.status === 'package_expired') {
        this.logger.log(`[SLIP] Package expired - sending expired message`);
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
        this.logger.log(`[SLIP] Processing message sent`);
      }

      // Get retry settings
      const retrySettings = await this.configurableMessagesService.getRetrySettings();
      this.logger.log(`[SLIP] Starting image download...`);

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
        this.logger.error('[SLIP] Failed to get image content after retries:', imageError);
        const errorMsg = await this.configurableMessagesService.formatSlipNotFoundResponse({ account });
        await safeSendMessage([errorMsg]);
        return;
      }
      this.logger.log(`[SLIP] Image downloaded, size=${imageData.length} bytes`);

      // Phase 1: Pre-screen (validate) before reserving quota
      const validation = this.slipVerificationService.validateSlipImage(imageData);
      if (!validation.ok) {
        this.logger.log(`[SLIP] Image validation failed`);
        const invalidMsg = await this.configurableMessagesService.formatSlipNotFoundResponse({ account });
        await safeSendMessage([invalidMsg]);
        return;
      }
      this.logger.log(`[SLIP] Image validation passed`);

      // Phase 2: Check and reserve quota (atomic operation)
      if (!ownerQuota.hasQuota) {
        this.logger.log(`[SLIP] No quota available`);
        const quotaMsg = await this.configurableMessagesService.formatQuotaExhaustedResponse({ account });
        await safeSendMessage([quotaMsg]);
        return;
      }

      subscriptionId = await this.subscriptionsService.reserveQuota(ownerId, 1);
      if (!subscriptionId) {
        this.logger.log(`[SLIP] Quota reservation failed`);
        const quotaMsg = await this.configurableMessagesService.formatQuotaExhaustedResponse({ account });
        await safeSendMessage([quotaMsg]);
        return;
      }
      this.logger.log(`[SLIP] Quota reserved, subscriptionId=${subscriptionId}`);

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
      this.logger.log(`[SLIP] Reservation created, starting Thunder API verification...`);

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
      this.logger.log(`Slip verification completed: status=${result.status}, message=${result.message}`);

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
        try {
          const duplicateMsg = await this.slipVerificationService.formatSlipResponseWithConfig(
            result,
            { account, quotaRemaining: newQuota.remainingQuota }
          );
          if (!duplicateMsg) {
            await safeSendMessage([{ type: 'text', text: '⚠️ สลิปนี้เคยถูกใช้แล้ว' }]);
          } else {
            await safeSendMessage([duplicateMsg]);
          }
        } catch (formatError) {
          this.logger.error('Error formatting duplicate slip response, sending fallback:', formatError);
          await safeSendMessage([{ type: 'text', text: '⚠️ สลิปนี้เคยถูกใช้แล้ว' }]);
        }

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
      try {
        const responseMessage = await this.slipVerificationService.formatSlipResponseWithConfig(
          result,
          { account, quotaRemaining }
        );

        // Ensure we have a valid message
        if (!responseMessage) {
          this.logger.error('formatSlipResponseWithConfig returned null/undefined');
          await safeSendMessage([{ type: 'text', text: `${result.status === 'success' ? '✅' : '❌'} ${result.message || 'ตรวจสอบสลิปเรียบร้อย'}` }]);
        } else {
          await safeSendMessage([responseMessage]);
        }
      } catch (formatError) {
        this.logger.error('Error formatting slip response, sending fallback:', formatError);
        // Send fallback message (note: duplicate already returns early, so only success/error/not_found)
        const fallbackText = result.status === 'success'
          ? '✅ ตรวจสอบสลิปสำเร็จ'
          : `❌ ${result.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป'}`;
        await safeSendMessage([{ type: 'text', text: fallbackText }]);
      }

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

      // Emit real-time event for outgoing message
      const outMessageData = {
        _id: `out_${Date.now()}`,
        lineAccountId: accountId,
        lineUserId,
        direction: 'out',
        messageType: 'text',
        messageText: response,
        sentBy: 'AI',
        createdAt: new Date().toISOString(),
      };
      this.websocketGateway.broadcastToRoom(`chat:${accountId}`, 'message_received', outMessageData);
      this.websocketGateway.broadcastToAdmins('message_received', outMessageData);

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
