import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage } from 'mongoose';
import axios from 'axios';
import {
  ChatMessage,
  ChatMessageDocument,
  MessageDirection,
  MessageType,
} from '../database/schemas/chat-message.schema';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';
import { UserRole } from '../database/schemas/user.schema';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { SystemSettingsService } from '../system-settings/system-settings.service';

export interface ChatUser {
  lineUserId: string;
  lineUserName: string;
  lineUserPicture?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BroadcastResult {
  success: boolean;
  totalUsers: number;
  successCount: number;
  failedCount: number;
  failedUsers: { userId: string; error: string }[];
}

@Injectable()
export class ChatMessagesService {
  private readonly logger = new Logger(ChatMessagesService.name);

  constructor(
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(LineAccount.name) private lineAccountModel: Model<LineAccountDocument>,
    private websocketGateway: WebsocketGateway,
    private systemSettingsService: SystemSettingsService,
  ) { }

  /**
   * Ensure the current user can access a LINE account (admin or owner).
   * Chat endpoints are sensitive and must not allow cross-account access.
   */
  async ensureAccountAccess(
    lineAccountId: string,
    user: { userId: string; role: UserRole },
  ): Promise<void> {
    if (!Types.ObjectId.isValid(lineAccountId)) {
      throw new BadRequestException('Invalid LINE account id');
    }

    const account = await this.lineAccountModel
      .findById(lineAccountId)
      .select({ ownerId: 1 })
      .lean()
      .exec();

    if (!account) {
      throw new NotFoundException('LINE Account not found');
    }

    if (user.role !== UserRole.ADMIN) {
      // Check if user chat is enabled globally
      const settings = await this.systemSettingsService.getSettings();
      if (settings?.userChatEnabled === false) {
        throw new ForbiddenException('ระบบแชทถูกปิดใช้งานชั่วคราว');
      }

      if (account.ownerId !== user.userId) {
        throw new ForbiddenException('Access denied');
      }
    }
  }

  /**
   * Save incoming message from LINE webhook and emit real-time event
   */
  async saveIncomingMessage(params: {
    lineAccountId: string;
    lineUserId: string;
    lineUserName?: string;
    lineUserPicture?: string;
    messageType: MessageType;
    messageText?: string;
    messageId?: string;
    replyToken?: string;
    rawMessage?: Record<string, any>;
    content?: Record<string, any>;
  }): Promise<ChatMessageDocument> {
    const message = await this.chatMessageModel.create({
      lineAccountId: new Types.ObjectId(params.lineAccountId),
      lineUserId: params.lineUserId,
      lineUserName: params.lineUserName,
      lineUserPicture: params.lineUserPicture,
      direction: MessageDirection.IN,
      messageType: params.messageType,
      messageText: params.messageText,
      messageId: params.messageId,
      replyToken: params.replyToken,
      rawMessage: params.rawMessage,
      content: params.content,
      isRead: false,
    });

    // Emit real-time event to all admins watching this account
    try {
      this.websocketGateway.broadcastToRoom(`chat:${params.lineAccountId}`, 'message_received', {
        _id: message._id.toString(),
        lineAccountId: params.lineAccountId,
        lineUserId: params.lineUserId,
        lineUserName: params.lineUserName,
        lineUserPicture: params.lineUserPicture,
        direction: 'in',
        messageType: params.messageType,
        messageText: params.messageText,
        messageId: params.messageId,
        createdAt: message.createdAt,
      });

      // Also notify all admins of new unread message
      this.websocketGateway.broadcastToAdmins('unread_message', {
        lineAccountId: params.lineAccountId,
        lineUserId: params.lineUserId,
        lineUserName: params.lineUserName,
      });
    } catch (error) {
      this.logger.warn('Failed to emit WebSocket event:', error);
    }

    return message;
  }

  /**
   * Save outgoing message sent to LINE user and emit real-time event
   */
  async saveOutgoingMessage(params: {
    lineAccountId: string;
    lineUserId: string;
    messageType: MessageType;
    messageText?: string;
    content?: Record<string, any>;
    sentBy?: string;
  }): Promise<ChatMessageDocument> {
    const message = await this.chatMessageModel.create({
      lineAccountId: new Types.ObjectId(params.lineAccountId),
      lineUserId: params.lineUserId,
      direction: MessageDirection.OUT,
      messageType: params.messageType,
      messageText: params.messageText,
      content: params.content,
      sentBy: params.sentBy,
      isRead: true,
    });

    // Emit real-time event to all admins watching this chat
    try {
      this.websocketGateway.broadcastToRoom(`chat:${params.lineAccountId}`, 'message_received', {
        _id: message._id.toString(),
        lineAccountId: params.lineAccountId,
        lineUserId: params.lineUserId,
        direction: 'out',
        messageType: params.messageType,
        messageText: params.messageText,
        sentBy: params.sentBy,
        createdAt: message.createdAt,
      });
    } catch (error) {
      this.logger.warn('Failed to emit WebSocket event:', error);
    }

    return message;
  }

