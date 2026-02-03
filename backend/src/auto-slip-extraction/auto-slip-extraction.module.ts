import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

// Schemas
import {
  AutoSlipBankAccount,
  AutoSlipBankAccountSchema,
} from './schemas/auto-slip-bank-account.schema';
import {
  AutoSlipTransaction,
  AutoSlipTransactionSchema,
} from './schemas/auto-slip-transaction.schema';
import {
  AutoSlipKeyHistory,
  AutoSlipKeyHistorySchema,
} from './schemas/auto-slip-key-history.schema';
import {
  AutoSlipPinCode,
  AutoSlipPinCodeSchema,
} from './schemas/auto-slip-pin-code.schema';
import {
  AutoSlipStatusHistory,
  AutoSlipStatusHistorySchema,
} from './schemas/auto-slip-status-history.schema';

// Services
import { BankStateMachineService } from './services/bank-state-machine.service';
import { MessageParserService } from './services/message-parser.service';
import { AutoSlipLockService } from './services/auto-slip-lock.service';
import { TransactionFetcherService } from './services/transaction-fetcher.service';
import { AutoSlipOrchestratorService } from './services/auto-slip-orchestrator.service';

// Controllers
import {
  AutoSlipBankAccountController,
  AutoSlipAdminController,
} from './auto-slip-extraction.controller';

// Event Bus
import { EventBusModule } from '../core/events';

/**
 * Auto-Slip Extraction Module
 *
 * This module is completely independent and does NOT affect:
 * - Existing slip verification system
 * - AI chatbot system
 * - Payment processing
 *
 * Features:
 * - Bank account management for auto-slip
 * - State machine for bank status
 * - Message parsing for Thai banks (SCB, KBANK, GSB)
 * - Transaction extraction and storage
 *
 * To disable: Simply remove this module from app.module.ts imports
 */
@Module({
  imports: [
    // Database schemas - separate collections from existing system
    MongooseModule.forFeature([
      { name: AutoSlipBankAccount.name, schema: AutoSlipBankAccountSchema },
      { name: AutoSlipTransaction.name, schema: AutoSlipTransactionSchema },
      { name: AutoSlipKeyHistory.name, schema: AutoSlipKeyHistorySchema },
      { name: AutoSlipPinCode.name, schema: AutoSlipPinCodeSchema },
      { name: AutoSlipStatusHistory.name, schema: AutoSlipStatusHistorySchema },
    ]),
    // EventBus for publishing/subscribing to events
    EventBusModule,
    // Config for environment variables
    ConfigModule,
  ],
  controllers: [
    AutoSlipBankAccountController,
    AutoSlipAdminController,
  ],
  providers: [
    // Core services
    BankStateMachineService,
    MessageParserService,
    AutoSlipLockService,
    TransactionFetcherService,
    AutoSlipOrchestratorService,
  ],
  exports: [
    // Export services for use by other modules if needed
    BankStateMachineService,
    MessageParserService,
    AutoSlipLockService,
    TransactionFetcherService,
    AutoSlipOrchestratorService,
  ],
})
export class AutoSlipExtractionModule {}
