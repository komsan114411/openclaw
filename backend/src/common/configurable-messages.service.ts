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

  // ============================================
  // Control flag methods (kept for checking when to send)
  // ============================================

  /**
   * Check if quota warning is enabled and threshold reached
   */
  async shouldShowQuotaWarning(context: MessageContext = {}): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings?.quotaWarningEnabled) {
      return false;
    }
    const threshold = settings.quotaWarningThreshold || 10;
    const remaining = context.quotaRemaining || 0;
    return remaining <= threshold;
  }

  /**
   * Check if bot disabled message should be sent
   */
  async shouldSendBotDisabledMessage(context: MessageContext = {}): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    return accountSettings?.sendMessageWhenBotDisabled ?? settings?.botDisabledSendMessage ?? false;
  }

  /**
   * Check if slip disabled message should be sent
   */
  async shouldSendSlipDisabledMessage(context: MessageContext = {}): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    return accountSettings?.sendMessageWhenSlipDisabled ?? settings?.slipDisabledSendMessage ?? true;
  }

  /**
   * Check if AI disabled message should be sent
   */
  async shouldSendAiDisabledMessage(context: MessageContext = {}): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    return accountSettings?.sendMessageWhenAiDisabled ?? settings?.aiDisabledSendMessage ?? false;
  }

  /**
   * Check if processing message should be shown
   */
  async shouldShowProcessingMessage(context: MessageContext = {}): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    const accountSettings = context.account?.settings;
    const responseMode = accountSettings?.slipResponseMode || 'immediate';
    return responseMode === 'immediate' && (settings?.showSlipProcessingMessage ?? true);
  }

  // ============================================
  // Legacy methods - delegate to templates
  // These are kept for backward compatibility
  // ============================================

  /** @deprecated Use formatQuotaExhaustedResponse instead */
  async getQuotaExceededMessage(context: MessageContext = {}): Promise<string> {
    return '⚠️ โควต้าการตรวจสอบสลิปของร้านค้านี้หมดแล้ว กรุณาติดต่อผู้ดูแลหรือเติมแพ็คเกจ';
  }

  /** @deprecated Use formatQuotaLowResponse instead */
  async getQuotaLowWarningMessage(context: MessageContext = {}): Promise<string | null> {
    const shouldShow = await this.shouldShowQuotaWarning(context);
    if (!shouldShow) return null;
    return '⚠️ โควต้าเหลือน้อย กรุณาเติมแพ็คเกจ';
  }

  /** @deprecated Use formatBotDisabledResponse instead */
  async getBotDisabledMessage(context: MessageContext = {}): Promise<string | null> {
    const shouldSend = await this.shouldSendBotDisabledMessage(context);
    if (!shouldSend) return null;
    return '🔴 ระบบบอทปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล';
  }

  /** @deprecated Use formatSlipDisabledResponse instead */
  async getSlipDisabledMessage(context: MessageContext = {}): Promise<string | null> {
    const shouldSend = await this.shouldSendSlipDisabledMessage(context);
    if (!shouldSend) return null;
    return '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล';
  }

  /** @deprecated Messages now managed via SystemResponseTemplates */
  async getAiDisabledMessage(context: MessageContext = {}): Promise<string | null> {
    const shouldSend = await this.shouldSendAiDisabledMessage(context);
    if (!shouldSend) return null;
    return '🔴 ระบบ AI ตอบกลับปิดให้บริการชั่วคราว';
  }

  /** @deprecated Use SlipTemplates instead */
  async getDuplicateSlipMessage(context: MessageContext = {}): Promise<string> {
    return '⚠️ สลิปนี้เคยถูกใช้แล้ว กรุณาใช้สลิปใหม่';
  }

  /** @deprecated Use formatSystemErrorResponse instead */
  async getSlipErrorMessage(context: MessageContext = {}): Promise<string> {
    return '❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง';
  }

  /** @deprecated Use formatSlipNotFoundResponse instead */
  async getImageDownloadErrorMessage(context: MessageContext = {}): Promise<string> {
    return '❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่อีกครั้ง';
  }

  /** @deprecated Use formatSlipNotFoundResponse instead */
  async getInvalidImageMessage(context: MessageContext = {}): Promise<string> {
    return '❌ รูปภาพไม่ถูกต้องหรือไม่ใช่รูปสลิป กรุณาส่งรูปสลิปที่ชัดเจน';
  }

  /** @deprecated Use formatProcessingResponse instead */
  async getSlipProcessingMessage(context: MessageContext = {}): Promise<{ show: boolean; message: string }> {
    const show = await this.shouldShowProcessingMessage(context);
    return { show, message: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...' };
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

    // ตรวจสอบว่ามี custom message จาก account settings หรือไม่
    const customMessage = accountSettings?.slipImmediateMessage;
    if (customMessage && customMessage.trim()) {
      return this.formatTextMessage(customMessage);
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
   * Format AI quota exhausted response
   * ส่งข้อความตอบกลับเมื่อ AI quota หมด
   */
  async formatAiQuotaExhaustedResponse(context: MessageContext = {}): Promise<any> {
    // ตรวจสอบว่ามี custom message จาก account settings หรือไม่
    const accountSettings = context.account?.settings;
    const customMessage = accountSettings?.customAiDisabledMessage;
    if (customMessage && customMessage.trim()) {
      return this.formatTextMessage(customMessage);
    }

    try {
      const response = await this.systemResponseTemplatesService.getResponse(
        SystemResponseType.QUOTA_EXHAUSTED,
        { remaining: '0', type: 'AI' }
      );
      return response.type === 'flex' ? response.message : { type: 'text', text: response.message };
    } catch (error) {
      this.logger.error('Error getting AI quota exhausted response:', error);
      return this.formatTextMessage('⚠️ โควต้า AI หมดแล้ว กรุณาติดต่อผู้ดูแลหรือเติมแพ็คเกจ');
    }
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

    // ตรวจสอบว่ามี custom message จาก account settings หรือไม่
    const customMessage = accountSettings?.customSlipDisabledMessage;
    if (customMessage && customMessage.trim()) {
      return this.formatTextMessage(customMessage);
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
