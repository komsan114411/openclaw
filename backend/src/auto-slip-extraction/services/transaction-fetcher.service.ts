import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { AutoSlipLockService } from './auto-slip-lock.service';
import { BankStateMachineService } from './bank-state-machine.service';
import { MessageParserService } from './message-parser.service';
import { BankStatus } from '../constants/bank-status.enum';

import {
  AutoSlipBankAccount,
  AutoSlipBankAccountDocument,
} from '../schemas/auto-slip-bank-account.schema';
import {
  AutoSlipTransaction,
  AutoSlipTransactionDocument,
} from '../schemas/auto-slip-transaction.schema';

interface FetchResult {
  success: boolean;
  bankAccountId: string;
  messagesFound: number;
  newMessages: number;
  error?: string;
}

/**
 * Transaction Fetcher Service
 *
 * Fetches bank transaction messages from LINE with:
 * - Concurrent processing for multiple accounts
 * - Per-account locking to prevent conflicts
 * - Configurable check intervals per account
 * - Error tracking with auto-pause
 */
@Injectable()
export class TransactionFetcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransactionFetcherService.name);

  // Main polling interval
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  // Configuration - Optimized for 100+ users
  private readonly DEFAULT_CHECK_INTERVAL_MS = 180000; // 3 minutes (reduced from 5)
  private readonly MAX_CONCURRENT_FETCHES = 30; // Increased from 5 to 30
  private readonly MAX_CONSECUTIVE_ERRORS = 5; // Increased tolerance
  private readonly ERROR_PAUSE_MS = 60000; // 1 minute pause (reduced from 5)

  // LINE API endpoint
  private readonly LINE_API_URL = 'https://gd2.line.naver.jp/enc';

  constructor(
    @InjectModel(AutoSlipBankAccount.name)
    private bankAccountModel: Model<AutoSlipBankAccountDocument>,
    @InjectModel(AutoSlipTransaction.name)
    private transactionModel: Model<AutoSlipTransactionDocument>,
    private lockService: AutoSlipLockService,
    private stateMachineService: BankStateMachineService,
    private messageParserService: MessageParserService,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Start polling loop
    this.startPolling();
  }

  async onModuleDestroy() {
    this.stopPolling();
  }

  /**
   * Start the main polling loop
   */
  startPolling(): void {
    if (this.pollingInterval) {
      return;
    }

    const intervalMs = parseInt(
      this.configService.get('AUTO_SLIP_POLL_INTERVAL', '60000'),
      10,
    );

    this.pollingInterval = setInterval(async () => {
      await this.pollActiveAccounts();
    }, intervalMs);

    this.logger.log(`Transaction fetcher started (polling every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop the polling loop
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.logger.log('Transaction fetcher stopped');
    }
  }

  /**
   * Poll all active accounts that need checking
   */
  async pollActiveAccounts(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('Polling already in progress, skipping');
      return;
    }

    this.isPolling = true;

    try {
      // Find accounts that need fetching
      const accountsToFetch = await this.getAccountsToFetch();

      if (accountsToFetch.length === 0) {
        return;
      }

      this.logger.log(`Found ${accountsToFetch.length} accounts to fetch`);

      // Process in batches to limit concurrency
      for (let i = 0; i < accountsToFetch.length; i += this.MAX_CONCURRENT_FETCHES) {
        const batch = accountsToFetch.slice(i, i + this.MAX_CONCURRENT_FETCHES);
        await Promise.all(
          batch.map((account) => this.fetchAccountTransactions(account)),
        );
      }
    } catch (error: any) {
      this.logger.error(`Polling error: ${error.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Get accounts that are due for fetching
   */
  private async getAccountsToFetch(): Promise<AutoSlipBankAccountDocument[]> {
    const now = new Date();

    return this.bankAccountModel.find({
      isActive: true,
      monitoringEnabled: true,
      status: BankStatus.ACTIVE,
      // Has valid keys
      xLineAccess: { $exists: true, $ne: '' },
      xHmac: { $exists: true, $ne: '' },
      // Due for checking (last fetch + interval < now)
      $or: [
        { lastMessageFetch: { $exists: false } },
        {
          $expr: {
            $lt: [
              { $add: ['$lastMessageFetch', '$checkInterval'] },
              now,
            ],
          },
        },
      ],
      // Not in error cooldown
      errorCount: { $lt: this.MAX_CONSECUTIVE_ERRORS },
    }).limit(50);
  }

  /**
   * Fetch transactions for a single account
   */
  async fetchAccountTransactions(
    account: AutoSlipBankAccountDocument,
  ): Promise<FetchResult> {
    const bankAccountId = account._id.toString();

    // Try to acquire lock
    if (!this.lockService.acquireLock(bankAccountId, 'fetch')) {
      return {
        success: false,
        bankAccountId,
        messagesFound: 0,
        newMessages: 0,
        error: 'Account is locked by another operation',
      };
    }

    try {
      this.logger.debug(`Fetching transactions for ${bankAccountId}`);

      // Call LINE API
      const messages = await this.callLineApi(account);

      if (!messages || messages.length === 0) {
        // Update last fetch time even if no messages
        await this.bankAccountModel.updateOne(
          { _id: account._id },
          { lastMessageFetch: new Date() },
        );

        return {
          success: true,
          bankAccountId,
          messagesFound: 0,
          newMessages: 0,
        };
      }

      // Process messages
      let newMessages = 0;
      for (const msg of messages) {
        const saved = await this.processMessage(account, msg);
        if (saved) {
          newMessages++;
        }
      }

      // Update account
      await this.bankAccountModel.updateOne(
        { _id: account._id },
        {
          lastMessageFetch: new Date(),
          errorCount: 0, // Reset error count on success
        },
      );

      this.logger.log(
        `Fetched ${messages.length} messages for ${bankAccountId}, ${newMessages} new`,
      );

      return {
        success: true,
        bankAccountId,
        messagesFound: messages.length,
        newMessages,
      };
    } catch (error: any) {
      this.logger.error(`Fetch error for ${bankAccountId}: ${error.message}`);

      // Increment error count
      const newErrorCount = (account.errorCount || 0) + 1;
      await this.bankAccountModel.updateOne(
        { _id: account._id },
        {
          errorCount: newErrorCount,
          lastError: error.message,
          lastMessageFetch: new Date(),
        },
      );

      // Transition to error state if max errors reached
      if (newErrorCount >= this.MAX_CONSECUTIVE_ERRORS) {
        await this.stateMachineService.transition(
          bankAccountId,
          BankStatus.ERROR_SOFT,
          { reason: `Max consecutive errors (${newErrorCount})`, triggeredBy: 'system' },
        );
      }

      // Emit error event
      this.eventEmitter.emit('bank.error', {
        bankAccountId,
        userId: account.userId.toString(),
        error: error.message,
        timestamp: new Date(),
      });

      return {
        success: false,
        bankAccountId,
        messagesFound: 0,
        newMessages: 0,
        error: error.message,
      };
    } finally {
      this.lockService.releaseLock(bankAccountId, 'fetch');
    }
  }

  /**
   * Call LINE API to get messages
   */
  private async callLineApi(
    account: AutoSlipBankAccountDocument,
  ): Promise<any[]> {
    if (!account.chatMid) {
      throw new Error('Chat MID not configured');
    }

    // Build request body for getRecentMessagesV2
    const requestBody = this.buildThriftRequest(account.chatMid);

    const response = await axios.post(this.LINE_API_URL, requestBody, {
      headers: {
        'X-Line-Access': account.xLineAccess,
        'X-Hmac': account.xHmac,
        'User-Agent': account.userAgent || 'Mozilla/5.0',
        'Content-Type': 'application/x-thrift',
        'x-line-application': `CHROMEOS\t${account.lineVersion || '3.4.0'}\tChrome OS\t1`,
      },
      timeout: 30000,
      responseType: 'arraybuffer',
    });

    // Parse response (simplified - actual parsing would be more complex)
    // For now, return empty array if we can't parse
    try {
      const data = this.parseThriftResponse(response.data);
      return data.messages || [];
    } catch {
      this.logger.warn('Failed to parse LINE API response');
      return [];
    }
  }

  /**
   * Build Thrift request for getRecentMessagesV2
   */
  private buildThriftRequest(chatMid: string): Buffer {
    // Simplified Thrift binary request
    // In production, use proper Thrift library
    const header = Buffer.from([0x80, 0x01, 0x00, 0x01]);
    const methodName = 'getRecentMessagesV2';
    const methodNameLen = Buffer.alloc(4);
    methodNameLen.writeUInt32BE(methodName.length);

    const methodNameBuf = Buffer.from(methodName);
    const seqId = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    // String field for chatMid
    const chatMidField = Buffer.from([0x0b, 0x00, 0x02]);
    const chatMidLen = Buffer.alloc(4);
    chatMidLen.writeUInt32BE(chatMid.length);
    const chatMidBuf = Buffer.from(chatMid);

    // Count field (50 messages)
    const countField = Buffer.from([0x08, 0x00, 0x03, 0x00, 0x00, 0x00, 0x32]);

    // End of struct
    const structEnd = Buffer.from([0x00]);

    return Buffer.concat([
      header,
      methodNameLen,
      methodNameBuf,
      seqId,
      chatMidField,
      chatMidLen,
      chatMidBuf,
      countField,
      structEnd,
    ]);
  }

  /**
   * Parse Thrift response (simplified)
   */
  private parseThriftResponse(data: Buffer): { messages: any[] } {
    // This is a simplified parser
    // In production, use proper Thrift library
    return { messages: [] };
  }

  /**
   * Process and save a single message
   */
  private async processMessage(
    account: AutoSlipBankAccountDocument,
    rawMessage: any,
  ): Promise<boolean> {
    try {
      // Extract message text
      const text = rawMessage.text || rawMessage.content || '';
      if (!text) {
        return false;
      }

      // Check if message already exists
      const messageId = rawMessage.id || rawMessage.messageId || `${Date.now()}_${Math.random()}`;
      const existing = await this.transactionModel.findOne({ messageId });
      if (existing) {
        return false;
      }

      // Parse the message
      const parsed = this.messageParserService.parseMessage(text, account.bankCode);

      if (!parsed.success) {
        return false;
      }

      // Save transaction
      const transaction = await this.transactionModel.create({
        userId: account.userId,
        bankAccountId: account._id,
        messageId,
        type: parsed.type,
        amount: parsed.amount,
        balance: parsed.balance,
        counterparty: parsed.counterparty,
        reference: parsed.reference,
        rawMessage: text,
        messageDate: parsed.transactionDate || new Date(),
        bankCode: account.bankCode,
        isProcessed: false,
      });

      // Update account balance if available
      if (parsed.balance) {
        const previousBalance = account.balance;
        await this.bankAccountModel.updateOne(
          { _id: account._id },
          { balance: parsed.balance },
        );

        // Emit balance update event
        this.eventEmitter.emit('bank.balance_updated', {
          bankAccountId: account._id.toString(),
          userId: account.userId.toString(),
          previousBalance,
          newBalance: parsed.balance,
          timestamp: new Date(),
        });
      }

      // Emit message received event
      this.eventEmitter.emit('bank.message_received', {
        bankAccountId: account._id.toString(),
        userId: account.userId.toString(),
        type: parsed.type,
        amount: parsed.amount,
        balance: parsed.balance,
        messageId,
        transactionDate: parsed.transactionDate || new Date(),
      });

      this.logger.log(
        `Saved transaction: ${parsed.type} ${parsed.amount} for ${account.bankCode}`,
      );

      return true;
    } catch (error: any) {
      this.logger.error(`Failed to process message: ${error.message}`);
      return false;
    }
  }

  /**
   * Manual fetch for a specific account
   */
  async manualFetch(bankAccountId: string): Promise<FetchResult> {
    const account = await this.bankAccountModel.findById(bankAccountId);
    if (!account) {
      return {
        success: false,
        bankAccountId,
        messagesFound: 0,
        newMessages: 0,
        error: 'Account not found',
      };
    }

    if (!account.xLineAccess || !account.xHmac) {
      return {
        success: false,
        bankAccountId,
        messagesFound: 0,
        newMessages: 0,
        error: 'Keys not configured',
      };
    }

    return this.fetchAccountTransactions(account);
  }

  /**
   * Get fetcher status
   */
  getStatus(): {
    isPolling: boolean;
    lockStats: { totalLocks: number; operations: Record<string, number> };
  } {
    return {
      isPolling: this.isPolling,
      lockStats: this.lockService.getStats(),
    };
  }
}
