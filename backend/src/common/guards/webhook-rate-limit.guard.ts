import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RedisService, RateLimitResult } from '../../redis/redis.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';

/**
 * Webhook Rate Limit Guard
 *
 * This guard protects webhook endpoints from DDoS attacks by implementing
 * a THREE-tier rate limiting strategy:
 *
 * 1. Per IP Address - Limits requests per client IP (prevents single attacker)
 * 2. Per LINE Account - Limits requests per LINE Official Account
 * 3. Global - Limits total requests across all accounts
 *
 * Features:
 * - TRUE Sliding Window algorithm (not fixed window)
 * - Configurable from Admin Panel (stored in database)
 * - Cached settings to reduce database load
 * - Returns HTTP 429 with Retry-After header when rate limit exceeded
 * - X-RateLimit-* headers for monitoring
 * - Does NOT trigger business logic when blocked
 * - Supports both per-second and per-minute limits
 *
 * Flow:
 * 1. Request arrives at webhook
 * 2. Check per-IP rate limit (prevents single attacker)
 * 3. Guard extracts LINE Account ID from URL params
 * 4. Check per-account rate limit (Redis/memory)
 * 5. Check global rate limit (Redis/memory)
 * 6. If any exceeded → return 429 with Retry-After header
 * 7. If all pass → forward to webhook handler with rate limit headers
 */
@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WebhookRateLimitGuard.name);
  private settingsCache: {
    data: RateLimitConfig | null;
    expiry: number;
  } = { data: null, expiry: 0 };
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  // Metrics for monitoring
  private metrics = {
    totalRequests: 0,
    blockedByIp: 0,
    blockedByAccount: 0,
    blockedByGlobal: 0,
    lastReset: Date.now(),
  };

  constructor(
    private redisService: RedisService,
    private systemSettingsService: SystemSettingsService,
  ) {
    // Reset metrics every hour
    setInterval(() => {
      this.logger.log(
        `[METRICS] Requests: ${this.metrics.totalRequests}, ` +
        `Blocked (IP: ${this.metrics.blockedByIp}, Account: ${this.metrics.blockedByAccount}, Global: ${this.metrics.blockedByGlobal})`,
      );
      this.metrics = { totalRequests: 0, blockedByIp: 0, blockedByAccount: 0, blockedByGlobal: 0, lastReset: Date.now() };
    }, 3600000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    this.metrics.totalRequests++;

    // Get rate limit config (cached)
    const config = await this.getRateLimitConfig();

    // If rate limiting is disabled, allow all
    if (!config.enabled) {
      return true;
    }

    // Get client IP address
    const clientIp = this.getClientIp(request);

    // Check per-IP limits first (prevents single attacker from overwhelming)
    const ipResult = await this.checkPerIpLimit(clientIp, config);
    if (!ipResult.allowed) {
      this.metrics.blockedByIp++;
      this.logger.warn(`[RATE LIMIT] Per-IP limit exceeded for: ${clientIp}`);
      this.throwRateLimitException(config.message, 'per_ip', clientIp, ipResult, response);
    }

    // Extract LINE Account identifier from URL params
    const slug = request.params?.slug;

    if (slug) {
      // Check per-account limits
      const accountResult = await this.checkPerAccountLimit(slug, config);
      if (!accountResult.allowed) {
        this.metrics.blockedByAccount++;
        this.logger.warn(`[RATE LIMIT] Per-account limit exceeded for: ${slug}`);
        this.throwRateLimitException(config.message, 'per_account', slug, accountResult, response);
      }
    }

    // Check global limits
    const globalResult = await this.checkGlobalLimit(config);
    if (!globalResult.allowed) {
      this.metrics.blockedByGlobal++;
      this.logger.warn(`[RATE LIMIT] Global limit exceeded`);
      this.throwRateLimitException(config.message, 'global', undefined, globalResult, response);
    }

    // Add rate limit headers for successful requests
    this.setRateLimitHeaders(response, globalResult, config);

    return true;
  }

  /**
   * Get client IP address (handles proxies)
   */
  private getClientIp(request: any): string {
    // Check common proxy headers
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      // Take the first IP (original client)
      return String(forwarded).split(',')[0].trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return String(realIp).trim();
    }

    // Fallback to connection IP
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }

  /**
   * Set rate limit headers on response
   */
  private setRateLimitHeaders(response: any, result: RateLimitResult, config: RateLimitConfig): void {
    if (response.setHeader) {
      response.setHeader('X-RateLimit-Limit', result.limit);
      response.setHeader('X-RateLimit-Remaining', result.remaining);
      response.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
    }
  }

  /**
   * Check per-IP rate limits (stricter limits to prevent single attacker)
   */
  private async checkPerIpLimit(
    clientIp: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    // IP limits are more strict: half of per-account limits
    const ipLimitPerSecond = Math.max(5, Math.floor(config.perAccountPerSecond / 2));
    const ipLimitPerMinute = Math.max(30, Math.floor(config.perAccountPerMinute / 2));

    // Check per-second limit
    const perSecondResult = await this.redisService.rateLimitWithInfo(
      `webhook:ip:${clientIp}:second`,
      ipLimitPerSecond,
      1,
    );

    if (!perSecondResult.allowed) {
      return perSecondResult;
    }

    // Check per-minute limit
    return this.redisService.rateLimitWithInfo(
      `webhook:ip:${clientIp}:minute`,
      ipLimitPerMinute,
      60,
    );
  }

  /**
   * Check per-account rate limits (per second and per minute)
   */
  private async checkPerAccountLimit(
    accountId: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    // Check per-second limit
    const perSecondResult = await this.redisService.rateLimitWithInfo(
      `webhook:account:${accountId}:second`,
      config.perAccountPerSecond,
      1,
    );

    if (!perSecondResult.allowed) {
      return perSecondResult;
    }

    // Check per-minute limit
    return this.redisService.rateLimitWithInfo(
      `webhook:account:${accountId}:minute`,
      config.perAccountPerMinute,
      60,
    );
  }

  /**
   * Check global rate limits (per second and per minute)
   */
  private async checkGlobalLimit(config: RateLimitConfig): Promise<RateLimitResult> {
    // Check global per-second limit
    const perSecondResult = await this.redisService.rateLimitWithInfo(
      `webhook:global:second`,
      config.globalPerSecond,
      1,
    );

    if (!perSecondResult.allowed) {
      return perSecondResult;
    }

    // Check global per-minute limit
    return this.redisService.rateLimitWithInfo(
      `webhook:global:minute`,
      config.globalPerMinute,
      60,
    );
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
   * Throw HTTP 429 exception with proper headers
   */
  private throwRateLimitException(
    message: string,
    limitType: 'per_ip' | 'per_account' | 'global',
    identifier?: string,
    result?: RateLimitResult,
    response?: any,
  ): never {
    // Set Retry-After header if we have the response object
    if (response?.setHeader && result) {
      response.setHeader('Retry-After', result.retryAfter || 1);
      response.setHeader('X-RateLimit-Limit', result.limit);
      response.setHeader('X-RateLimit-Remaining', 0);
      response.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too Many Requests',
        limitType,
        identifier,
        retryAfter: result?.retryAfter || 1,
        resetAt: result ? new Date(result.resetAt).toISOString() : undefined,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Get current metrics (for monitoring endpoints)
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
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
