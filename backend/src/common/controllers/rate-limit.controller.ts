import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/schemas/user.schema';
import { RateLimitService } from '../services/rate-limit.service';
import { RateLimitType, RateLimitAction } from '../../database/schemas/rate-limit-log.schema';

@ApiTags('Rate Limit')
@ApiBearerAuth()
@Controller('rate-limit')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RateLimitController {
  constructor(private rateLimitService: RateLimitService) {}

  /**
   * Get rate limit statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get rate limit statistics (Admin only)' })
  @ApiQuery({ name: 'period', required: false, description: 'Period in minutes (default: 60)' })
  async getStats(@Query('period') period?: string) {
    const periodMinutes = parseInt(period || '60', 10);
    const stats = await this.rateLimitService.getStats(periodMinutes);

    return {
      success: true,
      stats,
    };
  }

  /**
   * Get rate limit logs
   */
  @Get('logs')
  @ApiOperation({ summary: 'Get rate limit logs (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of logs to return (default: 100)' })
  @ApiQuery({ name: 'type', required: false, enum: RateLimitType })
  @ApiQuery({ name: 'action', required: false, enum: RateLimitAction })
  @ApiQuery({ name: 'clientIp', required: false })
  @ApiQuery({ name: 'accountSlug', required: false })
  @ApiQuery({ name: 'isTest', required: false })
  async getLogs(
    @Query('limit') limit?: string,
    @Query('type') type?: RateLimitType,
    @Query('action') action?: RateLimitAction,
    @Query('clientIp') clientIp?: string,
    @Query('accountSlug') accountSlug?: string,
    @Query('isTest') isTest?: string,
  ) {
    const logs = await this.rateLimitService.getLogs({
      limit: parseInt(limit || '100', 10),
      type,
      action,
      clientIp,
      accountSlug,
      isTest: isTest === 'true' ? true : isTest === 'false' ? false : undefined,
    });

    return {
      success: true,
      count: logs.length,
      logs,
    };
  }

  /**
   * Get current in-memory metrics
   */
  @Get('metrics')
  @ApiOperation({ summary: 'Get current rate limit metrics (Admin only)' })
  async getMetrics() {
    const metrics = this.rateLimitService.getMetrics();

    const total = metrics.totalRequests;
    const blocked = metrics.blockedByIp + metrics.blockedByAccount + metrics.blockedByGlobal;

    return {
      success: true,
      metrics: {
        ...metrics,
        totalBlocked: blocked,
        blockRate: total > 0 ? ((blocked / total) * 100).toFixed(2) + '%' : '0%',
        periodStart: new Date(metrics.lastReset).toISOString(),
        periodDuration: Math.floor((Date.now() - metrics.lastReset) / 1000) + ' seconds',
      },
    };
  }

  /**
   * Run rate limit test
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run rate limit test (Admin only)' })
  async runTest(
    @Body()
    body: {
      testType: 'per_ip' | 'per_account' | 'global';
      requestCount: number;
      delayMs?: number;
      testIp?: string;
      testAccount?: string;
    },
  ) {
    // Validate request count (max 100 for safety)
    const requestCount = Math.min(body.requestCount || 20, 100);

    const result = await this.rateLimitService.runTest({
      testType: body.testType || 'per_ip',
      requestCount,
      delayMs: body.delayMs || 0,
      testIp: body.testIp,
      testAccount: body.testAccount,
    });

    return {
      success: true,
      message: `Test completed: ${result.requestsAllowed} allowed, ${result.requestsBlocked} blocked`,
      result,
    };
  }

  /**
   * Run quick test with preset configurations
   */
  @Post('test/quick')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run quick rate limit test with presets (Admin only)' })
  async runQuickTest(
    @Body()
    body: {
      preset: 'light' | 'medium' | 'heavy' | 'ddos_simulation';
    },
  ) {
    const presets = {
      light: { requestCount: 5, delayMs: 200, testType: 'per_ip' as const },
      medium: { requestCount: 15, delayMs: 50, testType: 'per_ip' as const },
      heavy: { requestCount: 30, delayMs: 10, testType: 'per_ip' as const },
      ddos_simulation: { requestCount: 50, delayMs: 0, testType: 'per_ip' as const },
    };

    const preset = presets[body.preset] || presets.light;

    const result = await this.rateLimitService.runTest({
      ...preset,
      testIp: `test-${body.preset}-${Date.now()}`,
      testAccount: `test-account-${body.preset}`,
    });

    return {
      success: true,
      preset: body.preset,
      message: `${body.preset.toUpperCase()} test completed: ${result.requestsAllowed} allowed, ${result.requestsBlocked} blocked (${result.blockRate.toFixed(1)}% blocked)`,
      result,
    };
  }

  /**
   * Clear test logs
   */
  @Delete('test/logs')
  @ApiOperation({ summary: 'Clear test logs (Admin only)' })
  async clearTestLogs() {
    const deletedCount = await this.rateLimitService.clearTestLogs();

    return {
      success: true,
      message: `Deleted ${deletedCount} test logs`,
      deletedCount,
    };
  }

  /**
   * Get test history
   */
  @Get('test/history')
  @ApiOperation({ summary: 'Get test history (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of logs to return (default: 50)' })
  async getTestHistory(@Query('limit') limit?: string) {
    const logs = await this.rateLimitService.getLogs({
      limit: parseInt(limit || '50', 10),
      isTest: true,
    });

    // Group by test session (based on metadata.testType and timestamp proximity)
    const sessions: any[] = [];
    let currentSession: any = null;

    for (const log of logs) {
      const logTime = new Date((log as any).createdAt).getTime();
      
      if (!currentSession || logTime - currentSession.lastTime > 5000) {
        // New session (more than 5 seconds gap)
        if (currentSession) {
          sessions.push(currentSession);
        }
        currentSession = {
          startTime: new Date((log as any).createdAt).toISOString(),
          lastTime: logTime,
          testType: (log as any).metadata?.testType || 'unknown',
          totalRequests: 0,
          allowedRequests: 0,
          blockedRequests: 0,
          logs: [],
        };
      }

      currentSession.lastTime = logTime;
      currentSession.totalRequests++;
      if ((log as any).action === RateLimitAction.ALLOWED) {
        currentSession.allowedRequests++;
      } else {
        currentSession.blockedRequests++;
      }
      currentSession.logs.push(log);
    }

    if (currentSession) {
      sessions.push(currentSession);
    }

    return {
      success: true,
      sessionCount: sessions.length,
      sessions: sessions.map((s) => ({
        startTime: s.startTime,
        testType: s.testType,
        totalRequests: s.totalRequests,
        allowedRequests: s.allowedRequests,
        blockedRequests: s.blockedRequests,
        blockRate: ((s.blockedRequests / s.totalRequests) * 100).toFixed(1) + '%',
      })),
    };
  }
}
