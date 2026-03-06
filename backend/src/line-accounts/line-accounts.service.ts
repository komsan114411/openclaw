import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';
import { ChatMessage, ChatMessageDocument, MessageDirection, MessageType } from '../database/schemas/chat-message.schema';
import { SlipTemplate, SlipTemplateDocument } from '../database/schemas/slip-template.schema';
import { LineMessage, LineMessageDocument } from '../line-session/schemas/line-message.schema';
import { AccountAlert, AccountAlertDocument } from '../line-session/schemas/account-alert.schema';
import { SlipHistory, SlipHistoryDocument } from '../database/schemas/slip-history.schema';
import { AngpaoHistory, AngpaoHistoryDocument } from '../angpao/schemas/angpao-history.schema';
import { CreateLineAccountDto } from './dto/create-line-account.dto';
import { UpdateLineAccountDto } from './dto/update-line-account.dto';
import { RedisService } from '../redis/redis.service';
import { isValidObjectId } from '../common/utils/validation.util';

@Injectable()
export class LineAccountsService {
  private readonly logger = new Logger(LineAccountsService.name);

  constructor(
    @InjectModel(LineAccount.name) private lineAccountModel: Model<LineAccountDocument>,
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(SlipTemplate.name) private slipTemplateModel: Model<SlipTemplateDocument>,
    @InjectModel(LineMessage.name) private lineMessageModel: Model<LineMessageDocument>,
    @InjectModel(AccountAlert.name) private accountAlertModel: Model<AccountAlertDocument>,
    @InjectModel(SlipHistory.name) private slipHistoryModel: Model<SlipHistoryDocument>,
    @InjectModel(AngpaoHistory.name) private angpaoHistoryModel: Model<AngpaoHistoryDocument>,
    private redisService: RedisService,
  ) { }

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
    if (!templateId || !isValidObjectId(templateId)) {
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
    // Check if account name already exists
    const existingName = await this.lineAccountModel.findOne({ accountName: dto.accountName });
    if (existingName) {
      throw new BadRequestException('ชื่อบัญชีนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
    }

    // Check if channel ID already exists
    const existing = await this.lineAccountModel.findOne({ channelId: dto.channelId });
    if (existing) {
      throw new BadRequestException('Channel ID นี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบว่าใส่ Channel ID ถูกต้อง');
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

    // Extract template fields and ownerId from dto (ownerId is resolved by controller)
    const { slipTemplateId, slipTemplateIds, ownerId: _dtoOwnerId, ...restDto } = dto;

    // Build settings with proper slipTemplateIds structure
    const settings: any = {};
    const validatedTemplateIds: Record<string, string> = {};

    // Handle new slipTemplateIds format (preferred)
    if (slipTemplateIds && typeof slipTemplateIds === 'object') {
      for (const [type, templateId] of Object.entries(slipTemplateIds)) {
        if (templateId && typeof templateId === 'string' && templateId.trim()) {
          // Validate template ownership
          const isValid = await this.validateTemplateOwnership(templateId, ownerId);
          if (isValid) {
            validatedTemplateIds[type] = templateId;
            this.logger.log(`[CREATE] Validated template ${templateId} for type ${type}`);
          } else {
            this.logger.warn(`[CREATE] Template ${templateId} for type ${type} is not owned by user or doesn't exist`);
          }
        }
      }
    }

    // Handle legacy slipTemplateId (backward compatibility)
    if (slipTemplateId && !Object.keys(validatedTemplateIds).length) {
      const template = await this.slipTemplateModel.findById(slipTemplateId).select({ ownerId: 1, isGlobal: 1, type: 1 }).lean().exec();
      if (template) {
        const isOwner = template.ownerId?.toString() === ownerId;
        const isGlobal = template.isGlobal === true;
        if (isOwner || isGlobal) {
          const templateType = template.type || 'success';
          validatedTemplateIds[templateType] = slipTemplateId;
          settings.slipTemplateId = slipTemplateId; // Keep legacy field
          this.logger.log(`[CREATE] Legacy: Storing template ${slipTemplateId} for type ${templateType}`);
        }
      }
    }

    if (Object.keys(validatedTemplateIds).length > 0) {
      settings.slipTemplateIds = validatedTemplateIds;
    }

    const account = new this.lineAccountModel({
      ...restDto,
      ownerId,
      webhookSlug,
      isActive: true,
      settings,
    });

    try {
      return await account.save();
    } catch (error: any) {
      // Handle MongoDB duplicate key error (race condition)
      if (error.code === 11000) {
        const keyPattern = error.keyPattern || {};
        if (keyPattern.accountName) {
          throw new BadRequestException('ชื่อบัญชีนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
        }
        if (keyPattern.channelId) {
          throw new BadRequestException('Channel ID นี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบว่าใส่ Channel ID ถูกต้อง');
        }
        throw new BadRequestException('ข้อมูลซ้ำกับบัญชีที่มีอยู่แล้ว กรุณาตรวจสอบชื่อบัญชีและ Channel ID');
      }
      throw error;
    }
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
    return this.lineAccountModel.find({ ownerId, isActive: true })
      .select('-accessToken -channelSecret')
      .exec();
  }

  async findById(id: string): Promise<LineAccountDocument | null> {
    return this.lineAccountModel.findById(id)
      .select('-accessToken -channelSecret')
      .exec();
  }

  /**
   * Find by ID with sensitive fields included (for internal use: webhook, test-connection)
   */
  async findByIdInternal(id: string): Promise<LineAccountDocument | null> {
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
      throw new NotFoundException('ไม่พบบัญชี LINE นี้ในระบบ');
    }

    // Check accountName duplicate if being updated
    if (dto.accountName && dto.accountName !== account.accountName) {
      const existingName = await this.lineAccountModel.findOne({ accountName: dto.accountName, _id: { $ne: id } });
      if (existingName) {
        throw new BadRequestException('ชื่อบัญชีนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
      }
    }

    const userIdToCheck = ownerId || account.ownerId;
    const currentSettings = (account.settings as any) || {};

    // Handle new slipTemplateIds format (preferred)
    if (dto.slipTemplateIds !== undefined) {
      const validatedTemplateIds: Record<string, string> = {};

      if (dto.slipTemplateIds && typeof dto.slipTemplateIds === 'object') {
        for (const [type, templateId] of Object.entries(dto.slipTemplateIds)) {
          if (templateId && typeof templateId === 'string' && templateId.trim()) {
            // Validate template ownership
            const isValid = await this.validateTemplateOwnership(templateId, userIdToCheck);
            if (isValid) {
              validatedTemplateIds[type] = templateId;
              this.logger.log(`[UPDATE] Validated template ${templateId} for type ${type}`);
            } else {
              this.logger.warn(`[UPDATE] Template ${templateId} for type ${type} is not owned by user or doesn't exist`);
            }
          }
          // If templateId is empty/null, it means user wants to clear that type (don't add to validatedTemplateIds)
        }
      }

      // Update settings with new template IDs (replace, not merge)
      account.settings = {
        ...currentSettings,
        slipTemplateIds: validatedTemplateIds,
        slipTemplateId: '', // Clear legacy field when using new format
      };

      this.logger.log(`[UPDATE] Updated slipTemplateIds: ${JSON.stringify(validatedTemplateIds)}`);
    }
    // Handle legacy slipTemplateId (backward compatibility)
    else if (dto.slipTemplateId !== undefined) {
      if (dto.slipTemplateId) {
        // Get the template to find its type
        const template = await this.slipTemplateModel.findById(dto.slipTemplateId)
          .select({ ownerId: 1, isGlobal: 1, type: 1 }).lean().exec();

        if (!template) {
          throw new ForbiddenException('เทมเพลตนี้ไม่มีอยู่ในระบบ');
        }

        // Check ownership: must be owner OR template is global
        const isOwner = template.ownerId?.toString() === userIdToCheck;
        const isGlobal = template.isGlobal === true;
        if (!isOwner && !isGlobal) {
          throw new ForbiddenException('เทมเพลตนี้ไม่ใช่ของคุณหรือไม่มีอยู่ในระบบ');
        }

        const templateType = template.type || 'success';
        const currentTemplateIds = currentSettings.slipTemplateIds || {};

        // Update both legacy field and new per-type field
        account.settings = {
          ...currentSettings,
          slipTemplateId: dto.slipTemplateId,
          slipTemplateIds: {
            ...currentTemplateIds,
            [templateType]: dto.slipTemplateId,
          },
        };

        this.logger.log(`[UPDATE] Legacy: Storing template ${dto.slipTemplateId} for type ${templateType}`);
      } else {
        // If null/empty is passed, clear the template selection
        account.settings = {
          ...currentSettings,
          slipTemplateId: '',
          slipTemplateIds: {},
        };
        this.logger.log(`[UPDATE] Cleared template selection for account ${id}`);
      }
    }

    // Remove template fields from dto before assigning (they're handled in settings)
    const { slipTemplateId, slipTemplateIds, ...restDto } = dto;
    Object.assign(account, restDto);

    // Mark settings as modified for Mongoose to detect nested changes
    account.markModified('settings');

    try {
      await account.save();
    } catch (error: any) {
      if (error.code === 11000) {
        const keyPattern = error.keyPattern || {};
        if (keyPattern.accountName) {
          throw new BadRequestException('ชื่อบัญชีนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
        }
        throw new BadRequestException('ข้อมูลซ้ำกับบัญชีที่มีอยู่แล้ว');
      }
      throw error;
    }

    // Invalidate cache
    await this.redisService.invalidateCache(`line-account:${id}`);

    return account;
  }

  // Allowed settings fields — prevents injection of arbitrary fields into the document
  // MUST match all fields in LineAccountSettings schema — missing = silently dropped!
  private static readonly ALLOWED_SETTINGS_FIELDS = new Set([
    // Core toggles
    'enableBot', 'enableAi', 'enableSlipVerification', 'webhookEnabled',
    // AI settings
    'enableSmartAi', 'aiSystemPrompt', 'aiModel', 'aiTemperature',
    'aiFallbackMessage', 'aiResponseMode', 'aiImmediateMessage', 'aiCustomResponse',
    'knowledgeBase', 'intentRules', 'gameLinks',
    'smartAiClassifierModel', 'duplicateDetectionWindowMinutes',
    'spamThresholdMessagesPerMinute',
    // Smart AI advanced
    'smartAiConfidenceThreshold', 'smartAiMaxTokens', 'smartAiResponseDelayMs',
    'smartAiMaxRetries', 'smartAiRetryDelayMs', 'smartAiFallbackAction',
    // Slip & payment
    'slipTemplateId', 'slipTemplateIds', 'slipResponseMode', 'slipImmediateMessage',
    'slipSuccessTemplate', 'slipDuplicateTemplate', 'slipErrorTemplate',
    'autoReplyEnabled', 'autoReplyMessage', 'sendProcessingMessage',
    // Custom messages
    'customQuotaExceededMessage', 'customBotDisabledMessage',
    'customSlipDisabledMessage', 'customAiDisabledMessage',
    'customDuplicateSlipMessage', 'customSlipErrorMessage', 'customSlipSuccessMessage',
    // Message toggles (null = use system default)
    'sendMessageWhenBotDisabled', 'sendMessageWhenSlipDisabled',
    'sendMessageWhenAiDisabled', 'sendMessageWhenAiQuotaExhausted',
    // Notifications & display
    'welcomeMessage', 'notifyOnDeposit', 'notifyOnWithdraw',
    'richMenuId', 'richMenuEnabled',
    // Quota
    'quotaAlertEnabled', 'quotaAlertThreshold',
    // Angpao
    'enableAngpao', 'angpaoPhoneNumber', 'angpaoRecipientName',
  ]);

  async updateSettings(id: string, settings: Partial<LineAccountDocument['settings']>): Promise<void> {
    const account = await this.lineAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('LINE account not found');
    }

    // Filter out unknown/disallowed fields
    const sanitizedSettings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
      if (LineAccountsService.ALLOWED_SETTINGS_FIELDS.has(key)) {
        sanitizedSettings[key] = value;
      } else {
        this.logger.warn(`[updateSettings] Rejected unknown settings field: ${key}`);
      }
    }
    settings = sanitizedSettings as typeof settings;

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

    // ========================================
    // Angpao phone number validation (format only — no collision check)
    // Phone numbers can be shared across multiple accounts.
    // ========================================
    if ('angpaoPhoneNumber' in mergedSettings && mergedSettings.angpaoPhoneNumber) {
      const phone = String(mergedSettings.angpaoPhoneNumber).trim();
      // Validate Thai mobile format: 0xxxxxxxxx (10 digits)
      if (!/^0[0-9]{9}$/.test(phone)) {
        throw new BadRequestException('เบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็นเบอร์ไทย 10 หลัก เช่น 0812345678)');
      }
      mergedSettings.angpaoPhoneNumber = phone;
    }

    // Set the merged settings
    account.settings = mergedSettings as any;

    // Mark settings as modified to ensure Mongoose saves nested changes
    account.markModified('settings');

    await account.save();

    this.logger.log(`[updateSettings] Updated settings for account ${id}: slipTemplateIds=${JSON.stringify(mergedSettings.slipTemplateIds || {})}`);

    await this.redisService.invalidateCache(`line-account:${id}`);

    // Clear AI chat history when AI-related settings change
    // This ensures the AI uses the new prompt/knowledge base without stale context
    const aiRelatedKeys = ['enableAi', 'enableSmartAi', 'knowledgeBase', 'aiSystemPrompt', 'aiModel', 'intentRules', 'gameLinks', 'aiTemperature', 'aiFallbackMessage'];
    const hasAiSettingsChanged = aiRelatedKeys.some((key) => key in (settings as Record<string, unknown>));
    if (hasAiSettingsChanged) {
      this.logger.log(`[updateSettings] AI settings changed for account ${id}, clearing chat history...`);
      const deletedCount = await this.redisService.deleteKeysByPattern(`chat:${id}:*`);
      this.logger.log(`[updateSettings] Cleared ${deletedCount} chat history entries for account ${id}`);
      // Also clear duplicate detection cache so AI starts fresh
      const dupDeleted = await this.redisService.deleteKeysByPattern(`dup:${id}:*`);
      if (dupDeleted > 0) {
        this.logger.log(`[updateSettings] Cleared ${dupDeleted} duplicate detection entries for account ${id}`);
      }
    }
  }

  async delete(id: string): Promise<void> {
    const account = await this.lineAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('LINE account not found');
    }

    account.isActive = false;
    await account.save();

    // Cascade delete related data
    const [msgResult, chatResult, alertResult, slipResult, angpaoResult] = await Promise.all([
      this.lineMessageModel.deleteMany({ lineAccountId: id }),
      this.chatMessageModel.deleteMany({ lineAccountId: id }),
      this.accountAlertModel.deleteMany({ lineAccountId: id }),
      this.slipHistoryModel.deleteMany({ lineAccountId: id }),
      this.angpaoHistoryModel.deleteMany({ lineAccountId: id }),
      this.redisService.invalidateCache(`line-account:${id}`),
      this.redisService.deleteKeysByPattern(`chat:${id}:*`),
    ]);

    this.logger.log(
      `[delete] Cascade deleted for account ${id}: ` +
      `${msgResult.deletedCount} messages, ${chatResult.deletedCount} chats, ` +
      `${alertResult.deletedCount} alerts, ${slipResult.deletedCount} slips, ` +
      `${angpaoResult.deletedCount} angpao`,
    );
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
      this.logger.debug('[sendReply] Message sent successfully');
    } catch (error) {
      const axiosError = error as AxiosError;
      // Log detailed error for debugging
      if (axiosError.response) {
        this.logger.error(`[sendReply] LINE API error: status=${axiosError.response.status}, data=${JSON.stringify(axiosError.response.data)}`);
        this.logger.error(`[sendReply] Failed message preview: ${JSON.stringify(messages).substring(0, 500)}`);
      }
      // IMPORTANT: Always throw 400 errors so fallback logic can work
      // 400 can be: reply token expired OR invalid Flex Message structure
      // The caller (safeSendMessage) needs to know to try fallback
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
