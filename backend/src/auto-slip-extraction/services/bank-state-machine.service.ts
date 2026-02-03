import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BankStatus, VALID_TRANSITIONS, STATUS_LABELS_TH } from '../constants/bank-status.enum';
import {
  AutoSlipBankAccount,
  AutoSlipBankAccountDocument,
} from '../schemas/auto-slip-bank-account.schema';
import {
  AutoSlipStatusHistory,
  AutoSlipStatusHistoryDocument,
} from '../schemas/auto-slip-status-history.schema';

export interface TransitionResult {
  success: boolean;
  previousStatus: BankStatus;
  newStatus: BankStatus;
  message?: string;
  error?: string;
}

/**
 * Bank State Machine Service
 *
 * Manages state transitions for bank accounts in auto-slip extraction.
 * Ensures valid transitions and maintains history.
 */
@Injectable()
export class BankStateMachineService {
  private readonly logger = new Logger(BankStateMachineService.name);

  constructor(
    @InjectModel(AutoSlipBankAccount.name)
    private bankAccountModel: Model<AutoSlipBankAccountDocument>,
    @InjectModel(AutoSlipStatusHistory.name)
    private statusHistoryModel: Model<AutoSlipStatusHistoryDocument>,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check if a transition from current to new status is valid
   */
  canTransition(currentStatus: BankStatus, newStatus: BankStatus): boolean {
    const validNextStates = VALID_TRANSITIONS[currentStatus] || [];
    return validNextStates.includes(newStatus);
  }

  /**
   * Execute a state transition
   */
  async transition(
    bankAccountId: string,
    newStatus: BankStatus,
    options?: {
      reason?: string;
      triggeredBy?: string;
      metadata?: Record<string, unknown>;
      force?: boolean;
    },
  ): Promise<TransitionResult> {
    const { reason, triggeredBy = 'system', metadata, force = false } = options || {};

    try {
      // Find the bank account
      const bankAccount = await this.bankAccountModel.findById(bankAccountId);
      if (!bankAccount) {
        return {
          success: false,
          previousStatus: BankStatus.DISABLED,
          newStatus,
          error: 'Bank account not found',
        };
      }

      const previousStatus = bankAccount.status;

      // Check if transition is valid (unless force is true)
      if (!force && !this.canTransition(previousStatus, newStatus)) {
        const errorMsg = `Invalid transition from ${previousStatus} to ${newStatus}`;
        this.logger.warn(`[StateMachine] ${errorMsg} for bank ${bankAccountId}`);
        return {
          success: false,
          previousStatus,
          newStatus,
          error: errorMsg,
        };
      }

      // Update the status
      bankAccount.status = newStatus;
      bankAccount.lastStatusChange = new Date();

      // Update error tracking
      if (newStatus === BankStatus.ERROR_SOFT || newStatus === BankStatus.ERROR_FATAL) {
        bankAccount.errorCount += 1;
        if (reason) {
          bankAccount.lastError = reason;
        }
      } else if (newStatus === BankStatus.ACTIVE || newStatus === BankStatus.KEYS_READY) {
        // Reset error count on successful states
        bankAccount.errorCount = 0;
        bankAccount.lastError = '';
      }

      await bankAccount.save();

      // Record history
      await this.statusHistoryModel.create({
        bankAccountId: new Types.ObjectId(bankAccountId),
        userId: bankAccount.userId,
        previousStatus,
        newStatus,
        reason,
        triggeredBy,
        metadata,
        changedAt: new Date(),
      });

      // Emit event
      this.eventEmitter.emit('bank.status_changed', {
        bankAccountId,
        userId: bankAccount.userId.toString(),
        previousStatus,
        newStatus,
        reason,
        metadata,
        timestamp: new Date(),
      });

      this.logger.log(
        `[StateMachine] Bank ${bankAccountId}: ${previousStatus} → ${newStatus} (${triggeredBy})`,
      );

      return {
        success: true,
        previousStatus,
        newStatus,
        message: `Status changed to ${STATUS_LABELS_TH[newStatus]}`,
      };
    } catch (error: any) {
      this.logger.error(`[StateMachine] Transition failed: ${error.message}`);
      return {
        success: false,
        previousStatus: BankStatus.DISABLED,
        newStatus,
        error: error.message,
      };
    }
  }

  /**
   * Get status history for a bank account
   */
  async getStatusHistory(bankAccountId: string, limit = 50): Promise<AutoSlipStatusHistoryDocument[]> {
    return this.statusHistoryModel
      .find({ bankAccountId: new Types.ObjectId(bankAccountId) })
      .sort({ changedAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Check and reset stuck banks
   * Banks in certain states for too long should be reset
   */
  async checkAndResetStuckBanks(): Promise<number> {
    const stuckTimeout = 10 * 60 * 1000; // 10 minutes
    const now = new Date();
    const stuckThreshold = new Date(now.getTime() - stuckTimeout);

    // Find banks stuck in transitional states
    const stuckBanks = await this.bankAccountModel.find({
      status: { $in: [BankStatus.LOGGING_IN, BankStatus.AWAITING_PIN] },
      lastStatusChange: { $lt: stuckThreshold },
      isActive: true,
    });

    let resetCount = 0;

    for (const bank of stuckBanks) {
      const result = await this.transition(
        bank._id.toString(),
        BankStatus.ERROR_SOFT,
        {
          reason: 'Stuck in transitional state for too long',
          triggeredBy: 'auto_recovery',
        },
      );

      if (result.success) {
        resetCount++;
        this.logger.log(`[StateMachine] Auto-reset stuck bank: ${bank._id}`);
      }
    }

    return resetCount;
  }

  /**
   * Get current status for a bank account
   */
  async getCurrentStatus(bankAccountId: string): Promise<BankStatus | null> {
    const bank = await this.bankAccountModel.findById(bankAccountId).select('status');
    return bank?.status || null;
  }

  /**
   * Get all possible next states from current state
   */
  getPossibleNextStates(currentStatus: BankStatus): BankStatus[] {
    return VALID_TRANSITIONS[currentStatus] || [];
  }
}
