import { Injectable, Logger } from '@nestjs/common';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SystemResponseTemplatesService } from '../system-response-templates/system-response-templates.service';
import { SystemResponseType } from '../database/schemas/system-response-template.schema';
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

  constructor(
    private systemSettingsService: SystemSettingsService,
    private systemResponseTemplatesService: SystemResponseTemplatesService,
  ) {}

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
   * Format quota exceeded response using SystemResponseTemplates
   */
  async formatQuotaExceededResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.QUOTA_EXCEEDED,
        { remaining: String(context.quotaRemaining || 0) }
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting quota exceeded response:', error);
      const message = await this.getQuotaExceededMessage(context);
      return this.formatTextMessage(message);
    }
  }

  /**
   * Format no quota response (user has never had quota)
   */
  async formatNoQuotaResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.NO_QUOTA
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting no quota response:', error);
      return this.formatTextMessage('🚫 ไม่มีโควต้าการตรวจสอบสลิป กรุณาซื้อแพ็คเกจเพื่อใช้งาน');
    }
  }

  /**
   * Format package expired response
   */
  async formatPackageExpiredResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.PACKAGE_EXPIRED
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting package expired response:', error);
      return this.formatTextMessage('⏰ แพ็คเกจของคุณหมดอายุแล้ว กรุณาต่ออายุหรือซื้อแพ็คเกจใหม่');
    }
  }

  /**
   * Format QR code not found response
   */
  async formatQrCodeNotFoundResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.QRCODE_NOT_FOUND
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting QR code not found response:', error);
      return this.formatTextMessage('🔳 ไม่พบ QR Code ในรูปสลิป กรุณาส่งรูปสลิปที่มี QR Code ชัดเจน');
    }
  }

  /**
   * Format no slip found response
   */
  async formatNoSlipFoundResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.NO_SLIP_FOUND
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting no slip found response:', error);
      return this.formatTextMessage('🔍 ไม่พบสลิปในรูปภาพ กรุณาส่งรูปสลิปที่ชัดเจน');
    }
  }

  /**
   * Format QR unclear response
   */
  async formatQrUnclearResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.QR_UNCLEAR
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting QR unclear response:', error);
      return this.formatTextMessage('⚠️ QR code ในสลิปไม่ชัดเจน กรุณาถ่ายรูปใหม่ให้ชัดขึ้น');
    }
  }

  /**
   * Format general error response
   */
  async formatGeneralErrorResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.GENERAL_ERROR
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting general error response:', error);
      return this.formatTextMessage('❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  /**
   * Format invalid image response
   */
  async formatInvalidImageResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.INVALID_IMAGE
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting invalid image response:', error);
      return this.formatTextMessage('❌ รูปภาพไม่ถูกต้อง กรุณาส่งรูปสลิปที่ชัดเจน');
    }
  }

  /**
   * Format image download error response
   */
  async formatImageDownloadErrorResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.IMAGE_DOWNLOAD_ERROR
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting image download error response:', error);
      return this.formatTextMessage('❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่');
    }
  }

  /**
   * Format bot disabled response
   */
  async formatBotDisabledResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.BOT_DISABLED
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting bot disabled response:', error);
      return this.formatTextMessage('🔴 ระบบบอทปิดให้บริการชั่วคราว');
    }
  }

  /**
   * Format slip disabled response
   */
  async formatSlipDisabledResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.SLIP_DISABLED
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting slip disabled response:', error);
      return this.formatTextMessage('🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว');
    }
  }

  /**
   * Format processing response
   */
  async formatProcessingResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.PROCESSING
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting processing response:', error);
      return this.formatTextMessage('⏳ กำลังตรวจสอบสลิป กรุณารอสักครู่...');
    }
  }
}
