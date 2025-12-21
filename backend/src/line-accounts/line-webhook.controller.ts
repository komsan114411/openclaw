import {
  Controller,
  Post,
  Body,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { LineAccountsService } from './line-accounts.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { MessageDirection, MessageType } from '../database/schemas/chat-message.schema';

@ApiTags('LINE Webhook')
@Controller('webhook/line')
export class LineWebhookController {
  constructor(
    private lineAccountsService: LineAccountsService,
    private slipVerificationService: SlipVerificationService,
    private chatbotService: ChatbotService,
  ) {}

  @Post(':channelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LINE Webhook endpoint' })
  async handleWebhook(
    @Param('channelId') channelId: string,
    @Headers('x-line-signature') signature: string,
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
      const expectedSignature = crypto
        .createHmac('sha256', account.channelSecret)
        .update(JSON.stringify(body))
        .digest('base64');

      if (signature !== expectedSignature) {
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
    if (!account.settings?.botEnabled) return;

    // Handle different message types
    if (message.type === 'image') {
      // Handle image - slip verification
      if (account.settings?.slipVerificationEnabled) {
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
      if (account.settings?.aiEnabled) {
        await this.handleAIResponse(account, event);
      }
    }
  }

  private async handleSlipVerification(account: any, event: any): Promise<void> {
    const { source, replyToken, message } = event;
    const lineUserId = source.userId;
    const accessToken = account.channelAccessToken;

    try {
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
        message.id,
        accessToken,
      );

      // Verify slip
      const result = await this.slipVerificationService.verifySlip(
        imageData,
        account._id.toString(),
        lineUserId,
        message.id,
      );

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
          account._id.toString(),
          'totalSlipsVerified',
        );
      }
    } catch (error) {
      console.error('Slip verification error:', error);
      await this.lineAccountsService.sendPush(
        lineUserId,
        [{ type: 'text', text: 'ขออภัย ไม่สามารถตรวจสอบสลิปได้ในขณะนี้' }],
        accessToken,
      );
    }
  }

  private async handleAIResponse(account: any, event: any): Promise<void> {
    const { source, message } = event;
    const lineUserId = source.userId;
    const accessToken = account.channelAccessToken;
    const accountId = account._id.toString();

    try {
      // Get AI response
      const response = await this.chatbotService.getResponse(
        message.text,
        lineUserId,
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
}
