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

  // ============================================
  // ปรับให้เรียบง่าย - ใช้ templates ใหม่
  // ============================================

  /**
   * Format quota exhausted response (รวม no_quota + quota_exceeded)
   */
  async formatQuotaExhaustedResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.QUOTA_EXHAUSTED,
        { remaining: String(context.quotaRemaining || 0) }
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting quota exhausted response:', error);
      const message = await this.getQuotaExceededMessage(context);
      return this.formatTextMessage(message);
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
   * Format slip not found response (รวมทุกกรณีอ่านสลิปไม่ได้)
   * - ไม่พบสลิป
   * - QR code ไม่ชัด
   * - ไม่พบ QR code
   * - รูปไม่ถูกต้อง
   * - ดาวน์โหลดรูปไม่ได้
   */
  async formatSlipNotFoundResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.SLIP_NOT_FOUND
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting slip not found response:', error);
      return this.formatTextMessage('❌ ไม่พบสลิปหรือ QR code ในรูปภาพ กรุณาส่งรูปสลิปที่ชัดเจน');
    }
  }

  /**
   * Format system error response (รวมทุกกรณีข้อผิดพลาดระบบ)
   */
  async formatSystemErrorResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.SYSTEM_ERROR
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting system error response:', error);
      return this.formatTextMessage('⚠️ เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง');
    }
  }

  /**
   * Format bot disabled response (ผู้ใช้เลือกส่ง/ไม่ส่ง)
   */
  async formatBotDisabledResponse(context: MessageContext = {}): Promise<any> {
    // ตรวจสอบว่าผู้ใช้ต้องการให้ส่งหรือไม่
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    const shouldSend = accountSettings?.sendMessageWhenBotDisabled ?? settings?.botDisabledSendMessage ?? true;
    
    if (!shouldSend) {
      return null; // ไม่ส่งอะไรเลย
    }

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
   * Format processing response (ผู้ใช้เลือกส่ง/ไม่ส่ง)
   */
  async formatProcessingResponse(context: MessageContext = {}): Promise<any> {
    // ตรวจสอบว่าผู้ใช้ต้องการให้ส่งหรือไม่
    const accountSettings = context.account?.settings;
    
    // ใช้ค่า sendProcessingMessage ถ้ามี หรือดูจาก slipResponseMode
    const sendProcessing = accountSettings?.sendProcessingMessage;
    const responseMode = accountSettings?.slipResponseMode || 'immediate';
    
    // ถ้าผู้ใช้ตั้งค่าไว้ชัดเจนว่าไม่ส่ง หรือโหมดเป็น direct = ไม่ต้องส่ง
    if (sendProcessing === false || responseMode === 'direct') {
      return null;
    }

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

  /**
   * Format quota low warning response
   */
  async formatQuotaLowResponse(context: MessageContext = {}): Promise<any> {
    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.QUOTA_LOW,
        { remaining: String(context.quotaRemaining || 0) }
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting quota low response:', error);
      return null; // ไม่ต้องส่งถ้าเกิดข้อผิดพลาด
    }
  }

  /**
   * Format duplicate slip response
   * @deprecated สลิปซ้ำให้ใช้ Slip Templates แทน (TemplateType.DUPLICATE)
   * Method นี้คงไว้เพื่อ backward compatibility
   */
  async formatDuplicateSlipResponse(context: MessageContext = {}): Promise<any> {
    // ไม่ใช้ SystemResponseTemplate อีกต่อไป
    // ใช้ข้อความจาก getDuplicateSlipMessage แทน
    const message = await this.getDuplicateSlipMessage(context);
    return this.formatTextMessage(message);
  }

  // ============================================
  // Legacy methods (สำหรับ backward compatibility)
  // ============================================

  /** @deprecated ใช้ formatQuotaExhaustedResponse แทน */
  async formatQuotaExceededResponse(context: MessageContext = {}): Promise<any> {
    return this.formatQuotaExhaustedResponse(context);
  }

  /** @deprecated ใช้ formatQuotaExhaustedResponse แทน */
  async formatNoQuotaResponse(context: MessageContext = {}): Promise<any> {
    return this.formatQuotaExhaustedResponse(context);
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatNoSlipFoundResponse(context: MessageContext = {}): Promise<any> {
    return this.formatSlipNotFoundResponse(context);
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatQrCodeNotFoundResponse(context: MessageContext = {}): Promise<any> {
    return this.formatSlipNotFoundResponse(context);
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatQrUnclearResponse(context: MessageContext = {}): Promise<any> {
    return this.formatSlipNotFoundResponse(context);
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatInvalidImageResponse(context: MessageContext = {}): Promise<any> {
    return this.formatSlipNotFoundResponse(context);
  }

  /** @deprecated ใช้ formatSlipNotFoundResponse แทน */
  async formatImageDownloadErrorResponse(context: MessageContext = {}): Promise<any> {
    return this.formatSlipNotFoundResponse(context);
  }

  /** @deprecated ใช้ formatSystemErrorResponse แทน */
  async formatGeneralErrorResponse(context: MessageContext = {}): Promise<any> {
    return this.formatSystemErrorResponse(context);
  }

  /**
   * Format slip verification disabled response
   * ส่งข้อความตอบกลับเมื่อระบบตรวจสอบสลิปปิดอยู่
   * ต่างจาก formatBotDisabledResponse ตรงที่จะส่งข้อความเสมอเมื่อรับรูปมา
   */
  async formatSlipDisabledResponse(context: MessageContext = {}): Promise<any> {
    // ตรวจสอบว่าผู้ใช้ต้องการให้ส่งหรือไม่
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    const shouldSend = accountSettings?.sendMessageWhenSlipDisabled ?? settings?.slipDisabledSendMessage ?? true;
    
    if (!shouldSend) {
      return null; // ไม่ส่งอะไรเลย
    }

    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.SLIP_DISABLED
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting slip disabled response:', error);
      // Fallback message
      return this.formatTextMessage('🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว');
    }
  }
}
