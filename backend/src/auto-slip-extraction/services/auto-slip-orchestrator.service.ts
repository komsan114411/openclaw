import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

import { AutoSlipLockService } from './auto-slip-lock.service';
import { BankStateMachineService } from './bank-state-machine.service';
import { TransactionFetcherService } from './transaction-fetcher.service';
import { BankStatus, STATUS_LABELS_TH } from '../constants/bank-status.enum';

import {
  AutoSlipBankAccount,
  AutoSlipBankAccountDocument,
} from '../schemas/auto-slip-bank-account.schema';
import {
  AutoSlipPinCode,
  AutoSlipPinCodeDocument,
} from '../schemas/auto-slip-pin-code.schema';

export interface AccountStatus {
  bankAccountId: string;
  bankType: string;
  accountNumber: string;
  accountName: string;
  status: BankStatus;
  statusLabel: string;
  balance?: number;
  hasKeys: boolean;
  isLocked: boolean;
  lockOperation?: string;
  lastMessageFetch?: Date;
  errorCount: number;
  pinCode?: string;
  pinExpiresAt?: Date;
}

export interface OrchestratorStats {
  totalAccounts: number;
  activeAccounts: number;
  accountsWithKeys: number;
  accountsInError: number;
  accountsAwaitingPin: number;
  accountsLoggingIn: number;
  lockedAccounts: number;
}

/**
 * Auto-Slip Orchestrator Service
 *
 * Central control for all bank account operations:
 * - Monitors all accounts status
 * - Handles stuck account recovery
 * - Provides real-time status updates
 * - Coordinates concurrent operations
 */
