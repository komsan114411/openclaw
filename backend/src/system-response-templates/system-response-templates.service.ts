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

// Default templates configuration
const DEFAULT_TEMPLATES: Partial<SystemResponseTemplate>[] = [
  {
    type: SystemResponseType.NO_SLIP_FOUND,
    name: 'ไม่พบสลิปในรูป',
    description: 'ข้อความเมื่อไม่พบสลิปหรือ QR code ในรูปที่ส่งมา',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '❌ ไม่พบสลิปหรือ QR code ในรูปภาพ กรุณาส่งรูปสลิปที่ชัดเจน',
    title: 'ไม่พบสลิป',
    mainMessage: 'ไม่พบสลิปหรือ QR code ในรูปภาพที่ส่งมา',
    subMessage: 'กรุณาถ่ายรูปสลิปให้ชัดเจนและส่งใหม่อีกครั้ง',
    styling: {
      primaryColor: '#FF6B6B',
      textColor: '#FFFFFF',
      backgroundColor: '#FFF5F5',
      icon: '❌',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: true,
      retryButtonText: 'ส่งรูปใหม่',
    },
    sortOrder: 1,
  },
  {
    type: SystemResponseType.QR_UNCLEAR,
    name: 'QR Code ไม่ชัด',
    description: 'ข้อความเมื่อ QR code ในสลิปไม่ชัดหรืออ่านไม่ได้',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '⚠️ QR code ในสลิปไม่ชัดเจน กรุณาถ่ายรูปใหม่ให้ชัดขึ้น',
    title: 'QR Code ไม่ชัด',
    mainMessage: 'ไม่สามารถอ่าน QR code ในสลิปได้',
    subMessage: 'กรุณาถ่ายรูปให้ชัดเจน โดยให้ QR code อยู่ในกรอบ และมีแสงสว่างเพียงพอ',
    styling: {
      primaryColor: '#FFB347',
      textColor: '#FFFFFF',
      backgroundColor: '#FFF8E1',
      icon: '⚠️',
      showIcon: true,
      showContactButton: false,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: true,
      retryButtonText: 'ถ่ายรูปใหม่',
    },
    sortOrder: 2,
  },
  {
    type: SystemResponseType.QUOTA_EXCEEDED,
    name: 'โควต้าหมด',
    description: 'ข้อความเมื่อโควต้าการตรวจสอบสลิปหมด',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '🔴 โควต้าการตรวจสอบสลิปหมดแล้ว กรุณาติดต่อผู้ดูแลระบบ',
    title: 'โควต้าหมด',
    mainMessage: 'โควต้าการตรวจสอบสลิปหมดแล้ว',
    subMessage: 'กรุณาติดต่อผู้ดูแลระบบเพื่อเติมแพ็คเกจ',
    styling: {
      primaryColor: '#DC3545',
      textColor: '#FFFFFF',
      backgroundColor: '#FFF0F0',
      icon: '🔴',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 3,
  },
  {
    type: SystemResponseType.QUOTA_LOW,
    name: 'โควต้าใกล้หมด',
    description: 'ข้อความเตือนเมื่อโควต้าเหลือน้อย',
    responseFormat: ResponseFormat.TEXT,
    textMessage: '⚠️ โควต้าเหลือน้อยกว่า {threshold} สลิป กรุณาเติมแพ็คเกจ',
    title: 'โควต้าใกล้หมด',
    mainMessage: 'โควต้าการตรวจสอบสลิปใกล้หมดแล้ว',
    subMessage: 'เหลือโควต้าอีก {remaining} สลิป กรุณาเติมแพ็คเกจ',
    styling: {
      primaryColor: '#FFC107',
      textColor: '#000000',
      backgroundColor: '#FFFDE7',
      icon: '⚠️',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'เติมแพ็คเกจ',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 4,
  },
  {
    type: SystemResponseType.INVALID_IMAGE,
    name: 'รูปภาพไม่ถูกต้อง',
    description: 'ข้อความเมื่อรูปภาพไม่ใช่สลิปหรือไม่รองรับ',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '❌ รูปภาพไม่ถูกต้องหรือไม่ใช่รูปสลิป กรุณาส่งรูปสลิปที่ชัดเจน',
    title: 'รูปภาพไม่ถูกต้อง',
    mainMessage: 'รูปภาพที่ส่งมาไม่ใช่สลิปโอนเงิน',
    subMessage: 'กรุณาส่งรูปสลิปโอนเงินที่มี QR code ชัดเจน',
    styling: {
      primaryColor: '#FF6B6B',
      textColor: '#FFFFFF',
      backgroundColor: '#FFF5F5',
      icon: '❌',
      showIcon: true,
      showContactButton: false,
      contactButtonText: '',
      contactButtonUrl: '',
      showRetryButton: true,
      retryButtonText: 'ส่งรูปใหม่',
    },
    sortOrder: 5,
  },
  {
    type: SystemResponseType.IMAGE_DOWNLOAD_ERROR,
    name: 'ดาวน์โหลดรูปไม่ได้',
    description: 'ข้อความเมื่อไม่สามารถดาวน์โหลดรูปภาพได้',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่อีกครั้ง',
    title: 'เกิดข้อผิดพลาด',
    mainMessage: 'ไม่สามารถดาวน์โหลดรูปภาพได้',
    subMessage: 'กรุณาลองส่งรูปใหม่อีกครั้ง',
    styling: {
      primaryColor: '#FF6B6B',
      textColor: '#FFFFFF',
      backgroundColor: '#FFF5F5',
      icon: '❌',
      showIcon: true,
      showContactButton: false,
      contactButtonText: '',
      contactButtonUrl: '',
      showRetryButton: true,
      retryButtonText: 'ส่งใหม่',
    },
    sortOrder: 6,
  },
  {
    type: SystemResponseType.GENERAL_ERROR,
    name: 'ข้อผิดพลาดทั่วไป',
    description: 'ข้อความเมื่อเกิดข้อผิดพลาดทั่วไป',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง',
    title: 'เกิดข้อผิดพลาด',
    mainMessage: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป',
    subMessage: 'กรุณาลองใหม่อีกครั้ง หากยังพบปัญหากรุณาติดต่อผู้ดูแล',
    styling: {
      primaryColor: '#FF6B6B',
      textColor: '#FFFFFF',
      backgroundColor: '#FFF5F5',
      icon: '❌',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: true,
      retryButtonText: 'ลองใหม่',
    },
    sortOrder: 7,
  },
  {
    type: SystemResponseType.BOT_DISABLED,
    name: 'บอทปิดให้บริการ',
    description: 'ข้อความเมื่อบอทถูกปิดใช้งาน',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '🔴 ระบบบอทปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
    title: 'ปิดให้บริการชั่วคราว',
    mainMessage: 'ระบบบอทปิดให้บริการชั่วคราว',
    subMessage: 'กรุณาติดต่อผู้ดูแลระบบ',
    styling: {
      primaryColor: '#6C757D',
      textColor: '#FFFFFF',
      backgroundColor: '#F8F9FA',
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
    type: SystemResponseType.SLIP_DISABLED,
    name: 'ระบบตรวจสลิปปิด',
    description: 'ข้อความเมื่อระบบตรวจสลิปถูกปิด',
    responseFormat: ResponseFormat.FLEX,
    textMessage: '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
    title: 'ระบบตรวจสลิปปิด',
    mainMessage: 'ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว',
    subMessage: 'กรุณาติดต่อผู้ดูแลระบบ',
    styling: {
      primaryColor: '#6C757D',
      textColor: '#FFFFFF',
      backgroundColor: '#F8F9FA',
      icon: '🔴',
      showIcon: true,
      showContactButton: true,
      contactButtonText: 'ติดต่อผู้ดูแล',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 9,
  },
  {
    type: SystemResponseType.PROCESSING,
    name: 'กำลังประมวลผล',
    description: 'ข้อความขณะกำลังตรวจสอบสลิป',
    responseFormat: ResponseFormat.TEXT,
    textMessage: '⏳ กำลังตรวจสอบสลิป กรุณารอสักครู่...',
    title: 'กำลังตรวจสอบ',
    mainMessage: 'กำลังตรวจสอบสลิป',
    subMessage: 'กรุณารอสักครู่...',
    styling: {
      primaryColor: '#17A2B8',
      textColor: '#FFFFFF',
      backgroundColor: '#E3F2FD',
      icon: '⏳',
      showIcon: true,
      showContactButton: false,
      contactButtonText: '',
      contactButtonUrl: '',
      showRetryButton: false,
      retryButtonText: '',
    },
    sortOrder: 10,
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

  async getAll(): Promise<SystemResponseTemplateDocument[]> {
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
      if (styling.contactButtonUrl) {
        footerContents.push({
          type: 'button',
          action: {
            type: 'uri',
            label: styling.contactButtonText,
            uri: styling.contactButtonUrl,
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
