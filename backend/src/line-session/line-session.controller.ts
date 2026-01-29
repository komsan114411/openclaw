import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { KeyStorageService } from './services/key-storage.service';
import { SessionHealthService, HealthStatus } from './services/session-health.service';
import { ReloginSchedulerService } from './services/relogin-scheduler.service';
import { SetKeysDto, CopyKeysDto, ParseCurlDto } from './dto/set-keys.dto';

@ApiTags('LINE Session')
@ApiBearerAuth()
@Controller('api/admin/line-session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class LineSessionController {
  private readonly logger = new Logger(LineSessionController.name);

  constructor(
    private keyStorageService: KeyStorageService,
    private sessionHealthService: SessionHealthService,
    private reloginSchedulerService: ReloginSchedulerService,
  ) {}

  // ================================
  // KEY MANAGEMENT
  // ================================

  /**
   * ดึง active session ของ LINE Account
   */
  @Get(':lineAccountId')
  @ApiOperation({ summary: 'Get active session for LINE Account' })
  async getSession(@Param('lineAccountId') lineAccountId: string) {
    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    if (!session) {
      return {
        success: true,
        hasSession: false,
        session: null,
      };
    }

    return {
      success: true,
      hasSession: true,
      session: {
        id: session._id,
        lineAccountId: session.lineAccountId,
        hasKeys: !!(session.xLineAccess && session.xHmac),
        extractedAt: session.extractedAt,
        expiresAt: session.expiresAt,
        lastCheckedAt: session.lastCheckedAt,
        lastCheckResult: session.lastCheckResult,
        status: session.status,
        source: session.source,
        consecutiveFailures: session.consecutiveFailures,
        // ไม่ส่ง keys กลับเพื่อความปลอดภัย
      },
    };
  }

  /**
   * ตั้งค่า keys แบบ manual
   */
  @Post(':lineAccountId/keys')
  @ApiOperation({ summary: 'Set keys manually' })
  async setKeys(
    @Param('lineAccountId') lineAccountId: string,
    @Body() dto: SetKeysDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const session = await this.keyStorageService.saveKeys({
      lineAccountId,
      xLineAccess: dto.xLineAccess,
      xHmac: dto.xHmac,
      userAgent: dto.userAgent,
      lineVersion: dto.lineVersion,
      source: 'manual_input',
      performedBy: user.userId,
      ipAddress: req.ip,
    });

    return {
      success: true,
      message: 'Keys saved successfully',
      sessionId: session._id,
    };
  }

  /**
   * Parse cURL command และสกัด keys
   */
  @Post(':lineAccountId/parse-curl')
  @ApiOperation({ summary: 'Parse cURL command and extract keys' })
  async parseCurl(
    @Param('lineAccountId') lineAccountId: string,
    @Body() dto: ParseCurlDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const extracted = this.extractKeysFromCurl(dto.curlCommand);

    if (!extracted.xLineAccess || !extracted.xHmac) {
      throw new BadRequestException('Could not extract keys from cURL command');
    }

    const session = await this.keyStorageService.saveKeys({
      lineAccountId,
      xLineAccess: extracted.xLineAccess,
      xHmac: extracted.xHmac,
      userAgent: extracted.userAgent,
      source: 'curl_parse',
      performedBy: user.userId,
      ipAddress: req.ip,
      metadata: { curlCommand: dto.curlCommand.substring(0, 200) },
    });

    return {
      success: true,
      message: 'Keys extracted and saved successfully',
      sessionId: session._id,
      extracted: {
        hasXLineAccess: !!extracted.xLineAccess,
        hasXHmac: !!extracted.xHmac,
        hasUserAgent: !!extracted.userAgent,
      },
    };
  }

  /**
   * Copy keys จาก account อื่น
   */
  @Post(':lineAccountId/copy-keys')
  @ApiOperation({ summary: 'Copy keys from another LINE Account' })
  async copyKeys(
    @Param('lineAccountId') lineAccountId: string,
    @Body() dto: CopyKeysDto,
    @CurrentUser() user: AuthUser,
  ) {
    const session = await this.keyStorageService.copyKeysFromAccount(
      lineAccountId,
      dto.sourceLineAccountId,
      user.userId,
    );

    return {
      success: true,
      message: 'Keys copied successfully',
      sessionId: session._id,
    };
  }

  /**
   * ดึงประวัติ keys
   */
  @Get(':lineAccountId/history')
  @ApiOperation({ summary: 'Get key extraction history' })
  async getKeyHistory(
    @Param('lineAccountId') lineAccountId: string,
    @Query('limit') limit?: number,
  ) {
    const history = await this.keyStorageService.getKeyHistory(
      lineAccountId,
      limit || 20,
    );

    return {
      success: true,
      history: history.map((h) => ({
        id: h._id,
        extractedAt: h.extractedAt,
        source: h.source,
        status: h.status,
        performedBy: h.performedBy,
        durationMs: h.durationMs,
        errorMessage: h.errorMessage,
      })),
    };
  }

  // ================================
  // HEALTH CHECK
  // ================================

  /**
   * ดึงสถานะ health ของ session
   */
  @Get(':lineAccountId/health')
  @ApiOperation({ summary: 'Get session health status' })
  async getHealth(@Param('lineAccountId') lineAccountId: string) {
    const health = await this.sessionHealthService.getHealthStatus(lineAccountId);

    if (!health) {
      return {
        success: true,
        hasSession: false,
        health: null,
      };
    }

    return {
      success: true,
      hasSession: true,
      health,
    };
  }

  /**
   * ดึงสถานะ health ของทุก sessions
   */
  @Get('health/all')
  @ApiOperation({ summary: 'Get health status of all sessions' })
  async getAllHealth() {
    const statuses = await this.sessionHealthService.getAllHealthStatuses();

    return {
      success: true,
      total: statuses.length,
      healthy: statuses.filter((s) => s.status === HealthStatus.HEALTHY).length,
      unhealthy: statuses.filter((s) => s.status === HealthStatus.UNHEALTHY).length,
      expired: statuses.filter((s) => s.status === HealthStatus.EXPIRED).length,
      statuses,
    };
  }

  /**
   * บังคับตรวจสอบ health ทันที
   */
  @Post(':lineAccountId/health/check')
  @ApiOperation({ summary: 'Force health check now' })
  async forceHealthCheck(@Param('lineAccountId') lineAccountId: string) {
    const session = await this.keyStorageService.getActiveSession(lineAccountId);
    if (!session) {
      return {
        success: false,
        message: 'No active session found',
      };
    }

    const result = await this.sessionHealthService.checkSessionHealth(session);

    return {
      success: true,
      result,
    };
  }

  // ================================
  // RELOGIN
  // ================================

  /**
   * Trigger relogin แบบ manual
   */
  @Post(':lineAccountId/relogin')
  @ApiOperation({ summary: 'Trigger manual relogin' })
  async triggerRelogin(@Param('lineAccountId') lineAccountId: string) {
    await this.reloginSchedulerService.triggerRelogin(lineAccountId, 'manual');

    return {
      success: true,
      message: 'Relogin triggered',
    };
  }

  /**
   * ดึง relogin queue
   */
  @Get('relogin/queue')
  @ApiOperation({ summary: 'Get relogin queue' })
  async getReloginQueue() {
    const queue = this.reloginSchedulerService.getQueue();

    return {
      success: true,
      queueSize: queue.length,
      queue,
    };
  }

  /**
   * ลบ job ออกจาก queue
   */
  @Delete('relogin/queue/:lineAccountId')
  @ApiOperation({ summary: 'Remove from relogin queue' })
  async removeFromQueue(@Param('lineAccountId') lineAccountId: string) {
    const removed = this.reloginSchedulerService.removeFromQueue(lineAccountId);

    return {
      success: true,
      removed,
    };
  }

  /**
   * Clear relogin queue
   */
  @Delete('relogin/queue')
  @ApiOperation({ summary: 'Clear relogin queue' })
  async clearQueue() {
    this.reloginSchedulerService.clearQueue();

    return {
      success: true,
      message: 'Queue cleared',
    };
  }

  // ================================
  // UTILITIES
  // ================================

  /**
   * Extract keys from cURL command
   */
  private extractKeysFromCurl(curlCommand: string): {
    xLineAccess?: string;
    xHmac?: string;
    userAgent?: string;
  } {
    const result: {
      xLineAccess?: string;
      xHmac?: string;
      userAgent?: string;
    } = {};

    // Extract X-Line-Access
    const xLineAccessMatch = curlCommand.match(
      /['"]-H['"]?\s*['"]?X-Line-Access:\s*([^'"]+)['"]/i,
    ) || curlCommand.match(/X-Line-Access:\s*([^\s'"]+)/i);
    if (xLineAccessMatch) {
      result.xLineAccess = xLineAccessMatch[1].trim();
    }

    // Extract X-Hmac
    const xHmacMatch = curlCommand.match(
      /['"]-H['"]?\s*['"]?X-Hmac:\s*([^'"]+)['"]/i,
    ) || curlCommand.match(/X-Hmac:\s*([^\s'"]+)/i);
    if (xHmacMatch) {
      result.xHmac = xHmacMatch[1].trim();
    }

    // Extract User-Agent
    const userAgentMatch = curlCommand.match(
      /['"]-H['"]?\s*['"]?User-Agent:\s*([^'"]+)['"]/i,
    ) || curlCommand.match(/User-Agent:\s*([^\n'"]+)/i);
    if (userAgentMatch) {
      result.userAgent = userAgentMatch[1].trim();
    }

    return result;
  }
}