  /**
   * Get list of users who have chatted with a LINE account
   */
  async getChatUsers(lineAccountId: string): Promise<ChatUser[]> {
    const pipeline: PipelineStage[] = [
      { $match: { lineAccountId: new Types.ObjectId(lineAccountId) } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$lineUserId',
          // Collect all names and pictures to find the latest non-null one
          names: { $push: '$lineUserName' },
          pictures: { $push: '$lineUserPicture' },

          lastMessage: { $first: '$messageText' },
          lastMessageTime: { $first: '$createdAt' },
          lastDirection: { $first: '$direction' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$direction', MessageDirection.IN] }, { $eq: ['$isRead', false] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          lineUserName: {
            $reduce: {
              input: '$names',
              initialValue: null,
              in: { $ifNull: ['$$value', '$$this'] },
            },
          },
          lineUserPicture: {
            $reduce: {
              input: '$pictures',
              initialValue: null,
              in: { $ifNull: ['$$value', '$$this'] },
            },
          },
        },
      },
      { $sort: { lastMessageTime: -1 } },
    ];

    const results = await this.chatMessageModel.aggregate(pipeline);

    return results.map((r) => ({
      lineUserId: r._id,
      lineUserName: r.lineUserName || 'Unknown User',
      lineUserPicture: r.lineUserPicture,
      lastMessage: r.lastMessage,
      lastMessageTime: r.lastMessageTime,
      unreadCount: r.unreadCount,
    }));
  }

