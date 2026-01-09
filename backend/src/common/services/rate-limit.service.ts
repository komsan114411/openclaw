import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RedisService, RateLimitResult } from '../../redis/redis.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import {
  RateLimitLog,
  RateLimitLogDocument,
  RateLimitType,
  RateLimitAction,
} from '../../database/schemas/rate-limit-log.schema';

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  blockedByIp: number;
  blockedByAccount: number;
  blockedByGlobal: number;
  blockRate: number;
  topBlockedIps: { ip: string; count: number }[];
  topBlockedAccounts: { account: string; count: number }[];
  recentLogs: any[];
  period: string;
}

export interface RateLimitTestResult {
  success: boolean;
  testMode: 'simulation' | 'real_webhook';
  targetAccount?: {
    id: string;
    name: string;
    webhookSlug: string;
  };
  requestsSent: number;
  requestsBlocked: number;
  requestsAllowed: number;
  requestsError: number;
  blockRate: number;
  averageResponseTime: number;
  logs: {
    requestNumber: number;
    status: 'allowed' | 'blocked' | 'error';
    statusCode?: number;
    responseTime: number;
    remaining?: number;
    retryAfter?: number;
    errorMessage?: string;
  }[];
  config: {
    perIpPerSecond: number;
    perIpPerMinute: number;
    perAccountPerSecond: number;
    perAccountPerMinute: number;
    globalPerSecond: number;
    globalPerMinute: number;
  };
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  // In-memory metrics (reset hourly)
  private metrics = {
    totalRequests: 0,
    blockedByIp: 0,
    blockedByAccount: 0,
    blockedByGlobal: 0,
    lastReset: Date.now(),
  };

  constructor(
    @InjectModel(RateLimitLog.name)
    private rateLimitLogModel: Model<RateLimitLogDocument>,
    private redisService: RedisService,
    private systemSettingsService: SystemSettingsService,
    private configService: ConfigService,
  ) {
    // Reset metrics every hour and log summary
    setInterval(() => {
      this.logMetricsSummary();
      this.resetMetrics();
    }, 3600000);
  }

