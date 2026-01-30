import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export enum RequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum RejectionReason {
  COOLDOWN = 'cooldown',
  ALREADY_IN_PROGRESS = 'already_in_progress',
  MAX_RETRIES_EXCEEDED = 'max_retries_exceeded',
  RATE_LIMITED = 'rate_limited',
}

export interface LoginRequest {
  requestId: string;
  lineAccountId: string;
  source: 'manual' | 'auto' | 'relogin';
  status: RequestStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  priority: number;
}

export interface LoginHistory {
  lineAccountId: string;
  timestamp: number;
  status: RequestStatus;
  error?: string;
  duration?: number;
}

export interface RequestResult {
  approved: boolean;
  requestId?: string;
  reason?: RejectionReason;
  cooldownRemainingMs?: number;
  message?: string;
}

interface CooldownConfig {
  errorCooldownMs: number;
  successCooldownMs: number;
  loginTimeoutMs: number;
  maxAutoRetryErrors: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

/**
 * LoginCoordinator Service
 *
 * Manages login requests with:
 * - Request queue with priority
 * - Cooldown periods after errors
 * - Exponential backoff on repeated failures
 * - Rate limiting protection
 * - Concurrent login prevention
 *
 * This is a NEW service that works alongside existing LineAutomationService
 */
@Injectable()
export class LoginCoordinatorService {
  private readonly logger = new Logger(LoginCoordinatorService.name);

  // Active requests by lineAccountId
  private activeRequests: Map<string, LoginRequest> = new Map();

  // Request history for cooldown calculation
  private requestHistory: Map<string, LoginHistory[]> = new Map();

  // Pending requests queue
  private requestQueue: LoginRequest[] = [];

  // Configuration
  private readonly config: CooldownConfig = {
    errorCooldownMs: 2 * 60 * 1000,      // 2 minutes base cooldown
    successCooldownMs: 30 * 1000,         // 30 seconds after success
    loginTimeoutMs: 5 * 60 * 1000,        // 5 minutes timeout
    maxAutoRetryErrors: 3,                 // Max auto retries
    backoffMultiplier: 2,                  // Exponential multiplier
    maxBackoffMs: 30 * 60 * 1000,         // Max 30 minutes backoff
  };

