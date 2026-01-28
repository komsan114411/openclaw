/**
 * Slip Verification Manager
 *
 * จัดการการตรวจสอบสลิปจากหลาย Provider พร้อม Auto-Failover
 * ออกแบบให้ผู้ใช้ไม่รู้สึกถึงการสลับ Provider
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

export interface VerificationStats {
  provider: SlipProvider;
  duration: number;
  success: boolean;
  failoverUsed: boolean;
  failoverFrom?: SlipProvider;
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

  // Track last verification stats (for monitoring)
  private lastVerificationStats: VerificationStats | null = null;

  /**
   * ตรวจสอบสลิปด้วยระบบ Auto-Failover
   * ออกแบบให้ผู้ใช้ไม่รู้สึกถึงการสลับ Provider
   *
   * @param imageData Buffer ของรูปภาพสลิป
   * @param context ข้อมูล context (optional)
   * @returns ผลลัพธ์การตรวจสอบ (format เดียวกันไม่ว่าจะใช้ provider ไหน)
   */
  async verifySlip(
    imageData: Buffer,
    context?: VerificationContext,
  ): Promise<NormalizedVerificationResult> {
    const startTime = Date.now();
    const settings = await this.systemSettingsService.getDecryptedSettings();

    // Log settings for debugging
    this.logger.log(`[MANAGER] Settings: provider=${settings?.slipApiProvider}, failback=${settings?.slipApiFallbackEnabled}, secondary=${settings?.slipApiProviderSecondary}`);
    this.logger.log(`[MANAGER] API Keys: thunder=${settings?.slipApiKeyThunder ? 'SET' : 'NONE'}, slipmate=${settings?.slipApiKeySlipMate ? 'SET' : 'NONE'}, slipApiKey=${settings?.slipApiKey ? 'SET' : 'NONE'}`);

    // Get failover order from settings
    const failoverOrder = this.getFailoverOrder(settings);
    this.logger.log(`[MANAGER] Failover order: ${failoverOrder.join(' → ')}`);

    let lastResult: NormalizedVerificationResult | null = null;
    let attemptedProviders: SlipProvider[] = [];
    let successProvider: SlipProvider | null = null;

    for (const providerName of failoverOrder) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        this.logger.debug(`[MANAGER] Provider not found: ${providerName}`);
        continue;
      }

      // Get API key for this provider
      const apiKey = this.getApiKeyForProvider(providerName, settings);
      if (!apiKey) {
        this.logger.debug(`[MANAGER] No API key for: ${providerName}, skipping`);
        continue;
      }

      attemptedProviders.push(providerName);
      const providerStartTime = Date.now();

      try {
        // Try with retry for transient errors
        const result = await this.verifyWithRetry(provider, imageData, apiKey, providerName);
        lastResult = result;

        const providerDuration = Date.now() - providerStartTime;

        // Success, duplicate, or not_found → return immediately (no failover)
        if (result.status === 'success' || result.status === 'duplicate' || result.status === 'not_found') {
          successProvider = providerName;

          // Log only for debugging (not visible to user)
          if (attemptedProviders.length > 1) {
            this.logger.log(
              `[MANAGER] Failover: ${attemptedProviders.slice(0, -1).join('→')} (failed) → ${providerName} ✓ [${providerDuration}ms]`,
            );
          } else {
            this.logger.debug(`[MANAGER] ${providerName}: ${result.status} [${providerDuration}ms]`);
          }

          // Track stats
          this.lastVerificationStats = {
            provider: providerName,
            duration: Date.now() - startTime,
            success: true,
            failoverUsed: attemptedProviders.length > 1,
            failoverFrom: attemptedProviders.length > 1 ? attemptedProviders[0] : undefined,
          };

          // Return result WITHOUT provider info (user shouldn't know)
          return this.sanitizeResultForUser(result);
        }

        // Error with shouldFailover flag
        if (result.status === 'error' && result.shouldFailover) {
          this.logger.debug(`[MANAGER] ${providerName} needs failover [${providerDuration}ms]`);
          continue;
        }

        // Error without failover flag → return (but sanitize)
        return this.sanitizeResultForUser(result);
      } catch (error) {
        const providerDuration = Date.now() - providerStartTime;

        if (error instanceof ProviderUnavailableError) {
          this.logger.debug(`[MANAGER] ${providerName} unavailable: ${error.reason} [${providerDuration}ms]`);
          continue;
        }

        // Unexpected error - log but continue to next provider
        this.logger.error(`[MANAGER] ${providerName} error [${providerDuration}ms]:`, error);
        continue;
      }
    }

    // All providers failed
    const totalDuration = Date.now() - startTime;
    this.logger.warn(`[MANAGER] All providers failed [${totalDuration}ms]: ${attemptedProviders.join(', ')}`);

    // Track stats
    this.lastVerificationStats = {
      provider: attemptedProviders[attemptedProviders.length - 1] || SlipProvider.THUNDER,
      duration: totalDuration,
      success: false,
      failoverUsed: attemptedProviders.length > 1,
    };

    // Return generic error (don't expose which providers failed)
    return {
      status: 'error',
      provider: SlipProvider.THUNDER, // Don't expose actual provider
      message: 'ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่อีกครั้ง',
    };
  }

  /**
   * Verify with retry for transient errors
   * ลองใหม่ 1 ครั้งก่อน failover (สำหรับ network glitch)
   */
  private async verifyWithRetry(
    provider: SlipVerificationProvider,
    imageData: Buffer,
    apiKey: string,
    providerName: SlipProvider,
    maxRetries: number = 1,
  ): Promise<NormalizedVerificationResult> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await provider.verify(imageData, apiKey);
      } catch (error) {
        lastError = error;

        // Only retry for transient errors
        if (error instanceof ProviderUnavailableError) {
          const isTransient = ['Timeout', 'Connection refused'].includes(error.reason);
          if (isTransient && attempt < maxRetries) {
            this.logger.debug(`[MANAGER] ${providerName} transient error, retrying... (${attempt + 1}/${maxRetries})`);
            await this.delay(500); // Wait 500ms before retry
            continue;
          }
        }

        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Remove provider-specific info from result (user shouldn't know which provider)
   */
  private sanitizeResultForUser(result: NormalizedVerificationResult): NormalizedVerificationResult {
    // Remove provider from result - user shouldn't see this
    const sanitized = { ...result };

    // Keep provider for internal logging but it won't be exposed in final response
    // The SlipVerificationService.convertToSlipVerificationResult will handle this

    return sanitized;
  }

  /**
   * Get last verification stats (for admin monitoring)
   */
  getLastVerificationStats(): VerificationStats | null {
    return this.lastVerificationStats;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
   * ใช้ slipApiProvider เป็นหลัก และ slipApiProviderSecondary เมื่อเปิด failover
   */
  private getFailoverOrder(settings: any): SlipProvider[] {
    const order: SlipProvider[] = [];

    // Primary provider - ใช้ slipApiProvider เสมอ
    const primary = (settings.slipApiProvider || 'thunder') as SlipProvider;
    if (this.providers.has(primary)) {
      order.push(primary);
    }

    // Secondary provider - เพิ่มเมื่อ failover เปิดและมี provider สำรอง
    if (settings.slipApiFallbackEnabled) {
      // ถ้ามี slipApiProviderSecondary ให้ใช้
      if (settings.slipApiProviderSecondary) {
        const secondary = settings.slipApiProviderSecondary as SlipProvider;
        if (this.providers.has(secondary) && !order.includes(secondary)) {
          order.push(secondary);
        }
      } else {
        // ถ้าไม่มี secondary แต่เปิด failover ให้เพิ่ม provider อื่นที่ไม่ใช่ primary
        const allProviders = Array.from(this.providers.keys());
        for (const p of allProviders) {
          if (!order.includes(p)) {
            order.push(p);
          }
        }
      }
    }

    // Default: at least Thunder
    if (order.length === 0) {
      order.push(SlipProvider.THUNDER);
    }

    this.logger.debug(`[MANAGER] Provider order: ${order.join(' → ')} (failover=${settings.slipApiFallbackEnabled})`);
    return order;
  }

  /**
   * Get API key for a specific provider
   * ให้ความสำคัญกับ key ใหม่ก่อน แล้วค่อย fallback ไป key เก่า
   */
  private getApiKeyForProvider(provider: SlipProvider, settings: any): string | null {
    let apiKey: string | null = null;

    switch (provider) {
      case SlipProvider.THUNDER:
        // ใช้ slipApiKeyThunder ก่อน แล้วค่อย fallback ไป slipApiKey (เก่า)
        apiKey = settings.slipApiKeyThunder || settings.slipApiKey || null;
        break;

      case SlipProvider.SLIPMATE:
        // ใช้ slipApiKeySlipMate ก่อน แล้วค่อย fallback ไป slipApiKeySecondary (เก่า)
        apiKey = settings.slipApiKeySlipMate || settings.slipApiKeySecondary || null;
        break;

      default:
        return null;
    }

    // Log for debugging
    if (apiKey) {
      this.logger.debug(`[MANAGER] API key found for ${provider}: ${apiKey.substring(0, 8)}...`);
    } else {
      this.logger.warn(`[MANAGER] No API key found for ${provider}`);
    }

    return apiKey;
  }
}
