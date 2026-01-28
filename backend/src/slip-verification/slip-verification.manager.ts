/**
 * Slip Verification Manager
 *
 * จัดการการตรวจสอบสลิปจากหลาย Provider พร้อม Auto-Failover
 */

import { Injectable, Logger } from '@nestjs/common';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import {
  SlipProvider,
  SlipVerificationProvider,
  NormalizedVerificationResult,
  ProviderUnavailableError,
} from './providers';
import { ThunderProvider } from './providers/thunder.provider';
import { SlipMateProvider } from './providers/slipmate.provider';

export interface VerificationContext {
  lineAccountId?: string;
  lineUserId?: string;
  messageId?: string;
  ownerId?: string;
  subscriptionId?: string;
}

@Injectable()
export class SlipVerificationManager {
  private readonly logger = new Logger(SlipVerificationManager.name);
  private readonly providers: Map<SlipProvider, SlipVerificationProvider> = new Map();

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly thunderProvider: ThunderProvider,
    private readonly slipMateProvider: SlipMateProvider,
  ) {
    // Register all providers
    this.providers.set(SlipProvider.THUNDER, this.thunderProvider);
    this.providers.set(SlipProvider.SLIPMATE, this.slipMateProvider);
  }

  /**
   * ตรวจสอบสลิปด้วยระบบ Auto-Failover
   *
   * @param imageData Buffer ของรูปภาพสลิป
   * @param context ข้อมูล context (optional)
   * @returns ผลลัพธ์การตรวจสอบ
   */
  async verifySlip(
    imageData: Buffer,
    context?: VerificationContext,
  ): Promise<NormalizedVerificationResult> {
    const settings = await this.systemSettingsService.getDecryptedSettings();

    // Get failover order from settings
    const failoverOrder = this.getFailoverOrder(settings);
    this.logger.log(`[MANAGER] Failover order: ${failoverOrder.join(' → ')}`);

    let lastResult: NormalizedVerificationResult | null = null;
    let attemptedProviders: string[] = [];

    for (const providerName of failoverOrder) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        this.logger.warn(`[MANAGER] Provider not found: ${providerName}`);
        continue;
      }

      // Get API key for this provider
      const apiKey = this.getApiKeyForProvider(providerName, settings);
      if (!apiKey) {
        this.logger.warn(`[MANAGER] No API key configured for: ${providerName}`);
        continue;
      }

      attemptedProviders.push(providerName);
      this.logger.log(`[MANAGER] Trying provider: ${providerName}`);

      try {
        const result = await provider.verify(imageData, apiKey);
        lastResult = result;

        // Success, duplicate, or not_found → return immediately (no failover)
        if (result.status === 'success' || result.status === 'duplicate' || result.status === 'not_found') {
          this.logger.log(`[MANAGER] ${providerName} returned: ${result.status}`);

          // Log failover if it happened
          if (attemptedProviders.length > 1) {
            this.logger.log(
              `[MANAGER] Failover successful: ${attemptedProviders.slice(0, -1).join(' → ')} (failed) → ${providerName} (success)`,
            );
          }

          return result;
        }

        // Error with shouldFailover flag
        if (result.status === 'error' && result.shouldFailover) {
          this.logger.warn(`[MANAGER] ${providerName} error with failover flag, trying next...`);
          continue;
        }

        // Error without failover flag → return
        return result;
      } catch (error) {
        if (error instanceof ProviderUnavailableError) {
          this.logger.warn(`[MANAGER] ${providerName} unavailable: ${error.reason}, trying next...`);
          continue;
        }

        // Unexpected error
        this.logger.error(`[MANAGER] Unexpected error from ${providerName}:`, error);
        throw error;
      }
    }

    // All providers failed
    this.logger.error(`[MANAGER] All providers failed: ${attemptedProviders.join(', ')}`);

    return lastResult ?? {
      status: 'error',
      provider: failoverOrder[0] || SlipProvider.THUNDER,
      message: 'ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่อีกครั้ง',
    };
  }

  /**
   * ทดสอบการเชื่อมต่อของ Provider
   */
  async testProviderConnection(providerName: SlipProvider): Promise<{
    success: boolean;
    message: string;
    remainingQuota?: number;
    expiresAt?: string;
  }> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        success: false,
        message: `Provider not found: ${providerName}`,
      };
    }

    const settings = await this.systemSettingsService.getDecryptedSettings();
    const apiKey = this.getApiKeyForProvider(providerName, settings);

    if (!apiKey) {
      return {
        success: false,
        message: 'API Key ยังไม่ได้ตั้งค่า',
      };
    }

    return provider.testConnection(apiKey);
  }

  /**
   * ทดสอบการเชื่อมต่อของทุก Provider
   */
  async testAllProviders(): Promise<
    Map<
      SlipProvider,
      {
        success: boolean;
        message: string;
        remainingQuota?: number;
        expiresAt?: string;
      }
    >
  > {
    const results = new Map<
      SlipProvider,
      {
        success: boolean;
        message: string;
        remainingQuota?: number;
        expiresAt?: string;
      }
    >();

    for (const providerName of this.providers.keys()) {
      const result = await this.testProviderConnection(providerName);
      results.set(providerName, result);
    }

    return results;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): SlipProvider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get failover order from settings
   */
  private getFailoverOrder(settings: any): SlipProvider[] {
    // Check if custom failover order is set
    if (settings.slipProviderFailoverOrder && Array.isArray(settings.slipProviderFailoverOrder)) {
      return settings.slipProviderFailoverOrder as SlipProvider[];
    }

    // Build failover order from primary/secondary settings
    const order: SlipProvider[] = [];

    // Primary provider
    const primary = (settings.slipApiProvider || 'thunder') as SlipProvider;
    if (this.providers.has(primary)) {
      order.push(primary);
    }

    // Secondary provider (if failover is enabled)
    if (settings.slipApiFallbackEnabled && settings.slipApiProviderSecondary) {
      const secondary = settings.slipApiProviderSecondary as SlipProvider;
      if (this.providers.has(secondary) && !order.includes(secondary)) {
        order.push(secondary);
      }
    }

    // Default: at least Thunder
    if (order.length === 0) {
      order.push(SlipProvider.THUNDER);
    }

    return order;
  }

  /**
   * Get API key for a specific provider
   */
  private getApiKeyForProvider(provider: SlipProvider, settings: any): string | null {
    switch (provider) {
      case SlipProvider.THUNDER:
        // Thunder uses slipApiKey (primary) or slipApiKeyThunder
        return settings.slipApiKey || settings.slipApiKeyThunder || null;

      case SlipProvider.SLIPMATE:
        // SlipMate uses slipApiKeySecondary or slipApiKeySlipMate
        return settings.slipApiKeySecondary || settings.slipApiKeySlipMate || null;

      default:
        return null;
    }
  }
}
