import { Injectable, Logger } from '@nestjs/common';

export interface LockInfo {
  bankAccountId: string;
  operation: string;
  lockedAt: Date;
  expiresAt: Date;
}

/**
 * Auto-Slip Lock Service
 *
 * Manages locks for bank account operations to prevent conflicts
 * when multiple operations run concurrently.
 */
@Injectable()
export class AutoSlipLockService {
  private readonly logger = new Logger(AutoSlipLockService.name);
  private locks: Map<string, LockInfo> = new Map();
  private readonly DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Try to acquire a lock for a bank account
   */
  acquireLock(
    bankAccountId: string,
    operation: string,
    timeoutMs?: number,
  ): boolean {
    this.cleanupExpiredLocks();

    const existingLock = this.locks.get(bankAccountId);
    if (existingLock) {
      this.logger.warn(
        `Lock denied for ${bankAccountId} (${operation}) - already locked by ${existingLock.operation}`,
      );
      return false;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (timeoutMs || this.DEFAULT_LOCK_TIMEOUT_MS));

    this.locks.set(bankAccountId, {
      bankAccountId,
      operation,
      lockedAt: now,
      expiresAt,
    });

    this.logger.debug(`Lock acquired: ${bankAccountId} (${operation})`);
    return true;
  }

  /**
   * Release a lock for a bank account
   */
  releaseLock(bankAccountId: string, operation?: string): boolean {
    const lock = this.locks.get(bankAccountId);
    if (!lock) {
      return false;
    }

    // Only release if operation matches (if specified)
    if (operation && lock.operation !== operation) {
      this.logger.warn(
        `Cannot release lock for ${bankAccountId}: operation mismatch (${operation} vs ${lock.operation})`,
      );
      return false;
    }

    this.locks.delete(bankAccountId);
    this.logger.debug(`Lock released: ${bankAccountId}`);
    return true;
  }

  /**
   * Check if a bank account is locked
   */
  isLocked(bankAccountId: string): boolean {
    this.cleanupExpiredLocks();
    return this.locks.has(bankAccountId);
  }

  /**
   * Get lock info for a bank account
   */
  getLockInfo(bankAccountId: string): LockInfo | null {
    this.cleanupExpiredLocks();
    return this.locks.get(bankAccountId) || null;
  }

  /**
   * Get all active locks
   */
  getAllLocks(): LockInfo[] {
    this.cleanupExpiredLocks();
    return Array.from(this.locks.values());
  }

  /**
   * Force release all locks for cleanup
   */
  forceReleaseAll(): number {
    const count = this.locks.size;
    this.locks.clear();
    this.logger.log(`Force released all ${count} locks`);
    return count;
  }

  /**
   * Force release a specific lock
   */
  forceRelease(bankAccountId: string): boolean {
    if (this.locks.has(bankAccountId)) {
      this.locks.delete(bankAccountId);
      this.logger.warn(`Force released lock for ${bankAccountId}`);
      return true;
    }
    return false;
  }

  /**
   * Clean up expired locks
   */
  private cleanupExpiredLocks(): void {
    const now = new Date();
    for (const [bankAccountId, lock] of this.locks.entries()) {
      if (lock.expiresAt < now) {
        this.locks.delete(bankAccountId);
        this.logger.warn(`Lock expired and auto-released: ${bankAccountId}`);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): { totalLocks: number; operations: Record<string, number> } {
    this.cleanupExpiredLocks();
    const operations: Record<string, number> = {};

    for (const lock of this.locks.values()) {
      operations[lock.operation] = (operations[lock.operation] || 0) + 1;
    }

    return {
      totalLocks: this.locks.size,
      operations,
    };
  }
}
