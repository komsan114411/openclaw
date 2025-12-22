import { Injectable, Logger } from '@nestjs/common';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { LineAccountDocument } from '../database/schemas/line-account.schema';

export interface MessageContext {
  account?: LineAccountDocument;
  quotaRemaining?: number;
  quotaThreshold?: number;
  errorDetails?: string;
}

@Injectable()
export class ConfigurableMessagesService {
  private readonly logger = new Logger(ConfigurableMessagesService.name);

  constructor(private systemSettingsService: SystemSettingsService) {}

  /**
   * Get quota exceeded message with customization
   */
  async getQuotaExceededMessage(context: MessageContext = {}): Promise<string> {
    const settings = await this.systemSettingsService.getSettings();
    const accountMessage = context.account?.settings?.customQuotaExceededMessage;
    
    return accountMessage || settings?.quotaExceededMessage || 
      '⚠️ โควต้าการตรวจสอบสลิปของร้านค้านี้หมดแล้ว กรุณาติดต่อผู้ดูแลหรือเติมแพ็คเกจ';
  }

  /**
   * Get quota low warning message
   */
  async getQuotaLowWarningMessage(context: MessageContext = {}): Promise<string | null> {
    const settings = await this.systemSettingsService.getSettings();
    
    if (!settings?.quotaWarningEnabled) {
      return null;
    }

    const threshold = settings.quotaWarningThreshold || 10;
    const remaining = context.quotaRemaining || 0;

    if (remaining > threshold) {
      return null;
    }

    let message = settings.quotaLowWarningMessage || '⚠️ โควต้าเหลือน้อยกว่า {threshold} สลิป กรุณาเติมแพ็คเกจ';
    message = message.replace('{threshold}', String(threshold));
    message = message.replace('{remaining}', String(remaining));
    
    return message;
  }

  /**
   * Get bot disabled message (if should send)
   */
  async getBotDisabledMessage(context: MessageContext = {}): Promise<string | null> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    
    // Check if we should send message
    const shouldSend = accountSettings?.sendMessageWhenBotDisabled ?? settings?.botDisabledSendMessage ?? false;
    
    if (!shouldSend) {
      return null;
    }

    return accountSettings?.customBotDisabledMessage || settings?.botDisabledMessage ||
      '🔴 ระบบบอทปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล';
  }

  /**
   * Get slip verification disabled message (if should send)
   */
  async getSlipDisabledMessage(context: MessageContext = {}): Promise<string | null> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    
    // Check if we should send message
    const shouldSend = accountSettings?.sendMessageWhenSlipDisabled ?? settings?.slipDisabledSendMessage ?? false;
    
    if (!shouldSend) {
      return null;
    }

    return accountSettings?.customSlipDisabledMessage || settings?.slipDisabledMessage ||
      '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล';
  }

  /**
   * Get AI disabled message (if should send)
   */
  async getAiDisabledMessage(context: MessageContext = {}): Promise<string | null> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    
    // Check if we should send message
    const shouldSend = accountSettings?.sendMessageWhenAiDisabled ?? settings?.aiDisabledSendMessage ?? false;
    
    if (!shouldSend) {
      return null;
    }

    return accountSettings?.customAiDisabledMessage || settings?.aiDisabledMessage ||
      '🔴 ระบบ AI ตอบกลับปิดให้บริการชั่วคราว';
  }

  /**
   * Get duplicate slip message
   */
  async getDuplicateSlipMessage(context: MessageContext = {}): Promise<string> {
    const settings = await this.systemSettingsService.getSettings();
    const accountMessage = context.account?.settings?.customDuplicateSlipMessage;
    
    return accountMessage || settings?.duplicateSlipMessage || 
      '⚠️ สลิปนี้เคยถูกใช้แล้ว กรุณาใช้สลิปใหม่';
  }

  /**
   * Get slip error message
   */
  async getSlipErrorMessage(context: MessageContext = {}): Promise<string> {
    const settings = await this.systemSettingsService.getSettings();
    const accountMessage = context.account?.settings?.customSlipErrorMessage;
    
    return accountMessage || settings?.slipErrorMessage || 
      '❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง';
  }

  /**
   * Get image download error message
   */
  async getImageDownloadErrorMessage(context: MessageContext = {}): Promise<string> {
    const settings = await this.systemSettingsService.getSettings();
    
    return settings?.imageDownloadErrorMessage || 
      '❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่อีกครั้ง';
  }

  /**
   * Get invalid image message
   */
  async getInvalidImageMessage(context: MessageContext = {}): Promise<string> {
    const settings = await this.systemSettingsService.getSettings();
    
    return settings?.invalidImageMessage || 
      '❌ รูปภาพไม่ถูกต้องหรือไม่ใช่รูปสลิป กรุณาส่งรูปสลิปที่ชัดเจน';
  }

  /**
   * Get slip processing message and whether to show it
   */
  async getSlipProcessingMessage(context: MessageContext = {}): Promise<{ show: boolean; message: string }> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    
    // Per-account message overrides system default
    const message = accountSettings?.slipImmediateMessage || settings?.slipProcessingMessage ||
      'กำลังตรวจสอบสลิป กรุณารอสักครู่...';
    
    // Check if should show based on response mode
    const responseMode = accountSettings?.slipResponseMode || 'immediate';
    const show = responseMode === 'immediate' && (settings?.showSlipProcessingMessage ?? true);
    
    return { show, message };
  }

  /**
   * Get retry settings
   */
  async getRetrySettings(): Promise<{ maxAttempts: number; delayMs: number }> {
    const settings = await this.systemSettingsService.getSettings();
    
    return {
      maxAttempts: settings?.maxRetryAttempts || 3,
      delayMs: settings?.retryDelayMs || 1000,
    };
  }

  /**
   * Check if duplicate slip should refund quota
   */
  async shouldRefundDuplicate(): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    return settings?.duplicateRefundEnabled ?? true;
  }

  /**
   * Format response as LINE message object
   */
  formatTextMessage(text: string): { type: string; text: string } {
    return { type: 'text', text };
  }

  /**
   * Format quota exceeded response as Flex or Text based on settings
   */
  async formatQuotaExceededResponse(context: MessageContext = {}): Promise<any> {
    const settings = await this.systemSettingsService.getSettings();
    const message = await this.getQuotaExceededMessage(context);
    const responseType = settings?.quotaExceededResponseType || 'text';

    if (responseType === 'flex') {
      return {
        type: 'flex',
        altText: 'โควต้าหมด',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '⚠️ โควต้าหมด', weight: 'bold', size: 'lg', color: '#FF8800' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: message, margin: 'md', wrap: true },
            ],
          },
        },
      };
    }

    return this.formatTextMessage(message);
  }
}
