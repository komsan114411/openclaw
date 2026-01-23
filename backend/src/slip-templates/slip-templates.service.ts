import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SlipTemplate,
  SlipTemplateDocument,
  TemplateType,
} from '../database/schemas/slip-template.schema';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';
import { UserRole } from '../database/schemas/user.schema';

export interface CreateTemplateDto {
  lineAccountId?: string;
  ownerId?: string;
  name: string;
  description?: string;
  type: TemplateType;
  flexTemplate?: Record<string, any>;
  textTemplate?: string;
  primaryColor?: string;
  secondaryColor?: string;
  bankId?: string;
  headerText?: string;
  footerText?: string;
  footerLink?: string;
  footerLinkText?: string;
  showAmount?: boolean;
  showSender?: boolean;
  showReceiver?: boolean;
  showDate?: boolean;
  showTime?: boolean;
  showTransRef?: boolean;
  showBankLogo?: boolean;
  showCountryCode?: boolean;
  showFee?: boolean;
  showRefs?: boolean;
  showPayload?: boolean;
  showSenderBankId?: boolean;
  showReceiverBankId?: boolean;
  showReceiverProxy?: boolean;
  showDelayWarning?: boolean;
  delayWarningMinutes?: number;
  isGlobal?: boolean;
  isSystemTemplate?: boolean;
  isActive?: boolean;
  isDefault?: boolean;
  // New enhanced fields
  showSenderAccount?: boolean;
  showReceiverAccount?: boolean;
  showSenderNameEn?: boolean;
  showReceiverNameEn?: boolean;
  showLocalAmount?: boolean;
  // Enhanced styling fields
  themePreset?: string;
  headerBackgroundColor?: string;
  headerBackgroundGradient?: string;
  headerBackgroundImage?: string;
  headerTextColor?: string;
  headerIcon?: string;
  headerIconUrl?: string;
  bodyBackgroundColor?: string;
  bodyBackgroundImage?: string;
  amountColor?: string;
  cardBackgroundColor?: string;
  cardBorderRadius?: string;
  showCardBorder?: boolean;
  cardBorderColor?: string;
  showFooterBranding?: boolean;
  footerBrandingText?: string;
  footerBrandingName?: string;
  footerBrandingLogo?: string;
  showQrCode?: boolean;
  qrCodeContent?: string;
  qrCodeLabel?: string;
  layoutStyle?: string;
  showSlipImage?: boolean;
  thumbnailUrl?: string;
}

export interface SlipData {
  amount?: number;
  amountFormatted?: string;
  localAmount?: number;
  localAmountFormatted?: string;
  localCurrency?: string;
  fee?: number;
  feeFormatted?: string;
  countryCode?: string;
  ref1?: string;
  ref2?: string;
  ref3?: string;
  payload?: string;
  // Sender info
  senderName?: string;
  senderNameEn?: string;
  senderBank?: string;
  senderBankCode?: string;
  senderBankId?: string;
  senderAccount?: string;
  senderAccountType?: string;
  // Receiver info
  receiverName?: string;
  receiverNameEn?: string;
  receiverBank?: string;
  receiverBankCode?: string;
  receiverBankId?: string;
  receiverAccount?: string;
  receiverAccountNumber?: string;
  receiverAccountType?: string;
  receiverProxyType?: string;
  receiverProxyAccount?: string;
  // Date & Time
  date?: string;
  time?: string;
  transRef?: string;
  // Bank logos
  senderBankLogoUrl?: string;
  receiverBankLogoUrl?: string;
  // For duplicate slip detection
  isDuplicate?: boolean;
  originalDate?: string;
  delayMinutes?: number;
  duplicateMessage?: string;
  // For error templates
  message?: string;
}

// ============================================
// Theme Presets - Predefined beautiful styles
// ============================================
export const THEME_PRESETS = {
  default: {
    name: 'Default Green',
    headerBackgroundColor: '#4ADE80',
    headerTextColor: '#FFFFFF',
    amountColor: '#22C55E',
    bodyBackgroundColor: '#FFFFFF',
    cardBackgroundColor: '#F5F5F5',
    cardBorderColor: '#E5E5E5',
  },
  green: {
    name: 'Emerald',
    headerBackgroundColor: '#10B981',
    headerTextColor: '#FFFFFF',
    amountColor: '#059669',
    bodyBackgroundColor: '#FFFFFF',
    cardBackgroundColor: '#ECFDF5',
    cardBorderColor: '#A7F3D0',
  },
  'green-gradient': {
    name: 'Green Gradient',
    headerBackgroundColor: '#22C55E',
    headerBackgroundGradient: 'linear-gradient(135deg, #4ADE80, #22C55E)',
    headerTextColor: '#FFFFFF',
    amountColor: '#16A34A',
    bodyBackgroundColor: '#FFFFFF',
    cardBackgroundColor: '#F0FDF4',
    cardBorderColor: '#BBF7D0',
  },
  orange: {
    name: 'Warm Orange',
    headerBackgroundColor: '#F97316',
    headerTextColor: '#FFFFFF',
    amountColor: '#EA580C',
    bodyBackgroundColor: '#FFFBEB',
    cardBackgroundColor: '#FEF3C7',
    cardBorderColor: '#FDE68A',
  },
  pink: {
    name: 'Sweet Pink',
    headerBackgroundColor: '#EC4899',
    headerTextColor: '#FFFFFF',
    amountColor: '#DB2777',
    bodyBackgroundColor: '#FDF2F8',
    cardBackgroundColor: '#FCE7F3',
    cardBorderColor: '#FBCFE8',
  },
  blue: {
    name: 'Ocean Blue',
    headerBackgroundColor: '#3B82F6',
    headerTextColor: '#FFFFFF',
    amountColor: '#2563EB',
    bodyBackgroundColor: '#EFF6FF',
    cardBackgroundColor: '#DBEAFE',
    cardBorderColor: '#BFDBFE',
  },
  purple: {
    name: 'Royal Purple',
    headerBackgroundColor: '#8B5CF6',
    headerTextColor: '#FFFFFF',
    amountColor: '#7C3AED',
    bodyBackgroundColor: '#F5F3FF',
    cardBackgroundColor: '#EDE9FE',
    cardBorderColor: '#DDD6FE',
  },
  duplicate: {
    name: 'Duplicate Warning',
    headerBackgroundColor: '#FFF3E0',
    headerTextColor: '#FF6B00',
    amountColor: '#FF6B00',
    bodyBackgroundColor: '#FFFFFF',
    cardBackgroundColor: '#FFF8E1',
    cardBorderColor: '#FFE0B2',
  },
  error: {
    name: 'Error Red',
    headerBackgroundColor: '#FEE2E2',
    headerTextColor: '#DC2626',
    amountColor: '#DC2626',
    bodyBackgroundColor: '#FFFFFF',
    cardBackgroundColor: '#FEF2F2',
    cardBorderColor: '#FECACA',
  },
} as const;

export type ThemePresetKey = keyof typeof THEME_PRESETS;

