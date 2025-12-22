import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios, { AxiosError } from 'axios';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';
import { ChatMessage, ChatMessageDocument, MessageDirection, MessageType } from '../database/schemas/chat-message.schema';
import { CreateLineAccountDto } from './dto/create-line-account.dto';
import { UpdateLineAccountDto } from './dto/update-line-account.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LineAccountsService {
  private readonly logger = new Logger(LineAccountsService.name);

  constructor(
    @InjectModel(LineAccount.name) private lineAccountModel: Model<LineAccountDocument>,
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    private redisService: RedisService,
  ) {}

  /**
   * Validate ObjectId format
   */
  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  async create(ownerId: string, dto: CreateLineAccountDto): Promise<LineAccountDocument> {
    // Check if channel ID already exists
    const existing = await this.lineAccountModel.findOne({ channelId: dto.channelId });
    if (existing) {
      throw new BadRequestException('Channel ID already exists');
    }

    const account = new this.lineAccountModel({
      ...dto,
      ownerId,
      isActive: true,
    });

    return account.save();
  }

  async findAll(includeInactive = false): Promise<LineAccountDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.lineAccountModel.find(query).exec();
  }

  async findByOwner(ownerId: string): Promise<LineAccountDocument[]> {
    return this.lineAccountModel.find({ ownerId, isActive: true }).exec();
  }

  async findById(id: string): Promise<LineAccountDocument | null> {
    return this.lineAccountModel.findById(id).exec();
  }

  async findByChannelId(channelId: string): Promise<LineAccountDocument | null> {
    return this.lineAccountModel.findOne({ channelId }).exec();
  }

  async update(id: string, dto: UpdateLineAccountDto): Promise<LineAccountDocument> {
    const account = await this.lineAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('LINE account not found');
    }

    Object.assign(account, dto);
    await account.save();
    
    // Invalidate cache
    await this.redisService.invalidateCache(`line-account:${id}`);
    
    return account;
  }

  async updateSettings(id: string, settings: Partial<LineAccountDocument['settings']>): Promise<void> {
    const account = await this.lineAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('LINE account not found');
    }

    account.settings = { ...account.settings, ...settings };
    await account.save();
    
    await this.redisService.invalidateCache(`line-account:${id}`);
  }

  async delete(id: string): Promise<void> {
    const account = await this.lineAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('LINE account not found');
    }

    account.isActive = false;
    await account.save();
    
    await this.redisService.invalidateCache(`line-account:${id}`);
  }

  async incrementStatistics(id: string, field: string, increment = 1): Promise<void> {
    await this.lineAccountModel.updateOne(
      { _id: id },
      { $inc: { [`statistics.${field}`]: increment } },
    );
  }

  async updateWebhookTimestamp(id: string): Promise<void> {
    await this.lineAccountModel.updateOne(
      { _id: id },
      { lastWebhookReceived: new Date() },
    );
  }

  // LINE API Methods
  async sendReply(replyToken: string, messages: any[], accessToken: string): Promise<void> {
    if (!replyToken || !messages || messages.length === 0) {
      this.logger.warn('Invalid sendReply parameters');
      return;
    }

    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        { replyToken, messages },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 10000,
        },
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 400) {
        // Reply token expired or invalid - this is normal for delayed responses
        this.logger.debug('Reply token expired, message not sent');
        return;
      }
      this.logger.error('Error sending LINE reply:', axiosError.message);
      throw error;
    }
  }

  async sendPush(userId: string, messages: any[], accessToken: string): Promise<void> {
    if (!userId || !messages || messages.length === 0) {
      this.logger.warn('Invalid sendPush parameters');
      return;
    }

    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        { to: userId, messages },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 10000,
        },
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(`Error sending LINE push message: ${axiosError.message}`);
      throw error;
    }
  }

  async getMessageContent(messageId: string, accessToken: string): Promise<Buffer> {
    if (!messageId || !accessToken) {
      throw new BadRequestException('Invalid messageId or accessToken');
    }

    try {
      const response = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          responseType: 'arraybuffer',
          timeout: 30000,
        },
      );
      return Buffer.from(response.data);
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(`Error getting message content: ${axiosError.message}`);
      throw error;
    }
  }

  /**
   * Test LINE channel connection
   */
  async testConnection(accessToken: string): Promise<{ success: boolean; message: string; botInfo?: any }> {
    try {
      const response = await axios.get('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });

      return {
        success: true,
        message: 'เชื่อมต่อ LINE API สำเร็จ',
        botInfo: response.data,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;

      if (status === 401 || status === 403) {
        return {
          success: false,
          message: 'Access Token ไม่ถูกต้องหรือหมดอายุ',
        };
      }

      return {
        success: false,
        message: `ไม่สามารถเชื่อมต่อ LINE API: ${axiosError.message}`,
      };
    }
  }

  // Chat history
  async saveChatMessage(
    lineAccountId: string,
    lineUserId: string,
    direction: MessageDirection,
    messageType: MessageType,
    messageText: string,
    messageId?: string,
    replyToken?: string,
    rawMessage?: any,
  ): Promise<void> {
    await this.chatMessageModel.create({
      lineAccountId,
      lineUserId,
      direction,
      messageType,
      messageText,
      messageId,
      replyToken,
      rawMessage,
    });
  }

  async getChatHistory(
    lineAccountId: string,
    lineUserId?: string,
    limit = 50,
  ): Promise<ChatMessageDocument[]> {
    const query: any = { lineAccountId };
    if (lineUserId) {
      query.lineUserId = lineUserId;
    }
    
    return this.chatMessageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async getStatistics(): Promise<{
    totalAccounts: number;
    activeAccounts: number;
    totalMessages: number;
    totalSlipsVerified: number;
  }> {
    const accounts = await this.lineAccountModel.find({ isActive: true }).exec();
    
    const totalMessages = accounts.reduce(
      (sum, acc) => sum + (acc.statistics?.totalMessages || 0),
      0,
    );
    
    const totalSlipsVerified = accounts.reduce(
      (sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0),
      0,
    );

    return {
      totalAccounts: await this.lineAccountModel.countDocuments(),
      activeAccounts: accounts.length,
      totalMessages,
      totalSlipsVerified,
    };
  }
}