@Injectable()
export class AutoSlipOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AutoSlipOrchestratorService.name);

  // Status broadcast interval
  private statusBroadcastInterval: NodeJS.Timeout | null = null;
  private readonly BROADCAST_INTERVAL_MS = 5000; // 5 seconds

  constructor(
    @InjectModel(AutoSlipBankAccount.name)
    private bankAccountModel: Model<AutoSlipBankAccountDocument>,
    @InjectModel(AutoSlipPinCode.name)
    private pinCodeModel: Model<AutoSlipPinCodeDocument>,
    private lockService: AutoSlipLockService,
    private stateMachineService: BankStateMachineService,
    private transactionFetcherService: TransactionFetcherService,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Start status broadcast loop
    this.startStatusBroadcast();
    this.logger.log('Auto-Slip Orchestrator initialized');
  }

  /**
   * Start periodic status broadcast to connected clients
   */
  private startStatusBroadcast(): void {
    this.statusBroadcastInterval = setInterval(async () => {
      await this.broadcastStatus();
    }, this.BROADCAST_INTERVAL_MS);
  }

  /**
   * Broadcast current status to all connected clients
   */
  private async broadcastStatus(): Promise<void> {
    try {
      const statuses = await this.getAllAccountStatuses();
      const stats = this.calculateStats(statuses);

      this.eventEmitter.emit('auto-slip.orchestrator.status', {
        timestamp: new Date(),
        stats,
        accounts: statuses,
      });
    } catch (error: any) {
      this.logger.error(`Status broadcast error: ${error.message}`);
    }
  }

  /**
   * Get status for all accounts
   */
  async getAllAccountStatuses(): Promise<AccountStatus[]> {
    const accounts = await this.bankAccountModel.find({ isActive: true });
    const statuses: AccountStatus[] = [];

    for (const account of accounts) {
      const bankAccountId = account._id.toString();
      const lockInfo = this.lockService.getLockInfo(bankAccountId);

      // Check for active PIN
      const activePIN = await this.pinCodeModel.findOne({
        bankAccountId: account._id,
        status: { $in: ['fresh', 'new'] },
        expiresAt: { $gt: new Date() },
      });

      statuses.push({
        bankAccountId,
        bankType: account.bankType,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        status: account.status,
        statusLabel: STATUS_LABELS_TH[account.status] || account.status,
        balance: account.balance,
        hasKeys: !!(account.xLineAccess && account.xHmac),
        isLocked: !!lockInfo,
        lockOperation: lockInfo?.operation,
        lastMessageFetch: account.lastMessageFetch,
        errorCount: account.errorCount || 0,
        pinCode: activePIN?.pinCode,
        pinExpiresAt: activePIN?.expiresAt,
      });
    }

    return statuses;
  }

  /**
   * Get status for accounts owned by a specific user
   */
  async getUserAccountStatuses(userId: string): Promise<AccountStatus[]> {
    const accounts = await this.bankAccountModel.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    const statuses: AccountStatus[] = [];

    for (const account of accounts) {
      const bankAccountId = account._id.toString();
      const lockInfo = this.lockService.getLockInfo(bankAccountId);

      // Check for active PIN
      const activePIN = await this.pinCodeModel.findOne({
        bankAccountId: account._id,
        status: { $in: ['fresh', 'new'] },
        expiresAt: { $gt: new Date() },
      });

      statuses.push({
        bankAccountId,
        bankType: account.bankType,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        status: account.status,
        statusLabel: STATUS_LABELS_TH[account.status] || account.status,
        balance: account.balance,
        hasKeys: !!(account.xLineAccess && account.xHmac),
        isLocked: !!lockInfo,
        lockOperation: lockInfo?.operation,
        lastMessageFetch: account.lastMessageFetch,
        errorCount: account.errorCount || 0,
        pinCode: activePIN?.pinCode,
        pinExpiresAt: activePIN?.expiresAt,
      });
    }

    return statuses;
  }

  /**
   * Calculate statistics from account statuses
   */
  private calculateStats(statuses: AccountStatus[]): OrchestratorStats {
    return {
      totalAccounts: statuses.length,
      activeAccounts: statuses.filter((s) => s.status === BankStatus.ACTIVE).length,
      accountsWithKeys: statuses.filter((s) => s.hasKeys).length,
      accountsInError: statuses.filter(
        (s) => s.status === BankStatus.ERROR_SOFT || s.status === BankStatus.ERROR_FATAL,
      ).length,
      accountsAwaitingPin: statuses.filter((s) => s.status === BankStatus.AWAITING_PIN).length,
      accountsLoggingIn: statuses.filter((s) => s.status === BankStatus.LOGGING_IN).length,
      lockedAccounts: statuses.filter((s) => s.isLocked).length,
    };
  }

  /**
   * Get orchestrator statistics
   */
  async getStats(): Promise<OrchestratorStats> {
    const statuses = await this.getAllAccountStatuses();
    return this.calculateStats(statuses);
  }

  /**
   * Cron: Check for stuck accounts every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkStuckAccounts(): Promise<void> {
    try {
      const resetCount = await this.stateMachineService.checkAndResetStuckBanks();
      if (resetCount > 0) {
        this.logger.log(`Auto-reset ${resetCount} stuck accounts`);
      }
    } catch (error: any) {
      this.logger.error(`Stuck account check error: ${error.message}`);
    }
  }

  /**
   * Cron: Cleanup expired PINs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredPins(): Promise<void> {
    try {
      const result = await this.pinCodeModel.updateMany(
        {
          status: { $in: ['fresh', 'new', 'old'] },
          expiresAt: { $lt: new Date() },
        },
        { status: 'expired' },
      );

      if (result.modifiedCount > 0) {
        this.logger.log(`Marked ${result.modifiedCount} PINs as expired`);
      }
    } catch (error: any) {
      this.logger.error(`PIN cleanup error: ${error.message}`);
    }
  }

  /**
   * Enable monitoring for an account
   */
  async enableMonitoring(bankAccountId: string): Promise<boolean> {
    const result = await this.bankAccountModel.updateOne(
      { _id: new Types.ObjectId(bankAccountId) },
      { monitoringEnabled: true },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Disable monitoring for an account
   */
  async disableMonitoring(bankAccountId: string): Promise<boolean> {
    const result = await this.bankAccountModel.updateOne(
      { _id: new Types.ObjectId(bankAccountId) },
      { monitoringEnabled: false },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Update check interval for an account
   */
  async updateCheckInterval(
    bankAccountId: string,
    intervalMs: number,
  ): Promise<boolean> {
    // Validate interval (min 1 minute, max 1 hour)
    if (intervalMs < 60000 || intervalMs > 3600000) {
      throw new Error('Check interval must be between 1 minute and 1 hour');
    }

    const result = await this.bankAccountModel.updateOne(
      { _id: new Types.ObjectId(bankAccountId) },
      { checkInterval: intervalMs },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Trigger manual fetch for an account
   */
  async triggerManualFetch(bankAccountId: string): Promise<{
    success: boolean;
    messagesFound: number;
    newMessages: number;
    error?: string;
  }> {
    return this.transactionFetcherService.manualFetch(bankAccountId);
  }

  /**
   * Get fetcher status
   */
  getFetcherStatus(): {
    isPolling: boolean;
    lockStats: { totalLocks: number; operations: Record<string, number> };
  } {
    return this.transactionFetcherService.getStatus();
  }

  /**
   * Force release all locks (admin only)
   */
  forceReleaseAllLocks(): number {
    return this.lockService.forceReleaseAll();
  }

  /**
   * Get global settings
   */
  getGlobalSettings(): {
    defaultCheckInterval: number;
    maxConcurrentFetches: number;
    maxConsecutiveErrors: number;
    statusBroadcastInterval: number;
  } {
    return {
      defaultCheckInterval: parseInt(
        this.configService.get('AUTO_SLIP_DEFAULT_INTERVAL', '300000'),
        10,
      ),
      maxConcurrentFetches: 5,
      maxConsecutiveErrors: 3,
      statusBroadcastInterval: this.BROADCAST_INTERVAL_MS,
    };
  }
}