@Injectable()
export class SlipTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(SlipTemplatesService.name);

  constructor(
    @InjectModel(SlipTemplate.name) private slipTemplateModel: Model<SlipTemplateDocument>,
    @InjectModel(LineAccount.name) private lineAccountModel: Model<LineAccountDocument>,
  ) { }

  /**
   * Auto-seed global default templates on application startup
   */
  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('[INIT] Starting global templates initialization...');
      await this.createDefaultGlobalTemplates();

      // Verify templates were created
      const count = await this.slipTemplateModel.countDocuments({ isGlobal: true, isActive: true });
      this.logger.log(`[INIT] Global templates count: ${count}`);

      if (count === 0) {
        this.logger.warn('[INIT] No global templates found after initialization, retrying...');
        await this.createDefaultGlobalTemplates();
      }
    } catch (error) {
      this.logger.error('Failed to create default global templates:', error);
    }
  }

  /**
   * SECURITY: Verify user has access to the LINE account
   * Admins can access any account, users can only access their own
   */
  async ensureAccountAccess(
    lineAccountId: string,
    user: { userId: string; role: UserRole },
  ): Promise<void> {
    if (!Types.ObjectId.isValid(lineAccountId)) {
      throw new BadRequestException('Invalid LINE account ID');
    }

    const account = await this.lineAccountModel
      .findById(lineAccountId)
      .select({ ownerId: 1 })
      .lean()
      .exec();

    if (!account) {
      throw new NotFoundException('LINE Account not found');
    }

    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  /**
   * SECURITY: Validate footerLink URL to prevent phishing/XSS
   * Only allows https:// and tel: protocols
   */
  validateFooterLink(link: string): void {
    if (!link) return;

    const trimmed = link.trim().toLowerCase();

    // Only allow https:// and tel: protocols
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('tel:')) {
      throw new BadRequestException(
        'Invalid footer link. Only https:// and tel: protocols are allowed',
      );
    }

    // Block javascript: and data: even if embedded
    if (trimmed.includes('javascript:') || trimmed.includes('data:')) {
      throw new BadRequestException('Invalid footer link: blocked protocol detected');
    }
  }

  /**
   * Create a new slip template
   */
  async create(dto: CreateTemplateDto): Promise<SlipTemplateDocument> {
    // SECURITY: Validate footerLink before saving
    if (dto.footerLink) {
      this.validateFooterLink(dto.footerLink);
    }

    // Extract variables from template
    const variables = this.extractVariables(dto.flexTemplate, dto.textTemplate);

    const template = await this.slipTemplateModel.create({
      lineAccountId: dto.lineAccountId ? new Types.ObjectId(dto.lineAccountId) : undefined,
      ownerId: dto.ownerId ? new Types.ObjectId(dto.ownerId) : undefined,
      name: dto.name,
      description: dto.description,
      type: dto.type,
      flexTemplate: dto.flexTemplate,
      textTemplate: dto.textTemplate,
      variables,
      primaryColor: dto.primaryColor || '#00C851',
      secondaryColor: dto.secondaryColor || '#333333',
      bankId: dto.bankId ? new Types.ObjectId(dto.bankId) : undefined,
      headerText: dto.headerText,
      footerText: dto.footerText,
      footerLink: dto.footerLink,
      footerLinkText: dto.footerLinkText,
      showAmount: dto.showAmount ?? true,
      showSender: dto.showSender ?? true,
      showReceiver: dto.showReceiver ?? true,
      showDate: dto.showDate ?? true,
      showTime: dto.showTime ?? true,
      showTransRef: dto.showTransRef ?? true,
      showBankLogo: dto.showBankLogo ?? true,
      showCountryCode: dto.showCountryCode ?? false,
      showFee: dto.showFee ?? false,
      showRefs: dto.showRefs ?? false,
      showPayload: dto.showPayload ?? false,
      showSenderBankId: dto.showSenderBankId ?? false,
      showReceiverBankId: dto.showReceiverBankId ?? false,
      showReceiverProxy: dto.showReceiverProxy ?? false,
      showDelayWarning: dto.showDelayWarning ?? false,
      delayWarningMinutes: dto.delayWarningMinutes ?? 5,
      isGlobal: dto.isGlobal ?? false,
      isSystemTemplate: dto.isSystemTemplate ?? false,
      isActive: dto.isActive ?? true,
      isDefault: dto.isDefault ?? false,
      // New enhanced fields
      showSenderAccount: dto.showSenderAccount ?? false,
      showReceiverAccount: dto.showReceiverAccount ?? false,
      showSenderNameEn: dto.showSenderNameEn ?? false,
      showReceiverNameEn: dto.showReceiverNameEn ?? false,
      showLocalAmount: dto.showLocalAmount ?? false,
    });

    return template;
  }

  /**
   * Create a global template (Admin only)
   */
  async createGlobalTemplate(dto: Omit<CreateTemplateDto, 'lineAccountId'>): Promise<SlipTemplateDocument> {
    this.logger.log(`[TEMPLATE] Creating global template: name=${dto.name}, type=${dto.type}`);
    return this.create({
      ...dto,
      isGlobal: true,
      isSystemTemplate: true,
      isActive: true,
    });
  }

  /**
   * Get all global templates
   * Auto-creates default templates if none exist
   */
  async getGlobalTemplates(): Promise<SlipTemplateDocument[]> {
    let templates = await this.slipTemplateModel
      .find({ isGlobal: true, isActive: true })
      .sort({ type: 1, isDefault: -1, createdAt: -1 })
      .exec();

    // If no templates, create defaults
    if (templates.length === 0) {
      this.logger.log('[TEMPLATE] No global templates found, creating defaults...');
      await this.createDefaultGlobalTemplates();
      templates = await this.slipTemplateModel
        .find({ isGlobal: true, isActive: true })
        .sort({ type: 1, isDefault: -1, createdAt: -1 })
        .exec();
      this.logger.log(`[TEMPLATE] Created ${templates.length} default templates`);
    }

    return templates;
  }

  /**
   * Get all global templates (for admin management)
   * Auto-creates default templates if none exist
   */
  async getAllGlobalTemplates(): Promise<SlipTemplateDocument[]> {
    let templates = await this.slipTemplateModel
      .find({ isGlobal: true })
      .sort({ type: 1, isDefault: -1, createdAt: -1 })
      .exec();

    // If no templates, create defaults
    if (templates.length === 0) {
      this.logger.log('[TEMPLATE] No global templates found (admin), creating defaults...');
      await this.createDefaultGlobalTemplates();
      templates = await this.slipTemplateModel
        .find({ isGlobal: true })
        .sort({ type: 1, isDefault: -1, createdAt: -1 })
        .exec();
      this.logger.log(`[TEMPLATE] Created ${templates.length} default templates`);
    }

    return templates;
  }

  /**
   * Get all templates for a LINE account (includes global templates)
   */
  async getByLineAccount(lineAccountId: string): Promise<SlipTemplateDocument[]> {
    // Get account-specific templates and global templates
    return this.slipTemplateModel
      .find({
        isActive: true,
        $or: [
          { lineAccountId: new Types.ObjectId(lineAccountId) },
          { isGlobal: true },
        ],
      })
      .sort({ isGlobal: 1, type: 1, isDefault: -1, createdAt: -1 })
      .exec();
  }

  /**
   * Get only account-specific templates (no global)
   */
  async getAccountTemplates(lineAccountId: string): Promise<SlipTemplateDocument[]> {
    return this.slipTemplateModel
      .find({
        lineAccountId: new Types.ObjectId(lineAccountId),
        isActive: true,
        isGlobal: { $ne: true },
      })
      .sort({ type: 1, isDefault: -1, createdAt: -1 })
      .exec();
  }

  /**
   * Get template by ID
   */
  async getById(templateId: string): Promise<SlipTemplateDocument> {
    const template = await this.slipTemplateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  /**
   * Get default template for a type
   */
  async getDefaultTemplate(
    lineAccountId: string,
    type: TemplateType,
  ): Promise<SlipTemplateDocument | null> {
    return this.slipTemplateModel.findOne({
      lineAccountId: new Types.ObjectId(lineAccountId),
      type,
      isDefault: true,
      isActive: true,
    });
  }

  /**
   * Get default global template for a type
   * Falls back to any global template of the same type if no default is found
   * If no template exists, auto-creates default templates
   */
  async getGlobalDefaultTemplate(type: TemplateType): Promise<SlipTemplateDocument | null> {
    // First try to find a default template
    let defaultTemplate = await this.slipTemplateModel.findOne({
      isGlobal: true,
      type,
      isDefault: true,
      isActive: true,
    });

    if (defaultTemplate) {
      this.logger.log(`[TEMPLATE] Found default global template for ${type}: ${defaultTemplate.name}`);
      return defaultTemplate;
    }

    // Fallback: find any global template for this type
    this.logger.log(`[TEMPLATE] No default global template for ${type}, looking for any global template`);
    defaultTemplate = await this.slipTemplateModel.findOne({
      isGlobal: true,
      type,
      isActive: true,
    }).sort({ createdAt: -1 });

    if (defaultTemplate) {
      this.logger.log(`[TEMPLATE] Found non-default global template for ${type}: ${defaultTemplate.name}`);
      return defaultTemplate;
    }

    // No template found - try to create defaults
    this.logger.warn(`[TEMPLATE] No global template found for ${type}, creating defaults...`);
    try {
      await this.createDefaultGlobalTemplates();

      // Try to find again after creation
      defaultTemplate = await this.slipTemplateModel.findOne({
        isGlobal: true,
        type,
        isDefault: true,
        isActive: true,
      });

      if (defaultTemplate) {
        this.logger.log(`[TEMPLATE] Created and found template for ${type}: ${defaultTemplate.name}`);
        return defaultTemplate;
      }
    } catch (error) {
      this.logger.error(`[TEMPLATE] Failed to create default templates:`, error);
    }

    this.logger.error(`[TEMPLATE] Could not find or create template for ${type}`);
    return null;
  }


  /**
   * Update template
   * IMPORTANT: Preserves isGlobal, isSystemTemplate, and isActive flags to prevent accidental data loss
   */
  async update(
    templateId: string,
    updates: Partial<CreateTemplateDto>,
  ): Promise<SlipTemplateDocument> {
    // SECURITY: Validate footerLink before saving
    if (updates.footerLink) {
      this.validateFooterLink(updates.footerLink);
    }

    // Get existing template to preserve critical flags
    const existingTemplate = await this.slipTemplateModel.findById(templateId);
    if (!existingTemplate) {
      throw new NotFoundException('Template not found');
    }

    // Preserve critical flags that should not be accidentally overwritten
    const preservedFlags = {
      isGlobal: existingTemplate.isGlobal,
      isSystemTemplate: existingTemplate.isSystemTemplate,
      isActive: updates.isActive !== undefined ? updates.isActive : existingTemplate.isActive,
    };

    this.logger.log(`[TEMPLATE UPDATE] Updating template ${templateId}, preserving flags: isGlobal=${preservedFlags.isGlobal}, isSystemTemplate=${preservedFlags.isSystemTemplate}, isActive=${preservedFlags.isActive}`);

    const template = await this.slipTemplateModel.findByIdAndUpdate(
      templateId,
      {
        ...updates,
        ...preservedFlags,
        variables: this.extractVariables(updates.flexTemplate, updates.textTemplate),
      },
      { new: true },
    );

    if (!template) {
      throw new NotFoundException('Template not found after update');
    }

    this.logger.log(`[TEMPLATE UPDATE] Template ${template.name} updated successfully, isGlobal=${template.isGlobal}`);

    return template;
  }

  /**
   * Get count of LINE accounts using this template
   */
  async getTemplateUsageCount(templateId: string): Promise<{
    count: number;
    accounts: Array<{ _id: string; name: string }>;
  }> {
    if (!Types.ObjectId.isValid(templateId)) {
      throw new BadRequestException('Invalid template ID');
    }

    const accounts = await this.lineAccountModel.find({
      $or: [
        { 'settings.slipTemplateId': templateId },
        { 'settings.slipTemplateIds.success': templateId },
        { 'settings.slipTemplateIds.duplicate': templateId },
        { 'settings.slipTemplateIds.error': templateId },
        { 'settings.slipTemplateIds.not_found': templateId },
      ],
    }).select({ _id: 1, name: 1 }).lean().exec();

    return {
      count: accounts.length,
      accounts: accounts.map((a) => ({
        _id: a._id.toString(),
        name: a.accountName || 'Unnamed Account',
      })),
    };
  }

  /**
   * Check if template can be safely deleted
   */
  async checkTemplateUsage(templateId: string): Promise<{
    canDelete: boolean;
    isDefault: boolean;
    usageCount: number;
    accounts: Array<{ _id: string; name: string }>;
    warningMessage?: string;
  }> {
    const template = await this.slipTemplateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    const usage = await this.getTemplateUsageCount(templateId);

    let warningMessage: string | undefined;
    if (template.isDefault) {
      warningMessage = 'ไม่สามารถลบเทมเพลตค่าเริ่มต้นได้';
    } else if (usage.count > 0) {
      warningMessage = `เทมเพลตนี้กำลังถูกใช้งานโดย ${usage.count} บัญชี หากลบจะมีผลกระทบทันที`;
    }

    return {
      canDelete: !template.isDefault,
      isDefault: template.isDefault,
      usageCount: usage.count,
      accounts: usage.accounts,
      warningMessage,
    };
  }

  /**
   * Safe delete template with usage check
   */
  async safeDelete(
    templateId: string,
    confirmationText?: string,
  ): Promise<{ success: boolean; affectedAccounts: number }> {
    const template = await this.slipTemplateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.isDefault) {
      throw new BadRequestException('ไม่สามารถลบเทมเพลตค่าเริ่มต้นได้');
    }

    const usage = await this.getTemplateUsageCount(templateId);

    if (usage.count > 0) {
      if (!confirmationText) {
        throw new BadRequestException(
          `เทมเพลตนี้กำลังถูกใช้งานโดย ${usage.count} บัญชี กรุณายืนยันการลบ`,
        );
      }

      const validConfirmations = ['DELETE', template.name.toUpperCase()];
      if (!validConfirmations.includes(confirmationText.toUpperCase())) {
        throw new BadRequestException(
          'กรุณาพิมพ์ "DELETE" หรือชื่อเทมเพลตเพื่อยืนยันการลบ',
        );
      }

      this.logger.warn(
        `Template "${template.name}" (${templateId}) deleted while in use by ${usage.count} accounts`,
      );

      await this.lineAccountModel.updateMany(
        { 'settings.slipTemplateId': templateId },
        { $unset: { 'settings.slipTemplateId': '' } },
      );

      for (const type of ['success', 'duplicate', 'error', 'not_found']) {
        await this.lineAccountModel.updateMany(
          { [`settings.slipTemplateIds.${type}`]: templateId },
          { $unset: { [`settings.slipTemplateIds.${type}`]: '' } },
        );
      }
    }

    await this.slipTemplateModel.findByIdAndDelete(templateId);

    return { success: true, affectedAccounts: usage.count };
  }

  /**
   * Get template with fallback to global default
   */
  async getTemplateWithFallback(
    lineAccountId: string,
    type: TemplateType,
    selectedTemplateId?: string,
  ): Promise<{ template: SlipTemplateDocument | null; usedFallback: boolean; reason?: string }> {
    if (selectedTemplateId && Types.ObjectId.isValid(selectedTemplateId)) {
      const selectedTemplate = await this.slipTemplateModel.findOne({
        _id: new Types.ObjectId(selectedTemplateId),
        type,
        isActive: true,
      });

      if (selectedTemplate) {
        return { template: selectedTemplate, usedFallback: false };
      }

      this.logger.warn(
        `Selected template ${selectedTemplateId} not found for account ${lineAccountId}, using fallback`,
      );
    }

    const accountDefault = await this.getDefaultTemplate(lineAccountId, type);
    if (accountDefault) {
      return {
        template: accountDefault,
        usedFallback: !!selectedTemplateId,
        reason: selectedTemplateId ? 'selected_template_deleted' : undefined,
      };
    }

    const globalDefault = await this.getGlobalDefaultTemplate(type);
    if (globalDefault) {
      return {
        template: globalDefault,
        usedFallback: true,
        reason: selectedTemplateId ? 'selected_template_deleted' : 'no_account_default',
      };
    }

    this.logger.error(`No template found for type ${type} (account: ${lineAccountId})`);
    return { template: null, usedFallback: true, reason: 'no_template_available' };
  }

  /**
   * Delete template
   */
  async delete(templateId: string): Promise<void> {
    const template = await this.slipTemplateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.isDefault) {
      throw new BadRequestException('Cannot delete default template');
    }

    await this.slipTemplateModel.findByIdAndDelete(templateId);
  }

  /**
   * Set template as default (for account-specific templates)
   */
  async setAsDefault(templateId: string): Promise<SlipTemplateDocument> {
    const template = await this.slipTemplateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Unset other defaults of same type for this account
    await this.slipTemplateModel.updateMany(
      {
        lineAccountId: template.lineAccountId,
        type: template.type,
        isGlobal: { $ne: true },
        _id: { $ne: templateId },
      },
      { isDefault: false },
    );

    // Set this as default
    template.isDefault = true;
    await template.save();

    return template;
  }

  /**
   * Set global template as default for its type
   */
  async setGlobalDefault(templateId: string): Promise<SlipTemplateDocument> {
    const template = await this.slipTemplateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (!template.isGlobal) {
      throw new BadRequestException('Template is not a global template');
    }

    // Unset other global defaults of same type
    await this.slipTemplateModel.updateMany(
      {
        isGlobal: true,
        type: template.type,
        _id: { $ne: templateId },
      },
      { isDefault: false },
    );

    // Set this as default
    template.isDefault = true;
    await template.save();

    return template;
  }

  /**
   * Generate Flex Message from template and slip data
   */
  generateFlexMessage(template: SlipTemplateDocument, slipData: SlipData): any {
    this.logger.log(`[FLEX] Generating flex message from template: ${template.name} (type: ${template.type})`);
    this.logger.log(`[FLEX] Template has flexTemplate: ${!!template.flexTemplate}, slipData keys: ${Object.keys(slipData).join(',')}`);

    if (template.flexTemplate) {
      this.logger.log(`[FLEX] Using custom flexTemplate`);
      return this.replaceVariables(template.flexTemplate, slipData);
    }

    // Generate default flex message
    this.logger.log(`[FLEX] Using generateDefaultFlexMessage`);
    const result = this.generateDefaultFlexMessage(template, slipData);
    this.logger.log(`[FLEX] Generated bubble type: ${result?.type}`);
    return result;
  }

  /**
   * Generate text message from template and slip data
   */
  generateTextMessage(template: SlipTemplateDocument, slipData: SlipData): string {
    if (template.textTemplate) {
      return this.replaceTextVariables(template.textTemplate, slipData);
    }

    // Generate default text message
    return this.generateDefaultTextMessage(template, slipData);
  }

  /**
   * Preview template with sample data
   */
  preview(template: SlipTemplateDocument): any {
    const sampleData: SlipData = {
      amount: 1000,
      amountFormatted: '฿1,000.00',
      localAmount: 0,
      localAmountFormatted: '',
      localCurrency: '',
      fee: 0,
      feeFormatted: '฿0',
      countryCode: 'TH',
      ref1: '',
      ref2: '',
      ref3: '',
      payload: '00000000000000000000000000000000000000000000000000000000000',
      senderName: 'นาย ธันเดอร์ มานะ',
      senderNameEn: 'MR. THUNDER MANA',
      senderBank: 'กสิกรไทย',
      senderBankCode: 'KBANK',
      senderBankId: '001',
      senderAccount: '1234xxxx5678',
      senderAccountType: 'BANKAC',
      receiverName: 'นาย ธันเดอร์ มานะ',
      receiverNameEn: '',
      receiverBank: 'ธนาคารออมสิน',
      receiverBankCode: 'GSB',
      receiverBankId: '030',
      receiverAccount: '12xxxx3456',
      receiverAccountNumber: '12xxxx3456',
      receiverAccountType: 'BANKAC',
      receiverProxyType: 'EWALLETID',
      receiverProxyAccount: '123xxxxxxxx4567',
      date: '24 ธ.ค. 2568',
      time: '09:41',
      transRef: '68370160657749I376388B35',
    };

    return {
      flex: this.generateFlexMessage(template, sampleData),
      text: this.generateTextMessage(template, sampleData),
    };
  }

  /**
   * Create default templates for a LINE account
   */
  async createDefaultTemplates(lineAccountId: string, ownerId?: string): Promise<void> {
    const defaults = [
      {
        name: 'Default Success',
        type: TemplateType.SUCCESS,
        isDefault: true,
        headerText: '✅ ตรวจสอบสลิปสำเร็จ',
        primaryColor: '#00C851',
      },
      {
        name: 'Default Duplicate',
        type: TemplateType.DUPLICATE,
        isDefault: true,
        headerText: '⚠️ สลิปซ้ำ',
        primaryColor: '#FF8800',
      },
      {
        name: 'Default Error',
        type: TemplateType.ERROR,
        isDefault: true,
        headerText: '❌ ตรวจสอบไม่สำเร็จ',
        primaryColor: '#FF4444',
      },
    ];

    for (const def of defaults) {
      await this.slipTemplateModel.create({
        lineAccountId: new Types.ObjectId(lineAccountId),
        ownerId: ownerId ? new Types.ObjectId(ownerId) : undefined,
        ...def,
      });
    }
  }

  /**
   * Create default global templates (Auto-called on startup)
   * Only creates templates for types that don't have a global default yet
   */
  async createDefaultGlobalTemplates(ownerId?: string): Promise<void> {
    const defaults = [
      {
        name: '✅ สลิปถูกต้อง (Global)',
        description: 'Template มาตรฐานสำหรับสลิปที่ตรวจสอบสำเร็จ',
        type: TemplateType.SUCCESS,
        isDefault: true,
        headerText: '✅ ตรวจสอบสลิปสำเร็จ',
        footerText: 'ขอบคุณที่ใช้บริการ',
        primaryColor: '#00C851',
      },
      {
        name: '⚠️ สลิปซ้ำ (Global)',
        description: 'Template มาตรฐานสำหรับสลิปที่ถูกใช้แล้ว',
        type: TemplateType.DUPLICATE,
        isDefault: true,
        headerText: '⚠️ พบสลิปซ้ำ',
        footerText: 'สลิปนี้ถูกใช้ไปแล้ว กรุณาใช้สลิปใหม่',
        primaryColor: '#FF8800',
      },
      {
        name: '❌ ตรวจสอบไม่สำเร็จ (Global)',
        description: 'Template มาตรฐานสำหรับสลิปที่ตรวจสอบไม่ผ่าน',
        type: TemplateType.ERROR,
        isDefault: true,
        headerText: '❌ ตรวจสอบไม่สำเร็จ',
        footerText: 'กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแล',
        primaryColor: '#FF4444',
      },
      {
        name: '🔍 ไม่พบข้อมูล (Global)',
        description: 'Template มาตรฐานสำหรับไม่พบข้อมูลสลิป',
        type: TemplateType.NOT_FOUND,
        isDefault: true,
        headerText: '🔍 ไม่พบข้อมูลสลิป',
        footerText: 'กรุณาตรวจสอบสลิปและลองใหม่อีกครั้ง',
        primaryColor: '#999999',
      },
    ];

    let createdCount = 0;

    for (const def of defaults) {
      // Check if this type already has a global default
      const existing = await this.slipTemplateModel.findOne({
        isGlobal: true,
        type: def.type,
        isDefault: true,
        isActive: true,
      });

      if (existing) {
        this.logger.debug(`Global default template already exists for type ${def.type}`);
        continue;
      }

      await this.slipTemplateModel.create({
        ownerId: ownerId ? new Types.ObjectId(ownerId) : undefined,
        isGlobal: true,
        isSystemTemplate: true,
        isActive: true,
        ...def,
      });
      createdCount++;
      this.logger.log(`Created global default template for type ${def.type}`);
    }

    if (createdCount > 0) {
      this.logger.log(`Created ${createdCount} default global template(s)`);
    }
  }

  /**
   * Reset global templates - delete ALL global templates and recreate fresh defaults
   * Use this when templates are corrupted beyond repair
   */
  async resetGlobalTemplates(): Promise<{ deletedCount: number; createdCount: number; message: string }> {
    this.logger.log('[RESET] Starting global templates reset...');

    // Delete ALL global templates
    const deleteResult = await this.slipTemplateModel.deleteMany({ isGlobal: true });
    this.logger.log(`[RESET] Deleted ${deleteResult.deletedCount} global templates`);

    // Also delete orphaned templates (no lineAccountId and not properly flagged)
    const orphanedResult = await this.slipTemplateModel.deleteMany({
      lineAccountId: { $exists: false },
    });
    this.logger.log(`[RESET] Deleted ${orphanedResult.deletedCount} orphaned templates`);

    // Recreate default global templates
    const defaults = [
      {
        name: '✅ สลิปถูกต้อง (Global)',
        description: 'Template มาตรฐานสำหรับสลิปที่ตรวจสอบสำเร็จ',
        type: TemplateType.SUCCESS,
        isDefault: true,
        headerText: '✅ ตรวจสอบสลิปสำเร็จ',
        footerText: 'ขอบคุณที่ใช้บริการ',
        primaryColor: '#00C851',
        isGlobal: true,
        isSystemTemplate: true,
        isActive: true,
      },
      {
        name: '⚠️ สลิปซ้ำ (Global)',
        description: 'Template มาตรฐานสำหรับสลิปที่ถูกใช้แล้ว',
        type: TemplateType.DUPLICATE,
        isDefault: true,
        headerText: '⚠️ พบสลิปซ้ำ',
        footerText: 'สลิปนี้ถูกใช้ไปแล้ว กรุณาใช้สลิปใหม่',
        primaryColor: '#FF8800',
        isGlobal: true,
        isSystemTemplate: true,
        isActive: true,
      },
      {
        name: '❌ ตรวจสอบไม่สำเร็จ (Global)',
        description: 'Template มาตรฐานสำหรับสลิปที่ตรวจสอบไม่ผ่าน',
        type: TemplateType.ERROR,
        isDefault: true,
        headerText: '❌ ตรวจสอบไม่สำเร็จ',
        footerText: 'กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแล',
        primaryColor: '#FF4444',
        isGlobal: true,
        isSystemTemplate: true,
        isActive: true,
      },
      {
        name: '🔍 ไม่พบข้อมูล (Global)',
        description: 'Template มาตรฐานสำหรับไม่พบข้อมูลสลิป',
        type: TemplateType.NOT_FOUND,
        isDefault: true,
        headerText: '🔍 ไม่พบข้อมูลสลิป',
        footerText: 'กรุณาตรวจสอบสลิปและลองใหม่อีกครั้ง',
        primaryColor: '#999999',
        isGlobal: true,
        isSystemTemplate: true,
        isActive: true,
      },
    ];

    let createdCount = 0;
    for (const def of defaults) {
      await this.slipTemplateModel.create(def);
      createdCount++;
      this.logger.log(`[RESET] Created template: ${def.name}`);
    }

    const message = `Reset complete. Deleted ${deleteResult.deletedCount + orphanedResult.deletedCount} templates, created ${createdCount} new templates`;
    this.logger.log(`[RESET] ${message}`);

    return {
      deletedCount: deleteResult.deletedCount + orphanedResult.deletedCount,
      createdCount,
      message,
    };
  }

  /**
   * Repair global templates - restore flags and ensure templates are properly configured
   * This fixes templates that were updated before the preserve-flags fix
   */
  async repairGlobalTemplates(): Promise<{ repairedCount: number; totalGlobalCount: number; message: string; details: string[] }> {
    this.logger.log('[REPAIR] Starting global templates repair...');
    const details: string[] = [];

    // Step 0: Delete templates with suspicious/invalid names (likely corrupted)
    const suspiciousTemplates = await this.slipTemplateModel.find({
      isGlobal: true,
      $or: [
        { name: { $regex: /^[0-9]+$/ } }, // Names that are just numbers
        { name: { $exists: false } },
        { name: '' },
        { name: null },
      ],
    });

    if (suspiciousTemplates.length > 0) {
      for (const template of suspiciousTemplates) {
        this.logger.warn(`[REPAIR] Deleting suspicious template: name="${template.name}", type=${template.type}, id=${template._id}`);
        await this.slipTemplateModel.findByIdAndDelete(template._id);
        details.push(`Deleted suspicious template: "${template.name}" (${template.type})`);
      }
    }

    // Step 1: Fix templates that should be global but aren't
    const brokenTemplates = await this.slipTemplateModel.find({
      $and: [
        {
          $or: [
            { isSystemTemplate: true },
            { isDefault: true, lineAccountId: { $exists: false } },
          ],
        },
        {
          $or: [
            { isGlobal: false },
            { isGlobal: { $exists: false } },
          ],
        },
      ],
    });

    let repairedCount = 0;
    for (const template of brokenTemplates) {
      this.logger.log(`[REPAIR] Fixing isGlobal for template: ${template.name} (ID: ${template._id})`);
      await this.slipTemplateModel.findByIdAndUpdate(template._id, {
        isGlobal: true,
        isActive: true,
      });
      details.push(`Fixed isGlobal for "${template.name}"`);
      repairedCount++;
    }

    // Step 2: Fix templates without lineAccountId that aren't marked as global
    const orphanedResult = await this.slipTemplateModel.updateMany(
      {
        lineAccountId: { $exists: false },
        isGlobal: { $ne: true },
      },
      {
        $set: { isGlobal: true, isActive: true },
      }
    );
    if (orphanedResult.modifiedCount > 0) {
      details.push(`Fixed ${orphanedResult.modifiedCount} orphaned templates`);
      repairedCount += orphanedResult.modifiedCount;
    }

    // Step 3: Ensure all global templates are active
    const inactiveResult = await this.slipTemplateModel.updateMany(
      {
        isGlobal: true,
        isActive: { $ne: true },
      },
      {
        $set: { isActive: true },
      }
    );
    if (inactiveResult.modifiedCount > 0) {
      details.push(`Activated ${inactiveResult.modifiedCount} inactive global templates`);
      repairedCount += inactiveResult.modifiedCount;
    }

    // Step 4: Check if we have default templates for all types, create if missing
    const requiredTypes = [TemplateType.SUCCESS, TemplateType.DUPLICATE, TemplateType.ERROR, TemplateType.NOT_FOUND];
    for (const type of requiredTypes) {
      const hasTemplate = await this.slipTemplateModel.findOne({
        isGlobal: true,
        type,
        isActive: true,
      });

      if (!hasTemplate) {
        this.logger.log(`[REPAIR] No template found for type ${type}, creating default...`);
        details.push(`Created default template for type "${type}"`);
      }
    }

    // Create default templates if missing
    await this.createDefaultGlobalTemplates();

    // Step 5: Set isDefault on first template of each type if none has isDefault
    for (const type of requiredTypes) {
      const hasDefault = await this.slipTemplateModel.findOne({
        isGlobal: true,
        type,
        isDefault: true,
        isActive: true,
      });

      if (!hasDefault) {
        const firstTemplate = await this.slipTemplateModel.findOne({
          isGlobal: true,
          type,
          isActive: true,
        }).sort({ createdAt: 1 });

        if (firstTemplate) {
          await this.slipTemplateModel.findByIdAndUpdate(firstTemplate._id, {
            isDefault: true,
          });
          details.push(`Set "${firstTemplate.name}" as default for type "${type}"`);
          repairedCount++;
        }
      }
    }

    // Get final count
    const totalGlobalCount = await this.slipTemplateModel.countDocuments({ isGlobal: true, isActive: true });

    const message = repairedCount > 0
      ? `Repaired ${repairedCount} issues. Total global templates: ${totalGlobalCount}`
      : `No issues found. Total global templates: ${totalGlobalCount}`;

    this.logger.log(`[REPAIR] ${message}`);
    this.logger.log(`[REPAIR] Details: ${details.join('; ')}`);

    return {
      repairedCount,
      totalGlobalCount,
      message,
      details,
    };
  }

  /**
   * Debug: Get all templates with their flags for troubleshooting
   */
  async debugGetAllTemplates(): Promise<{
    total: number;
    globalActiveCount: number;
    byType: Record<string, number>;
    templates: Array<{
      _id: string;
      name: string;
      type: string;
      isGlobal: boolean;
      isActive: boolean;
      isDefault: boolean;
      isSystemTemplate: boolean;
      lineAccountId?: string;
    }>;
    issues: string[];
  }> {
    const allTemplates = await this.slipTemplateModel.find({}).lean();
    const globalActiveTemplates = await this.slipTemplateModel.find({ isGlobal: true, isActive: true }).lean();

    const byType: Record<string, number> = {
      success: 0,
      duplicate: 0,
      error: 0,
      not_found: 0,
    };

    const issues: string[] = [];
    const templates = allTemplates.map((t: any) => {
      // Count by type for global active templates
      if (t.isGlobal && t.isActive) {
        byType[t.type] = (byType[t.type] || 0) + 1;
      }

      // Check for issues
      if (!t.isGlobal && !t.lineAccountId) {
        issues.push(`Template "${t.name}" (${t._id}) has no lineAccountId and is not global`);
      }
      if (t.isGlobal && !t.isActive) {
        issues.push(`Global template "${t.name}" (${t._id}) is not active`);
      }
      if (t.isDefault === undefined) {
        issues.push(`Template "${t.name}" (${t._id}) has undefined isDefault`);
      }

      return {
        _id: t._id.toString(),
        name: t.name,
        type: t.type,
        isGlobal: t.isGlobal ?? false,
        isActive: t.isActive ?? false,
        isDefault: t.isDefault ?? false,
        isSystemTemplate: t.isSystemTemplate ?? false,
        lineAccountId: t.lineAccountId?.toString(),
      };
    });

    // Check if we have all required types
    const requiredTypes = ['success', 'duplicate', 'error', 'not_found'];
    for (const type of requiredTypes) {
      if (byType[type] === 0) {
        issues.push(`No active global template for type: ${type}`);
      }
    }

    this.logger.log(`[DEBUG] Total templates: ${allTemplates.length}, Global active: ${globalActiveTemplates.length}`);
    this.logger.log(`[DEBUG] By type: ${JSON.stringify(byType)}`);
    if (issues.length > 0) {
      this.logger.warn(`[DEBUG] Issues found: ${issues.join('; ')}`);
    }

    return {
      total: allTemplates.length,
      globalActiveCount: globalActiveTemplates.length,
      byType,
      templates,
      issues,
    };
  }

  private extractVariables(
    flexTemplate?: Record<string, any>,
    textTemplate?: string,
  ): string[] {
    const variables = new Set<string>();
    const regex = /\{\{(\w+)\}\}/g;

    if (textTemplate) {
      let match;
      while ((match = regex.exec(textTemplate)) !== null) {
        variables.add(match[1]);
      }
    }

    if (flexTemplate) {
      const jsonStr = JSON.stringify(flexTemplate);
      let match;
      while ((match = regex.exec(jsonStr)) !== null) {
        variables.add(match[1]);
      }
    }

    return Array.from(variables);
  }

  private replaceVariables(template: any, data: SlipData): any {
    const jsonStr = JSON.stringify(template);
    const replaced = jsonStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return (data as any)[key] || '';
    });
    return JSON.parse(replaced);
  }

  private replaceTextVariables(template: string, data: SlipData): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return (data as any)[key] || '';
    });
  }

  private generateDefaultFlexMessage(template: SlipTemplateDocument, data: SlipData): any {
    // Get theme preset or use default based on template type
    const themeKey = template.themePreset ||
      (template.type === 'duplicate' ? 'duplicate' :
        template.type === 'error' ? 'error' : 'default');
    const theme = THEME_PRESETS[themeKey as keyof typeof THEME_PRESETS] || THEME_PRESETS.default;

    // Apply template overrides over theme defaults
    const headerBgColor = template.headerBackgroundColor || theme.headerBackgroundColor;
    const headerTextColor = template.headerTextColor || theme.headerTextColor;
    const amountColor = template.amountColor || template.primaryColor || theme.amountColor;
    const bodyBgColor = template.bodyBackgroundColor || theme.bodyBackgroundColor;
    const cardBgColor = template.cardBackgroundColor || theme.cardBackgroundColor;
    const cardBorderColor = template.cardBorderColor || theme.cardBorderColor;

    const isDuplicate = data.isDuplicate || template.type === 'duplicate';
    const isError = template.type === 'error';

    // Default header icons
    const headerIcon = template.headerIcon === 'warning' ? '⚠️' :
      template.headerIcon === 'error' ? '❌' :
        template.headerIcon === 'info' ? 'ℹ️' :
          isDuplicate ? '⚠️' : isError ? '❌' : '✓';

    const headerText = template.headerText ||
      (isDuplicate ? 'สลิปนี้ถูกใช้งานไปแล้ว' :
        isError ? 'ตรวจสอบไม่สำเร็จ' : 'สลิปถูกต้อง');

    const contents: any[] = [];

    // Header with icon
    contents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: headerIcon,
              color: headerTextColor,
              size: 'lg',
              weight: 'bold',
              align: 'center',
            },
          ],
          width: '30px',
          height: '30px',
          backgroundColor: amountColor,
          cornerRadius: '15px',
          justifyContent: 'center',
          alignItems: 'center',
        },
        {
          type: 'text',
          text: headerText,
          weight: 'bold',
          size: 'lg',
          color: amountColor,
          margin: 'md',
          flex: 1,
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: isDuplicate ? '!' : '✓',
              color: '#FFFFFF',
              size: 'xs',
              align: 'center',
            },
          ],
          width: '20px',
          height: '20px',
          backgroundColor: amountColor,
          cornerRadius: '10px',
          justifyContent: 'center',
          alignItems: 'center',
        },
      ],
      backgroundColor: headerBgColor,
      paddingAll: '12px',
      cornerRadius: '12px',
    });

    // For duplicate/error/not_found templates without data, add descriptive message
    const isNotFound = template.type === 'not_found';
    const hasNoData = !data.amountFormatted && !data.senderName && !data.receiverName;

    // Only force generic message for error/not_found types when no data
    // For duplicate, allow rendering the template structure even without data (using placeholders)
    if ((isError || isNotFound) && hasNoData) {
      // Add descriptive message when no slip data is available
      const messageText = template.footerText || (
        isError ? 'เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง' :
          'ไม่พบข้อมูลสลิปในระบบ กรุณาตรวจสอบสลิปอีกครั้ง'
      );

      contents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'lg',
        paddingAll: '16px',
        backgroundColor: isError ? '#FFEBEE' : '#F5F5F5',
        cornerRadius: '12px',
        contents: [
          {
            type: 'text',
            text: messageText,
            size: 'sm',
            color: isError ? '#C62828' : '#616161',
            wrap: true,
            align: 'center',
          },
        ],
      });

      // Skip amount/sender/receiver sections and go directly to footer
    }

    // Amount Section
    if (template.showAmount && (data.amountFormatted || isDuplicate)) {
      contents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: data.amountFormatted || '฿0.00',
            size: 'xxl',
            weight: 'bold',
            color: amountColor,
            align: 'center',
          },
          (template.showDate || template.showTime)
            ? {
              type: 'text',
              text: [
                template.showDate ? (data.date || isDuplicate ? (data.date || '-') : null) : null,
                template.showTime ? (data.time || isDuplicate ? (data.time || '-') : null) : null,
              ].filter(Boolean).join(' • '),
              size: 'xs',
              color: '#888888',
              align: 'center',
              margin: 'sm',
            }
            : { type: 'text', text: ' ', size: 'xxs', color: '#FFFFFF' },
        ],
        margin: 'lg',
        paddingAll: '10px',
      });
    }

    // Date/time row (when amount is hidden)
    if (!template.showAmount && (template.showDate || template.showTime)) {
      contents.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'วันที่/เวลา', size: 'xs', color: '#888888', flex: 2 },
          {
            type: 'text',
            text: [
              template.showDate ? (data.date || '-') : null,
              template.showTime ? (data.time || '-') : null,
            ].filter(Boolean).join(' • ') || '-',
            size: 'xs',
            color: '#333333',
            flex: 4,
            align: 'end',
            wrap: true,
          },
        ],
        margin: 'md',
        paddingAll: '8px',
        backgroundColor: '#F5F5F5',
        cornerRadius: '8px',
      });
    }

    // Sender info with bank logo
    if (template.showSender && (data.senderName || isDuplicate)) {
      const senderAccountLines: string[] = [];
      if ((template as any).showSenderAccount) {
        senderAccountLines.push(data.senderAccount || (isDuplicate ? '-' : ''));
      }
      if ((template as any).showSenderNameEn && data.senderNameEn) {
        senderAccountLines.push(data.senderNameEn);
      }
      contents.push(this.createBankInfoBox(
        'ผู้โอน',
        data.senderName || (isDuplicate ? '-' : ''),
        senderAccountLines.join(' • ') || data.senderBank || (isDuplicate ? '-' : ''),
        data.senderBank || '',
        data.senderBankLogoUrl,
        template.showBankLogo,
      ));
    }

    // Receiver info with bank logo
    if (template.showReceiver && (data.receiverName || isDuplicate)) {
      const receiverAccountLines: string[] = [];
      if ((template as any).showReceiverAccount) {
        receiverAccountLines.push(data.receiverAccount || (isDuplicate ? '-' : ''));
      }
      if ((template as any).showReceiverNameEn && data.receiverNameEn) {
        receiverAccountLines.push(data.receiverNameEn);
      }
      if (template.showReceiverProxy && data.receiverProxyType && data.receiverProxyAccount) {
        receiverAccountLines.push(`${data.receiverProxyType}: ${data.receiverProxyAccount}`);
      }
      contents.push(this.createBankInfoBox(
        'ผู้รับ',
        data.receiverName || (isDuplicate ? '-' : ''),
        receiverAccountLines.join(' • ') || data.receiverBank || (isDuplicate ? '-' : ''),
        data.receiverBank || '',
        data.receiverBankLogoUrl,
        template.showBankLogo,
      ));
    }

    // Transaction reference
    if (template.showTransRef && (data.transRef || isDuplicate)) {
      contents.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'เลขอ้างอิง:', size: 'xs', color: '#888888', flex: 2 },
          { type: 'text', text: data.transRef || '-', size: 'xs', color: '#333333', flex: 4, align: 'end' },
        ],
        margin: 'md',
        paddingAll: '8px',
        backgroundColor: '#F5F5F5',
        cornerRadius: '8px',
      });
    }

    // Extended fields
    const extraRows: any[] = [];
    if ((template as any).showLocalAmount && data.localAmountFormatted) {
      extraRows.push(this.createInfoRow('จำนวนเงิน (สกุลท้องถิ่น)', `${data.localAmountFormatted} ${data.localCurrency || ''}`));
    }
    if (template.showCountryCode) extraRows.push(this.createInfoRow('ประเทศ', data.countryCode || '-'));
    if (template.showFee) extraRows.push(this.createInfoRow('ค่าธรรมเนียม', data.feeFormatted || (data.fee !== undefined ? String(data.fee) : '-')));
    if (template.showRefs) {
      if (data.ref1) extraRows.push(this.createInfoRow('Ref1', data.ref1));
      if (data.ref2) extraRows.push(this.createInfoRow('Ref2', data.ref2));
      if (data.ref3) extraRows.push(this.createInfoRow('Ref3', data.ref3));
    }
    if (template.showSenderBankId) extraRows.push(this.createInfoRow('ธนาคารผู้โอน (ID)', data.senderBankId || '-'));
    if (template.showReceiverBankId) extraRows.push(this.createInfoRow('ธนาคารผู้รับ (ID)', data.receiverBankId || '-'));
    if (template.showPayload) extraRows.push(this.createInfoRow('Payload', (data.payload || '').toString().slice(0, 32) + ((data.payload && data.payload.length > 32) ? '…' : '') || '-'));

    if (extraRows.length > 0) {
      contents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'รายละเอียดเพิ่มเติม', size: 'xs', weight: 'bold', color: '#666666' },
          { type: 'separator', margin: 'sm' },
          ...extraRows.map((r) => ({ ...r, margin: 'sm' })),
        ],
        margin: 'lg',
        paddingAll: '12px',
        backgroundColor: '#FAFAFA',
        cornerRadius: '12px',
      });
    }

    // Duplicate warning with delay info
    if (data.isDuplicate) {
      const warningContents: any[] = [
        {
          type: 'text',
          text: '⚠️ สลิปนี้ถูกใช้งานไปแล้ว',
          size: 'sm',
          color: '#FFFFFF',
          weight: 'bold',
          align: 'center',
        },
      ];

      if (template.showDelayWarning && data.delayMinutes !== undefined) {
        warningContents.push({
          type: 'text',
          text: `ตรวจสอบช้า ${data.delayMinutes} นาที`,
          size: 'xs',
          color: '#FFE0B2',
          align: 'center',
          margin: 'sm',
        });
      }

      if (data.originalDate) {
        warningContents.push({
          type: 'text',
          text: `บันทึกเมื่อ ${data.originalDate}`,
          size: 'xxs',
          color: '#FFE0B2',
          align: 'center',
          margin: 'xs',
        });
      }

      contents.push({
        type: 'box',
        layout: 'vertical',
        contents: warningContents,
        margin: 'md',
        paddingAll: '12px',
        backgroundColor: '#FF6B00',
        cornerRadius: '8px',
      });
    }

    // Footer with optional link
    if (template.footerText || template.footerLink) {
      const footerContents: any[] = [];

      if (template.footerText) {
        footerContents.push({
          type: 'text',
          text: template.footerText,
          size: 'xxs',
          color: '#888888',
          wrap: true,
          align: 'center',
        });
      }

      // SECURITY: Validate URI at render time to prevent invalid Flex Message
      if (template.footerLink && template.footerLinkText) {
        const trimmedLink = template.footerLink.trim();
        // Only add action if URI is valid (starts with https:// or tel:)
        if (trimmedLink && (trimmedLink.startsWith('https://') || trimmedLink.startsWith('tel:'))) {
          footerContents.push({
            type: 'text',
            text: template.footerLinkText,
            size: 'xxs',
            color: '#0066CC',
            align: 'center',
            margin: template.footerText ? 'sm' : 'none',
            action: {
              type: 'uri',
              uri: trimmedLink,
            },
          });
        } else if (template.footerLinkText) {
          // Show link text without action if URI is invalid
          footerContents.push({
            type: 'text',
            text: template.footerLinkText,
            size: 'xxs',
            color: '#888888',
            align: 'center',
            margin: template.footerText ? 'sm' : 'none',
          });
        }
      }

      contents.push({
        type: 'box',
        layout: 'vertical',
        contents: footerContents,
        margin: 'lg',
        paddingAll: '10px',
        backgroundColor: '#F0F0F0',
        cornerRadius: '8px',
      });
    }

    return {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents,
        paddingAll: '16px',
        backgroundColor: '#FFFFFF',
      },
    };
  }

  private createBankInfoBox(
    label: string,
    name: string,
    account: string,
    bankName: string,
    logoUrl?: string,
    showLogo?: boolean,
  ): any {
    const contents: any[] = [];

    // Validate logo URL: LINE Flex only accepts https:// URLs with max 2000 chars
    const isValidLogoUrl = logoUrl &&
      logoUrl.startsWith('https://') &&
      logoUrl.length <= 2000;

    // Bank logo or placeholder
    if (showLogo && isValidLogoUrl) {
      contents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'image',
            url: logoUrl,
            size: 'xxs',
            aspectMode: 'cover',
            aspectRatio: '1:1',
          },
        ],
        width: '40px',
        height: '40px',
        cornerRadius: '8px',
        backgroundColor: '#F5F5F5',
        justifyContent: 'center',
        alignItems: 'center',
      });
    } else {
      contents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: bankName ? bankName.substring(0, 2) : '🏦',
            size: 'sm',
            color: '#666666',
            align: 'center',
          },
        ],
        width: '40px',
        height: '40px',
        cornerRadius: '8px',
        backgroundColor: '#E8F5E9',
        justifyContent: 'center',
        alignItems: 'center',
      });
    }

    // Info text
    contents.push({
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: label, size: 'xxs', color: '#888888' },
        { type: 'text', text: name, size: 'sm', color: '#333333', weight: 'bold' },
        { type: 'text', text: account || bankName || '', size: 'xs', color: '#666666' },
      ],
      flex: 1,
      margin: 'md',
    });

    return {
      type: 'box',
      layout: 'horizontal',
      contents,
      margin: 'md',
      paddingAll: '12px',
      backgroundColor: '#FAFAFA',
      cornerRadius: '12px',
    };
  }

  private createInfoRow(label: string, value: string): any {
    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: label, size: 'sm', color: '#666666', flex: 2 },
        { type: 'text', text: value || '-', size: 'sm', color: '#333333', flex: 3, wrap: true },
      ],
    };
  }

  private generateDefaultTextMessage(template: SlipTemplateDocument, data: SlipData): string {
    const lines: string[] = [];

    lines.push(template.headerText || '✅ ตรวจสอบสลิปสำเร็จ');
    lines.push('');

    if (template.showAmount && data.amountFormatted) {
      lines.push(`💰 จำนวนเงิน: ${data.amountFormatted}`);
    }
    if ((template as any).showLocalAmount && data.localAmountFormatted) {
      lines.push(`💱 สกุลท้องถิ่น: ${data.localAmountFormatted} ${data.localCurrency || ''}`);
    }
    if (template.showDate && data.date) {
      lines.push(`📅 วันที่: ${data.date}`);
    }
    if (template.showTime && data.time) {
      lines.push(`⏰ เวลา: ${data.time}`);
    }
    if (template.showSender && data.senderName) {
      lines.push(`👤 ผู้โอน: ${data.senderName}`);
      if ((template as any).showSenderNameEn && data.senderNameEn) {
        lines.push(`   (${data.senderNameEn})`);
      }
      if (data.senderBank) {
        lines.push(`🏦 ธนาคาร: ${data.senderBank}`);
      }
      if ((template as any).showSenderAccount && data.senderAccount) {
        lines.push(`📝 เลขบัญชี: ${data.senderAccount}`);
      }
    }
    if (template.showReceiver && data.receiverName) {
      lines.push(`👤 ผู้รับ: ${data.receiverName}`);
      if ((template as any).showReceiverNameEn && data.receiverNameEn) {
        lines.push(`   (${data.receiverNameEn})`);
      }
      if ((template as any).showReceiverAccount && data.receiverAccount) {
        lines.push(`📝 เลขบัญชี: ${data.receiverAccount}`);
      }
      if (template.showReceiverProxy && data.receiverProxyType && data.receiverProxyAccount) {
        lines.push(`🔗 Proxy: ${data.receiverProxyType} ${data.receiverProxyAccount}`);
      }
    }
    if (template.showTransRef && data.transRef) {
      lines.push(`🔖 เลขอ้างอิง: ${data.transRef}`);
    }

    if (template.showCountryCode) {
      lines.push(`🌍 ประเทศ: ${data.countryCode || '-'}`);
    }
    if (template.showFee) {
      lines.push(`💸 ค่าธรรมเนียม: ${data.feeFormatted || (data.fee !== undefined ? String(data.fee) : '-')}`);
    }
    if (template.showRefs) {
      if (data.ref1) lines.push(`Ref1: ${data.ref1}`);
      if (data.ref2) lines.push(`Ref2: ${data.ref2}`);
      if (data.ref3) lines.push(`Ref3: ${data.ref3}`);
    }
    if (template.showSenderBankId) {
      lines.push(`ธนาคารผู้โอน (ID): ${data.senderBankId || '-'}`);
    }
    if (template.showReceiverBankId) {
      lines.push(`ธนาคารผู้รับ (ID): ${data.receiverBankId || '-'}`);
    }
    if (template.showPayload) {
      const payload = (data.payload || '').toString();
      lines.push(`Payload: ${payload.slice(0, 64)}${payload.length > 64 ? '…' : ''}`);
    }

    if (template.footerText) {
      lines.push('');
      lines.push(template.footerText);
    }

    return lines.join('\n');
  }

  /**
   * Select a global template for a LINE account (save preference)
   */
  async selectGlobalTemplateForAccount(
    lineAccountId: string,
    type: TemplateType,
    templateId: string,
  ): Promise<void> {
    const template = await this.slipTemplateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.type !== type) {
      throw new BadRequestException(`Template type mismatch. Expected ${type}, got ${template.type}`);
    }

    // Verify account exists
    const account = await this.lineAccountModel.findById(lineAccountId);
    if (!account) {
      throw new NotFoundException('LINE Account not found');
    }

    // Update setting using dot notation for the specific key in the Record
    const updatePath = `settings.slipTemplateIds.${type}`;

    await this.lineAccountModel.findByIdAndUpdate(lineAccountId, {
      $set: { [updatePath]: templateId }
    });
  }

  /**
   * Get selected template IDs for a LINE account
   */
  async getSelectedTemplatesForAccount(lineAccountId: string): Promise<Record<string, string>> {
    const account = await this.lineAccountModel.findById(lineAccountId).select('settings.slipTemplateIds').lean();
    return account?.settings?.slipTemplateIds || {};
  }
}
