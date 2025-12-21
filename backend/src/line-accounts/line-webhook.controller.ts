import {
  Controller,
  Post,
  Body,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { LineAccountsService } from './line-accounts.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MessageDirection, MessageType } from '../database/schemas/chat-message.schema';
import { RedisService } from '../redis/redis.service';

@ApiTags('LINE Webhook')
@Controller('webhook/line')
export class LineWebhookController {
  constructor(
    private lineAccountsService: LineAccountsService,
    private slipVerificationService: SlipVerificationService,
    private chatbotService: ChatbotService,
    private subscriptionsService: SubscriptionsService,
    private redisService: RedisService,
  ) {}

  @Post(':channelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LINE Webhook endpoint' })
  async handleWebhook(
    @Param('channelId') channelId: string,
    @Headers('x-line-signature') signature: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    try {
      // Find LINE account
      const account = await this.lineAccountsService.findByChannelId(channelId);
      if (!account) {
        console.error(`LINE account not found for channel: ${channelId}`);
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
        console.error('Invalid LINE signature');
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
      console.error('Webhook error:', error);
      return { success: false };
    }
  }

  private async processEvent(account: any, event: any): Promise<void> {
    const { type, source, replyToken, message } = event;
    const lineUserId = source?.userId;
    const accountId = account._id.toString();

    if (type !== 'message' || !lineUserId) return;

    // Increment message count
    await this.lineAccountsService.incrementStatistics(accountId, 'totalMessages');

    // Check if bot is enabled
    if (!account.settings?.webhookEnabled || !account.settings?.enableBot) return;

    // Handle different message types
    if (message.type === 'image') {
      // Handle image - slip verification
      if (account.settings?.enableSlipVerification) {
        await this.handleSlipVerification(account, event);
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

    try {
      // Prevent duplicate concurrent processing per message
      if (await this.redisService.exists(lockKey)) {
        return;
      }
      await this.redisService.set(lockKey, '1', 120);

      // Send processing message
      if (account.settings?.slipResponseMode === 'immediate' && account.settings?.slipImmediateMessage) {
        await this.lineAccountsService.sendReply(
          replyToken,
          [{ type: 'text', text: account.settings.slipImmediateMessage }],
          accessToken,
        );
      }

      // Get image content
      const imageData = await this.lineAccountsService.getMessageContent(
        messageId,
        accessToken,
      );

      // Phase 1: Pre-screen (validate) before reserving quota
      const validation = this.slipVerificationService.validateSlipImage(imageData);
      if (!validation.ok) {
        await this.lineAccountsService.sendPush(
          lineUserId,
          [{ type: 'text', text: validation.message || 'รูปภาพไม่ถูกต้อง' }],
          accessToken,
        );
        return;
      }

      // Phase 2: Reserve quota
      const quota = await this.subscriptionsService.checkQuota(ownerId);
      if (!quota.hasQuota) {
        const quotaMsg = await this.slipVerificationService.formatQuotaExceededResponse();
        await this.lineAccountsService.sendPush(lineUserId, [quotaMsg], accessToken);
        return;
      }

      subscriptionId = await this.subscriptionsService.reserveQuota(ownerId, 1);
      if (!subscriptionId) {
        const quotaMsg = await this.slipVerificationService.formatQuotaExceededResponse();
        await this.lineAccountsService.sendPush(lineUserId, [quotaMsg], accessToken);
        return;
      }

      const reservation = await this.slipVerificationService.createReservation({
        ownerId,
        subscriptionId,
        lineAccountId: accountId,
        lineUserId,
        messageId,
        amount: 1,
      });
      reservationId = reservation._id.toString();

      // Verify slip
      const result = await this.slipVerificationService.verifySlip(
        imageData,
        accountId,
        lineUserId,
        messageId,
        { ownerId, subscriptionId, reservationId },
      );

      // Phase 4: Finalize quota (commit or rollback)
      if (result.status === 'success') {
        await this.subscriptionsService.confirmReservation(subscriptionId, 1);
        await this.slipVerificationService.confirmReservation(reservationId);
      } else if (result.status === 'duplicate') {
        const refund = await this.slipVerificationService.shouldRefundDuplicate();
        if (refund) {
          await this.subscriptionsService.rollbackReservation(subscriptionId, 1);
          await this.slipVerificationService.rollbackReservation(reservationId, 'duplicate');
        } else {
          await this.subscriptionsService.confirmReservation(subscriptionId, 1);
          await this.slipVerificationService.confirmReservation(reservationId);
        }
      } else {
        await this.subscriptionsService.rollbackReservation(subscriptionId, 1);
        await this.slipVerificationService.rollbackReservation(reservationId, result.status);
      }

      // Send result message
      const responseMessage = this.slipVerificationService.formatSlipResponse(result);
      await this.lineAccountsService.sendPush(
        lineUserId,
        [responseMessage],
        accessToken,
      );

      // Increment slip count
      if (result.status === 'success') {
        await this.lineAccountsService.incrementStatistics(
          accountId,
          'totalSlipsVerified',
        );
      }
    } catch (error) {
      console.error('Slip verification error:', error);

      // Best-effort rollback if we already reserved quota
      if (subscriptionId) {
        await this.subscriptionsService.rollbackReservation(subscriptionId, 1).catch(() => undefined);
      }
      if (reservationId) {
        await this.slipVerificationService.rollbackReservation(reservationId, 'exception').catch(() => undefined);
      }

      await this.lineAccountsService.sendPush(
        lineUserId,
        [{ type: 'text', text: 'ขออภัย ไม่สามารถตรวจสอบสลิปได้ในขณะนี้' }],
        accessToken,
      );
    } finally {
      await this.redisService.del(lockKey).catch(() => undefined);
    }
  }

  private async handleAIResponse(account: any, event: any): Promise<void> {
    const { source, message } = event;
    const lineUserId = source.userId;
    const accessToken = account.accessToken;
    const accountId = account._id.toString();

    try {
      // Get AI response
      const response = await this.chatbotService.getResponse(
        message.text,
        lineUserId,
        accountId,
        account.settings?.aiSystemPrompt,
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
      console.error('AI response error:', error);
      const fallbackMessage = account.settings?.aiFallbackMessage || 'ขอบคุณสำหรับข้อความของคุณ';
      await this.lineAccountsService.sendPush(
        lineUserId,
        [{ type: 'text', text: fallbackMessage }],
        accessToken,
      );
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
