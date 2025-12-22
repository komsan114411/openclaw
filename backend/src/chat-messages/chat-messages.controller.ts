import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ChatMessagesService } from './chat-messages.service';

@Controller('api/chat-messages')
@UseGuards(SessionAuthGuard)
export class ChatMessagesController {
  constructor(private readonly chatMessagesService: ChatMessagesService) {}

  /**
   * Get list of users who have chatted with a LINE account
   */
  @Get(':accountId/users')
  async getChatUsers(@Param('accountId') accountId: string) {
    const users = await this.chatMessagesService.getChatUsers(accountId);
    return { success: true, users };
  }

  /**
   * Get chat history with a specific user
   */
  @Get(':accountId/:userId')
  async getChatHistory(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const messages = await this.chatMessagesService.getChatHistory(
      accountId,
      userId,
      limit ? parseInt(limit, 10) : 50,
      before ? new Date(before) : undefined,
    );

    // Mark messages as read
    await this.chatMessagesService.markAsRead(accountId, userId);

    return { success: true, messages: messages.reverse() };
  }

  /**
   * Send message to a specific user
   */
  @Post(':accountId/:userId/send')
  async sendMessage(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
    @Body() body: { message: string },
    @Request() req: any,
  ) {
    const result = await this.chatMessagesService.sendMessageToUser(
      accountId,
      userId,
      body.message,
      req.user?.username,
    );

    if (result.success) {
      return { success: true, message: 'Message sent successfully' };
    } else {
      return { success: false, error: result.error };
    }
  }

  /**
   * Send broadcast message to multiple users (future feature)
   */
  @Post(':accountId/send')
  async sendBroadcast(
    @Param('accountId') accountId: string,
    @Body() body: { userIds: string[]; message: string },
    @Request() req: any,
  ) {
    const results = await Promise.all(
      body.userIds.map((userId) =>
        this.chatMessagesService.sendMessageToUser(
          accountId,
          userId,
          body.message,
          req.user?.username,
        ),
      ),
    );

    const successCount = results.filter((r) => r.success).length;
    return {
      success: true,
      message: `Sent to ${successCount}/${body.userIds.length} users`,
      results,
    };
  }

  /**
   * Mark messages as read
   */
  @Post(':accountId/:userId/read')
  async markAsRead(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
  ) {
    await this.chatMessagesService.markAsRead(accountId, userId);
    return { success: true };
  }

  /**
   * Get unread message count
   */
  @Get(':accountId/unread-count')
  async getUnreadCount(@Param('accountId') accountId: string) {
    const count = await this.chatMessagesService.getUnreadCount(accountId);
    return { success: true, count };
  }

  /**
   * Delete chat history with a user
   */
  @Delete(':accountId/:userId')
  async deleteChatHistory(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
  ) {
    await this.chatMessagesService.deleteChatHistory(accountId, userId);
    return { success: true, message: 'Chat history deleted' };
  }

  /**
   * Get LINE image content
   */
  @Get(':accountId/image/:messageId')
  async getLineImage(
    @Param('accountId') accountId: string,
    @Param('messageId') messageId: string,
    @Res() res: Response,
  ) {
    const imageBuffer = await this.chatMessagesService.getLineImage(accountId, messageId);

    if (!imageBuffer) {
      res.status(404).json({ success: false, error: 'Image not found' });
      return;
    }

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(imageBuffer);
  }

  /**
   * Get LINE user profile
   */
  @Get(':accountId/profile/:userId')
  async getLineUserProfile(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
  ) {
    const profile = await this.chatMessagesService.getLineUserProfile(accountId, userId);

    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    return { success: true, profile };
  }
}
