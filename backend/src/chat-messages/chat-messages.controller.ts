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
} from '@nestjs/common';
import { Response } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ChatMessagesService } from './chat-messages.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@Controller('chat-messages')
@UseGuards(SessionAuthGuard)
export class ChatMessagesController {
  constructor(private readonly chatMessagesService: ChatMessagesService) {}

  /**
   * Get list of users who have chatted with a LINE account
   */
  @Get(':accountId/users')
  async getChatUsers(@Param('accountId') accountId: string, @CurrentUser() user: AuthUser) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
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
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
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
    @CurrentUser() user: AuthUser,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
    const result = await this.chatMessagesService.sendMessageToUser(
      accountId,
      userId,
      body.message,
      user?.username,
    );

    if (result.success) {
      return { success: true, message: 'Message sent successfully' };
    } else {
      return { success: false, message: result.error };
    }
  }

  /**
   * Send broadcast message to multiple users with batching and rate limiting.
   * Efficiently handles large user lists without timing out.
   */
  @Post(':accountId/broadcast')
  async sendBroadcast(
    @Param('accountId') accountId: string,
    @Body() body: { userIds?: string[]; message: string; sendToAll?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);

    // Get user IDs - either from request or all users who have chatted
    let userIds = body.userIds || [];
    if (body.sendToAll) {
      userIds = await this.chatMessagesService.getAllChatUserIds(accountId);
    }

    if (userIds.length === 0) {
      return {
        success: false,
        message: 'No users to send to',
        totalUsers: 0,
      };
    }

    const result = await this.chatMessagesService.sendBroadcastMessage(
      accountId,
      userIds,
      body.message,
      user?.username,
    );

    return {
      success: result.success,
      message: `Broadcast sent to ${result.successCount}/${result.totalUsers} users`,
      totalUsers: result.totalUsers,
      successCount: result.successCount,
      failedCount: result.failedCount,
      failedUsers: result.failedUsers.length > 0 ? result.failedUsers.slice(0, 10) : [], // Limit failed users in response
    };
  }

  /**
   * Legacy endpoint - sends to specific users (kept for backward compatibility)
   */
  @Post(':accountId/send')
  async sendToMultiple(
    @Param('accountId') accountId: string,
    @Body() body: { userIds: string[]; message: string },
    @CurrentUser() user: AuthUser,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);

    // For small lists, use the optimized broadcast
    const result = await this.chatMessagesService.sendBroadcastMessage(
      accountId,
      body.userIds,
      body.message,
      user?.username,
    );

    return {
      success: result.success,
      message: `Sent to ${result.successCount}/${result.totalUsers} users`,
      successCount: result.successCount,
      failedCount: result.failedCount,
    };
  }

  /**
   * Mark messages as read
   */
  @Post(':accountId/:userId/read')
  async markAsRead(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
    await this.chatMessagesService.markAsRead(accountId, userId);
    return { success: true };
  }

  /**
   * Get unread message count
   */
  @Get(':accountId/unread-count')
  async getUnreadCount(@Param('accountId') accountId: string, @CurrentUser() user: AuthUser) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
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
    @CurrentUser() user: AuthUser,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
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
    @CurrentUser() user: AuthUser,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
    const imageBuffer = await this.chatMessagesService.getLineImage(accountId, messageId);

    if (!imageBuffer) {
      res.status(404).json({ success: false, message: 'Image not found' });
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
    @CurrentUser() user: AuthUser,
  ) {
    await this.chatMessagesService.ensureAccountAccess(accountId, user);
    const profile = await this.chatMessagesService.getLineUserProfile(accountId, userId);

    if (!profile) {
      return { success: false, message: 'Profile not found' };
    }

    return { success: true, profile };
  }
}