  constructor(private eventEmitter: EventEmitter2) {
    // Cleanup old history periodically
    setInterval(() => this.cleanupOldHistory(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Request login for a LINE account
   */
  requestLogin(
    lineAccountId: string,
    source: 'manual' | 'auto' | 'relogin' = 'manual',
    priority: number = 1,
  ): RequestResult {
    const requestId = `req_${lineAccountId}_${Date.now()}`;

    // Check if login already in progress
    const activeRequest = this.activeRequests.get(lineAccountId);
    if (activeRequest && activeRequest.status === RequestStatus.IN_PROGRESS) {
      return {
        approved: false,
        reason: RejectionReason.ALREADY_IN_PROGRESS,
        message: 'Login already in progress for this account',
      };
    }

    // Check cooldown
    const cooldownCheck = this.checkCooldown(lineAccountId, source);
    if (!cooldownCheck.allowed) {
      return {
        approved: false,
        reason: RejectionReason.COOLDOWN,
        cooldownRemainingMs: cooldownCheck.remainingMs,
        message: `Please wait ${Math.ceil(cooldownCheck.remainingMs! / 1000)} seconds before retrying`,
      };
    }

    // Check max retries for auto/relogin
    if (source !== 'manual') {
      const recentErrors = this.getRecentErrors(lineAccountId);
      if (recentErrors >= this.config.maxAutoRetryErrors) {
        return {
          approved: false,
          reason: RejectionReason.MAX_RETRIES_EXCEEDED,
          message: `Max auto-retry errors (${this.config.maxAutoRetryErrors}) exceeded. Manual login required.`,
        };
      }
    }

    // Check if higher priority request is queued
    const queuedRequest = this.requestQueue.find(r => r.lineAccountId === lineAccountId);
    if (queuedRequest && queuedRequest.priority > priority) {
      return {
        approved: false,
        reason: RejectionReason.RATE_LIMITED,
        message: 'A higher priority request is already queued',
      };
    }

    // Create and approve request
    const request: LoginRequest = {
      requestId,
      lineAccountId,
      source,
      status: RequestStatus.APPROVED,
      createdAt: new Date(),
      priority,
    };

    this.activeRequests.set(lineAccountId, request);

    this.logger.log(`Login request approved: ${requestId} for ${lineAccountId} (source: ${source})`);

    this.eventEmitter.emit('login.requested', {
      requestId,
      lineAccountId,
      source,
    });

    return {
      approved: true,
      requestId,
    };
  }

  /**
   * Check cooldown status
   */
  private checkCooldown(
    lineAccountId: string,
    source: 'manual' | 'auto' | 'relogin',
  ): { allowed: boolean; remainingMs?: number } {
    const history = this.requestHistory.get(lineAccountId) || [];

    if (history.length === 0) {
      return { allowed: true };
    }

    const lastEntry = history[history.length - 1];
    const now = Date.now();
    const timeSinceLastRequest = now - lastEntry.timestamp;

    // Calculate cooldown based on last result
    let cooldownMs: number;

    if (lastEntry.status === RequestStatus.COMPLETED) {
      cooldownMs = this.config.successCooldownMs;
    } else if (lastEntry.status === RequestStatus.FAILED) {
      // Exponential backoff for errors
      const recentFailures = this.getRecentErrors(lineAccountId);
      cooldownMs = Math.min(
        this.config.errorCooldownMs * Math.pow(this.config.backoffMultiplier, recentFailures - 1),
        this.config.maxBackoffMs,
      );
    } else {
      cooldownMs = this.config.successCooldownMs;
    }

    // Manual requests have shorter cooldown
    if (source === 'manual') {
      cooldownMs = Math.min(cooldownMs, this.config.successCooldownMs);
    }

    if (timeSinceLastRequest < cooldownMs) {
      return {
        allowed: false,
        remainingMs: cooldownMs - timeSinceLastRequest,
      };
    }

    return { allowed: true };
  }

  /**
   * Get recent error count (within 30 minutes)
   */
  private getRecentErrors(lineAccountId: string): number {
    const history = this.requestHistory.get(lineAccountId) || [];
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

    return history.filter(
      h => h.status === RequestStatus.FAILED && h.timestamp > thirtyMinutesAgo,
    ).length;
  }

  /**
   * Mark login as started
   */
  markLoginStarted(lineAccountId: string): void {
    const request = this.activeRequests.get(lineAccountId);
    if (request) {
      request.status = RequestStatus.IN_PROGRESS;
      request.startedAt = new Date();

      this.eventEmitter.emit('login.started', {
        requestId: request.requestId,
        lineAccountId,
      });
    }
  }

  /**
   * Mark login as completed (success)
   */
  markLoginCompleted(lineAccountId: string): void {
    const request = this.activeRequests.get(lineAccountId);
    if (request) {
      request.status = RequestStatus.COMPLETED;
      request.completedAt = new Date();

      // Add to history
      this.addToHistory(lineAccountId, {
        lineAccountId,
        timestamp: Date.now(),
        status: RequestStatus.COMPLETED,
        duration: request.startedAt
          ? Date.now() - request.startedAt.getTime()
          : undefined,
      });

      this.activeRequests.delete(lineAccountId);

      this.logger.log(`Login completed for ${lineAccountId}`);

      this.eventEmitter.emit('login.completed', {
        requestId: request.requestId,
        lineAccountId,
      });
    }
  }

  /**
   * Mark login as failed
   */
  markLoginFailed(lineAccountId: string, error: string): void {
    const request = this.activeRequests.get(lineAccountId);
    if (request) {
      request.status = RequestStatus.FAILED;
      request.completedAt = new Date();
      request.error = error;

      // Add to history
      this.addToHistory(lineAccountId, {
        lineAccountId,
        timestamp: Date.now(),
        status: RequestStatus.FAILED,
        error,
        duration: request.startedAt
          ? Date.now() - request.startedAt.getTime()
          : undefined,
      });

      this.activeRequests.delete(lineAccountId);

      const recentErrors = this.getRecentErrors(lineAccountId);
      const nextCooldownMs = Math.min(
        this.config.errorCooldownMs * Math.pow(this.config.backoffMultiplier, recentErrors - 1),
        this.config.maxBackoffMs,
      );

      this.logger.warn(
        `Login failed for ${lineAccountId}: ${error}. ` +
        `Next retry in ${Math.ceil(nextCooldownMs / 1000)} seconds`,
      );

      this.eventEmitter.emit('login.failed', {
        requestId: request.requestId,
        lineAccountId,
        error,
        nextCooldownMs,
      });
    }
  }

  /**
   * Cancel login request
   */
  cancelRequest(lineAccountId: string): void {
    this.activeRequests.delete(lineAccountId);
    this.requestQueue = this.requestQueue.filter(r => r.lineAccountId !== lineAccountId);

    this.eventEmitter.emit('login.cancelled', { lineAccountId });
  }

  /**
   * Add to history
   */
  private addToHistory(lineAccountId: string, entry: LoginHistory): void {
    const history = this.requestHistory.get(lineAccountId) || [];
    history.push(entry);

    // Keep only last 50 entries
    if (history.length > 50) {
      history.shift();
    }

    this.requestHistory.set(lineAccountId, history);
  }

  /**
   * Cleanup old history (older than 24 hours)
   */
  private cleanupOldHistory(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const [lineAccountId, history] of this.requestHistory) {
      const filtered = history.filter(h => h.timestamp > oneDayAgo);
      if (filtered.length === 0) {
        this.requestHistory.delete(lineAccountId);
      } else {
        this.requestHistory.set(lineAccountId, filtered);
      }
    }
  }

  /**
   * Get request status
   */
  getRequestStatus(lineAccountId: string): LoginRequest | null {
    return this.activeRequests.get(lineAccountId) || null;
  }

  /**
   * Get request history
   */
  getRequestHistory(lineAccountId: string, limit = 10): LoginHistory[] {
    const history = this.requestHistory.get(lineAccountId) || [];
    return history.slice(-limit);
  }

  /**
   * Get cooldown info
   */
  getCooldownInfo(lineAccountId: string): {
    inCooldown: boolean;
    remainingMs: number;
    recentErrors: number;
    nextRetryAt?: Date;
  } {
    const check = this.checkCooldown(lineAccountId, 'auto');
    const recentErrors = this.getRecentErrors(lineAccountId);

    return {
      inCooldown: !check.allowed,
      remainingMs: check.remainingMs || 0,
      recentErrors,
      nextRetryAt: check.remainingMs
        ? new Date(Date.now() + check.remainingMs)
        : undefined,
    };
  }

  /**
   * Reset cooldown (manual override)
   */
  resetCooldown(lineAccountId: string): void {
    this.requestHistory.delete(lineAccountId);
    this.logger.log(`Cooldown reset for ${lineAccountId}`);
  }

  /**
   * Get all active requests
   */
  getAllActiveRequests(): LoginRequest[] {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeRequests: number;
    queuedRequests: number;
    totalHistoryEntries: number;
    accountsInCooldown: number;
  } {
    let accountsInCooldown = 0;

    for (const lineAccountId of this.requestHistory.keys()) {
      const check = this.checkCooldown(lineAccountId, 'auto');
      if (!check.allowed) {
        accountsInCooldown++;
      }
    }

    return {
      activeRequests: this.activeRequests.size,
      queuedRequests: this.requestQueue.length,
      totalHistoryEntries: Array.from(this.requestHistory.values())
        .reduce((sum, h) => sum + h.length, 0),
      accountsInCooldown,
    };
  }
}
