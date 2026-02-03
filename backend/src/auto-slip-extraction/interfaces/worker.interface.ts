import { BankStatus } from '../constants/bank-status.enum';

/**
 * Worker state for browser automation
 */
export enum AutoSlipWorkerState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  BUSY = 'busy',
  WAITING_PIN = 'waiting_pin',
  RECOVERING = 'recovering',
  ERROR = 'error',
  CLOSED = 'closed',
}

/**
 * Worker interface for auto-slip extraction
 */
export interface AutoSlipWorker {
  id: string;
  bankAccountId: string;
  lineEmail: string;
  state: AutoSlipWorkerState;
  browser: any; // Puppeteer Browser
  page: any; // Puppeteer Page
  cdpClient: any; // CDP Session
  profileDir: string;
  createdAt: Date;
  lastActivityAt: Date;
  recoveryAttempts: number;
  error?: string;
  pinCode?: string;
  capturedKeys?: {
    xLineAccess: string;
    xHmac: string;
  };
  capturedChatMid?: string;
}

/**
 * Worker pool configuration
 */
export interface AutoSlipWorkerPoolConfig {
  maxWorkers: number;
  maxRecoveryAttempts: number;
  recoveryDelayMs: number;
  idleTimeoutMs: number;
  userDataDir: string;
  staleWorkerTimeoutMs: number;
  cleanupIntervalMs: number;
}

/**
 * Bank account status change event
 */
export interface BankStatusChangeEvent {
  bankAccountId: string;
  userId: string;
  previousStatus: BankStatus;
  newStatus: BankStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * PIN display event
 */
export interface PinDisplayEvent {
  bankAccountId: string;
  userId: string;
  pinCode: string;
  displayedAt: Date;
  expiresAt: Date;
  status: 'fresh' | 'new' | 'old' | 'expired';
}

/**
 * Keys extraction event
 */
export interface KeysExtractedEvent {
  bankAccountId: string;
  userId: string;
  xLineAccess: string;
  xHmac: string;
  chatMid?: string;
  extractedAt: Date;
  source: 'auto_login' | 'manual_input' | 'copied';
}

/**
 * Transaction detected event
 */
export interface TransactionDetectedEvent {
  bankAccountId: string;
  userId: string;
  type: 'deposit' | 'withdraw' | 'transfer';
  amount: number;
  balance?: number;
  messageId: string;
  transactionDate: Date;
  rawMessage: string;
}
