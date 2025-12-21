import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemSettings, SystemSettingsDocument, BankAccount } from '../database/schemas/system-settings.schema';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private readonly CACHE_KEY = 'system-settings';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectModel(SystemSettings.name)
    private settingsModel: Model<SystemSettingsDocument>,
    private redisService: RedisService,
  ) {
    this.ensureDefaultSettings();
  }

  private async ensureDefaultSettings(): Promise<void> {
    try {
      const exists = await this.settingsModel.findOne({ settingsId: 'main' });
      if (!exists) {
        await this.settingsModel.create({
          settingsId: 'main',
          slipApiProvider: 'thunder',
          aiModel: 'gpt-3.5-turbo',
          usdtEnabled: true,
          usdtNetwork: 'TRC20',
          quotaExceededResponseType: 'text',
          quotaWarningThreshold: 10,
          quotaWarningEnabled: true,
          duplicateRefundEnabled: true,
        });
        this.logger.log('Default system settings created');
      }
    } catch (error) {
      this.logger.error('Error creating default settings:', error);
    }
  }

  async getSettings(): Promise<SystemSettingsDocument | null> {
    // Try cache first
    const cached = await this.redisService.getJson<SystemSettingsDocument>(
      `cache:${this.CACHE_KEY}`,
    );
    if (cached) {
      return cached;
    }

    // Fetch from database
    const settings = await this.settingsModel.findOne({ settingsId: 'main' });
    if (settings) {
      await this.redisService.setJson(
        `cache:${this.CACHE_KEY}`,
        settings.toObject(),
        this.CACHE_TTL,
      );
    }

    return settings;
  }

  async updateSettings(
    updates: Partial<SystemSettings>,
    updatedBy: string,
  ): Promise<boolean> {
    try {
      const result = await this.settingsModel.updateOne(
        { settingsId: 'main' },
        {
          ...updates,
          updatedBy,
        },
        { upsert: true },
      );

      // Invalidate cache
      await this.redisService.invalidateCache(this.CACHE_KEY);

      return result.modifiedCount > 0 || result.upsertedCount > 0;
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
