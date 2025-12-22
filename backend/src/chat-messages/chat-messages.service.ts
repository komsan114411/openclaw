import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class ChatMessagesService {
  private readonly logger = new Logger(ChatMessagesService.name);

  constructor(
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(LineAccount.name) private lineAccountModel: Model<LineAccountDocument>,
  ) {}

  /**
   * Save incoming message from LINE webhook
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
    return this.chatMessageModel.create({
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
  }

  /**
   * Save outgoing message sent to LINE user
   */
  async saveOutgoingMessage(params: {
    lineAccountId: string;
    lineUserId: string;
    messageType: MessageType;
    messageText?: string;
    content?: Record<string, any>;
    sentBy?: string;
  }): Promise<ChatMessageDocument> {
    return this.chatMessageModel.create({
      lineAccountId: new Types.ObjectId(params.lineAccountId),
      lineUserId: params.lineUserId,
      direction: MessageDirection.OUT,
      messageType: params.messageType,
      messageText: params.messageText,
      content: params.content,
      sentBy: params.sentBy,
      isRead: true,
    });
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
          lineUserName: { $first: '$lineUserName' },
          lineUserPicture: { $first: '$lineUserPicture' },
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
   * Send message to LINE user via Push API
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

    try {
      const response = await axios.post(
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
}
