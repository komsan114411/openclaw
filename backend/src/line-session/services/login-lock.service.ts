import { Injectable, Logger } from '@nestjs/common';

export interface LockInfo {
  source: string;
  lockedAt: Date;
}

/**
 * LoginLockService - Global lock mechanism for LINE login
 *
 * ป้องกันไม่ให้ LineAutomationService และ EnhancedAutomationService
 * ทำงานพร้อมกันกับ LINE Account เดียวกัน
 */
@Injectable()
export class LoginLockService {
  private readonly logger = new Logger(LoginLockService.name);
  private locks: Map<string, LockInfo> = new Map();
  private readonly LOCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes (reduced for faster recovery)
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupAllExpiredLocks();
    }, 30000);
  }

  /**
   * Cleanup all expired locks
   */
  private cleanupAllExpiredLocks(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [lineAccountId, lockInfo] of this.locks.entries()) {
      if (now - lockInfo.lockedAt.getTime() >= this.LOCK_TIMEOUT_MS) {
        this.locks.delete(lineAccountId);
        cleanedCount++;
        this.logger.warn(`Lock auto-released for ${lineAccountId} (expired after ${this.LOCK_TIMEOUT_MS / 1000}s)`);
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`[Cleanup] Released ${cleanedCount} expired locks`);
    }
  }

  /**
   * Attempt to acquire a lock for the given lineAccountId
   * @param lineAccountId - The LINE account ID to lock
   * @param source - The source service requesting the lock (e.g., 'enhanced', 'original', 'relogin')
   * @returns true if lock acquired successfully, false if already locked
   */
  acquireLock(lineAccountId: string, source: string): boolean {
    this.cleanupExpiredLock(lineAccountId);

    if (this.locks.has(lineAccountId)) {
      const existing = this.locks.get(lineAccountId);
      this.logger.warn(
        `Lock denied for ${lineAccountId} (source: ${source}) - already locked by ${existing?.source}`,
      );
      return false;
    }

    this.locks.set(lineAccountId, {
      source,
      lockedAt: new Date(),
    });

    this.logger.log(`Lock acquired for ${lineAccountId} (source: ${source})`);
    return true;
  }

  /**
   * Release the lock for the given lineAccountId (only if source matches)
   * @param lineAccountId - The LINE account ID to unlock
   * @param source - The source service requesting to release the lock
   */
  releaseLock(lineAccountId: string, source: string): void {
    const lockInfo = this.locks.get(lineAccountId);

    if (lockInfo && lockInfo.source === source) {
      this.locks.delete(lineAccountId);
      this.logger.log(`Lock released for ${lineAccountId} (source: ${source})`);
    }
  }

  /**
   * Check if the given lineAccountId is currently locked
   * @param lineAccountId - The LINE account ID to check
   * @returns true if locked, false otherwise
   */
  isLocked(lineAccountId: string): boolean {
    this.cleanupExpiredLock(lineAccountId);
    return this.locks.has(lineAccountId);
  }

  /**
   * Get the lock information for the given lineAccountId
   * @param lineAccountId - The LINE account ID to get lock info for
   * @returns Lock info object or null if not locked
   */
  getLockInfo(lineAccountId: string): LockInfo | null {
    this.cleanupExpiredLock(lineAccountId);
    const lockInfo = this.locks.get(lineAccountId);
    return lockInfo ? { ...lockInfo } : null;
  }

  /**
   * Force release the lock regardless of source
   * @param lineAccountId - The LINE account ID to force unlock
   */
  forceRelease(lineAccountId: string): void {
    const lockInfo = this.locks.get(lineAccountId);
    if (lockInfo) {
      this.locks.delete(lineAccountId);
      this.logger.warn(`Lock force released for ${lineAccountId} (was: ${lockInfo.source})`);
    }
  }

  /**
   * Get all active locks
   */
  getAllLocks(): Array<{ lineAccountId: string; info: LockInfo }> {
    // Cleanup all expired locks first
    for (const lineAccountId of this.locks.keys()) {
      this.cleanupExpiredLock(lineAccountId);
    }

    return Array.from(this.locks.entries()).map(([lineAccountId, info]) => ({
      lineAccountId,
      info: { ...info },
    }));
  }

  /**
   * Cleanup expired lock for a specific lineAccountId (auto-release after timeout)
   * @param lineAccountId - The LINE account ID to check for expiration
   */
  private cleanupExpiredLock(lineAccountId: string): void {
    const lockInfo = this.locks.get(lineAccountId);

    if (lockInfo) {
      const now = new Date().getTime();
      const lockedAt = lockInfo.lockedAt.getTime();

      if (now - lockedAt >= this.LOCK_TIMEOUT_MS) {
        this.locks.delete(lineAccountId);
        this.logger.warn(`Lock expired and auto-released for ${lineAccountId}`);
      }
    }
  }
}
