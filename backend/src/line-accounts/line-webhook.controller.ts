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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import axios from 'axios';
import { LineAccountsService } from './line-accounts.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { AiQuotaService } from '../chatbot/ai-quota.service';
import { SmartResponseService } from '../chatbot/smart-response.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MessageDirection, MessageType } from '../database/schemas/chat-message.schema';
import { RedisService } from '../redis/redis.service';
import { ConfigurableMessagesService } from '../common/configurable-messages.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { WebhookRateLimitGuard } from '../common/guards/webhook-rate-limit.guard';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@ApiTags('LINE Webhook')
@Controller('webhook/line')
@UseGuards(WebhookRateLimitGuard)
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private lineAccountsService: LineAccountsService,
    private slipVerificationService: SlipVerificationService,
    private chatbotService: ChatbotService,
    private aiQuotaService: AiQuotaService,
    private smartResponseService: SmartResponseService,
    private subscriptionsService: SubscriptionsService,
    private redisService: RedisService,
    private configurableMessagesService: ConfigurableMessagesService,
    private websocketGateway: WebsocketGateway,
    private systemSettingsService: SystemSettingsService,
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

      // Update webhook timestamp (don't await to avoid blocking)
      this.lineAccountsService.updateWebhookTimestamp(account._id.toString()).catch((e) => {
        this.logger.warn('Failed to update webhook timestamp:', e);
      });

      // IMPORTANT: Process events asynchronously to avoid LINE webhook timeout
      // LINE expects a response within 30 seconds, but slip verification can take longer
      // Process in background and return immediately
      const events = body.events || [];
      const eventCount = events.length;

      if (eventCount > 0) {
        this.logger.log(`[WEBHOOK] Processing ${eventCount} events in background for account ${account._id}`);

        // Fire and forget - process events in background
        setImmediate(async () => {
          for (const event of events) {
            try {
              await this.processEvent(account, event);
            } catch (err) {
              this.logger.error(`[WEBHOOK] Background event processing error for ${event?.message?.id || 'unknown'}:`, err);
            }
          }
          this.logger.log(`[WEBHOOK] Background processing completed for ${eventCount} events`);
        });
      }

      // Return immediately to LINE to prevent timeout
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
    // ใช้ ?? true เพื่อให้ default เป็นเปิดใช้งาน (ตรงกับ schema)
    if (!(account.settings?.enableBot ?? true)) {
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
      // ตรวจสอบการตั้งค่า 2 ระดับ:
      // 1. ระดับแอดมิน (globalSlipVerificationEnabled) - ปิดทั้งระบบ
      // 2. ระดับบัญชี LINE (enableSlipVerification) - ปิดเฉพาะบัญชีนี้
      const systemSettings = await this.systemSettingsService.getSettings();
      const globalEnabled = systemSettings?.globalSlipVerificationEnabled ?? true;
      const accountEnabled = account.settings?.enableSlipVerification ?? true;
      
      // ตรวจสอบทั้ง 2 ระดับ - ถ้าอันใดอันหนึ่งปิด จะไม่ตรวจสอบสลิป
      if (globalEnabled && accountEnabled) {
        await this.handleSlipVerification(account, event);
      } else {
        // Log ว่าปิดจากระดับไหน
        if (!globalEnabled) {
          this.logger.log(`[SLIP] Slip verification disabled globally by admin`);
        } else {
          this.logger.log(`[SLIP] Slip verification disabled for this LINE account`);
        }
        
        // Send slip disabled message (ใช้ formatSlipDisabledResponse)
        const slipDisabledMsg = await this.configurableMessagesService.formatSlipDisabledResponse({ account });
        if (slipDisabledMsg) {
          try {
            // ส่งข้อความตอบกลับทุกครั้งเมื่อรับรูป
            if (replyToken) {
              await this.lineAccountsService.sendReply(replyToken, [slipDisabledMsg], accessToken);
            } else {
              // ถ้าไม่มี replyToken ให้ใช้ push แทน
              await this.lineAccountsService.sendPush(lineUserId, [slipDisabledMsg], accessToken);
            }
          } catch (error) {
            this.logger.error('Failed to send slip disabled reply:', error);
            // Fallback: ลองส่งผ่าน push แทน
            try {
              const fallbackText = typeof slipDisabledMsg === 'string' ? slipDisabledMsg : (slipDisabledMsg.text || slipDisabledMsg.altText || '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว');
              await this.lineAccountsService.sendPush(lineUserId, [{ type: 'text', text: fallbackText }], accessToken);
            } catch (pushError) {
              this.logger.error('Failed to send slip disabled push:', pushError);
            }
          }
        } else {
          // ถ้าไม่มีข้อความจาก template แต่ตั้งค่าให้ส่ง ให้ส่ง fallback message
          // ตรวจสอบว่าตั้งค่าให้ส่งข้อความหรือไม่
          const settings = await this.systemSettingsService.getSettings();
          const accountSettings = account.settings || {};
          const shouldSend = accountSettings.sendMessageWhenSlipDisabled ?? settings?.slipDisabledSendMessage ?? true;
          
          if (shouldSend) {
            await safeSendReply('🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว');
          }
        }
      }
    } else if (message.type === 'text') {
      // ตรวจสอบการตั้งค่า AI 2 ระดับ:
      // 1. ระดับแอดมิน (globalAiEnabled) - ปิด AI ทั้งระบบ
      // 2. ระดับบัญชี LINE (enableAi) - ปิด AI เฉพาะบัญชีนี้
      const systemSettings = await this.systemSettingsService.getSettings();
      const globalAiEnabled = systemSettings?.globalAiEnabled ?? true;
      const accountAiEnabled = account.settings?.enableAi ?? false;

      if (globalAiEnabled && accountAiEnabled) {
        await this.handleAIResponse(account, event);
      } else {
        // Log ว่าปิดจากระดับไหน
        if (!globalAiEnabled) {
          this.logger.log(`[AI] AI disabled globally by admin`);
        } else {
          this.logger.log(`[AI] AI disabled for this LINE account`);
        }
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
    // Default to useReply=true to save LINE message quota (Reply is FREE, Push costs quota)
    const safeSendMessage = async (messages: any[], useReply = true) => {
      // Log message details for debugging
      this.logger.log(`[SLIP] safeSendMessage called: useReply=${useReply}, messageCount=${messages.length}`);
      if (messages.length > 0) {
        const firstMsg = messages[0];
        this.logger.log(`[SLIP] First message type: ${firstMsg?.type}, altText: ${firstMsg?.altText || 'none'}`);
        if (firstMsg?.type === 'flex') {
          this.logger.log(`[SLIP] Flex message contents type: ${firstMsg?.contents?.type}`);
        }
      }

      // Helper to extract fallback text from message
      const getFallbackText = (msg: any): string => {
        return msg?.altText || msg?.text || msg?.contents?.body?.contents?.[0]?.text || 'ระบบตรวจสอบสลิปเรียบร้อยแล้ว';
      };

      const sendViaReply = async (msgs: any[]) => {
        if (replyToken && !replyTokenUsed) {
          this.logger.log(`[SLIP] Sending via reply token`);
          await this.lineAccountsService.sendReply(replyToken, msgs, accessToken);
          replyTokenUsed = true;
          return true;
        }
        return false;
      };

      const sendViaPush = async (msgs: any[]) => {
        this.logger.log(`[SLIP] Sending via push to ${lineUserId}`);
        await this.lineAccountsService.sendPush(lineUserId, msgs, accessToken);
      };

      try {
        // Try reply first if requested
        if (useReply) {
          const replySent = await sendViaReply(messages);
          if (replySent) {
            this.logger.log(`[SLIP] Message sent successfully via reply`);
            return;
          }
        }
        // Fallback to push
        await sendViaPush(messages);
        this.logger.log(`[SLIP] Message sent successfully via push`);
      } catch (sendError: any) {
        this.logger.error('Failed to send LINE message:', sendError);

        // If Flex message failed (400 error), try text fallback
        if (sendError?.response?.status === 400) {
          this.logger.warn('[SLIP] Flex message failed, trying text fallback...');
          const firstMsg = messages[0];
          const fallbackText = getFallbackText(firstMsg);
          const textMsg = [{ type: 'text', text: fallbackText }];
          
          try {
            // Try reply first for text fallback
            if (useReply && !replyTokenUsed) {
              const replySent = await sendViaReply(textMsg);
              if (replySent) {
                this.logger.log('[SLIP] Text fallback sent via reply');
                return;
              }
            }
            // Fallback to push for text
            await sendViaPush(textMsg);
            this.logger.log('[SLIP] Text fallback sent via push');
          } catch (fallbackError) {
            this.logger.error('[SLIP] Text fallback also failed:', fallbackError);
          }
        } else {
          // For other errors, try push as fallback if we used reply
          if (useReply && replyTokenUsed) {
            this.logger.warn('[SLIP] Reply failed, trying push...');
            try {
              await sendViaPush(messages);
              this.logger.log('[SLIP] Message sent via push after reply failed');
            } catch (pushError) {
              this.logger.error('[SLIP] Push also failed:', pushError);
              // Last resort: try text message via push
              try {
                const fallbackText = getFallbackText(messages[0]);
                await sendViaPush([{ type: 'text', text: fallbackText }]);
                this.logger.log('[SLIP] Text fallback sent via push');
              } catch (lastError) {
                this.logger.error('[SLIP] All send attempts failed:', lastError);
              }
            }
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
          this.logger.log(`[SLIP] Formatting duplicate response, accountId=${accountId}`);
          this.logger.log(`[SLIP] Account settings slipTemplateIds: ${JSON.stringify(account.settings?.slipTemplateIds || {})}`);
          
          const duplicateMsg = await this.slipVerificationService.formatSlipResponseWithConfig(
            result,
            { account, quotaRemaining: newQuota.remainingQuota, lineUserId, lineAccountId: accountId }
          );
          
          this.logger.log(`[SLIP] Duplicate response generated: type=${duplicateMsg?.type}, hasContents=${!!duplicateMsg?.contents}`);
          
          if (!duplicateMsg) {
            this.logger.warn('[SLIP] No duplicate message generated, using fallback');
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
        this.logger.log(`[SLIP] Formatting response for status=${result.status}, accountId=${accountId}`);
        this.logger.log(`[SLIP] Account settings slipTemplateIds: ${JSON.stringify(account.settings?.slipTemplateIds || {})}`);
        
        const responseMessage = await this.slipVerificationService.formatSlipResponseWithConfig(
          result,
          { account, quotaRemaining }
        );

        this.logger.log(`[SLIP] Response message generated: type=${responseMessage?.type}, hasContents=${!!responseMessage?.contents}`);

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
      // ใช้ Reply ก่อน (ฟรี) ถ้าไม่ได้ใช้ไปแล้ว, fallback เป็น Push
      try {
        const errorMsg = await this.configurableMessagesService.formatSystemErrorResponse({ account });
        await safeSendMessage([errorMsg]);
      } catch (sendError) {
        this.logger.error('Failed to send error message:', sendError);
      }
    } finally {
      await this.redisService.del(lockKey).catch(() => undefined);
    }
  }

  private async handleAIResponse(account: any, event: any): Promise<void> {
    const { source, replyToken, message } = event;
    const lineUserId = source.userId;
    const accessToken = account.accessToken;
    const accountId = account._id.toString();
    const ownerId = account.ownerId;
    const messageId = message.id;

    let subscriptionId: string | null = null;
    let reservationId: string | null = null;
    let replyTokenUsed = false;

    // Helper to send message - uses Reply first (FREE), falls back to Push
    const safeSendAIMessage = async (messages: any[]) => {
      try {
        // Try Reply first (FREE and unlimited)
        if (replyToken && !replyTokenUsed) {
          this.logger.log(`[AI] Sending via reply token`);
          await this.lineAccountsService.sendReply(replyToken, messages, accessToken);
          replyTokenUsed = true;
          return;
        }
        // Fallback to Push
        this.logger.log(`[AI] Sending via push to ${lineUserId}`);
        await this.lineAccountsService.sendPush(lineUserId, messages, accessToken);
      } catch (error: any) {
        // If Reply failed (token expired), try Push
        if (!replyTokenUsed) {
          this.logger.warn(`[AI] Reply failed, trying push...`);
          await this.lineAccountsService.sendPush(lineUserId, messages, accessToken);
        } else {
          throw error;
        }
      }
    };

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
      // ============================================
      // 1. Check AI quota before processing
      // ============================================
      const aiQuotaInfo = await this.subscriptionsService.checkAiQuota(ownerId);
      this.logger.log(`[AI] Quota check for ${ownerId}: hasQuota=${aiQuotaInfo.hasQuota}, remaining=${aiQuotaInfo.remainingQuota}`);

      if (!aiQuotaInfo.hasQuota) {
        this.logger.log(`[AI] No AI quota`);
        // ตรวจสอบว่าต้องส่งข้อความแจ้งเตือนหรือไม่
        const shouldSendQuotaMsg = await this.configurableMessagesService.shouldSendAiQuotaExhaustedMessage({ account });
        if (shouldSendQuotaMsg) {
          this.logger.log(`[AI] Sending quota exhausted message`);
          const quotaMsg = await this.configurableMessagesService.formatAiQuotaExhaustedResponse({ account });
          await safeSendAIMessage([quotaMsg]);
        } else {
          this.logger.log(`[AI] Quota exhausted message disabled by settings`);
        }
        return;
      }

      // ============================================
      // 2. Reserve AI quota (atomic operation)
      // ============================================
      subscriptionId = await this.subscriptionsService.reserveAiQuota(ownerId, 1);
      if (!subscriptionId) {
        this.logger.log(`[AI] AI quota reservation failed`);
        // ตรวจสอบว่าต้องส่งข้อความแจ้งเตือนหรือไม่
        const shouldSendQuotaMsg = await this.configurableMessagesService.shouldSendAiQuotaExhaustedMessage({ account });
        if (shouldSendQuotaMsg) {
          const quotaMsg = await this.configurableMessagesService.formatAiQuotaExhaustedResponse({ account });
          await safeSendAIMessage([quotaMsg]);
        }
        return;
      }
      this.logger.log(`[AI] AI quota reserved, subscriptionId=${subscriptionId}`);

      // ============================================
      // 3. Create reservation record
      // ============================================
      const reservation = await this.aiQuotaService.createReservation({
        ownerId,
        subscriptionId,
        lineAccountId: accountId,
        lineUserId,
        messageId,
        amount: 1,
      });
      reservationId = reservation._id.toString();
      this.logger.log(`[AI] Reservation created, reservationId=${reservationId}`);

      // ============================================
      // 4. Smart AI or Legacy AI response
      // ============================================
      let response: string;
      const isSmartAiEnabled = account.settings?.enableSmartAi === true;

      if (isSmartAiEnabled) {
        // ---- Smart AI Pipeline ----
        this.logger.log(`[AI] Smart AI enabled, using two-stage pipeline`);
        const smartResult = await this.smartResponseService.processMessage(
          message.text,
          lineUserId,
          accountId,
          {
            enableSmartAi: true,
            smartAiClassifierModel: account.settings?.smartAiClassifierModel || 'gpt-3.5-turbo',
            duplicateDetectionWindowMinutes: account.settings?.duplicateDetectionWindowMinutes ?? 5,
            spamThresholdMessagesPerMinute: account.settings?.spamThresholdMessagesPerMinute ?? 5,
            gameLinks: account.settings?.gameLinks || [],
            knowledgeBase: account.settings?.knowledgeBase || [],
            intentRules: account.settings?.intentRules || {},
            aiSystemPrompt: account.settings?.aiSystemPrompt,
            aiModel: account.settings?.aiModel,
            aiTemperature: account.settings?.aiTemperature,
            smartAiConfidenceThreshold: account.settings?.smartAiConfidenceThreshold ?? 0.6,
            smartAiMaxTokens: account.settings?.smartAiMaxTokens ?? 500,
            smartAiResponseDelayMs: account.settings?.smartAiResponseDelayMs ?? 0,
            smartAiMaxRetries: account.settings?.smartAiMaxRetries ?? 2,
            smartAiRetryDelayMs: account.settings?.smartAiRetryDelayMs ?? 1000,
            smartAiFallbackAction: account.settings?.smartAiFallbackAction || 'fallback_message',
          },
        );

        this.logger.log(`[AI] Smart AI result: intent=${smartResult.intent}, shouldRespond=${smartResult.shouldRespond}, time=${smartResult.processingTimeMs}ms`);

        if (!smartResult.shouldRespond) {
          // Don't send a response, but confirm quota usage (classification used a call)
          await this.subscriptionsService.confirmAiReservation(subscriptionId, 1);
          await this.aiQuotaService.confirmReservation(reservationId);
          this.logger.log(`[AI] Smart AI decided not to respond (intent=${smartResult.intent}), quota confirmed`);
          await this.lineAccountsService.incrementStatistics(accountId, 'totalAiResponses');
          return;
        }

        if (smartResult.response) {
          response = smartResult.response;
        } else {
          // Fallback to legacy if smart AI returned null response — inject knowledge base
          let fallbackPrompt = account.settings?.aiSystemPrompt || '';
          const fbKb = (account.settings?.knowledgeBase || []).filter((k: { enabled: boolean }) => k.enabled);
          if (fbKb.length > 0) {
            const fbEntries = fbKb.map((k: { topic: string; answer: string }) => `- ${k.topic}: ${k.answer}`).join('\n');
            fallbackPrompt = (fallbackPrompt || 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น') +
              `\n\nคลังความรู้ (ข้อมูลจริง — ตอบจากข้อมูลนี้เท่านั้น):\n${fbEntries}`;
          }
          fallbackPrompt = (fallbackPrompt || 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย') +
            '\n\nกฎ: ตอบเฉพาะสิ่งที่มีข้อมูล ห้ามเดา ถ้าไม่มีข้อมูลให้แนะนำติดต่อแอดมิน';
          response = await retryWithBackoff(
            () => this.chatbotService.getResponse(
              message.text,
              lineUserId,
              accountId,
              fallbackPrompt || undefined,
              account.settings?.aiModel,
              undefined,
              account.settings?.aiTemperature,
            ),
            retrySettings.maxAttempts,
            retrySettings.delayMs,
          );
        }
      } else {
        // ---- Legacy AI Response ----
        // Build system prompt with knowledge base for legacy path
        let legacyPrompt = account.settings?.aiSystemPrompt || '';
        const kb = (account.settings?.knowledgeBase || []).filter((k: { enabled: boolean }) => k.enabled);
        if (kb.length > 0) {
          const entries = kb.map((k: { topic: string; answer: string }) => `- ${k.topic}: ${k.answer}`).join('\n');
          const knowledgeSection = `\n\nคลังความรู้ (ข้อมูลจริงของธุรกิจ — ใช้ข้อมูลนี้ตอบลูกค้าเท่านั้น ห้ามแต่งเพิ่มเอง ถ้าลูกค้าถามเรื่องที่ไม่มีในนี้ให้แจ้งว่าไม่มีข้อมูลและแนะนำติดต่อแอดมิน):\n${entries}`;
          legacyPrompt = (legacyPrompt || 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น') + knowledgeSection;
        }
        const legacyCoreRules =
          '\n\nกฎสำคัญ:\n' +
          '1. ตอบคำถามของลูกค้าโดยตรงก่อนเสมอ อย่าเปลี่ยนเรื่อง\n' +
          '2. ตอบเฉพาะสิ่งที่มีข้อมูล ห้ามแต่งเรื่องหรือเดาข้อมูลที่ไม่มี\n' +
          '3. ถ้าคำถามอยู่นอกเหนือขอบเขตข้อมูลที่มี ให้แจ้งว่าไม่มีข้อมูลและแนะนำติดต่อแอดมิน\n' +
          '4. ห้ามให้ข้อมูลที่อาจไม่ถูกต้อง เช่น ตัวเลข จำนวนเงิน ลิงก์ ที่ไม่มีในคลังความรู้';
        legacyPrompt = (legacyPrompt || 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น') + legacyCoreRules;
        response = await retryWithBackoff(
          () => this.chatbotService.getResponse(
            message.text,
            lineUserId,
            accountId,
            legacyPrompt || undefined,
            account.settings?.aiModel,
            undefined,
            account.settings?.aiTemperature,
          ),
          retrySettings.maxAttempts,
          retrySettings.delayMs,
        );
      }

      // ============================================
      // 5. Confirm AI quota
      // ============================================
      await this.subscriptionsService.confirmAiReservation(subscriptionId, 1);
      await this.aiQuotaService.confirmReservation(reservationId);
      this.logger.log(`[AI] AI quota confirmed for ${ownerId}`);

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

      // Send response (uses Reply first - FREE, falls back to Push)
      await safeSendAIMessage([{ type: 'text', text: response }]);

      // Increment AI response count
      await this.lineAccountsService.incrementStatistics(accountId, 'totalAiResponses');
    } catch (error) {
      this.logger.error('AI response error:', error);

      // ============================================
      // Rollback AI quota on error
      // ============================================
      if (subscriptionId) {
        await this.subscriptionsService.rollbackAiReservation(subscriptionId, 1).catch((e) => {
          this.logger.error('Failed to rollback AI quota:', e);
        });
      }
      if (reservationId) {
        await this.aiQuotaService.rollbackReservation(reservationId, 'exception').catch((e) => {
          this.logger.error('Failed to rollback AI reservation:', e);
        });
      }

      const fallbackMessage = account.settings?.aiFallbackMessage || 'ขอบคุณสำหรับข้อความของคุณ';
      try {
        await safeSendAIMessage([{ type: 'text', text: fallbackMessage }]);
      } catch (sendError) {
        this.logger.error('Failed to send AI fallback message:', sendError);
      }
    }
  }

  /**
   * SECURITY: Timing-safe comparison for LINE signature verification
   * Uses Node.js built-in crypto.timingSafeEqual to prevent timing attacks
   * 
   * @param signature - The signature from LINE webhook header (x-line-signature)
   * @param expectedSignature - The computed HMAC-SHA256 signature
   * @returns true if signatures match, false otherwise
   */
  private timingSafeEqualBase64(signature: string, expectedSignature: string): boolean {
    try {
      // Validate inputs
      if (!signature || !expectedSignature) {
        this.logger.warn('Signature verification failed: missing signature');
        return false;
      }

      // Convert base64 strings to buffers
      const signatureBuffer = Buffer.from(signature, 'base64');
      const expectedSignatureBuffer = Buffer.from(expectedSignature, 'base64');

      // SECURITY: Check length first (constant time)
      // This is safe because length comparison doesn't leak timing information
      if (signatureBuffer.length !== expectedSignatureBuffer.length) {
        this.logger.warn('Signature verification failed: length mismatch');
        return false;
      }

      // SECURITY: Use Node.js built-in crypto.timingSafeEqual
      // This function is designed to prevent timing attacks by always taking
      // the same amount of time regardless of where the difference is
      return crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer);
    } catch (error) {
      this.logger.error('Signature verification error:', error);
      return false;
    }
  }
}
