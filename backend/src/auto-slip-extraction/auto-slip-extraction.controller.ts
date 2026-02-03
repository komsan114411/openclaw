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
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';

import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { TriggerAutoSlipLoginDto, SetAutoSlipKeysDto } from './dto/trigger-login.dto';

import { BankStateMachineService } from './services/bank-state-machine.service';
import { MessageParserService } from './services/message-parser.service';
import { AutoSlipOrchestratorService, AccountStatus, OrchestratorStats } from './services/auto-slip-orchestrator.service';
import { AutoSlipLockService } from './services/auto-slip-lock.service';
import { AutoSlipLoginService } from './services/auto-slip-login.service';
import { BankStatus, STATUS_LABELS_TH } from './constants/bank-status.enum';
import { getBankConfig, isValidBankCode } from './constants/bank-codes';

import {
  AutoSlipBankAccount,
  AutoSlipBankAccountDocument,
} from './schemas/auto-slip-bank-account.schema';
import {
  AutoSlipTransaction,
  AutoSlipTransactionDocument,
} from './schemas/auto-slip-transaction.schema';
import {
  AutoSlipKeyHistory,
  AutoSlipKeyHistoryDocument,
} from './schemas/auto-slip-key-history.schema';
import {
  AutoSlipPinCode,
  AutoSlipPinCodeDocument,
} from './schemas/auto-slip-pin-code.schema';

// =============================================
// USER ENDPOINTS - /api/auto-slip/bank-accounts
// =============================================

@ApiTags('Auto-Slip Bank Accounts')
@ApiBearerAuth()
@Controller('auto-slip/bank-accounts')
@UseGuards(SessionAuthGuard)
export class AutoSlipBankAccountController {
  private readonly logger = new Logger(AutoSlipBankAccountController.name);

  constructor(
    @InjectModel(AutoSlipBankAccount.name)
    private bankAccountModel: Model<AutoSlipBankAccountDocument>,
    @InjectModel(AutoSlipTransaction.name)
    private transactionModel: Model<AutoSlipTransactionDocument>,
    @InjectModel(AutoSlipKeyHistory.name)
    private keyHistoryModel: Model<AutoSlipKeyHistoryDocument>,
    @InjectModel(AutoSlipPinCode.name)
    private pinCodeModel: Model<AutoSlipPinCodeDocument>,
    private stateMachineService: BankStateMachineService,
    private messageParserService: MessageParserService,
    private loginService: AutoSlipLoginService,
  ) {}

  /**
   * Create a new bank account for auto-slip extraction
   */
  @Post()
  @ApiOperation({ summary: 'Add new bank account for auto-slip' })
  async createBankAccount(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate bank code
    if (!isValidBankCode(dto.bankCode)) {
      throw new BadRequestException('Invalid bank code');
    }

    // Check for duplicate
    const existing = await this.bankAccountModel.findOne({
      userId: new Types.ObjectId(user.userId),
      bankCode: dto.bankCode,
      accountNumber: dto.accountNumber,
      isActive: true,
    });

    if (existing) {
      throw new BadRequestException('Bank account already exists');
    }

    // Create bank account
    const bankAccount = await this.bankAccountModel.create({
      userId: new Types.ObjectId(user.userId),
      bankType: dto.bankType,
      bankCode: dto.bankCode,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
      lineEmail: dto.lineEmail,
      // TODO: Encrypt password before storing
      linePasswordEncrypted: dto.linePassword || '',
      status: BankStatus.INIT,
      lastStatusChange: new Date(),
      checkInterval: dto.checkInterval || 300000,
      monitoringEnabled: dto.monitoringEnabled ?? true,
      isActive: true,
    });

    this.logger.log(`Bank account created: ${bankAccount._id} for user ${user.userId}`);

    return {
      success: true,
      message: 'Bank account created',
      bankAccount: {
        id: bankAccount._id,
        bankType: bankAccount.bankType,
        bankCode: bankAccount.bankCode,
        accountNumber: bankAccount.accountNumber,
        accountName: bankAccount.accountName,
        status: bankAccount.status,
        statusLabel: STATUS_LABELS_TH[bankAccount.status],
      },
    };
  }

