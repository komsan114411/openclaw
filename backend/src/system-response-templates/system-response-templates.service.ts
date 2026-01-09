import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SystemResponseTemplate,
  SystemResponseTemplateDocument,
  SystemResponseType,
  ResponseFormat,
} from '../database/schemas/system-response-template.schema';
import { RedisService } from '../redis/redis.service';

// Default templates configuration (ปรับให้เรียบง่าย)
const DEFAULT_TEMPLATES: Partial<SystemResponseTemplate>[] = [
  // ===== หลัก - ใช้งานจริง =====
  {
    type: SystemResponseType.QUOTA_EXHAUSTED,
    name: 'โควต้าหมด',
    description: 'เมื่อไม่มีโควต้าเหลือหรือใช้หมดแล้ว',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '🔴 โควต้าการตรวจสอบสลิปหมดแล้ว กรุณาติดต่อผู้ดูแลระบบ',
    title: 'โควต้าหมด',
    mainMessage: 'โควต้าการตรวจสอบสลิปหมดแล้ว',
    subMessage: 'กรุณาติดต่อผู้ดูแลระบบเพื่อเติมแพ็คเกจ',
    styling: {
      primaryColor: '#DC2626',
      textColor: '#FFFFFF',
      backgroundColor: '#FEF2F2',
      icon: '🔴',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 1,
  },
  {
    type: SystemResponseType.PACKAGE_EXPIRED,
    name: 'แพ็คเกจหมดอายุ',
    description: 'เมื่อแพ็คเกจหมดอายุแล้ว',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '⏰ แพ็คเกจหมดอายุแล้ว กรุณาต่ออายุหรือซื้อแพ็คเกจใหม่',
    title: 'แพ็คเกจหมดอายุ',
    mainMessage: 'แพ็คเกจของคุณหมดอายุแล้ว',
    subMessage: 'กรุณาต่ออายุหรือซื้อแพ็คเกจใหม่เพื่อใช้งานต่อ',
    styling: {
      primaryColor: '#F59E0B',
      textColor: '#FFFFFF',
      backgroundColor: '#FFFBEB',
      icon: '⏰',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ซื้อแพ็คเกจ',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 2,
  },
  {
    type: SystemResponseType.SLIP_NOT_FOUND,
    name: 'ไม่พบสลิป',
    description: 'เมื่ออ่านสลิปไม่ได้ (รวมทุกกรณี: ไม่พบสลิป, QR ไม่ชัด, รูปไม่ถูกต้อง)',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '❌ ไม่พบสลิปหรือ QR code ในรูปภาพ กรุณาส่งรูปสลิปที่ชัดเจน',
    title: 'ไม่พบสลิป',
    mainMessage: 'ไม่สามารถตรวจสอบสลิปได้',
    subMessage: 'กรุณาถ่ายรูปสลิปให้ชัดเจน โดยให้ QR code อยู่ในกรอบ',
    styling: {
      primaryColor: '#EF4444',
      textColor: '#FFFFFF',
      backgroundColor: '#FEF2F2',
      icon: '❌',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: true,
      retryButtonText: 'ส่งรูปใหม่',
    },
    sortOrder: 3,
  },
  {
    type: SystemResponseType.SYSTEM_ERROR,
    name: 'ข้อผิดพลาดระบบ',
    description: 'เมื่อเกิดข้อผิดพลาดในระบบ',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '⚠️ เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
    title: 'เกิดข้อผิดพลาด',
    mainMessage: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป',
    subMessage: 'กรุณาลองใหม่อีกครั้ง หากยังพบปัญหากรุณาติดต่อผู้ดูแล',
    styling: {
      primaryColor: '#F97316',
      textColor: '#FFFFFF',
      backgroundColor: '#FFF7ED',
      icon: '⚠️',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: true,
      retryButtonText: 'ลองใหม่',
    },
    sortOrder: 4,
  },

  // ===== ตัวเลือก - ผู้ใช้เลือกได้ว่าจะส่งหรือไม่ =====
  {
    type: SystemResponseType.BOT_DISABLED,
    name: 'บอทปิดให้บริการ',
    description: 'เมื่อบอทถูกปิด (แอดมินตั้งค่า, ผู้ใช้เลือกส่ง/ไม่ส่ง)',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '🔴 ระบบบอทปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
    title: 'ปิดให้บริการ',
    mainMessage: 'ระบบบอทปิดให้บริการชั่วคราว',
    subMessage: 'กรุณาติดต่อผู้ดูแลระบบ',
    styling: {
      primaryColor: '#64748B',
      textColor: '#FFFFFF',
      backgroundColor: '#F8FAFC',
      icon: '🔴',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 5,
  },
  {
    type: SystemResponseType.PROCESSING,
    name: 'กำลังประมวลผล',
    description: 'ขณะกำลังตรวจสอบ (ผู้ใช้เลือกส่ง/ไม่ส่ง)',
    responseFormat: ResponseFormat.TEXT,
    textMessage: '⏳ กำลังตรวจสอบสลิป กรุณารอสักครู่...',
    title: 'กำลังตรวจสอบ',
    mainMessage: 'กำลังตรวจสอบสลิป',
    subMessage: 'กรุณารอสักครู่...',
    styling: {
      primaryColor: '#0EA5E9',
      textColor: '#FFFFFF',
      backgroundColor: '#F0F9FF',
      icon: '⏳',
      showIcon: true,
      showContactButton: false,
      contactButtonText: '',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 6,
  },

  // ===== เสริม =====
  // หมายเหตุ: โควต้าใกล้หมดจะแสดงในบล็อกผลสลิปโดยตรง (ไม่ได้ส่งแยก)
  // สลิปซ้ำให้ใช้ Slip Templates (TemplateType.DUPLICATE) แทน
  {
    type: SystemResponseType.SLIP_DISABLED,
    name: 'ระบบตรวจสอบสลิปปิด',
    description: 'เมื่อระบบตรวจสอบสลิปปิดอยู่ (ผู้ใช้เลือกส่ง/ไม่ส่ง)',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
    title: 'ปิดให้บริการ',
    mainMessage: 'ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว',
    subMessage: 'กรุณาติดต่อผู้ดูแลระบบ',
    styling: {
      primaryColor: '#64748B',
      textColor: '#FFFFFF',
      backgroundColor: '#F8FAFC',
      icon: '🔴',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 8,
  },
  {
    type: SystemResponseType.QUOTA_LOW,
    name: 'โควต้าใกล้หมด',
    description: 'เตือนเมื่อโควต้าเหลือน้อย (แสดงในบล็อกผลสลิป)',
    responseFormat: ResponseFormat.TEXT,
    textMessage: '⚠️ โควต้าเหลือน้อย ({remaining} สลิป) กรุณาเติมแพ็คเกจ',
    title: 'โควต้าใกล้หมด',
    mainMessage: 'โควต้าเหลือน้อยแล้ว',
    subMessage: 'เหลือโควต้าอีก {remaining} สลิป',
    styling: {
      primaryColor: '#EAB308',
      textColor: '#000000',
      backgroundColor: '#FEFCE8',
      icon: '⚠️',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'เติมแพ็คเกจ',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 7,
  },
];

@Injectable()
export class SystemResponseTemplatesService {
  private readonly logger = new Logger(SystemResponseTemplatesService.name);
  private readonly CACHE_PREFIX = 'system-response-template';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectModel(SystemResponseTemplate.name)
    private templateModel: Model<SystemResponseTemplateDocument>,
    private redisService: RedisService,
  ) {
    this.ensureDefaultTemplates();
  }

  private async ensureDefaultTemplates(): Promise<void> {
    try {
      for (const template of DEFAULT_TEMPLATES) {
        const exists = await this.templateModel.findOne({ type: template.type });
        if (!exists) {
          await this.templateModel.create({
            ...template,
            isActive: true,
            useCustomTemplate: false,
          });
          this.logger.log(`Created default template: ${template.type}`);
        }
      }
    } catch (error) {
      this.logger.error('Error creating default templates:', error);
    }
  }

  /**
   * Force initialize all default templates (for admin use)
   */
  async initializeDefaults(): Promise<number> {
    let count = 0;
    try {
      for (const template of DEFAULT_TEMPLATES) {
        const exists = await this.templateModel.findOne({ type: template.type });
        if (!exists) {
          await this.templateModel.create({
            ...template,
            isActive: true,
            useCustomTemplate: false,
          });
          count++;
          this.logger.log(`Created default template: ${template.type}`);
        }
      }
      return count;
    } catch (error) {
      this.logger.error('Error initializing default templates:', error);
      throw error;
    }
  }

  async getAll(): Promise<SystemResponseTemplateDocument[]> {
    // First ensure templates exist
    const count = await this.templateModel.countDocuments();
    if (count === 0) {
      await this.initializeDefaults();
    }
    return this.templateModel.find().sort({ sortOrder: 1 });
  }

  async getByType(type: SystemResponseType): Promise<SystemResponseTemplateDocument | null> {
    // Try cache first
    const cacheKey = `cache:${this.CACHE_PREFIX}:${type}`;
    const cached = await this.redisService.getJson<SystemResponseTemplateDocument>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const template = await this.templateModel.findOne({ type });
    if (template) {
      await this.redisService.setJson(cacheKey, template.toObject(), this.CACHE_TTL);
    }

    return template;
  }

  async update(
    type: SystemResponseType,
    updates: Partial<SystemResponseTemplate>,
    updatedBy: string,
  ): Promise<SystemResponseTemplateDocument | null> {
    try {
      const template = await this.templateModel.findOneAndUpdate(
        { type },
        { ...updates, updatedBy },
        { new: true },
      );

      // Invalidate cache
      await this.redisService.invalidateCache(`${this.CACHE_PREFIX}:${type}`);

      return template;
    } catch (error) {
      this.logger.error(`Error updating template ${type}:`, error);
      return null;
    }
  }

  async resetToDefault(type: SystemResponseType, updatedBy: string): Promise<SystemResponseTemplateDocument | null> {
    const defaultTemplate = DEFAULT_TEMPLATES.find((t) => t.type === type);
    if (!defaultTemplate) {
      return null;
    }

    return this.update(type, {
      ...defaultTemplate,
      useCustomTemplate: false,
      customFlexTemplate: undefined,
    }, updatedBy);
  }

  async resetAllToDefault(updatedBy: string): Promise<boolean> {
    try {
      for (const defaultTemplate of DEFAULT_TEMPLATES) {
        await this.update(defaultTemplate.type as SystemResponseType, {
          ...defaultTemplate,
          useCustomTemplate: false,
          customFlexTemplate: undefined,
        }, updatedBy);
      }
      return true;
    } catch (error) {
      this.logger.error('Error resetting all templates:', error);
      return false;
    }
  }

  // Generate Flex Message from template
  generateFlexMessage(template: SystemResponseTemplateDocument, variables?: Record<string, string>): any {
    // If using custom template, return it directly
    if (template.useCustomTemplate && template.customFlexTemplate) {
      return template.customFlexTemplate;
    }

    const styling = template.styling || {};
    const primaryColor = styling.primaryColor || '#FF6B6B';
    const textColor = styling.textColor || '#FFFFFF';
    const bgColor = styling.backgroundColor || '#FFF5F5';

    // Replace variables in messages
    let mainMessage = template.mainMessage || template.textMessage;
    let subMessage = template.subMessage || '';
    let title = template.title || 'แจ้งเตือน';

    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        const pattern = new RegExp(`\\{${key}\\}`, 'g');
        mainMessage = mainMessage.replace(pattern, value);
        subMessage = subMessage.replace(pattern, value);
        title = title.replace(pattern, value);
      });
    }

    // Build footer buttons
    const footerContents: any[] = [];
    
    if (styling.showRetryButton && styling.retryButtonText) {
      footerContents.push({
        type: 'button',
        action: {
          type: 'message',
          label: styling.retryButtonText,
          text: 'ส่งสลิปใหม่',
        },
        style: 'primary',
        color: primaryColor,
        height: 'sm',
      });
    }

    if (styling.showContactButton && styling.contactButtonText) {
      const contactUrl = styling.contactButtonUrl?.trim();
      // Only use URI action if URL is valid (starts with https:// or tel:)
      if (contactUrl && (contactUrl.startsWith('https://') || contactUrl.startsWith('tel:') )) {
        footerContents.push({
          type: 'button',
          action: {
            type: 'uri',
            label: styling.contactButtonText,
            uri: contactUrl,
          },
          style: 'secondary',
          height: 'sm',
        });
      } else {
        footerContents.push({
          type: 'button',
          action: {
            type: 'message',
            label: styling.contactButtonText,
            text: 'ติดต่อผู้ดูแล',
          },
          style: 'secondary',
          height: 'sm',
        });
      }
    }

    const flexMessage: any = {
      type: 'flex',
      altText: title,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                ...(styling.showIcon ? [{
                  type: 'text',
                  text: styling.icon || '❌',
                  size: 'xl',
                  align: 'center',
                  gravity: 'center',
                }] : []),
                {
                  type: 'text',
                  text: title,
                  size: 'lg',
                  weight: 'bold',
                  color: textColor,
                  align: 'center',
                  gravity: 'center',
                  flex: 1,
                },
              ],
              spacing: 'md',
              justifyContent: 'center',
              alignItems: 'center',
            },
          ],
          backgroundColor: primaryColor,
          paddingAll: '15px',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: mainMessage,
              size: 'md',
              color: '#333333',
              wrap: true,
              align: 'center',
              weight: 'bold',
            },
            ...(subMessage ? [{
              type: 'text',
              text: subMessage,
              size: 'sm',
              color: '#666666',
              wrap: true,
              align: 'center',
              margin: 'md',
            }] : []),
          ],
          paddingAll: '20px',
          backgroundColor: bgColor,
        },
        ...(footerContents.length > 0 ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: footerContents,
            spacing: 'sm',
            paddingAll: '15px',
          },
        } : {}),
      },
    };

    return flexMessage;
  }

  // Get response message (text or flex) based on template settings
  async getResponse(
    type: SystemResponseType,
    variables?: Record<string, string>,
  ): Promise<{ type: 'text' | 'flex'; message: any }> {
    const template = await this.getByType(type);

    if (!template || !template.isActive) {
      // Return default text if template not found
      const defaultTemplate = DEFAULT_TEMPLATES.find((t) => t.type === type);
      return {
        type: 'text',
        message: defaultTemplate?.textMessage || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      };
    }

    if (template.responseFormat === ResponseFormat.TEXT) {
      let textMessage = template.textMessage;
      if (variables) {
        Object.entries(variables).forEach(([key, value]) => {
          const pattern = new RegExp(`\\{${key}\\}`, 'g');
          textMessage = textMessage.replace(pattern, value);
        });
      }
      return { type: 'text', message: textMessage };
    }

    return {
      type: 'flex',
      message: this.generateFlexMessage(template, variables),
    };
  }
}
