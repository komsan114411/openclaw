import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SlipTemplate,
  SlipTemplateDocument,
  TemplateType,
} from '../database/schemas/slip-template.schema';

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
  headerText?: string;
  footerText?: string;
  showAmount?: boolean;
  showSender?: boolean;
  showReceiver?: boolean;
  showDate?: boolean;
  showTime?: boolean;
  showTransRef?: boolean;
  showBankLogo?: boolean;
  isGlobal?: boolean;
  isSystemTemplate?: boolean;
}

export interface SlipData {
  amount?: number;
  amountFormatted?: string;
  senderName?: string;
  senderBank?: string;
  receiverName?: string;
  receiverBank?: string;
  receiverAccountNumber?: string;
  date?: string;
  time?: string;
  transRef?: string;
}

@Injectable()
export class SlipTemplatesService {
  private readonly logger = new Logger(SlipTemplatesService.name);

  constructor(
    @InjectModel(SlipTemplate.name) private slipTemplateModel: Model<SlipTemplateDocument>,
  ) {}

  /**
   * Create a new slip template
   */
  async create(dto: CreateTemplateDto): Promise<SlipTemplateDocument> {
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
      headerText: dto.headerText,
      footerText: dto.footerText,
      showAmount: dto.showAmount ?? true,
      showSender: dto.showSender ?? true,
      showReceiver: dto.showReceiver ?? true,
      showDate: dto.showDate ?? true,
      showTime: dto.showTime ?? true,
      showTransRef: dto.showTransRef ?? true,
      showBankLogo: dto.showBankLogo ?? false,
      isGlobal: dto.isGlobal ?? false,
      isSystemTemplate: dto.isSystemTemplate ?? false,
    });

    return template;
  }

  /**
   * Create a global template (Admin only)
   */
  async createGlobalTemplate(dto: Omit<CreateTemplateDto, 'lineAccountId'>): Promise<SlipTemplateDocument> {
    return this.create({
      ...dto,
      isGlobal: true,
      isSystemTemplate: true,
    });
  }

  /**
   * Get all global templates
   */
  async getGlobalTemplates(): Promise<SlipTemplateDocument[]> {
    return this.slipTemplateModel
      .find({ isGlobal: true, isActive: true })
      .sort({ type: 1, isDefault: -1, createdAt: -1 })
      .exec();
  }

  /**
   * Get all global templates (for admin management)
   */
  async getAllGlobalTemplates(): Promise<SlipTemplateDocument[]> {
    return this.slipTemplateModel
      .find({ isGlobal: true })
      .sort({ type: 1, isDefault: -1, createdAt: -1 })
      .exec();
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
   * Update template
   */
  async update(
    templateId: string,
    updates: Partial<CreateTemplateDto>,
  ): Promise<SlipTemplateDocument> {
    const template = await this.slipTemplateModel.findByIdAndUpdate(
      templateId,
      {
        ...updates,
        variables: this.extractVariables(updates.flexTemplate, updates.textTemplate),
      },
      { new: true },
    );

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
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
    if (template.flexTemplate) {
      return this.replaceVariables(template.flexTemplate, slipData);
    }

    // Generate default flex message
    return this.generateDefaultFlexMessage(template, slipData);
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
      amount: 1500,
      amountFormatted: '฿1,500',
      senderName: 'นายทดสอบ ระบบ',
      senderBank: 'กสิกรไทย',
      receiverName: 'บริษัท ทดสอบ จำกัด',
      receiverBank: 'ไทยพาณิชย์',
      receiverAccountNumber: '123-4-56789-0',
      date: '22/12/2567',
      time: '14:30:00',
      transRef: 'TEST123456789',
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
   * Create default global templates (Admin only)
   */
  async createDefaultGlobalTemplates(ownerId?: string): Promise<void> {
    // Check if global templates already exist
    const existingGlobal = await this.slipTemplateModel.findOne({ isGlobal: true });
    if (existingGlobal) {
      this.logger.log('Global templates already exist, skipping creation');
      return;
    }

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

    for (const def of defaults) {
      await this.slipTemplateModel.create({
        ownerId: ownerId ? new Types.ObjectId(ownerId) : undefined,
        isGlobal: true,
        isSystemTemplate: true,
        ...def,
      });
    }

    this.logger.log('Default global templates created successfully');
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
    const contents: any[] = [];

    // Header
    contents.push({
      type: 'text',
      text: template.headerText || '✅ ตรวจสอบสลิปสำเร็จ',
      weight: 'bold',
      size: 'lg',
      color: template.primaryColor || '#00C851',
    });

    contents.push({ type: 'separator', margin: 'md' });

    // Info rows
    const infoBox: any = {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'sm',
      contents: [],
    };

    if (template.showAmount && data.amountFormatted) {
      infoBox.contents.push(this.createInfoRow('จำนวนเงิน', data.amountFormatted));
    }
    if (template.showDate && data.date) {
      infoBox.contents.push(this.createInfoRow('วันที่', data.date));
    }
    if (template.showTime && data.time) {
      infoBox.contents.push(this.createInfoRow('เวลา', data.time));
    }
    if (template.showSender && data.senderName) {
      infoBox.contents.push(this.createInfoRow('ผู้โอน', data.senderName));
      if (data.senderBank) {
        infoBox.contents.push(this.createInfoRow('ธนาคารผู้โอน', data.senderBank));
      }
    }
    if (template.showReceiver && data.receiverName) {
      infoBox.contents.push(this.createInfoRow('ผู้รับ', data.receiverName));
      if (data.receiverBank) {
        infoBox.contents.push(this.createInfoRow('ธนาคารผู้รับ', data.receiverBank));
      }
    }
    if (template.showTransRef && data.transRef) {
      infoBox.contents.push(this.createInfoRow('เลขอ้างอิง', data.transRef));
    }

    contents.push(infoBox);

    // Footer
    if (template.footerText) {
      contents.push({ type: 'separator', margin: 'md' });
      contents.push({
        type: 'text',
        text: template.footerText,
        size: 'xs',
        color: '#888888',
        margin: 'md',
        wrap: true,
      });
    }

    return {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents,
      },
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
    if (template.showDate && data.date) {
      lines.push(`📅 วันที่: ${data.date}`);
    }
    if (template.showTime && data.time) {
      lines.push(`⏰ เวลา: ${data.time}`);
    }
    if (template.showSender && data.senderName) {
      lines.push(`👤 ผู้โอน: ${data.senderName}`);
      if (data.senderBank) {
        lines.push(`🏦 ธนาคาร: ${data.senderBank}`);
      }
    }
    if (template.showReceiver && data.receiverName) {
      lines.push(`👤 ผู้รับ: ${data.receiverName}`);
    }
    if (template.showTransRef && data.transRef) {
      lines.push(`🔖 เลขอ้างอิง: ${data.transRef}`);
    }

    if (template.footerText) {
      lines.push('');
      lines.push(template.footerText);
    }

    return lines.join('\n');
  }
}