  /**
   * Get all bank accounts for current user
   */
  @Get()
  @ApiOperation({ summary: 'List my bank accounts' })
  async getBankAccounts(@CurrentUser() user: AuthUser) {
    const accounts = await this.bankAccountModel.find({
      userId: new Types.ObjectId(user.userId),
      isActive: true,
    }).sort({ createdAt: -1 });

    return {
      success: true,
      total: accounts.length,
      bankAccounts: accounts.map(acc => ({
        id: acc._id,
        bankType: acc.bankType,
        bankCode: acc.bankCode,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        status: acc.status,
        statusLabel: STATUS_LABELS_TH[acc.status],
        balance: acc.balance,
        monitoringEnabled: acc.monitoringEnabled,
        lastMessageFetch: acc.lastMessageFetch,
        hasKeys: !!(acc.xLineAccess && acc.xHmac),
      })),
    };
  }

  /**
   * Get bank account details
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get bank account details' })
  async getBankAccountDetails(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    const bankConfig = getBankConfig(account.bankCode);

    return {
      success: true,
      bankAccount: {
        id: account._id,
        bankType: account.bankType,
        bankCode: account.bankCode,
        bankName: bankConfig?.nameTh,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        lineEmail: account.lineEmail,
        status: account.status,
        statusLabel: STATUS_LABELS_TH[account.status],
        balance: account.balance,
        monitoringEnabled: account.monitoringEnabled,
        checkInterval: account.checkInterval,
        hasKeys: !!(account.xLineAccess && account.xHmac),
        lastMessageFetch: account.lastMessageFetch,
        lastKeyCheck: account.lastKeyCheck,
        keysExtractedAt: account.keysExtractedAt,
        errorCount: account.errorCount,
        lastError: account.lastError,
      },
    };
  }

  /**
   * Update bank account
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update bank account' })
  async updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Update fields
    if (dto.accountName) account.accountName = dto.accountName;
    if (dto.lineEmail) account.lineEmail = dto.lineEmail;
    if (dto.linePassword) account.linePasswordEncrypted = dto.linePassword; // TODO: Encrypt
    if (dto.checkInterval) account.checkInterval = dto.checkInterval;
    if (dto.monitoringEnabled !== undefined) account.monitoringEnabled = dto.monitoringEnabled;
    if (dto.chatMid) account.chatMid = dto.chatMid;

    await account.save();

    return {
      success: true,
      message: 'Bank account updated',
    };
  }

  /**
   * Delete bank account
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Remove bank account' })
  async deleteBankAccount(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Soft delete
    account.isActive = false;
    account.status = BankStatus.DISABLED;
    await account.save();

    // Transition state
    await this.stateMachineService.transition(
      id,
      BankStatus.DISABLED,
      { reason: 'User deleted account', triggeredBy: 'user' },
    );

    return {
      success: true,
      message: 'Bank account removed',
    };
  }

  /**
   * Get current status
   */
  @Get(':id/status')
  @ApiOperation({ summary: 'Get current status' })
  async getBankAccountStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Check for active PIN
    const activePIN = await this.pinCodeModel.findOne({
      bankAccountId: new Types.ObjectId(id),
      status: { $in: ['fresh', 'new'] },
      expiresAt: { $gt: new Date() },
    });