  /**
   * Get chat history with a specific user
   */
  async getChatHistory(
    lineAccountId: string,
    lineUserId: string,
    limit = 50,
    before?: Date,
  ): Promise<ChatMessageDocument[]> {
    const query: any = {
      lineAccountId: new Types.ObjectId(lineAccountId),
      lineUserId,
    };

    if (before) {
      query.createdAt = { $lt: before };
    }

    return this.chatMessageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Mark messages as read
   */
  async markAsRead(lineAccountId: string, lineUserId: string): Promise<void> {
    await this.chatMessageModel.updateMany(
      {
        lineAccountId: new Types.ObjectId(lineAccountId),
        lineUserId,
        direction: MessageDirection.IN,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
  }

  /**
   * Send message to LINE user
   * Strategy: Try Reply API first (FREE, unlimited) if we have a recent replyToken,
   * then fall back to Push API if needed (has monthly limits)
   */
  async sendMessageToUser(
    lineAccountId: string,
    lineUserId: string,
    message: string,
    sentBy?: string,
  ): Promise<SendMessageResult> {
    const lineAccount = await this.lineAccountModel.findById(lineAccountId);
    if (!lineAccount) {
      throw new NotFoundException('LINE Account not found');
    }

    if (!lineAccount.accessToken) {
      throw new BadRequestException('LINE Channel Access Token not configured');
    }

    // Strategy 1: Try Reply API first (FREE, unlimited)
    // Reply tokens are valid for about 1 minute after message received
    const REPLY_TOKEN_VALIDITY_MS = 55 * 1000; // 55 seconds to be safe
    const recentMessage = await this.chatMessageModel.findOne({
      lineAccountId: new Types.ObjectId(lineAccountId),
      lineUserId,
      direction: MessageDirection.IN,
      replyToken: { $exists: true, $ne: null },
      createdAt: { $gte: new Date(Date.now() - REPLY_TOKEN_VALIDITY_MS) },
    }).sort({ createdAt: -1 });

    if (recentMessage?.replyToken) {
      try {
        this.logger.log(`Trying Reply API for user ${lineUserId} (FREE method)`);
        await axios.post(
          'https://api.line.me/v2/bot/message/reply',
          {
            replyToken: recentMessage.replyToken,
            messages: [{ type: 'text', text: message }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${lineAccount.accessToken}`,
            },
          },
        );

        // Clear used replyToken to prevent reuse
        await this.chatMessageModel.updateOne(
          { _id: recentMessage._id },
          { $unset: { replyToken: 1 } },
        );

        // Save outgoing message
        await this.saveOutgoingMessage({
          lineAccountId,
          lineUserId,
          messageType: MessageType.TEXT,
          messageText: message,
          sentBy,
        });

        this.logger.log(`Reply API success for user ${lineUserId} (FREE)`);
        return { success: true };
      } catch (replyError: any) {
        this.logger.warn(`Reply API failed, falling back to Push API:`, replyError.response?.data?.message || replyError.message);
        // Clear invalid replyToken
        await this.chatMessageModel.updateOne(
          { _id: recentMessage._id },
          { $unset: { replyToken: 1 } },
        );
        // Continue to Push API fallback
      }
    }

    // Strategy 2: Fall back to Push API (has monthly limits)
    try {
      this.logger.log(`Using Push API for user ${lineUserId} (may use monthly quota)`);
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: lineUserId,
          messages: [{ type: 'text', text: message }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${lineAccount.accessToken}`,
          },
        },
      );

      // Save outgoing message
      await this.saveOutgoingMessage({
        lineAccountId,
        lineUserId,
        messageType: MessageType.TEXT,
        messageText: message,
        sentBy,
      });

      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to send LINE message:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Send Flex message to LINE user
   */
  async sendFlexMessage(
    lineAccountId: string,
    lineUserId: string,
    altText: string,
    contents: any,
    sentBy?: string,
  ): Promise<SendMessageResult> {
    const lineAccount = await this.lineAccountModel.findById(lineAccountId);
    if (!lineAccount) {
      throw new NotFoundException('LINE Account not found');
    }

    if (!lineAccount.accessToken) {
      throw new BadRequestException('LINE Channel Access Token not configured');
    }

    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: lineUserId,
          messages: [{ type: 'flex', altText, contents }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${lineAccount.accessToken}`,
          },
        },
      );

      // Save outgoing message
      await this.saveOutgoingMessage({
        lineAccountId,
        lineUserId,
        messageType: MessageType.FLEX,
        messageText: altText,
        content: contents,
        sentBy,
      });

      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to send LINE flex message:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get image content from LINE
   */
  async getLineImage(lineAccountId: string, messageId: string): Promise<Buffer | null> {
    const lineAccount = await this.lineAccountModel.findById(lineAccountId);
    if (!lineAccount || !lineAccount.accessToken) {
      return null;
    }

    try {
      const response = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        {
          headers: {
            Authorization: `Bearer ${lineAccount.accessToken}`,
          },
          responseType: 'arraybuffer',
        },
      );

      return Buffer.from(response.data);
    } catch (error: any) {
      this.logger.error('Failed to get LINE image:', error.message);
      return null;
    }
  }

  /**
   * Get user profile from LINE
   */
  async getLineUserProfile(
    lineAccountId: string,
    lineUserId: string,
  ): Promise<{ displayName: string; pictureUrl?: string } | null> {
    const lineAccount = await this.lineAccountModel.findById(lineAccountId);
    if (!lineAccount || !lineAccount.accessToken) {
      return null;
    }

    try {
      const response = await axios.get(
        `https://api.line.me/v2/bot/profile/${lineUserId}`,
        {
          headers: {
            Authorization: `Bearer ${lineAccount.accessToken}`,
          },
        },
      );

      return {
        displayName: response.data.displayName,
        pictureUrl: response.data.pictureUrl,
      };
    } catch (error: any) {
      this.logger.error('Failed to get LINE user profile:', error.message);
      return null;
    }
  }

  /**
   * Get unread message count for a LINE account
   */
  async getUnreadCount(lineAccountId: string): Promise<number> {
    return this.chatMessageModel.countDocuments({
      lineAccountId: new Types.ObjectId(lineAccountId),
      direction: MessageDirection.IN,
      isRead: false,
    });
  }

  /**
   * Delete chat history for a user
   */
  async deleteChatHistory(lineAccountId: string, lineUserId: string): Promise<void> {
    await this.chatMessageModel.deleteMany({
      lineAccountId: new Types.ObjectId(lineAccountId),
      lineUserId,
    });
  }

  /**
   * Get recent messages for all LINE accounts (for admin dashboard)
   */
  async getRecentMessages(limit = 20): Promise<ChatMessageDocument[]> {
    return this.chatMessageModel
      .find({ direction: MessageDirection.IN })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('lineAccountId', 'accountName channelId')
      .exec();
  }

  /**
   * Send broadcast message to multiple users with batching and rate limiting.
   * LINE API supports multicast for up to 500 users per request.
   * Implements proper rate limiting to avoid API throttling.
   *
   * @param lineAccountId - The LINE account to send from
   * @param userIds - Array of LINE user IDs to send to
   * @param message - The message text to send
   * @param sentBy - Who sent the message (for audit)
   * @param onProgress - Optional callback for progress updates
   */
  async sendBroadcastMessage(
    lineAccountId: string,
    userIds: string[],
    message: string,
    sentBy?: string,
    onProgress?: (progress: { sent: number; total: number; failed: number }) => void,
  ): Promise<BroadcastResult> {
    const lineAccount = await this.lineAccountModel.findById(lineAccountId);
    if (!lineAccount) {
      throw new NotFoundException('LINE Account not found');
    }

    if (!lineAccount.accessToken) {
      throw new BadRequestException('LINE Channel Access Token not configured');
    }

    const BATCH_SIZE = 500; // LINE multicast limit
    const DELAY_BETWEEN_BATCHES_MS = 100; // Rate limiting delay
    const failedUsers: { userId: string; error: string }[] = [];
    let successCount = 0;

    // Split users into batches of 500
    const batches: string[][] = [];
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      batches.push(userIds.slice(i, i + BATCH_SIZE));
    }

    this.logger.log(`Broadcasting to ${userIds.length} users in ${batches.length} batches`);

    // Process batches with rate limiting
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      try {
        // Use LINE multicast API for efficiency
        await axios.post(
          'https://api.line.me/v2/bot/message/multicast',
          {
            to: batch,
            messages: [{ type: 'text', text: message }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${lineAccount.accessToken}`,
            },
          },
        );

        successCount += batch.length;
        this.logger.log(`Batch ${batchIndex + 1}/${batches.length} sent successfully (${batch.length} users)`);
      } catch (error: any) {
        // If multicast fails, fall back to individual push for this batch
        this.logger.warn(`Multicast failed for batch ${batchIndex + 1}, falling back to individual sends:`, error.message);

        for (const userId of batch) {
          try {
            await axios.post(
              'https://api.line.me/v2/bot/message/push',
              {
                to: userId,
                messages: [{ type: 'text', text: message }],
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${lineAccount.accessToken}`,
                },
              },
            );
            successCount++;
          } catch (pushError: any) {
            failedUsers.push({
              userId,
              error: pushError.response?.data?.message || pushError.message,
            });
          }

          // Small delay between individual sends to avoid rate limiting
          await this.delay(10);
        }
      }

      // Emit progress update via WebSocket
      if (onProgress) {
        onProgress({
          sent: successCount,
          total: userIds.length,
          failed: failedUsers.length,
        });
      }

      try {
        this.websocketGateway.broadcastToAdmins('broadcast_progress', {
          lineAccountId,
          sent: successCount,
          total: userIds.length,
          failed: failedUsers.length,
          batchNumber: batchIndex + 1,
          totalBatches: batches.length,
        });
      } catch (wsError) {
        // Ignore WebSocket errors
      }

      // Delay between batches to respect rate limits
      if (batchIndex < batches.length - 1) {
        await this.delay(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    // Save a single outgoing message record for the broadcast
    await this.chatMessageModel.create({
      lineAccountId: new Types.ObjectId(lineAccountId),
      lineUserId: 'broadcast',
      direction: MessageDirection.OUT,
      messageType: MessageType.TEXT,
      messageText: message,
      sentBy,
      isRead: true,
      metadata: {
        isBroadcast: true,
        totalRecipients: userIds.length,
        successCount,
        failedCount: failedUsers.length,
      },
    });

    // Emit completion event
    try {
      this.websocketGateway.broadcastToAdmins('broadcast_complete', {
        lineAccountId,
        totalUsers: userIds.length,
        successCount,
        failedCount: failedUsers.length,
      });
    } catch (wsError) {
      // Ignore WebSocket errors
    }

    this.logger.log(
      `Broadcast complete: ${successCount}/${userIds.length} successful, ${failedUsers.length} failed`,
    );

    return {
      success: failedUsers.length < userIds.length,
      totalUsers: userIds.length,
      successCount,
      failedCount: failedUsers.length,
      failedUsers,
    };
  }

  /**
   * Get all users for a LINE account (for broadcast targeting)
   */
  async getAllChatUserIds(lineAccountId: string): Promise<string[]> {
    const users = await this.chatMessageModel.distinct('lineUserId', {
      lineAccountId: new Types.ObjectId(lineAccountId),
    });
    return users;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
