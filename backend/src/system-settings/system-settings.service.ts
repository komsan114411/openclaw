import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemSettings, SystemSettingsDocument, BankAccount } from '../database/schemas/system-settings.schema';
import { RedisService } from '../redis/redis.service';
import { SecurityUtil } from '../utils/security.util';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private readonly CACHE_KEY = 'system-settings';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectModel(SystemSettings.name)
    private settingsModel: Model<SystemSettingsDocument>,
    private redisService: RedisService,
    private securityUtil: SecurityUtil,
  ) {
    this.ensureDefaultSettings();
  }

  private async ensureDefaultSettings(): Promise<void> {
    try {
      const exists = await this.settingsModel.findOne({ settingsId: 'main' });
      if (!exists) {
        await this.settingsModel.create({
          settingsId: 'main',
          publicBaseUrl: '',
          slipApiProvider: 'thunder',
          aiModel: 'gpt-3.5-turbo',
          usdtEnabled: true,
          usdtNetwork: 'TRC20',
          quotaExceededResponseType: 'text',
          quotaExceededMessage: '⚠️ โควต้าการตรวจสอบสลิปของร้านค้านี้หมดแล้ว กรุณาติดต่อผู้ดูแลหรือเติมแพ็คเกจ',
          quotaWarningThreshold: 10,
          quotaWarningEnabled: true,
          quotaLowWarningMessage: '⚠️ โควต้าเหลือน้อยกว่า {threshold} สลิป กรุณาเติมแพ็คเกจ',
          botDisabledSendMessage: false,
          botDisabledMessage: '🔴 ระบบบอทปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
          slipDisabledSendMessage: false,
          slipDisabledMessage: '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
          aiDisabledSendMessage: false,
          aiDisabledMessage: '🔴 ระบบ AI ตอบกลับปิดให้บริการชั่วคราว',
          duplicateRefundEnabled: true,
          duplicateSlipMessage: '⚠️ สลิปนี้เคยถูกใช้แล้ว กรุณาใช้สลิปใหม่',
          slipErrorMessage: '❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง',
          imageDownloadErrorMessage: '❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่อีกครั้ง',
          invalidImageMessage: '❌ รูปภาพไม่ถูกต้องหรือไม่ใช่รูปสลิป กรุณาส่งรูปสลิปที่ชัดเจน',
          slipProcessingMessage: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
          showSlipProcessingMessage: true,
          maxRetryAttempts: 3,
          retryDelayMs: 1000,
        });
        this.logger.log('Default system settings created');
      }
    } catch (error) {
      this.logger.error('Error creating default settings:', error);
    }
  }

  async getSettings(includeSecrets = false): Promise<SystemSettingsDocument | null> {
    // Try cache first
    const cached = await this.redisService.getJson<SystemSettingsDocument>(
      `cache:${this.CACHE_KEY}`,
    );
    if (cached) {
      // If cached, we assume it's masked or raw depending on how we stored it?
      // Actually, better to always cache encrypted/raw and mask on output if !includeSecrets
      // But for simplicity, let's cache the raw DB object and manipulate here.
      return this.processOutput(cached as any, includeSecrets);
    }

    // Fetch from database
    const settings = await this.settingsModel.findOne({ settingsId: 'main' });
    if (settings) {
      await this.redisService.setJson(
        `cache:${this.CACHE_KEY}`,
        settings.toObject(),
        this.CACHE_TTL,
      );
      return this.processOutput(settings.toObject(), includeSecrets);
    }

    return settings;
  }

  /**
   * Helper to mask secrets or return decrypted secrets
   */
  private processOutput(settings: any, includeSecrets: boolean): any {
    const result = { ...settings };

    // List of encrypted fields - only keep Thunder API and AI API encrypted
    // Blockchain API keys (etherscan, bscscan, tronscan) are stored as plain text for simplicity
    const secretFields = ['slipApiKey', 'aiApiKey'];

    secretFields.forEach(field => {
      if (result[field]) {
        if (includeSecrets) {
          // Decrypt for internal usage
          result[field] = this.securityUtil.decrypt(result[field]);
        } else {
          // Mask for frontend/admin view
          result[field] = this.securityUtil.mask(result[field]);
        }
      }
    });

    return result;
  }

  /**
   * Internal method to get fully decrypted settings
   */
  async getDecryptedSettings(): Promise<SystemSettingsDocument | null> {
    return this.getSettings(true);
  }

  async updateSettings(
    updates: Partial<SystemSettings>,
    updatedBy: string,
  ): Promise<boolean> {
    try {
      // Normalize publicBaseUrl
      if (typeof (updates as any).publicBaseUrl === 'string') {
        const trimmed = (updates as any).publicBaseUrl.trim();
        (updates as any).publicBaseUrl = trimmed === '' ? '' : trimmed.replace(/\/+$/, '');
        if (trimmed !== '' && !/^https?:\/\//i.test(trimmed)) {
          throw new Error('publicBaseUrl must start with http:// or https://');
        }
      }

      // Encrypt only Thunder API and AI API keys
      // Blockchain keys (etherscan, bscscan, tronscan) are stored as plain text
      const secretFields = ['slipApiKey', 'aiApiKey'];

      for (const field of secretFields) {
        if ((updates as any)[field]) {
          // Only encrypt if it doesn't look like it's already masked or unchanged
          // (Simple check: if it contains '***', assume it's masked and DON'T update it)
          if ((updates as any)[field].includes('***') || (updates as any)[field].includes('....')) {
            delete (updates as any)[field]; // Don't update masked value
          } else {
            (updates as any)[field] = this.securityUtil.encrypt((updates as any)[field]);
          }
        }
      }

      // Log what we're about to save (excluding large fields)
      const logPayload = { ...updates };
      if ((logPayload as any).usdtQrImage) {
        (logPayload as any).usdtQrImage = `[BASE64: ${(logPayload as any).usdtQrImage.length} chars]`;
      }
      this.logger.log(`Updating settings with payload: ${JSON.stringify(logPayload)}`);

      const result = await this.settingsModel.updateOne(
        { settingsId: 'main' },
        {
          $set: {
            ...updates,
            updatedBy,
          },
        },
        { upsert: true },
      );

      this.logger.log(`Update result: acknowledged=${result.acknowledged}, modifiedCount=${result.modifiedCount}, upsertedCount=${result.upsertedCount}`);

      // Debug log for QR image
      if ((updates as any).usdtQrImage) {
        this.logger.log(`USDT QR Image update detected, length: ${(updates as any).usdtQrImage.length}`);
      }

      // Invalidate cache (invalidateCache adds 'cache:' prefix internally)
      await this.redisService.invalidateCache(this.CACHE_KEY);

      // Return true if update was acknowledged (even if no changes)
      // This prevents confusing "save failed" messages when data is unchanged
      return result.acknowledged;
    } catch (error) {
      this.logger.error('Error updating settings:', error);
      return false;
    }
  }

  async addBankAccount(account: BankAccount, updatedBy: string): Promise<boolean> {
    const settings = await this.getSettings();
    const accounts = settings?.paymentBankAccounts || [];

    // Check for duplicate
    if (accounts.some((a: any) => a.accountNumber === account.accountNumber)) {
      return false;
    }

    accounts.push(account);
    return this.updateSettings({ paymentBankAccounts: accounts } as any, updatedBy);
  }

  async removeBankAccount(index: number, updatedBy: string): Promise<boolean> {
    const settings = await this.getSettings();
    const accounts = settings?.paymentBankAccounts || [];

    if (index < 0 || index >= accounts.length) {
      return false;
    }

    accounts.splice(index, 1);
    return this.updateSettings({ paymentBankAccounts: accounts } as any, updatedBy);
  }

  async getApiStatus(): Promise<{
    thunder: { configured: boolean; status: string; message: string };
    ai: { configured: boolean; status: string; message: string };
  }> {
    const settings = await this.getSettings();

    return {
      thunder: {
        configured: !!settings?.slipApiKey,
        status: settings?.slipApiKey ? 'configured' : 'not_configured',
        message: settings?.slipApiKey ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า',
      },
      ai: {
        configured: !!settings?.aiApiKey,
        status: settings?.aiApiKey ? 'configured' : 'not_configured',
        message: settings?.aiApiKey ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า',
      },
    };
  }
}
