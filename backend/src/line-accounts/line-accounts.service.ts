import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';
import { ChatMessage, ChatMessageDocument, MessageDirection, MessageType } from '../database/schemas/chat-message.schema';
import { SlipTemplate, SlipTemplateDocument } from '../database/schemas/slip-template.schema';
import { CreateLineAccountDto } from './dto/create-line-account.dto';
import { UpdateLineAccountDto } from './dto/update-line-account.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LineAccountsService {
  private readonly logger = new Logger(LineAccountsService.name);

  constructor(
    @InjectModel(LineAccount.name) private lineAccountModel: Model<LineAccountDocument>,
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(SlipTemplate.name) private slipTemplateModel: Model<SlipTemplateDocument>,
    private redisService: RedisService,
  ) { }

  /**
   * Validate ObjectId format
   */
  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  /**
   * Generate unique webhook slug
   */
  private generateWebhookSlug(): string {
    // สร้าง slug สั้นๆ 12 ตัวอักษร จาก UUID
    return randomUUID().replace(/-/g, '').substring(0, 12);
  }

  /**
   * Validate that a template belongs to the user (security check)
   * Returns true if template belongs to user or is a global template
   */
  async validateTemplateOwnership(templateId: string, userId: string): Promise<boolean> {
    if (!templateId || !this.isValidObjectId(templateId)) {
      return false;
    }

    const template = await this.slipTemplateModel.findById(templateId).select({ ownerId: 1, isGlobal: 1 }).lean().exec();
    if (!template) {
      return false;
    }

    // Allow global templates to be used by anyone
    if (template.isGlobal) {
      return true;
    }

    // Check if template belongs to user
    return template.ownerId?.toString() === userId;
  }

  /**
   * Get all templates owned by a user (across all LINE accounts)
   */
  async getTemplatesByOwner(ownerId: string): Promise<SlipTemplateDocument[]> {
    return this.slipTemplateModel.find({
      $or: [
        { ownerId: new Types.ObjectId(ownerId), isActive: true },
        { isGlobal: true, isActive: true },
      ],
    }).sort({ isGlobal: 1, type: 1, name: 1 }).exec();
  }

  async create(ownerId: string, dto: CreateLineAccountDto): Promise<LineAccountDocument> {
    // Check if channel ID already exists
    const existing = await this.lineAccountModel.findOne({ channelId: dto.channelId });
    if (existing) {
      throw new BadRequestException('Channel ID นี้มีอยู่ในระบบแล้ว');
    }

    // Validate template ownership if provided
    if (dto.slipTemplateId) {
      const isValid = await this.validateTemplateOwnership(dto.slipTemplateId, ownerId);
      if (!isValid) {
        throw new ForbiddenException('เทมเพลตนี้ไม่ใช่ของคุณหรือไม่มีอยู่ในระบบ');
      }
    }

    // Generate unique webhook slug
    let webhookSlug = this.generateWebhookSlug();

    // ตรวจสอบว่า slug ซ้ำหรือไม่ (แม้จะหายากมาก)
    let attempts = 0;
    while (await this.lineAccountModel.findOne({ webhookSlug })) {
      webhookSlug = this.generateWebhookSlug();
      attempts++;
      if (attempts > 5) {
        throw new BadRequestException('ไม่สามารถสร้าง Webhook URL ได้ กรุณาลองใหม่');
      }
    }

    // Extract slipTemplateId from dto and put it in settings
    const { slipTemplateId, ...restDto } = dto;

    const account = new this.lineAccountModel({
      ...restDto,
      ownerId,
      webhookSlug,
      isActive: true,
      settings: slipTemplateId ? { slipTemplateId } : {},
    });

    return account.save();
  }

  async findAll(includeInactive = false): Promise<any[]> {
    const query = includeInactive ? {} : { isActive: true };

    return this.lineAccountModel.aggregate([
      { $match: query },
      {
        $addFields: {
          ownerIdObj: { $toObjectId: '$ownerId' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerIdObj',
          foreignField: '_id',
          as: 'owner'
        }
      },
      {
        $unwind: {
          path: '$owner',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          ownerIdObj: 0,
          'owner.password': 0,
          'owner.role': 0,
          'owner.sessions': 0
        }
      }
    ]).exec();
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

  /**
   * Find LINE account by webhook slug (for webhook handler)
   */
  async findByWebhookSlug(webhookSlug: string): Promise<LineAccountDocument | null> {
    return this.lineAccountModel.findOne({ webhookSlug }).exec();
  }

  /**
   * Regenerate webhook slug for an account
   */
  async regenerateWebhookSlug(id: string): Promise<string> {
    const account = await this.lineAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('LINE account not found');
    }

    let webhookSlug = this.generateWebhookSlug();
    let attempts = 0;
    while (await this.lineAccountModel.findOne({ webhookSlug })) {
      webhookSlug = this.generateWebhookSlug();
      attempts++;
      if (attempts > 5) {
        throw new BadRequestException('ไม่สามารถสร้าง Webhook URL ใหม่ได้');
      }
    }

    account.webhookSlug = webhookSlug;
    await account.save();
    await this.redisService.invalidateCache(`line-account:${id}`);

    return webhookSlug;
  }

  /**
   * Ensure all accounts have webhook slug (migration)
   */
  async ensureWebhookSlugs(): Promise<number> {
    const accounts = await this.lineAccountModel.find({ webhookSlug: { $exists: false } }).exec();
    let updated = 0;

    for (const account of accounts) {
      let webhookSlug = this.generateWebhookSlug();
      while (await this.lineAccountModel.findOne({ webhookSlug })) {
        webhookSlug = this.generateWebhookSlug();
      }
      account.webhookSlug = webhookSlug;
      await account.save();
      updated++;
    }

    return updated;
  }

  async update(id: string, dto: UpdateLineAccountDto, ownerId?: string): Promise<LineAccountDocument> {
    const account = await this.lineAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('LINE account not found');
    }

    // Validate template ownership if slipTemplateId is provided
    if (dto.slipTemplateId !== undefined) {
      const userIdToCheck = ownerId || account.ownerId;
      if (dto.slipTemplateId) {
        const isValid = await this.validateTemplateOwnership(dto.slipTemplateId, userIdToCheck);
        if (!isValid) {
          throw new ForbiddenException('เทมเพลตนี้ไม่ใช่ของคุณหรือไม่มีอยู่ในระบบ');
        }
        // Update settings.slipTemplateId
        account.settings = { ...account.settings, slipTemplateId: dto.slipTemplateId };
      } else {
        // If null/empty is passed, clear the template selection
        account.settings = { ...account.settings, slipTemplateId: '' };
      }
    }

    // Remove slipTemplateId from dto before assigning (it's handled in settings)
    const { slipTemplateId, ...restDto } = dto;
    Object.assign(account, restDto);
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

    // Convert existing settings to plain object to avoid Mongoose subdocument issues
    const rawSettings = account.settings as any;
    const currentSettings = rawSettings && typeof rawSettings.toObject === 'function'
      ? rawSettings.toObject()
      : (rawSettings || {});

    // Merge settings properly (handle nested objects like slipTemplateIds)
    const mergedSettings = { ...currentSettings };
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        // For nested objects like slipTemplateIds, merge instead of replace
        if (key === 'slipTemplateIds' && typeof value === 'object' && value !== null) {
          // Filter out invalid template IDs (e.g., mock IDs starting with 'mock-')
          const filteredIds: Record<string, string> = {};
          for (const [type, templateId] of Object.entries(value as Record<string, string>)) {
            if (templateId && !templateId.startsWith('mock-')) {
              filteredIds[type] = templateId;
            } else if (templateId && templateId.startsWith('mock-')) {
              this.logger.warn(`[updateSettings] Ignoring mock template ID: ${templateId} for type ${type}`);
            }
          }
          mergedSettings[key] = { ...(currentSettings[key] || {}), ...filteredIds };
        } else {
          mergedSettings[key] = value;
        }
      }
    }

    // Set the merged settings
    account.settings = mergedSettings as any;

    // Mark settings as modified to ensure Mongoose saves nested changes
    account.markModified('settings');

    await account.save();

    this.logger.log(`[updateSettings] Updated settings for account ${id}: slipTemplateIds=${JSON.stringify(mergedSettings.slipTemplateIds || {})}`);

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

    this.logger.debug(`[sendPush] Sending ${messages.length} message(s) to ${userId}`);

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
      this.logger.debug(`[sendPush] Message sent successfully`);
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(`Error sending LINE push message: ${axiosError.message}`);
      // Log detailed error response from LINE API
      if (axiosError.response) {
        this.logger.error(`LINE API response: ${JSON.stringify(axiosError.response.data)}`);
      }
      // Log the message that failed to send (for debugging)
      this.logger.error(`Failed message: ${JSON.stringify(messages).substring(0, 500)}`);
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
    lineUserName?: string,
    lineUserPicture?: string,
  ): Promise<void> {
    await this.chatMessageModel.create({
      lineAccountId: new Types.ObjectId(lineAccountId), // Convert to ObjectId for proper query matching
      lineUserId,
      lineUserName,
      lineUserPicture,
      direction,
      messageType,
      messageText,
      messageId,
      replyToken,
      rawMessage,
      isRead: false,
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