    return {
      success: true,
      status: account.status,
      statusLabel: STATUS_LABELS_TH[account.status],
      hasKeys: !!(account.xLineAccess && account.xHmac),
      hasActivePIN: !!activePIN,
      pinCode: activePIN?.pinCode,
      pinExpiresAt: activePIN?.expiresAt,
      balance: account.balance,
      lastError: account.lastError,
      errorCount: account.errorCount,
    };
  }

  /**
   * Get extracted messages/transactions
   */
  @Get(':id/messages')
  @ApiOperation({ summary: 'Get extracted messages' })
  async getBankAccountMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('type') type?: string,
  ) {
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    const query: any = { bankAccountId: new Types.ObjectId(id) };
    if (type && ['deposit', 'withdraw', 'transfer'].includes(type)) {
      query.type = type;
    }

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ messageDate: -1 })
        .skip(offset || 0)
        .limit(limit || 50),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      success: true,
      total,
      messages: transactions.map(t => ({
        id: t._id,
        type: t.type,
        amount: t.amount,
        balance: t.balance,
        counterparty: t.counterparty,
        messageDate: t.messageDate,
        rawMessage: t.rawMessage,
        isProcessed: t.isProcessed,
      })),
    };
  }

  /**
   * Trigger LINE login for bank account
   */
  @Post(':id/login')
  @ApiOperation({ summary: 'Trigger LINE login' })
  async triggerLogin(
    @Param('id') id: string,
    @Body() dto: TriggerAutoSlipLoginDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Verify ownership
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    this.logger.log(`[Login] Triggering login for bank account ${id}`);

    // Call login service
    const result = await this.loginService.triggerLogin(
      id,
      dto.email,
      dto.password,
    );

    return {
      success: result.success,
      status: result.status,
      pinCode: result.pinCode,
      message: result.message || (result.pinCode
        ? 'PIN displayed. Please verify on your LINE mobile app.'
        : 'Login initiated'),
      error: result.error,
    };
  }

  /**
   * Get login status (poll-able endpoint)
   */
  @Get(':id/login-status')
  @ApiOperation({ summary: 'Get login status' })
  async getLoginStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Verify ownership
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    const status = await this.loginService.getLoginStatus(id);

    return {
      success: true,
      ...status,
      statusLabel: STATUS_LABELS_TH[status.status] || status.status,
    };
  }

  /**
   * Set keys manually
   */
  @Post(':id/keys')
  @ApiOperation({ summary: 'Set keys manually' })
  async setKeys(
    @Param('id') id: string,
    @Body() dto: SetAutoSlipKeysDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const account = await this.bankAccountModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Update keys
    account.xLineAccess = dto.xLineAccess;
    account.xHmac = dto.xHmac;
    if (dto.userAgent) account.userAgent = dto.userAgent;
    if (dto.lineVersion) account.lineVersion = dto.lineVersion;
    if (dto.chatMid) account.chatMid = dto.chatMid;
    account.keysExtractedAt = new Date();
    account.lastKeyCheck = new Date();
    await account.save();

    // Record history
    await this.keyHistoryModel.create({
      bankAccountId: new Types.ObjectId(id),
      userId: new Types.ObjectId(user.userId),
      xLineAccessPreview: dto.xLineAccess.substring(0, 20) + '...',
      xHmacPreview: dto.xHmac.substring(0, 20) + '...',
      extractedAt: new Date(),
      source: 'manual_input',
      status: 'success',
      performedBy: user.userId,
      ipAddress: req.ip,
    });

    // Transition to KEYS_READY
    await this.stateMachineService.transition(
      id,
      BankStatus.KEYS_READY,
      { reason: 'Manual keys input', triggeredBy: 'user' },
    );

    return {
      success: true,
      message: 'Keys saved successfully',
    };
  }
}

// =============================================
// ADMIN ENDPOINTS - /api/admin/auto-slip
// =============================================

