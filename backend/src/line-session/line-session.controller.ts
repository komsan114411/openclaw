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
import { LineAutomationService, LoginStatus } from './services/line-automation.service';
import { MessageFetchService, BankCodes } from './services/message-fetch.service';
// Enhanced services (GSB-like features)
import { EnhancedAutomationService, EnhancedLoginStatus } from './services/enhanced-automation.service';
import { WorkerPoolService } from './services/worker-pool.service';
import { LoginCoordinatorService } from './services/login-coordinator.service';
import { OrchestratorService } from './services/orchestrator.service';
import { SetKeysDto, CopyKeysDto, ParseCurlDto, TriggerLoginDto } from './dto/set-keys.dto';
import { BatchOperationDto, BatchReloginDto, BatchOperationResponse, BatchOperationResult } from './dto/batch-operation.dto';
import { LoginLockService } from './services/login-lock.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { BankList, BankListDocument, DEFAULT_BANKS } from './schemas/bank-list.schema';
import { LineSession, LineSessionDocument } from './schemas/line-session.schema';
import { LineMessage, LineMessageDocument } from './schemas/line-message.schema';
import { decryptPassword } from './utils/credential.util';

@ApiTags('LINE Session')
@ApiBearerAuth()
@Controller('admin/line-session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class LineSessionController {
  private readonly logger = new Logger(LineSessionController.name);
  private readonly ENCRYPTION_KEY: string;

  constructor(
    private keyStorageService: KeyStorageService,
    private sessionHealthService: SessionHealthService,
    private reloginSchedulerService: ReloginSchedulerService,
    private lineAutomationService: LineAutomationService,
    private messageFetchService: MessageFetchService,
    // Enhanced services (GSB-like features)
    private enhancedAutomationService: EnhancedAutomationService,
    private workerPoolService: WorkerPoolService,
    private loginCoordinatorService: LoginCoordinatorService,
    private orchestratorService: OrchestratorService,
    private loginLockService: LoginLockService,
    private configService: ConfigService,
    @InjectModel(BankList.name)
    private bankListModel: Model<BankListDocument>,
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(LineMessage.name)
    private lineMessageModel: Model<LineMessageDocument>,
  ) {
    // Initialize default banks on startup
    this.initializeDefaultBanks();
    // Get encryption key
    this.ENCRYPTION_KEY = this.configService.get('LINE_PASSWORD_ENCRYPTION_KEY') ||
      'default-key-change-in-production-32';
  }

  /**
   * Decrypt password safely
   */
  private decryptPasswordSafely(encryptedPassword: string | null | undefined): string | null {
    if (!encryptedPassword) return null;
    try {
      return decryptPassword(encryptedPassword, this.ENCRYPTION_KEY);
    } catch (error) {
      this.logger.warn(`Failed to decrypt password: ${error.message}`);
      return null;
    }
  }

  /**
   * Initialize default bank list if empty
   */
  private async initializeDefaultBanks() {
    const count = await this.bankListModel.countDocuments();
    if (count === 0) {
      await this.bankListModel.insertMany(DEFAULT_BANKS);
      this.logger.log('Default bank list initialized');
    }
  }

  // ================================
  // KEY MANAGEMENT
  // ================================

  /**
   * ดึง LINE Sessions ทั้งหมด (สำหรับ Bank Monitor)
   * รวมทั้ง sessions ที่สร้างจาก user/line-session (ไม่มี lineAccountId)
   * Admin เท่านั้น - แสดง keys เต็มๆ
   */
  @Get('all')
  @ApiOperation({ summary: 'Get all LINE sessions for bank monitoring (admin only - full keys)' })
  async getAllSessions() {
    this.logger.log('[getAllSessions] Fetching all LINE sessions...');
    const sessions = await this.lineSessionModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();
    this.logger.log(`[getAllSessions] Found ${sessions.length} sessions`);

    return {
      success: true,
      sessions: sessions.map((session) => ({
        _id: session._id.toString(),
        name: session.name,
        ownerId: session.ownerId,
        lineAccountId: session.lineAccountId,
        // Keys - full values for admin
        hasKeys: !!(session.xLineAccess && session.xHmac),
        xLineAccess: session.xLineAccess || null,
        xHmac: session.xHmac || null,
        chatMid: session.chatMid || null,
        cUrlBash: session.cUrlBash || null,
        userAgent: session.userAgent || null,
        lineVersion: session.lineVersion || null,
        // Bank info
        bankCode: session.bankCode,
        bankName: session.bankName,
        accountNumber: session.accountNumber,
        balance: session.balance,
        // Status
        status: session.status,
        // Credentials (admin can see decrypted password)
        lineEmail: session.lineEmail || null,
        linePassword: this.decryptPasswordSafely(session.linePassword),
        hasCredentials: !!(session.lineEmail && session.linePassword),
        // Timestamps
        lastCheckedAt: session.lastCheckedAt,
        lastCheckResult: session.lastCheckResult,
        extractedAt: session.extractedAt,
        consecutiveFailures: session.consecutiveFailures,
        createdAt: (session as any).createdAt,
      })),
    };
  }

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
        hasCurl: !!session.cUrlBash,
        chatMid: session.chatMid,
        extractedAt: session.extractedAt,
        expiresAt: session.expiresAt,
        lastCheckedAt: session.lastCheckedAt,
        lastCheckResult: session.lastCheckResult,
        status: session.status,
        source: session.source,
        consecutiveFailures: session.consecutiveFailures,
        // Masked keys for display (first 20 chars only)
        xLineAccessPreview: session.xLineAccess ? session.xLineAccess.substring(0, 20) + '...' : null,
        xHmacPreview: session.xHmac ? session.xHmac.substring(0, 20) + '...' : null,
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

  /**
   * ทดสอบ keys โดยเรียก LINE API โดยตรง
   * ให้ผลลัพธ์ที่ละเอียดกว่า health check ปกติ
   */
  @Post(':lineAccountId/validate-keys')
  @ApiOperation({ summary: 'Validate keys by calling LINE API directly' })
  async validateKeys(@Param('lineAccountId') lineAccountId: string) {
    this.logger.log(`Validating keys for ${lineAccountId}`);

    const result = await this.sessionHealthService.validateKeysDirectly(lineAccountId);

    return {
      success: true,
      validation: result,
      summary: {
        keysStatus: result.isValid ? 'VALID' : 'EXPIRED',
        statusEmoji: result.isValid ? '✅' : '❌',
        needsRelogin: !result.isValid && result.reasonCode !== 'RATE_LIMITED',
        message: result.reason,
      },
    };
  }

  /**
   * ทดสอบ keys แบบ batch สำหรับหลาย accounts
   */
  @Post('batch/validate-keys')
  @ApiOperation({ summary: 'Validate keys for multiple accounts' })
  async batchValidateKeys(@Body() dto: BatchOperationDto) {
    const results: BatchOperationResult[] = [];

    for (const sessionId of dto.sessionIds) {
      try {
        const validation = await this.sessionHealthService.validateKeysDirectly(sessionId);
        results.push({
          sessionId,
          success: true,
          data: {
            isValid: validation.isValid,
            reason: validation.reason,
            reasonCode: validation.reasonCode,
            responseTime: validation.responseTime,
          },
        });
      } catch (error: any) {
        results.push({
          sessionId,
          success: false,
          error: error.message,
        });
      }
    }

    const validCount = results.filter(r => r.success && r.data?.isValid).length;
    const expiredCount = results.filter(r => r.success && !r.data?.isValid).length;
    const errorCount = results.filter(r => !r.success).length;

    return {
      success: true,
      summary: {
        total: results.length,
        valid: validCount,
        expired: expiredCount,
        errors: errorCount,
      },
      results,
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

  /**
   * Get auto-relogin status
   */
  @Get('relogin/auto-status')
  @ApiOperation({ summary: 'Get auto-relogin enabled status' })
  async getAutoReloginStatus() {
    return {
      success: true,
      autoReloginEnabled: this.reloginSchedulerService.isAutoReloginEnabled(),
    };
  }

  /**
   * Enable auto-relogin
   */
  @Post('relogin/enable')
  @ApiOperation({ summary: 'Enable auto-relogin scheduler' })
  async enableAutoRelogin() {
    this.reloginSchedulerService.setAutoReloginEnabled(true);
    return {
      success: true,
      message: 'Auto-relogin enabled',
      autoReloginEnabled: true,
    };
  }

  /**
   * Disable auto-relogin
   */
  @Post('relogin/disable')
  @ApiOperation({ summary: 'Disable auto-relogin scheduler' })
  async disableAutoRelogin() {
    this.reloginSchedulerService.setAutoReloginEnabled(false);
    return {
      success: true,
      message: 'Auto-relogin disabled',
      autoReloginEnabled: false,
    };
  }

  // ================================
  // AUTOMATION CONTROL (All Services)
  // ================================

  /**
   * Get status of all automated processes
   */
  @Get('automation/all-status')
  @ApiOperation({ summary: 'Get status of all automated processes' })
  async getAllAutomationStatus() {
    return {
      success: true,
      automation: {
        autoRelogin: this.reloginSchedulerService.isAutoReloginEnabled(),
        autoHealthCheck: this.sessionHealthService.isAutoHealthCheckEnabled(),
        autoMessageFetch: this.messageFetchService.isAutoMessageFetchEnabled(),
      },
      message: 'All automated processes are disabled by default. Enable only when needed.',
    };
  }

  /**
   * Enable all automated processes
   */
  @Post('automation/enable-all')
  @ApiOperation({ summary: 'Enable all automated processes' })
  async enableAllAutomation() {
    this.reloginSchedulerService.setAutoReloginEnabled(true);
    this.sessionHealthService.setAutoHealthCheckEnabled(true);
    this.messageFetchService.setAutoMessageFetchEnabled(true);
    return {
      success: true,
      message: 'All automated processes enabled',
      automation: {
        autoRelogin: true,
        autoHealthCheck: true,
        autoMessageFetch: true,
      },
    };
  }

  /**
   * Disable all automated processes
   */
  @Post('automation/disable-all')
  @ApiOperation({ summary: 'Disable all automated processes' })
  async disableAllAutomation() {
    this.reloginSchedulerService.setAutoReloginEnabled(false);
    this.sessionHealthService.setAutoHealthCheckEnabled(false);
    this.messageFetchService.setAutoMessageFetchEnabled(false);
    return {
      success: true,
      message: 'All automated processes disabled',
      automation: {
        autoRelogin: false,
        autoHealthCheck: false,
        autoMessageFetch: false,
      },
    };
  }

  /**
   * Enable/Disable auto health check
   */
  @Post('automation/health-check/:enabled')
  @ApiOperation({ summary: 'Enable/Disable auto health check' })
  async setAutoHealthCheck(@Param('enabled') enabled: string) {
    const isEnabled = enabled === 'true' || enabled === '1';
    this.sessionHealthService.setAutoHealthCheckEnabled(isEnabled);
    return {
      success: true,
      message: `Auto health check ${isEnabled ? 'enabled' : 'disabled'}`,
      autoHealthCheck: isEnabled,
    };
  }

  /**
   * Enable/Disable auto message fetch
   */
  @Post('automation/message-fetch/:enabled')
  @ApiOperation({ summary: 'Enable/Disable auto message fetch' })
  async setAutoMessageFetch(@Param('enabled') enabled: string) {
    const isEnabled = enabled === 'true' || enabled === '1';
    this.messageFetchService.setAutoMessageFetchEnabled(isEnabled);
    return {
      success: true,
      message: `Auto message fetch ${isEnabled ? 'enabled' : 'disabled'}`,
      autoMessageFetch: isEnabled,
    };
  }

  // ================================
  // HEALTH CHECK SETTINGS (Admin)
  // ================================

  /**
   * ดึงการตั้งค่า health check ปัจจุบัน
   */
  @Get('settings/health-check')
  @ApiOperation({ summary: 'Get health check settings' })
  async getHealthCheckSettings() {
    const config = this.sessionHealthService.getConfig();
    return {
      success: true,
      settings: config,
      description: {
        enabled: 'เปิด/ปิด auto health check',
        intervalMinutes: 'ความถี่ในการตรวจสอบ (นาที)',
        maxConsecutiveFailures: 'จำนวนครั้งล้มเหลวก่อน mark expired',
        expiryWarningMinutes: 'เตือนก่อนหมดอายุกี่นาที',
        autoReloginEnabled: 'เปิด/ปิด auto relogin เมื่อ keys หมดอายุ',
        reloginCheckIntervalMinutes: 'ความถี่ในการตรวจสอบ relogin (นาที)',
      },
    };
  }

  /**
   * อัปเดตการตั้งค่า health check
   */
  @Put('settings/health-check')
  @ApiOperation({ summary: 'Update health check settings' })
  async updateHealthCheckSettings(
    @Body() body: {
      enabled?: boolean;
      intervalMinutes?: number;
      maxConsecutiveFailures?: number;
      expiryWarningMinutes?: number;
      autoReloginEnabled?: boolean;
      reloginCheckIntervalMinutes?: number;
    },
  ) {
    // Validate intervalMinutes (1-60 minutes)
    if (body.intervalMinutes !== undefined) {
      if (body.intervalMinutes < 1 || body.intervalMinutes > 60) {
        throw new BadRequestException('intervalMinutes ต้องอยู่ระหว่าง 1-60 นาที');
      }
    }

    // Validate maxConsecutiveFailures (1-10)
    if (body.maxConsecutiveFailures !== undefined) {
      if (body.maxConsecutiveFailures < 1 || body.maxConsecutiveFailures > 10) {
        throw new BadRequestException('maxConsecutiveFailures ต้องอยู่ระหว่าง 1-10');
      }
    }

    const updatedConfig = await this.sessionHealthService.updateConfig(body);

    this.logger.log(`Health check settings updated: ${JSON.stringify(body)}`);

    return {
      success: true,
      message: 'อัปเดตการตั้งค่าสำเร็จ',
      settings: updatedConfig,
    };
  }

  /**
   * Reload settings จาก database
   */
  @Post('settings/health-check/reload')
  @ApiOperation({ summary: 'Reload health check settings from database' })
  async reloadHealthCheckSettings() {
    const config = await this.sessionHealthService.loadSettingsFromDatabase();
    return {
      success: true,
      message: 'โหลดการตั้งค่าจาก database สำเร็จ',
      settings: config,
    };
  }

  // ================================
  // AUTO LOGIN (Puppeteer)
  // ================================

  /**
   * Get automation status
   */
  @Get('automation/status')
  @ApiOperation({ summary: 'Get automation service status' })
  async getAutomationStatus() {
    return {
      success: true,
      ...this.lineAutomationService.getStatus(),
    };
  }

  /**
   * Save LINE credentials for auto login
   */
  @Post(':lineAccountId/credentials')
  @ApiOperation({ summary: 'Save LINE credentials for auto login' })
  async saveCredentials(
    @Param('lineAccountId') lineAccountId: string,
    @Body() dto: TriggerLoginDto,
  ) {
    await this.lineAutomationService.saveCredentials(
      lineAccountId,
      dto.email,
      dto.password,
    );

    return {
      success: true,
      message: 'Credentials saved successfully',
    };
  }

  /**
   * Start auto login process
   * This will launch browser, enter credentials, and wait for PIN
   * Now uses EnhancedAutomationService for proper WebSocket notifications
   */
  @Post(':lineAccountId/login')
  @ApiOperation({ summary: 'Start auto login with Puppeteer' })
  async startAutoLogin(
    @Param('lineAccountId') lineAccountId: string,
    @Body() dto: TriggerLoginDto,
  ) {
    // Use enhanced automation service which has proper WebSocket notifications
    const result = await this.enhancedAutomationService.startLogin(
      lineAccountId,
      dto.email,
      dto.password,
      'manual',
    );

    return {
      success: result.success,
      status: result.status,
      pinCode: result.pinCode,
      error: result.error,
      message: result.message || (result.success
        ? 'Login successful'
        : result.pinCode
        ? 'PIN code displayed - please verify on your mobile device'
        : result.error || 'Login failed'),
    };
  }

  /**
   * Get login status
   */
  @Get(':lineAccountId/login/status')
  @ApiOperation({ summary: 'Get current login status' })
  async getLoginStatus(@Param('lineAccountId') lineAccountId: string) {
    // Use enhanced automation service
    const status = this.enhancedAutomationService.getWorkerStatus(lineAccountId);

    if (!status || !status.worker) {
      return {
        success: true,
        hasActiveLogin: false,
        status: EnhancedLoginStatus.IDLE,
      };
    }

    return {
      success: true,
      hasActiveLogin: status.worker.state !== 'idle',
      status: status.worker.state,
      pinCode: status.worker.pinCode,
      error: status.request?.error,
    };
  }

  /**
   * Cancel ongoing login
   */
  @Delete(':lineAccountId/login')
  @ApiOperation({ summary: 'Cancel ongoing login process' })
  async cancelLogin(@Param('lineAccountId') lineAccountId: string) {
    await this.enhancedAutomationService.cancelLogin(lineAccountId);

    return {
      success: true,
      message: 'Login cancelled',
    };
  }

  /**
   * Check if credentials are saved
   */
  @Get(':lineAccountId/credentials')
  @ApiOperation({ summary: 'Check if credentials are saved' })
  async hasCredentials(@Param('lineAccountId') lineAccountId: string) {
    const credentials = await this.lineAutomationService.getCredentials(lineAccountId);

    return {
      success: true,
      hasCredentials: !!credentials,
      email: credentials?.email ? credentials.email.substring(0, 3) + '***' : null,
    };
  }

  // ================================
  // BANK MANAGEMENT
  // ================================

  /**
   * Get list of supported banks
   */
  @Get('banks')
  @ApiOperation({ summary: 'Get list of supported banks' })
  async getBankList() {
    const banks = await this.bankListModel.find({ isActive: true }).sort({ bankNameEn: 1 });

    return {
      success: true,
      banks: banks.map((b) => ({
        id: b._id,
        bankCode: b.bankCode,
        bankNameTh: b.bankNameTh,
        bankNameEn: b.bankNameEn,
        bankSwift: b.bankSwift,
        bankImg: b.bankImg,
        reLoginAtMins: b.reLoginAtMins,
      })),
    };
  }

  /**
   * Configure bank for a LINE Account
   */
  @Post(':lineAccountId/bank')
  @ApiOperation({ summary: 'Configure bank for LINE Account' })
  async configureBank(
    @Param('lineAccountId') lineAccountId: string,
    @Body() dto: { bankCode: string; accountNumber?: string; chatMid?: string },
  ) {
    const bank = await this.bankListModel.findOne({ bankCode: dto.bankCode });
    if (!bank) {
      throw new BadRequestException('Invalid bank code');
    }

    await this.lineSessionModel.updateOne(
      { lineAccountId, isActive: true },
      {
        $set: {
          bankCode: dto.bankCode,
          bankName: bank.bankNameEn,
          accountNumber: dto.accountNumber,
          chatMid: dto.chatMid || bank.defaultChatMid,
        },
      },
      { upsert: true },
    );

    return {
      success: true,
      message: `Bank ${bank.bankNameEn} configured for account`,
    };
  }

  /**
   * Get bank configuration for a LINE Account
   */
  @Get(':lineAccountId/bank')
  @ApiOperation({ summary: 'Get bank configuration' })
  async getBankConfig(@Param('lineAccountId') lineAccountId: string) {
    const session = await this.lineSessionModel.findOne({
      lineAccountId,
      isActive: true,
    });

    if (!session) {
      return {
        success: true,
        configured: false,
        bank: null,
      };
    }

    return {
      success: true,
      configured: !!session.bankCode,
      bank: session.bankCode
        ? {
            bankCode: session.bankCode,
            bankName: session.bankName,
            accountNumber: session.accountNumber,
            chatMid: session.chatMid,
            balance: session.balance,
          }
        : null,
    };
  }

  // ================================
  // MESSAGE FETCHING
  // ================================

  /**
   * Fetch messages manually for single account
   */
  @Post(':lineAccountId/messages/fetch')
  @ApiOperation({ summary: 'Fetch messages from LINE' })
  async fetchMessages(@Param('lineAccountId') lineAccountId: string) {
    const result = await this.messageFetchService.fetchMessages(lineAccountId);

    return result;
  }

  /**
   * ดึงข้อความสำหรับทุกบัญชีพร้อมกัน (Admin only)
   */
  @Post('batch/messages/fetch-all')
  @ApiOperation({ summary: 'Fetch messages for all active accounts' })
  async fetchAllMessages() {
    this.logger.log('[Controller] Triggering fetch all messages...');
    const result = await this.messageFetchService.fetchAllMessages();

    return {
      ...result,
      message: `ดึงข้อความสำเร็จ ${result.successCount}/${result.totalSessions} บัญชี, ${result.totalNewMessages} ข้อความใหม่`,
    };
  }

  // ================================
  // Auto Message Fetch Settings
  // ================================

  /**
   * Get auto-fetch settings and status
   */
  @Get('settings/auto-fetch')
  @ApiOperation({ summary: 'Get auto-fetch settings and status' })
  async getAutoFetchSettings() {
    const status = this.messageFetchService.getAutoFetchStatus();
    return {
      success: true,
      ...status,
    };
  }

  /**
   * Update auto-fetch settings
   */
  @Put('settings/auto-fetch')
  @ApiOperation({ summary: 'Update auto-fetch settings' })
  async updateAutoFetchSettings(
    @Body() body: {
      enabled?: boolean;
      intervalSeconds?: number;
      activeOnly?: boolean;
      fetchLimit?: number;
    },
  ) {
    // Validate interval (min 10 seconds, max 3600 seconds)
    if (body.intervalSeconds !== undefined) {
      body.intervalSeconds = Math.max(10, Math.min(3600, body.intervalSeconds));
    }

    await this.messageFetchService.updateSettings(body);
    const status = this.messageFetchService.getAutoFetchStatus();

    return {
      success: true,
      message: `อัปเดตการตั้งค่าสำเร็จ - ${status.config.enabled ? `เปิด (ทุก ${status.config.intervalSeconds} วินาที)` : 'ปิด'}`,
      ...status,
    };
  }

  /**
   * Start/Stop auto-fetch
   */
  @Post('settings/auto-fetch/:action')
  @ApiOperation({ summary: 'Start or stop auto-fetch' })
  async controlAutoFetch(@Param('action') action: string) {
    if (action === 'start') {
      await this.messageFetchService.updateSettings({ enabled: true });
      return { success: true, message: 'เริ่มดึงข้อความอัตโนมัติแล้ว' };
    } else if (action === 'stop') {
      await this.messageFetchService.updateSettings({ enabled: false });
      return { success: true, message: 'หยุดดึงข้อความอัตโนมัติแล้ว' };
    } else if (action === 'restart') {
      await this.messageFetchService.restartAutoFetch();
      return { success: true, message: 'รีสตาร์ทการดึงข้อความอัตโนมัติแล้ว' };
    } else {
      return { success: false, message: 'Invalid action. Use: start, stop, or restart' };
    }
  }

  /**
   * Get messages for a LINE Account
   */
  @Get(':lineAccountId/messages')
  @ApiOperation({ summary: 'Get messages' })
  async getMessages(
    @Param('lineAccountId') lineAccountId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('type') transactionType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.messageFetchService.getMessages(lineAccountId, {
      limit: limit || 50,
      offset: offset || 0,
      transactionType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return {
      success: true,
      total: result.total,
      messages: result.messages.map((m) => ({
        id: m._id,
        messageId: m.messageId,
        text: m.text,
        transactionType: m.transactionType,
        amount: m.amount,
        balance: m.balance,
        messageDate: m.messageDate,
        bankCode: m.bankCode,
      })),
    };
  }

  /**
   * Get transaction summary
   */
  @Get(':lineAccountId/messages/summary')
  @ApiOperation({ summary: 'Get transaction summary' })
  async getTransactionSummary(
    @Param('lineAccountId') lineAccountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const summary = await this.messageFetchService.getTransactionSummary(
      lineAccountId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    return {
      success: true,
      summary,
    };
  }

  // ================================
  // MESSAGE CLEANUP
  // ================================

  /**
   * สถิติข้อความรวม (เรียกตอนโหลดหน้า)
   */
  @Get('messages/stats')
  @ApiOperation({ summary: 'Get message statistics' })
  async getMessageStats() {
    // Group by sessionId AND lineAccountId for robust matching
    const perSession = await this.lineMessageModel.aggregate([
      {
        $group: {
          _id: {
            sessionId: '$sessionId',
            lineAccountId: '$lineAccountId',
          },
          count: { $sum: 1 },
          oldestDate: { $min: '$createdAt' },
          newestDate: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: '$_id.sessionId',
          lineAccountId: '$_id.lineAccountId',
          count: 1,
          oldestDate: 1,
          newestDate: 1,
        },
      },
    ]);

    const totalMessages = perSession.reduce((sum, s) => sum + s.count, 0);

    this.logger.log(`[getMessageStats] Total: ${totalMessages}, Sessions: ${perSession.length}, Sample IDs: ${perSession.slice(0, 3).map((s) => `sid=${s._id}, laid=${s.lineAccountId}`).join('; ')}`);

    return {
      success: true,
      totalMessages,
      sessionCount: perSession.length,
      estimatedSizeBytes: totalMessages * 500,
      perSession,
    };
  }

  /**
   * Preview ก่อนลบ (เรียกอัตโนมัติเมื่อเปลี่ยนค่า)
   */
  @Post('messages/cleanup-preview')
  @ApiOperation({ summary: 'Preview cleanup before deleting' })
  async previewCleanup(
    @Body() body: {
      sessionIds?: string[];
      olderThanDays?: number;
      olderThanMonths?: number;
    },
  ) {
    const { sessionIds, olderThanDays, olderThanMonths } = body;

    if (!olderThanDays && !olderThanMonths) {
      throw new BadRequestException(
        'ต้องระบุ olderThanDays หรือ olderThanMonths อย่างน้อย 1 อย่าง',
      );
    }

    if (olderThanDays !== undefined && (olderThanDays < 1 || olderThanDays > 3650)) {
      throw new BadRequestException('olderThanDays ต้องอยู่ระหว่าง 1-3650');
    }

    if (olderThanMonths !== undefined && (olderThanMonths < 1 || olderThanMonths > 120)) {
      throw new BadRequestException('olderThanMonths ต้องอยู่ระหว่าง 1-120');
    }

    // คำนวณ cutoff date
    const cutoffDate = new Date();
    if (olderThanDays) {
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    } else if (olderThanMonths) {
      cutoffDate.setMonth(cutoffDate.getMonth() - olderThanMonths);
    }

    // Build scope query (session filter) — match by sessionId OR lineAccountId
    const scopeQuery: Record<string, unknown> = {};
    if (sessionIds && sessionIds.length > 0) {
      const ids = sessionIds.map((id) => String(id));
      scopeQuery.$or = [
        { sessionId: { $in: ids } },
        { lineAccountId: { $in: ids } },
      ];
      this.logger.log(`[previewCleanup] Filter IDs: ${ids.join(', ')}`);
    }

    // Count total in scope
    const totalMessages = await this.lineMessageModel.countDocuments(scopeQuery);
    this.logger.log(`[previewCleanup] Total in scope: ${totalMessages}, cutoff: ${cutoffDate.toISOString()}`);

    // Count messages to delete (ใช้ createdAt เพราะ messageDate อาจเป็น null สำหรับบาง parser)
    const deleteQuery = { ...scopeQuery, createdAt: { $lt: cutoffDate } };
    const messagesToDelete = await this.lineMessageModel.countDocuments(deleteQuery);

    // Get date range of messages in scope
    const dateRange = await this.lineMessageModel.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: null,
          oldestDate: { $min: '$createdAt' },
          newestDate: { $max: '$createdAt' },
        },
      },
    ]);

    // Per-session breakdown
    const perSessionCounts = await this.lineMessageModel.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: '$sessionId',
          total: { $sum: 1 },
          toDelete: {
            $sum: { $cond: [{ $lt: ['$createdAt', cutoffDate] }, 1, 0] },
          },
        },
      },
      { $sort: { total: -1 } },
    ]);

    return {
      success: true,
      totalMessages,
      messagesToDelete,
      messagesRemaining: totalMessages - messagesToDelete,
      estimatedSizeBytes: messagesToDelete * 500,
      cutoffDate: cutoffDate.toISOString(),
      oldestMessageDate: dateRange[0]?.oldestDate || null,
      newestMessageDate: dateRange[0]?.newestDate || null,
      perSessionCounts,
    };
  }

  /**
   * ลบข้อความเก่าออกจากระบบ (Admin only)
   * - เลือกบัญชี หรือ ลบทุกบัญชี
   * - กำหนดช่วงเวลา: เก่ากว่า X วัน หรือ X เดือน
   */
  @Delete('messages/cleanup')
  @ApiOperation({ summary: 'Delete old messages (admin only)' })
  async deleteOldMessages(
    @Body() body: {
      sessionIds?: string[];
      olderThanDays?: number;
      olderThanMonths?: number;
    },
  ) {
    const { sessionIds, olderThanDays, olderThanMonths } = body;

    // Validate: ต้องส่ง olderThanDays หรือ olderThanMonths อย่างน้อย 1 อย่าง
    if (!olderThanDays && !olderThanMonths) {
      throw new BadRequestException(
        'ต้องระบุ olderThanDays หรือ olderThanMonths อย่างน้อย 1 อย่าง',
      );
    }

    if (olderThanDays !== undefined && (olderThanDays < 1 || olderThanDays > 3650)) {
      throw new BadRequestException('olderThanDays ต้องอยู่ระหว่าง 1-3650');
    }

    if (olderThanMonths !== undefined && (olderThanMonths < 1 || olderThanMonths > 120)) {
      throw new BadRequestException('olderThanMonths ต้องอยู่ระหว่าง 1-120');
    }

    // คำนวณ cutoff date
    const cutoffDate = new Date();
    if (olderThanDays) {
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    } else if (olderThanMonths) {
      cutoffDate.setMonth(cutoffDate.getMonth() - olderThanMonths);
    }

    // Build query — match by sessionId OR lineAccountId (ใช้ createdAt เพราะ messageDate อาจเป็น null สำหรับบาง parser)
    const query: Record<string, unknown> = {
      createdAt: { $lt: cutoffDate },
    };

    if (sessionIds && sessionIds.length > 0) {
      const ids = sessionIds.map((id) => String(id));
      query.$or = [
        { sessionId: { $in: ids } },
        { lineAccountId: { $in: ids } },
      ];
    }

    this.logger.log(
      `[deleteOldMessages] Deleting messages before ${cutoffDate.toISOString()}, sessions: ${sessionIds ? sessionIds.join(', ') : 'ALL'}`,
    );

    const result = await this.lineMessageModel.deleteMany(query);

    // Count remaining messages — same $or filter
    const remainingQuery: Record<string, unknown> = {};
    if (sessionIds && sessionIds.length > 0) {
      const ids = sessionIds.map((id) => String(id));
      remainingQuery.$or = [
        { sessionId: { $in: ids } },
        { lineAccountId: { $in: ids } },
      ];
    }
    const messagesRemaining = await this.lineMessageModel.countDocuments(remainingQuery);

    this.logger.log(`[deleteOldMessages] Deleted ${result.deletedCount} messages, ${messagesRemaining} remaining`);

    return {
      success: true,
      deletedCount: result.deletedCount,
      messagesRemaining,
      cutoffDate: cutoffDate.toISOString(),
      message: `ลบข้อความเก่าก่อนวันที่ ${cutoffDate.toLocaleDateString('th-TH')} จำนวน ${result.deletedCount} ข้อความ`,
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

  // ================================
  // ENHANCED AUTOMATION (GSB-like)
  // ================================

  /**
   * Get enhanced automation status
   */
  @Get('enhanced/status')
  @ApiOperation({ summary: 'Get enhanced automation status' })
  async getEnhancedStatus() {
    return {
      success: true,
      ...this.enhancedAutomationService.getStatus(),
    };
  }

  /**
   * Get worker pool status
   */
  @Get('enhanced/pool')
  @ApiOperation({ summary: 'Get worker pool status' })
  async getWorkerPoolStatus() {
    return {
      success: true,
      ...this.workerPoolService.getPoolStatus(),
    };
  }

  /**
   * Get login coordinator statistics
   */
  @Get('enhanced/coordinator')
  @ApiOperation({ summary: 'Get login coordinator statistics' })
  async getCoordinatorStats() {
    return {
      success: true,
      statistics: this.loginCoordinatorService.getStatistics(),
      activeRequests: this.loginCoordinatorService.getAllActiveRequests(),
    };
  }

  /**
   * Start enhanced login (with full GSB-like features)
   * @param force - Skip key copying and force browser login (for testing)
   */
  @Post(':lineAccountId/enhanced-login')
  @ApiOperation({ summary: 'Start enhanced login with GSB-like features' })
  async startEnhancedLogin(
    @Param('lineAccountId') lineAccountId: string,
    @Body() body: {
      email?: string;
      password?: string;
      source?: 'manual' | 'auto' | 'relogin';
      force?: boolean; // Skip key copying, force browser login
    },
  ) {
    this.logger.log(`[enhanced-login] === CONTROLLER START === for ${lineAccountId}`);
    this.logger.log(`[enhanced-login] Body: ${JSON.stringify(body)}`);
    this.logger.log(`[enhanced-login] Force login: ${body.force || false}`);

    try {
      this.logger.log(`[enhanced-login] Calling enhancedAutomationService.startLogin...`);
      const result = await this.enhancedAutomationService.startLogin(
        lineAccountId,
        body.email,
        body.password,
        body.source || 'manual',
        body.force || false, // Pass force flag to skip key copying
      );

      this.logger.log(`[enhanced-login] === SERVICE RETURNED ===`);
      this.logger.log(`[enhanced-login] Result: ${JSON.stringify(result)}`);

      return result;
    } catch (error: any) {
      this.logger.error(`[enhanced-login] === ERROR IN CONTROLLER ===`);
      this.logger.error(`[enhanced-login] Error: ${error.message}`);
      this.logger.error(`[enhanced-login] Stack: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Get enhanced login status for account
   */
  @Get(':lineAccountId/enhanced-login/status')
  @ApiOperation({ summary: 'Get enhanced login status' })
  async getEnhancedLoginStatus(@Param('lineAccountId') lineAccountId: string) {
    const status = this.enhancedAutomationService.getWorkerStatus(lineAccountId);
    // status already contains success: true, so just return it directly
    return status;
  }

  /**
   * Cancel enhanced login
   */
  @Delete(':lineAccountId/enhanced-login')
  @ApiOperation({ summary: 'Cancel enhanced login' })
  async cancelEnhancedLogin(@Param('lineAccountId') lineAccountId: string) {
    await this.enhancedAutomationService.cancelLogin(lineAccountId);
    return {
      success: true,
      message: 'Login cancelled',
    };
  }

  /**
   * Get cooldown info for account
   */
  @Get(':lineAccountId/cooldown')
  @ApiOperation({ summary: 'Get cooldown info' })
  async getCooldownInfo(@Param('lineAccountId') lineAccountId: string) {
    const info = this.loginCoordinatorService.getCooldownInfo(lineAccountId);
    return {
      success: true,
      ...info,
    };
  }

  /**
   * Reset cooldown for account (manual override)
   */
  @Post(':lineAccountId/reset-cooldown')
  @ApiOperation({ summary: 'Reset cooldown for account' })
  async resetCooldown(@Param('lineAccountId') lineAccountId: string) {
    this.loginCoordinatorService.resetCooldown(lineAccountId);
    return {
      success: true,
      message: 'Cooldown reset',
    };
  }

  /**
   * Get login history for account
   */
  @Get(':lineAccountId/login-history')
  @ApiOperation({ summary: 'Get login request history' })
  async getLoginHistory(
    @Param('lineAccountId') lineAccountId: string,
    @Query('limit') limit?: number,
  ) {
    const history = this.loginCoordinatorService.getRequestHistory(lineAccountId, limit || 10);
    return {
      success: true,
      history,
    };
  }

  /**
   * Force close browser for account (completely closes browser)
   * Use this when you want to fully reset the browser session
   */
  @Delete(':lineAccountId/worker')
  @ApiOperation({ summary: 'Force close browser for account' })
  async closeWorker(@Param('lineAccountId') lineAccountId: string) {
    await this.enhancedAutomationService.forceCloseBrowser(lineAccountId);
    return {
      success: true,
      message: 'Browser force-closed',
    };
  }

  /**
   * Soft cancel login (keeps browser open for reuse - GSB-style)
   */
  @Post(':lineAccountId/soft-cancel')
  @ApiOperation({ summary: 'Soft cancel login - keeps browser open for reuse' })
  async softCancelLogin(@Param('lineAccountId') lineAccountId: string) {
    await this.enhancedAutomationService.cancelLogin(lineAccountId);
    return {
      success: true,
      message: 'Login cancelled (browser kept open for reuse)',
    };
  }

  // ================================
  // PIN STATUS TRACKING (GSB-style)
  // ================================

  /**
   * Get PIN status for account (GSB-style FRESH/NEW/OLD tracking)
   */
  @Get(':lineAccountId/pin-status')
  @ApiOperation({ summary: 'Get PIN status with GSB-style tracking' })
  async getPinStatus(@Param('lineAccountId') lineAccountId: string) {
    const status = this.enhancedAutomationService.getPinStatus(lineAccountId);
    return {
      success: true,
      lineAccountId,
      ...status,
    };
  }

  /**
   * Get full session status (PIN + Keys) with relogin check
   */
  @Get(':lineAccountId/session-status')
  @ApiOperation({ summary: 'Get full session status with PIN and Keys' })
  async getSessionStatus(@Param('lineAccountId') lineAccountId: string) {
    const status = await this.enhancedAutomationService.getFullSessionStatus(lineAccountId);
    return {
      success: true,
      ...status,
    };
  }

  /**
   * Get keys status with expiration tracking
   */
  @Get(':lineAccountId/keys-status')
  @ApiOperation({ summary: 'Get keys status with expiration tracking' })
  async getKeysStatus(@Param('lineAccountId') lineAccountId: string) {
    const status = await this.enhancedAutomationService.getKeysStatus(lineAccountId);
    return {
      success: true,
      lineAccountId,
      ...status,
    };
  }

  /**
   * Check if relogin is needed
   */
  @Get(':lineAccountId/needs-relogin')
  @ApiOperation({ summary: 'Check if relogin is needed' })
  async checkNeedsRelogin(@Param('lineAccountId') lineAccountId: string) {
    const result = await this.enhancedAutomationService.needsRelogin(lineAccountId);
    return {
      success: true,
      lineAccountId,
      ...result,
    };
  }

  /**
   * Force relogin - bypass key copying and always use browser login
   * Useful for testing browser automation
   */
  @Post(':lineAccountId/force-relogin')
  @ApiOperation({ summary: 'Force browser login (skip key copying)' })
  async forceRelogin(
    @Param('lineAccountId') lineAccountId: string,
    @Body() body: { email?: string; password?: string },
  ) {
    this.logger.log(`[force-relogin] Starting force relogin for ${lineAccountId}`);

    // First, clear existing keys so we can test browser login
    try {
      await this.lineSessionModel.updateOne(
        { _id: lineAccountId },
        {
          $unset: { xLineAccess: '', xHmac: '', chatMid: '' },
          $set: { status: 'pending_relogin', lastCheckResult: 'expired' },
        },
      );
      this.logger.log(`[force-relogin] Cleared existing keys for ${lineAccountId}`);
    } catch (e) {
      // Ignore if session not found by _id, try lineAccountId
      await this.lineSessionModel.updateOne(
        { lineAccountId },
        {
          $unset: { xLineAccess: '', xHmac: '', chatMid: '' },
          $set: { status: 'pending_relogin', lastCheckResult: 'expired' },
        },
      );
    }

    // Then trigger force login
    const result = await this.enhancedAutomationService.startLogin(
      lineAccountId,
      body.email,
      body.password,
      'manual',
      true, // Force login - skip key copying
    );

    return {
      ...result,
      forcedLogin: true,
    };
  }

  /**
   * Get all active PINs (for admin dashboard)
   */
  @Get('pins/active')
  @ApiOperation({ summary: 'Get all active PINs' })
  async getAllActivePins() {
    const pins = this.enhancedAutomationService.getAllActivePins();
    return {
      success: true,
      total: pins.length,
      pins,
    };
  }

  /**
   * Get all pending logins with full details (accounts waiting for PIN verification)
   * Shows PIN code, account name, time remaining, etc.
   */
  @Get('logins/pending')
  @ApiOperation({ summary: 'Get all pending logins waiting for PIN verification' })
  async getPendingLogins() {
    const pendingLogins = await this.enhancedAutomationService.getPendingLogins();

    // Separate active and expired
    const active = pendingLogins.filter(p => !p.isExpired);
    const expired = pendingLogins.filter(p => p.isExpired);

    return {
      success: true,
      total: pendingLogins.length,
      active: active.length,
      expired: expired.length,
      pendingLogins,
      message: active.length > 0
        ? `${active.length} account(s) waiting for PIN verification`
        : 'No pending logins',
    };
  }

  /**
   * Auto-cleanup expired logins and release locks
   */
  @Post('logins/cleanup')
  @ApiOperation({ summary: 'Auto-cleanup expired logins' })
  async autoCleanupExpiredLogins() {
    const result = await this.enhancedAutomationService.autoCleanupExpiredLogins();
    return {
      success: true,
      ...result,
      message: result.cleaned > 0
        ? `Cleaned up ${result.cleaned} expired login(s)`
        : 'No expired logins to clean up',
    };
  }

  /**
   * Clear PIN for account
   */
  @Delete(':lineAccountId/pin')
  @ApiOperation({ summary: 'Clear PIN for account' })
  async clearPin(@Param('lineAccountId') lineAccountId: string) {
    this.enhancedAutomationService.clearPin(lineAccountId);
    return {
      success: true,
      message: 'PIN cleared',
    };
  }

  /**
   * Cleanup expired PINs
   */
  @Post('pins/cleanup')
  @ApiOperation({ summary: 'Cleanup expired PINs' })
  async cleanupExpiredPins() {
    const cleaned = this.enhancedAutomationService.cleanupExpiredPins();
    return {
      success: true,
      message: `Cleaned up ${cleaned} expired PINs`,
      cleaned,
    };
  }

  // ================================
  // CURL COMMAND (GSB-style)
  // ================================

  /**
   * Get cURL command for a session
   */
  @Get(':lineAccountId/curl')
  @ApiOperation({ summary: 'Get cURL command for copying' })
  async getCurlCommand(@Param('lineAccountId') lineAccountId: string) {
    const curl = await this.keyStorageService.getCurlCommand(lineAccountId);

    if (!curl) {
      return {
        success: false,
        message: 'No keys found. Please login first.',
        curl: null,
      };
    }

    return {
      success: true,
      curl,
    };
  }

  /**
   * Get session with login details
   */
  @Get(':lineAccountId/details')
  @ApiOperation({ summary: 'Get session details including login info' })
  async getSessionDetails(@Param('lineAccountId') lineAccountId: string) {
    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    if (!session) {
      return {
        success: false,
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
        name: session.name,
        lineEmail: session.lineEmail,
        bankCode: session.bankCode,
        bankName: session.bankName,
        accountNumber: session.accountNumber,
        chatMid: session.chatMid,
        balance: session.balance,
        hasKeys: !!(session.xLineAccess && session.xHmac),
        hasCurl: !!session.cUrlBash,
        extractedAt: session.extractedAt,
        expiresAt: session.expiresAt,
        lastCheckedAt: session.lastCheckedAt,
        lastCheckResult: session.lastCheckResult,
        status: session.status,
        source: session.source,
        performedBy: session.performedBy,
      },
    };
  }

  // ================================
  // ORCHESTRATOR (Auto-Relogin Loop)
  // ================================

  /**
   * Get orchestrator status and statistics
   */
  @Get('orchestrator/status')
  @ApiOperation({ summary: 'Get orchestrator status and statistics' })
  async getOrchestratorStatus() {
    const stats = this.orchestratorService.getStatistics();
    const settings = this.orchestratorService.getCurrentSettings();
    const sessions = await this.orchestratorService.getAllSessionStatuses();

    // Calculate session stats
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(s => s.hasKeys && s.keysStatus === 'VALID').length;
    const expiringSoonSessions = sessions.filter(s => s.isExpiringSoon).length;
    const expiredSessions = sessions.filter(s => s.keysStatus === 'EXPIRED').length;
    const loggingInSessions = sessions.filter(s => s.loginStatus === 'logging_in' || s.loginStatus === 'waiting_pin').length;

    return {
      success: true,
      orchestrator: {
        ...stats,
        totalSessions,
        activeSessions,
        expiringSoonSessions,
        expiredSessions,
        loggingInSessions,
      },
      settings,
      sessions,
    };
  }

  /**
   * Get all session statuses (real-time)
   */
  @Get('orchestrator/sessions')
  @ApiOperation({ summary: 'Get all session statuses for real-time monitoring' })
  async getOrchestratorSessions() {
    const sessions = await this.orchestratorService.getAllSessionStatuses();
    return {
      success: true,
      total: sessions.length,
      sessions,
    };
  }

  /**
   * Force orchestrator health check now (all sessions)
   */
  @Post('orchestrator/health-check')
  @ApiOperation({ summary: 'Force orchestrator health check on all sessions' })
  async triggerOrchestratorHealthCheck() {
    await this.orchestratorService.forceHealthCheck();
    return {
      success: true,
      message: 'Health check completed',
    };
  }

  /**
   * Force relogin check now
   */
  @Post('orchestrator/relogin-check')
  @ApiOperation({ summary: 'Force relogin check now' })
  async forceReloginCheck() {
    await this.orchestratorService.forceReloginCheck();
    return {
      success: true,
      message: 'Relogin check completed',
    };
  }

  /**
   * Trigger manual relogin for a session
   */
  @Post(':lineAccountId/orchestrator/relogin')
  @ApiOperation({ summary: 'Trigger manual relogin via orchestrator' })
  async triggerOrchestratorRelogin(@Param('lineAccountId') lineAccountId: string) {
    const result = await this.orchestratorService.triggerManualRelogin(lineAccountId);
    return {
      success: result.success,
      message: result.message,
      pinCode: result.pinCode,
    };
  }

  /**
   * Restart orchestrator loops (after settings change)
   */
  @Post('orchestrator/restart')
  @ApiOperation({ summary: 'Restart orchestrator loops after settings change' })
  async restartOrchestrator() {
    await this.orchestratorService.restartLoops();
    return {
      success: true,
      message: 'Orchestrator restarted',
      settings: this.orchestratorService.getCurrentSettings(),
    };
  }

  /**
   * Get orchestrator settings
   */
  @Get('orchestrator/settings')
  @ApiOperation({ summary: 'Get orchestrator settings' })
  async getOrchestratorSettings() {
    return {
      success: true,
      settings: this.orchestratorService.getCurrentSettings(),
    };
  }

  // ================================
  // BATCH OPERATIONS
  // ================================

  /**
   * Batch health check for multiple sessions
   */
  @Post('batch/health-check')
  @ApiOperation({ summary: 'Check health of multiple sessions at once' })
  async batchHealthCheck(@Body() dto: BatchOperationDto): Promise<BatchOperationResponse> {
    const results: BatchOperationResult[] = [];

    for (const sessionId of dto.sessionIds) {
      try {
        const session = await this.keyStorageService.getActiveSession(sessionId);
        if (!session) {
          results.push({
            sessionId,
            success: false,
            error: 'Session not found',
          });
          continue;
        }

        const health = await this.sessionHealthService.checkSessionHealth(session);
        results.push({
          sessionId,
          success: true,
          data: {
            status: health.status,
            checkedAt: health.checkedAt,
            message: health.message,
            consecutiveFailures: health.consecutiveFailures,
          },
        });
      } catch (error: any) {
        results.push({
          sessionId,
          success: false,
          error: error.message,
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    return {
      success: succeeded > 0,
      total: dto.sessionIds.length,
      succeeded,
      failed: dto.sessionIds.length - succeeded,
      results,
    };
  }

  /**
   * Batch relogin for multiple sessions
   */
  @Post('batch/relogin')
  @ApiOperation({ summary: 'Trigger relogin for multiple sessions' })
  async batchRelogin(@Body() dto: BatchReloginDto): Promise<BatchOperationResponse> {
    const results: BatchOperationResult[] = [];
    const source = dto.source || 'manual';

    for (const sessionId of dto.sessionIds) {
      try {
        // Check cooldown unless force is true
        if (!dto.force) {
          const cooldownInfo = this.loginCoordinatorService.getCooldownInfo(sessionId);
          if (cooldownInfo.inCooldown) {
            results.push({
              sessionId,
              success: false,
              error: `In cooldown, retry after ${Math.ceil(cooldownInfo.remainingMs / 1000)}s`,
            });
            continue;
          }
        }

        await this.reloginSchedulerService.triggerRelogin(sessionId, source);
        results.push({
          sessionId,
          success: true,
          message: 'Relogin triggered',
        });
      } catch (error: any) {
        results.push({
          sessionId,
          success: false,
          error: error.message,
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    return {
      success: succeeded > 0,
      total: dto.sessionIds.length,
      succeeded,
      failed: dto.sessionIds.length - succeeded,
      results,
    };
  }

  // ================================
  // LOCK MANAGEMENT
  // ================================

  /**
   * Get all active locks
   */
  @Get('locks')
  @ApiOperation({ summary: 'Get all active login locks' })
  async getAllLocks() {
    const locks = this.loginLockService.getAllLocks();
    return {
      success: true,
      total: locks.length,
      locks: locks.map(l => ({
        lineAccountId: l.lineAccountId,
        source: l.info.source,
        lockedAt: l.info.lockedAt,
        duration: Date.now() - l.info.lockedAt.getTime(),
      })),
    };
  }

  /**
   * Force release a lock
   */
  @Delete('locks/:lineAccountId')
  @ApiOperation({ summary: 'Force release a login lock' })
  async forceReleaseLock(@Param('lineAccountId') lineAccountId: string) {
    const lockInfo = this.loginLockService.getLockInfo(lineAccountId);
    if (!lockInfo) {
      return {
        success: false,
        message: 'No lock found for this account',
      };
    }

    this.loginLockService.forceRelease(lineAccountId);
    return {
      success: true,
      message: `Lock released for ${lineAccountId}`,
      previousLock: {
        source: lockInfo.source,
        lockedAt: lockInfo.lockedAt,
      },
    };
  }

  // ================================
  // POOL METRICS
  // ================================

  /**
   * Get worker pool metrics
   */
  @Get('pool-metrics')
  @ApiOperation({ summary: 'Get worker pool metrics and statistics' })
  async getPoolMetrics() {
    const poolStatus = this.workerPoolService.getPoolStatus();
    return {
      success: true,
      metrics: {
        available: poolStatus.available,
        maxWorkers: poolStatus.maxWorkers,
        activeWorkers: poolStatus.activeWorkers,
        utilizationPercent: poolStatus.maxWorkers > 0
          ? Math.round((poolStatus.activeWorkers / poolStatus.maxWorkers) * 100)
          : 0,
      },
      workers: poolStatus.workers,
    };
  }

  /**
   * Clean up corrupted sessions (missing name or ownerId)
   */
  @Post('cleanup-corrupted')
  @ApiOperation({ summary: 'Delete sessions with missing required fields' })
  async cleanupCorruptedSessions() {
    const result = await this.lineSessionModel.deleteMany({
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: '' },
        { ownerId: { $exists: false } },
        { ownerId: null },
        { ownerId: '' },
      ],
    });

    return {
      success: true,
      message: `Deleted ${result.deletedCount} corrupted sessions`,
      deletedCount: result.deletedCount,
    };
  }
}
