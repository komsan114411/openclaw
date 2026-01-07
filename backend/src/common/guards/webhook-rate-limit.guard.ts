import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';

/**
 * Webhook Rate Limit Guard
 *
 * This guard protects webhook endpoints from DDoS attacks by implementing
 * a two-tier rate limiting strategy:
 *
 * 1. Per LINE Account - Limits requests per LINE Official Account
 * 2. Global - Limits total requests across all accounts
 *
 * Features:
 * - Configurable from Admin Panel (stored in database)
 * - Cached settings to reduce database load
 * - Returns HTTP 429 when rate limit exceeded
 * - Does NOT trigger business logic when blocked
 * - Supports both per-second and per-minute limits
 *
 * Flow:
 * 1. Request arrives at webhook
 * 2. Guard extracts LINE Account ID from URL params
 * 3. Check per-account rate limit (Redis/memory)
 * 4. Check global rate limit (Redis/memory)
 * 5. If either exceeded → return 429 immediately
 * 6. If both pass → forward to webhook handler
 */
@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WebhookRateLimitGuard.name);
  private settingsCache: {
    data: RateLimitConfig | null;
    expiry: number;
  } = { data: null, expiry: 0 };
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  constructor(
    private redisService: RedisService,
    private systemSettingsService: SystemSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Get rate limit config (cached)
    const config = await this.getRateLimitConfig();

    // If rate limiting is disabled, allow all
    if (!config.enabled) {
      return true;
    }

    // Extract LINE Account identifier from URL params
    const slug = request.params?.slug;
    if (!slug) {
      // No slug = no per-account limiting, only global
      return this.checkGlobalLimit(config);
    }

    // Check per-account limits first (more specific)
    const accountAllowed = await this.checkPerAccountLimit(slug, config);
    if (!accountAllowed) {
      this.logger.warn(`[RATE LIMIT] Per-account limit exceeded for: ${slug}`);
      this.throwRateLimitException(config.message, 'per_account', slug);
    }

    // Check global limits
    const globalAllowed = await this.checkGlobalLimit(config);
    if (!globalAllowed) {
      this.logger.warn(`[RATE LIMIT] Global limit exceeded`);
      this.throwRateLimitException(config.message, 'global');
    }

    return true;
  }

  /**
   * Check per-account rate limits (per second and per minute)
   */
  private async checkPerAccountLimit(
    accountId: string,
    config: RateLimitConfig,
  ): Promise<boolean> {
    // Check per-second limit
    const perSecondKey = `webhook:account:${accountId}:second`;
    const perSecondAllowed = await this.redisService.rateLimit(
      perSecondKey,
      config.perAccountPerSecond,
      1, // 1 second window
    );

    if (!perSecondAllowed) {
      return false;
    }

    // Check per-minute limit
    const perMinuteKey = `webhook:account:${accountId}:minute`;
    const perMinuteAllowed = await this.redisService.rateLimit(
      perMinuteKey,
      config.perAccountPerMinute,
      60, // 60 second window
    );

    return perMinuteAllowed;
  }

  /**
   * Check global rate limits (per second and per minute)
   */
  private async checkGlobalLimit(config: RateLimitConfig): Promise<boolean> {
    // Check global per-second limit
    const perSecondKey = 'webhook:global:second';
    const perSecondAllowed = await this.redisService.rateLimit(
      perSecondKey,
      config.globalPerSecond,
      1, // 1 second window
    );

    if (!perSecondAllowed) {
      return false;
    }

    // Check global per-minute limit
    const perMinuteKey = 'webhook:global:minute';
    const perMinuteAllowed = await this.redisService.rateLimit(
      perMinuteKey,
      config.globalPerMinute,
      60, // 60 second window
    );

    return perMinuteAllowed;
  }

  /**
   * Get rate limit config from database (with caching)
   */
  private async getRateLimitConfig(): Promise<RateLimitConfig> {
    const now = Date.now();

    // Return cached if still valid
    if (this.settingsCache.data && now < this.settingsCache.expiry) {
      return this.settingsCache.data;
    }

    // Fetch from database
    try {
      const settings = await this.systemSettingsService.getSettings();

      const config: RateLimitConfig = {
        enabled: settings?.webhookRateLimitEnabled ?? true,
        perAccountPerSecond: settings?.webhookRateLimitPerAccountPerSecond ?? 10,
        perAccountPerMinute: settings?.webhookRateLimitPerAccountPerMinute ?? 100,
        globalPerSecond: settings?.webhookRateLimitGlobalPerSecond ?? 100,
        globalPerMinute: settings?.webhookRateLimitGlobalPerMinute ?? 1000,
        message: settings?.webhookRateLimitMessage ?? 'Too many requests, please try again later',
      };

      // Cache the config
      this.settingsCache = {
        data: config,
        expiry: now + this.CACHE_TTL_MS,
      };

      return config;
    } catch (error) {
      this.logger.error(`Failed to fetch rate limit config: ${error}`);

      // Return default config on error
      return {
        enabled: true,
        perAccountPerSecond: 10,
        perAccountPerMinute: 100,
        globalPerSecond: 100,
        globalPerMinute: 1000,
        message: 'Too many requests, please try again later',
      };
    }
  }

  /**
   * Throw HTTP 429 exception
   */
  private throwRateLimitException(
    message: string,
    limitType: 'per_account' | 'global',
    accountId?: string,
  ): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too Many Requests',
        limitType,
        accountId,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Rate limit configuration interface
 */
interface RateLimitConfig {
  enabled: boolean;
  perAccountPerSecond: number;
  perAccountPerMinute: number;
  globalPerSecond: number;
  globalPerMinute: number;
  message: string;
}