@ApiTags('Auto-Slip Admin')
@ApiBearerAuth()
@Controller('admin/auto-slip')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AutoSlipAdminController {
  private readonly logger = new Logger(AutoSlipAdminController.name);

  constructor(
    @InjectModel(AutoSlipBankAccount.name)
    private bankAccountModel: Model<AutoSlipBankAccountDocument>,
    @InjectModel(AutoSlipTransaction.name)
    private transactionModel: Model<AutoSlipTransactionDocument>,
    private stateMachineService: BankStateMachineService,
    private orchestratorService: AutoSlipOrchestratorService,
    private lockService: AutoSlipLockService,
  ) {}

  /**
   * Get all bank accounts (admin view)
   */
  @Get('bank-accounts')
  @ApiOperation({ summary: 'List all bank accounts' })
  async getAllBankAccounts(
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const query: any = { isActive: true };
    if (status && Object.values(BankStatus).includes(status as BankStatus)) {
      query.status = status;
    }

    const [accounts, total] = await Promise.all([
      this.bankAccountModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset || 0)
        .limit(limit || 100)
        .populate('userId', 'username email'),
      this.bankAccountModel.countDocuments(query),
    ]);

    return {
      success: true,
      total,
      bankAccounts: accounts.map(acc => ({
        id: acc._id,
        userId: acc.userId,
        bankType: acc.bankType,
        bankCode: acc.bankCode,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        lineEmail: acc.lineEmail,
        status: acc.status,
        statusLabel: STATUS_LABELS_TH[acc.status],
        balance: acc.balance,
        monitoringEnabled: acc.monitoringEnabled,
        hasKeys: !!(acc.xLineAccess && acc.xHmac),
        errorCount: acc.errorCount,
        lastError: acc.lastError,
        lastMessageFetch: acc.lastMessageFetch,
        createdAt: acc['createdAt'],
      })),
    };
  }

  /**
   * Get system statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get system statistics' })
  async getStats() {
    const [
      totalAccounts,
      activeAccounts,
      accountsByStatus,
      recentTransactions,
    ] = await Promise.all([
      this.bankAccountModel.countDocuments({ isActive: true }),
      this.bankAccountModel.countDocuments({ isActive: true, status: BankStatus.ACTIVE }),
      this.bankAccountModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.transactionModel.countDocuments({
        messageDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const item of accountsByStatus) {
      statusCounts[item._id] = item.count;
    }

    return {
      success: true,
      stats: {
        totalAccounts,
        activeAccounts,
        statusCounts,
        transactionsLast24h: recentTransactions,
      },
    };
  }

  /**
   * Reset bank account status
   */
  @Post('bank-accounts/:id/reset')
  @ApiOperation({ summary: 'Reset bank status' })
  async resetBankAccount(@Param('id') id: string) {
    const account = await this.bankAccountModel.findById(id);
    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    await this.stateMachineService.transition(
      id,
      BankStatus.INIT,
      { reason: 'Admin manual reset', triggeredBy: 'admin', force: true },
    );

    // Clear error state
    account.errorCount = 0;
    account.lastError = '';
    await account.save();

    return {
      success: true,
      message: 'Bank account reset to INIT state',
    };
  }

  /**
   * Get all transactions (admin view)
   */
  @Get('transactions')
  @ApiOperation({ summary: 'View all auto-slip transactions' })
  async getAllTransactions(
    @Query('type') type?: string,
    @Query('isProcessed') isProcessed?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const query: any = {};
    if (type) query.type = type;
    if (isProcessed !== undefined) {
      query.isProcessed = isProcessed === 'true';
    }

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ messageDate: -1 })
        .skip(offset || 0)
        .limit(limit || 100)
        .populate('bankAccountId', 'bankType accountNumber'),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      success: true,
      total,
      transactions: transactions.map(t => ({
        id: t._id,
        bankAccountId: t.bankAccountId,
        type: t.type,
        amount: t.amount,
        balance: t.balance,
        messageDate: t.messageDate,
        rawMessage: t.rawMessage,
        isProcessed: t.isProcessed,
        matchedPaymentId: t.matchedPaymentId,
      })),
    };
  }

  /**
   * Get unmatched transactions
   */
  @Get('transactions/unmatched')
  @ApiOperation({ summary: 'View unmatched transactions' })
  async getUnmatchedTransactions(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const query = {
      isProcessed: false,
      type: 'deposit',
    };

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ messageDate: -1 })
        .skip(offset || 0)
        .limit(limit || 100)
        .populate('bankAccountId', 'bankType accountNumber accountName'),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      success: true,
      total,
      transactions: transactions.map(t => ({
        id: t._id,
        bankAccountId: t.bankAccountId,
        type: t.type,
        amount: t.amount,
        balance: t.balance,
        messageDate: t.messageDate,
        rawMessage: t.rawMessage,
      })),
    };
  }

  /**
   * Get status history for a bank account
   */
  @Get('bank-accounts/:id/history')
  @ApiOperation({ summary: 'Get status change history' })
  async getBankAccountHistory(
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    const history = await this.stateMachineService.getStatusHistory(id, limit || 50);

    return {
      success: true,
      total: history.length,
      history: history.map(h => ({
        id: h._id,
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        reason: h.reason,
        triggeredBy: h.triggeredBy,
        changedAt: h.changedAt,
      })),
    };
  }

  // ================================
  // ORCHESTRATOR & SETTINGS
  // ================================

  /**
   * Get orchestrator status and all account statuses
   */
  @Get('orchestrator/status')
  @ApiOperation({ summary: 'Get orchestrator status and statistics' })
  async getOrchestratorStatus() {
    const [stats, fetcherStatus, accounts] = await Promise.all([
      this.orchestratorService.getStats(),
      this.orchestratorService.getFetcherStatus(),
      this.orchestratorService.getAllAccountStatuses(),
    ]);

    return {
      success: true,
      stats,
      fetcherStatus,
      globalSettings: this.orchestratorService.getGlobalSettings(),
      accounts,
    };
  }

  /**
   * Get global settings
   */
  @Get('settings')
  @ApiOperation({ summary: 'Get global auto-slip settings' })
  async getGlobalSettings() {
    return {
      success: true,
      settings: this.orchestratorService.getGlobalSettings(),
    };
  }

  /**
   * Update check interval for a bank account
   */
  @Put('bank-accounts/:id/check-interval')
  @ApiOperation({ summary: 'Update check interval for a bank account' })
  async updateCheckInterval(
    @Param('id') id: string,
    @Body() body: { intervalMs: number },
  ) {
    if (!body.intervalMs || body.intervalMs < 60000 || body.intervalMs > 3600000) {
      throw new BadRequestException('Interval must be between 60000 (1 min) and 3600000 (1 hour)');
    }

    const success = await this.orchestratorService.updateCheckInterval(id, body.intervalMs);

    if (!success) {
      throw new NotFoundException('Bank account not found');
    }

    return {
      success: true,
      message: `Check interval updated to ${body.intervalMs / 1000} seconds`,
    };
  }

  /**
   * Enable monitoring for a bank account
   */
  @Post('bank-accounts/:id/enable-monitoring')
  @ApiOperation({ summary: 'Enable monitoring for a bank account' })
  async enableMonitoring(@Param('id') id: string) {
    const success = await this.orchestratorService.enableMonitoring(id);

    if (!success) {
      throw new NotFoundException('Bank account not found');
    }

    return {
      success: true,
      message: 'Monitoring enabled',
    };
  }

  /**
   * Disable monitoring for a bank account
   */
  @Post('bank-accounts/:id/disable-monitoring')
  @ApiOperation({ summary: 'Disable monitoring for a bank account' })
  async disableMonitoring(@Param('id') id: string) {
    const success = await this.orchestratorService.disableMonitoring(id);

    if (!success) {
      throw new NotFoundException('Bank account not found');
    }

    return {
      success: true,
      message: 'Monitoring disabled',
    };
  }

  /**
   * Trigger manual fetch for a bank account
   */
  @Post('bank-accounts/:id/fetch')
  @ApiOperation({ summary: 'Trigger manual fetch for a bank account' })
  async triggerManualFetch(@Param('id') id: string) {
    const result = await this.orchestratorService.triggerManualFetch(id);

    return {
      success: result.success,
      messagesFound: result.messagesFound,
      newMessages: result.newMessages,
      error: result.error,
    };
  }

  // ================================
  // LOCK MANAGEMENT
  // ================================

  /**
   * Get all active locks
   */
  @Get('locks')
  @ApiOperation({ summary: 'Get all active locks' })
  async getAllLocks() {
    const locks = this.lockService.getAllLocks();
    const stats = this.lockService.getStats();

    return {
      success: true,
      total: locks.length,
      stats,
      locks: locks.map(l => ({
        bankAccountId: l.bankAccountId,
        operation: l.operation,
        lockedAt: l.lockedAt,
        expiresAt: l.expiresAt,
        duration: Date.now() - l.lockedAt.getTime(),
      })),
    };
  }

  /**
   * Force release a specific lock
   */
  @Delete('locks/:bankAccountId')
  @ApiOperation({ summary: 'Force release a lock' })
  async forceReleaseLock(@Param('bankAccountId') bankAccountId: string) {
    const released = this.lockService.forceRelease(bankAccountId);

    return {
      success: released,
      message: released ? 'Lock released' : 'No lock found',
    };
  }

  /**
   * Force release all locks
   */
  @Delete('locks')
  @ApiOperation({ summary: 'Force release all locks' })
  async forceReleaseAllLocks() {
    const count = this.orchestratorService.forceReleaseAllLocks();

    return {
      success: true,
      message: `Released ${count} locks`,
      releasedCount: count,
    };
  }

  /**
   * Batch update check interval for multiple accounts
   */
  @Put('batch/check-interval')
  @ApiOperation({ summary: 'Update check interval for multiple accounts' })
  async batchUpdateCheckInterval(
    @Body() body: { bankAccountIds: string[]; intervalMs: number },
  ) {
    if (!body.intervalMs || body.intervalMs < 60000 || body.intervalMs > 3600000) {
      throw new BadRequestException('Interval must be between 60000 (1 min) and 3600000 (1 hour)');
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of body.bankAccountIds) {
      try {
        const success = await this.orchestratorService.updateCheckInterval(id, body.intervalMs);
        results.push({ id, success });
      } catch (error: any) {
        results.push({ id, success: false, error: error.message });
      }
    }

    return {
      success: true,
      total: body.bankAccountIds.length,
      succeeded: results.filter(r => r.success).length,
      results,
    };
  }

  /**
   * Batch enable/disable monitoring
   */
  @Put('batch/monitoring')
  @ApiOperation({ summary: 'Enable or disable monitoring for multiple accounts' })
  async batchUpdateMonitoring(
    @Body() body: { bankAccountIds: string[]; enabled: boolean },
  ) {
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of body.bankAccountIds) {
      try {
        const success = body.enabled
          ? await this.orchestratorService.enableMonitoring(id)
          : await this.orchestratorService.disableMonitoring(id);
        results.push({ id, success });
      } catch (error: any) {
        results.push({ id, success: false, error: error.message });
      }
    }

    return {
      success: true,
      total: body.bankAccountIds.length,
      succeeded: results.filter(r => r.success).length,
      results,
    };
  }
}
