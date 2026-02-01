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
import { SetKeysDto, CopyKeysDto, ParseCurlDto, TriggerLoginDto } from './dto/set-keys.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankList, BankListDocument, DEFAULT_BANKS } from './schemas/bank-list.schema';
import { LineSession, LineSessionDocument } from './schemas/line-session.schema';

@ApiTags('LINE Session')
@ApiBearerAuth()
@Controller('admin/line-session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class LineSessionController {
  private readonly logger = new Logger(LineSessionController.name);

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
    @InjectModel(BankList.name)
    private bankListModel: Model<BankListDocument>,
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
  ) {
    // Initialize default banks on startup
    this.initializeDefaultBanks();
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
   * Fetch messages manually
   */
  @Post(':lineAccountId/messages/fetch')
  @ApiOperation({ summary: 'Fetch messages from LINE' })
  async fetchMessages(@Param('lineAccountId') lineAccountId: string) {
    const result = await this.messageFetchService.fetchMessages(lineAccountId);

    return result;
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
   */
  @Post(':lineAccountId/enhanced-login')
  @ApiOperation({ summary: 'Start enhanced login with GSB-like features' })
  async startEnhancedLogin(
    @Param('lineAccountId') lineAccountId: string,
    @Body() body: { email?: string; password?: string; source?: 'manual' | 'auto' | 'relogin' },
  ) {
    this.logger.log(`[enhanced-login] === CONTROLLER START === for ${lineAccountId}`);
    this.logger.log(`[enhanced-login] Body: ${JSON.stringify(body)}`);

    try {
      this.logger.log(`[enhanced-login] Calling enhancedAutomationService.startLogin...`);
      const result = await this.enhancedAutomationService.startLogin(
        lineAccountId,
        body.email,
        body.password,
        body.source || 'manual',
      );

      this.logger.log(`[enhanced-login] === SERVICE RETURNED ===`);
      this.logger.log(`[enhanced-login] Result type: ${typeof result}`);
      this.logger.log(`[enhanced-login] Result: ${JSON.stringify(result)}`);
      this.logger.log(`[enhanced-login] Result.pinCode: ${result?.pinCode}`);
      this.logger.log(`[enhanced-login] Result.status: ${result?.status}`);

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
   * Close worker for account
   */
  @Delete(':lineAccountId/worker')
  @ApiOperation({ summary: 'Close worker/browser for account' })
  async closeWorker(@Param('lineAccountId') lineAccountId: string) {
    await this.workerPoolService.closeWorker(lineAccountId);
    return {
      success: true,
      message: 'Worker closed',
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
}