  /**
   * Log a rate limit event
   */
  async logRateLimitEvent(
    type: RateLimitType,
    action: RateLimitAction,
    data: {
      clientIp?: string;
      accountSlug?: string;
      endpoint?: string;
      userAgent?: string;
      requestCount?: number;
      limit?: number;
      retryAfter?: number;
      resetAt?: Date;
      message?: string;
      metadata?: Record<string, any>;
      isTest?: boolean;
    },
  ): Promise<void> {
    try {
      // Update in-memory metrics
      this.metrics.totalRequests++;
      if (action === RateLimitAction.BLOCKED) {
        if (type === RateLimitType.PER_IP) this.metrics.blockedByIp++;
        if (type === RateLimitType.PER_ACCOUNT) this.metrics.blockedByAccount++;
        if (type === RateLimitType.GLOBAL) this.metrics.blockedByGlobal++;
      }

      // Save to database (non-blocking)
      const log = new this.rateLimitLogModel({
        type,
        action,
        ...data,
      });
      await log.save();

      // Log to console for real-time monitoring
      if (action === RateLimitAction.BLOCKED) {
        this.logger.warn(
          `[RATE LIMIT BLOCKED] Type: ${type}, IP: ${data.clientIp || 'N/A'}, ` +
          `Account: ${data.accountSlug || 'N/A'}, Limit: ${data.limit}, ` +
          `RetryAfter: ${data.retryAfter}s`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to log rate limit event: ${error}`);
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStats(periodMinutes: number = 60): Promise<RateLimitStats> {
    const since = new Date(Date.now() - periodMinutes * 60 * 1000);

    const [totalLogs, blockedLogs, topIps, topAccounts, recentLogs] = await Promise.all([
      // Total requests
      this.rateLimitLogModel.countDocuments({
        createdAt: { $gte: since },
        isTest: { $ne: true },
      }),
      // Blocked requests by type
      this.rateLimitLogModel.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            action: RateLimitAction.BLOCKED,
            isTest: { $ne: true },
          },
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
          },
        },
      ]),
      // Top blocked IPs
      this.rateLimitLogModel.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            action: RateLimitAction.BLOCKED,
            clientIp: { $exists: true, $ne: null },
            isTest: { $ne: true },
          },
        },
        {
          $group: {
            _id: '$clientIp',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // Top blocked accounts
      this.rateLimitLogModel.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            action: RateLimitAction.BLOCKED,
            accountSlug: { $exists: true, $ne: null },
            isTest: { $ne: true },
          },
        },
        {
          $group: {
            _id: '$accountSlug',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // Recent logs
      this.rateLimitLogModel
        .find({ createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    // Calculate blocked counts by type
    const blockedByType = blockedLogs.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const blockedRequests =
      (blockedByType[RateLimitType.PER_IP] || 0) +
      (blockedByType[RateLimitType.PER_ACCOUNT] || 0) +
      (blockedByType[RateLimitType.GLOBAL] || 0);

    return {
      totalRequests: totalLogs,
      blockedRequests,
      blockedByIp: blockedByType[RateLimitType.PER_IP] || 0,
      blockedByAccount: blockedByType[RateLimitType.PER_ACCOUNT] || 0,
      blockedByGlobal: blockedByType[RateLimitType.GLOBAL] || 0,
      blockRate: totalLogs > 0 ? (blockedRequests / totalLogs) * 100 : 0,
      topBlockedIps: topIps.map((item: any) => ({ ip: item._id, count: item.count })),
      topBlockedAccounts: topAccounts.map((item: any) => ({ account: item._id, count: item.count })),
      recentLogs: recentLogs as any[],
      period: `${periodMinutes} minutes`,
    };
  }

  /**
   * Get recent logs with filtering
   */
  async getLogs(options: {
    limit?: number;
    type?: RateLimitType;
    action?: RateLimitAction;
    clientIp?: string;
    accountSlug?: string;
    isTest?: boolean;
  }): Promise<any[]> {
    const query: any = {};

    if (options.type) query.type = options.type;
    if (options.action) query.action = options.action;
    if (options.clientIp) query.clientIp = options.clientIp;
    if (options.accountSlug) query.accountSlug = options.accountSlug;
    if (options.isTest !== undefined) query.isTest = options.isTest;

    return this.rateLimitLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 100)
      .lean();
  }

  /**
   * Run rate limit test - simulation mode (Redis only)
   */
  async runSimulationTest(options: {
    testType: 'per_ip' | 'per_account' | 'global';
    requestCount: number;
    delayMs?: number;
    testIp?: string;
    testAccount?: string;
  }): Promise<RateLimitTestResult> {
    const settings = await this.systemSettingsService.getSettings();
    const testIp = options.testIp || `test-${Date.now()}`;
    const testAccount = options.testAccount || `test-account-${Date.now()}`;
    const delayMs = options.delayMs || 0;

    // Get current config
    const config = {
      perIpPerSecond: Math.max(5, Math.floor((settings?.webhookRateLimitPerAccountPerSecond || 10) / 2)),
      perIpPerMinute: Math.max(30, Math.floor((settings?.webhookRateLimitPerAccountPerMinute || 100) / 2)),
      perAccountPerSecond: settings?.webhookRateLimitPerAccountPerSecond || 10,
      perAccountPerMinute: settings?.webhookRateLimitPerAccountPerMinute || 100,
      globalPerSecond: settings?.webhookRateLimitGlobalPerSecond || 100,
      globalPerMinute: settings?.webhookRateLimitGlobalPerMinute || 1000,
    };

    const logs: RateLimitTestResult['logs'] = [];
    let requestsBlocked = 0;
    let requestsAllowed = 0;
    let totalResponseTime = 0;

    this.logger.log(`[RATE LIMIT TEST] Starting simulation test: ${options.testType}, ${options.requestCount} requests`);

    for (let i = 0; i < options.requestCount; i++) {
      const startTime = Date.now();
      let result: RateLimitResult;
      let limitType: RateLimitType;

      // Simulate rate limit check based on test type
      switch (options.testType) {
        case 'per_ip':
          limitType = RateLimitType.PER_IP;
          result = await this.redisService.rateLimitWithInfo(
            `test:webhook:ip:${testIp}:second`,
            config.perIpPerSecond,
            1,
          );
          break;
        case 'per_account':
          limitType = RateLimitType.PER_ACCOUNT;
          result = await this.redisService.rateLimitWithInfo(
            `test:webhook:account:${testAccount}:second`,
            config.perAccountPerSecond,
            1,
          );
          break;
        case 'global':
        default:
          limitType = RateLimitType.GLOBAL;
          result = await this.redisService.rateLimitWithInfo(
            `test:webhook:global:second`,
            config.globalPerSecond,
            1,
          );
          break;
      }

      const responseTime = Date.now() - startTime;
      totalResponseTime += responseTime;

      if (result.allowed) {
        requestsAllowed++;
      } else {
        requestsBlocked++;
      }

      logs.push({
        requestNumber: i + 1,
        status: result.allowed ? 'allowed' : 'blocked',
        responseTime,
        remaining: result.remaining,
        retryAfter: result.retryAfter,
      });

      // Log to database
      await this.logRateLimitEvent(
        limitType,
        result.allowed ? RateLimitAction.ALLOWED : RateLimitAction.BLOCKED,
        {
          clientIp: testIp,
          accountSlug: testAccount,
          endpoint: '/test/simulation',
          requestCount: result.current,
          limit: result.limit,
          retryAfter: result.retryAfter,
          resetAt: new Date(result.resetAt),
          isTest: true,
          metadata: { testType: options.testType, requestNumber: i + 1, mode: 'simulation' },
        },
      );

      // Add delay between requests if specified
      if (delayMs > 0 && i < options.requestCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const testResult: RateLimitTestResult = {
      success: true,
      testMode: 'simulation',
      requestsSent: options.requestCount,
      requestsBlocked,
      requestsAllowed,
      requestsError: 0,
      blockRate: (requestsBlocked / options.requestCount) * 100,
      averageResponseTime: totalResponseTime / options.requestCount,
      logs,
      config,
    };

    this.logger.log(
      `[RATE LIMIT TEST] Simulation complete: ${requestsAllowed} allowed, ${requestsBlocked} blocked ` +
      `(${testResult.blockRate.toFixed(1)}% block rate)`,
    );

    return testResult;
  }

  /**
   * Run rate limit test - real webhook mode (HTTP requests to actual webhook)
   */
  async runRealWebhookTest(options: {
    webhookSlug: string;
    accountName: string;
    accountId: string;
    requestCount: number;
    delayMs?: number;
  }): Promise<RateLimitTestResult> {
    const settings = await this.systemSettingsService.getSettings();
    const delayMs = options.delayMs || 0;

    // Get base URL
    const baseUrl = settings?.publicBaseUrl || this.configService.get('PUBLIC_BASE_URL') || 'http://localhost:3000';
    const webhookUrl = `${baseUrl}/webhook/${options.webhookSlug}`;

    // Get current config
    const config = {
      perIpPerSecond: Math.max(5, Math.floor((settings?.webhookRateLimitPerAccountPerSecond || 10) / 2)),
      perIpPerMinute: Math.max(30, Math.floor((settings?.webhookRateLimitPerAccountPerMinute || 100) / 2)),
      perAccountPerSecond: settings?.webhookRateLimitPerAccountPerSecond || 10,
      perAccountPerMinute: settings?.webhookRateLimitPerAccountPerMinute || 100,
      globalPerSecond: settings?.webhookRateLimitGlobalPerSecond || 100,
      globalPerMinute: settings?.webhookRateLimitGlobalPerMinute || 1000,
    };

    const logs: RateLimitTestResult['logs'] = [];
    let requestsBlocked = 0;
    let requestsAllowed = 0;
    let requestsError = 0;
    let totalResponseTime = 0;

    this.logger.log(`[RATE LIMIT TEST] Starting REAL webhook test to: ${webhookUrl}`);
    this.logger.log(`[RATE LIMIT TEST] Account: ${options.accountName}, Requests: ${options.requestCount}`);

    // Create a fake LINE webhook event for testing
    const fakeLineEvent = {
      destination: 'test-destination',
      events: [
        {
          type: 'message',
          message: {
            type: 'text',
            id: `test-${Date.now()}`,
            text: '[RATE LIMIT TEST] This is a test message',
          },
          timestamp: Date.now(),
          source: {
            type: 'user',
            userId: `test-user-${Date.now()}`,
          },
          replyToken: 'test-reply-token',
          mode: 'active',
        },
      ],
    };

    for (let i = 0; i < options.requestCount; i++) {
      const startTime = Date.now();
      let status: 'allowed' | 'blocked' | 'error' = 'allowed';
      let statusCode: number | undefined;
      let errorMessage: string | undefined;
      let retryAfter: number | undefined;

      try {
        const response = await axios.post(webhookUrl, fakeLineEvent, {
          headers: {
            'Content-Type': 'application/json',
            'X-Line-Signature': 'test-signature-for-rate-limit-test',
            'User-Agent': 'RateLimitTest/1.0',
            'X-Test-Request': 'true',
          },
          timeout: 10000,
          validateStatus: () => true, // Don't throw on any status code
        });

        statusCode = response.status;

        if (statusCode === 429) {
          // Rate limited
          status = 'blocked';
          requestsBlocked++;
          retryAfter = parseInt(response.headers['retry-after'] || '1', 10);
        } else if (statusCode >= 200 && statusCode < 300) {
          // Success (or signature validation failed, which is expected)
          status = 'allowed';
          requestsAllowed++;
        } else if (statusCode === 401 || statusCode === 403) {
          // Signature validation failed - this is expected, but request passed rate limit
          status = 'allowed';
          requestsAllowed++;
        } else {
          // Other error
          status = 'error';
          requestsError++;
          errorMessage = `HTTP ${statusCode}`;
        }
      } catch (error: any) {
        status = 'error';
        requestsError++;
        errorMessage = error.message || 'Unknown error';
      }

      const responseTime = Date.now() - startTime;
      totalResponseTime += responseTime;

      logs.push({
        requestNumber: i + 1,
        status,
        statusCode,
        responseTime,
        retryAfter,
        errorMessage,
      });

      // Log to database
      await this.logRateLimitEvent(
        RateLimitType.PER_ACCOUNT,
        status === 'blocked' ? RateLimitAction.BLOCKED : RateLimitAction.ALLOWED,
        {
          clientIp: 'test-client',
          accountSlug: options.webhookSlug,
          endpoint: webhookUrl,
          requestCount: i + 1,
          limit: config.perAccountPerSecond,
          retryAfter,
          isTest: true,
          metadata: {
            mode: 'real_webhook',
            accountId: options.accountId,
            accountName: options.accountName,
            statusCode,
            requestNumber: i + 1,
          },
        },
      );

      // Add delay between requests if specified
      if (delayMs > 0 && i < options.requestCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const testResult: RateLimitTestResult = {
      success: true,
      testMode: 'real_webhook',
      targetAccount: {
        id: options.accountId,
        name: options.accountName,
        webhookSlug: options.webhookSlug,
      },
      requestsSent: options.requestCount,
      requestsBlocked,
      requestsAllowed,
      requestsError,
      blockRate: options.requestCount > 0 ? (requestsBlocked / options.requestCount) * 100 : 0,
      averageResponseTime: options.requestCount > 0 ? totalResponseTime / options.requestCount : 0,
      logs,
      config,
    };

    this.logger.log(
      `[RATE LIMIT TEST] Real webhook test complete: ${requestsAllowed} allowed, ${requestsBlocked} blocked, ${requestsError} errors ` +
      `(${testResult.blockRate.toFixed(1)}% block rate)`,
    );

    return testResult;
  }

  /**
   * Run rate limit test from admin panel (backward compatible)
   */
  async runTest(options: {
    testType: 'per_ip' | 'per_account' | 'global';
    requestCount: number;
    delayMs?: number;
    testIp?: string;
    testAccount?: string;
  }): Promise<RateLimitTestResult> {
    return this.runSimulationTest(options);
  }

  /**
   * Clear test logs
   */
  async clearTestLogs(): Promise<number> {
    const result = await this.rateLimitLogModel.deleteMany({ isTest: true });
    return result.deletedCount;
  }

  /**
   * Get current in-memory metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Log metrics summary
   */
  private logMetricsSummary(): void {
    const total = this.metrics.totalRequests;
    const blocked = this.metrics.blockedByIp + this.metrics.blockedByAccount + this.metrics.blockedByGlobal;
    const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(2) : '0';

    this.logger.log(
      `[RATE LIMIT METRICS] Period: ${new Date(this.metrics.lastReset).toISOString()} - ${new Date().toISOString()} | ` +
      `Total: ${total}, Blocked: ${blocked} (${blockRate}%) | ` +
      `By IP: ${this.metrics.blockedByIp}, By Account: ${this.metrics.blockedByAccount}, Global: ${this.metrics.blockedByGlobal}`,
    );
  }

  /**
   * Reset in-memory metrics
   */
  private resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      blockedByIp: 0,
      blockedByAccount: 0,
      blockedByGlobal: 0,
      lastReset: Date.now(),
    };
  }
}
