import { Injectable, Logger } from '@nestjs/common';

export interface LockInfo {
  source: string;
  lockedAt: Date;
  ownerId?: string; // User who initiated the login
}

export interface LoginQueueItem {
  lineAccountId: string;
  ownerId: string;
  source: string;
  queuedAt: Date;
  position: number;
}

/**
 * LoginLockService - Global lock mechanism for LINE login
 *
 * ป้องกันไม่ให้ LineAutomationService และ EnhancedAutomationService
 * ทำงานพร้อมกันกับ LINE Account เดียวกัน
 *
 * Features:
 * - Per-account lock
 * - Per-user concurrent limit (MAX_PER_USER = 2)
 * - Login queue with position tracking
 * - Auto-cleanup expired locks
 */
@Injectable()
export class LoginLockService {
  private readonly logger = new Logger(LoginLockService.name);
  private locks: Map<string, LockInfo> = new Map();
  private readonly LOCK_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes (reduced from 6)
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Per-user limit: prevent one user from occupying all slots
  private readonly MAX_PER_USER = 2;

  // Login queue for when concurrent limit is reached
  private loginQueue: LoginQueueItem[] = [];
  private queueListeners: Map<string, (item: LoginQueueItem) => void> = new Map();

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
      // Notify queued items that slots may be available
      this.notifyQueueOnSlotFreed();
    }
  }

  /**
   * Attempt to acquire a lock for the given lineAccountId
   * @param lineAccountId - The LINE account ID to lock
   * @param source - The source service requesting the lock
   * @param ownerId - The user who initiated the login
   * @returns true if lock acquired successfully, false if already locked
   */
  acquireLock(lineAccountId: string, source: string, ownerId?: string): boolean {
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
      ownerId,
    });

    this.logger.log(`Lock acquired for ${lineAccountId} (source: ${source}, owner: ${ownerId || 'system'})`);
    return true;
  }

  /**
   * Release the lock for the given lineAccountId (only if source matches)
   */
  releaseLock(lineAccountId: string, source: string): void {
    const lockInfo = this.locks.get(lineAccountId);

    if (lockInfo && lockInfo.source === source) {
      this.locks.delete(lineAccountId);
      this.logger.log(`Lock released for ${lineAccountId} (source: ${source})`);
      // Notify queued items
      this.notifyQueueOnSlotFreed();
    }
  }

  /**
   * Check if the given lineAccountId is currently locked
   */
  isLocked(lineAccountId: string): boolean {
    this.cleanupExpiredLock(lineAccountId);
    return this.locks.has(lineAccountId);
  }

  /**
   * Get the lock information for the given lineAccountId
   */
  getLockInfo(lineAccountId: string): LockInfo | null {
    this.cleanupExpiredLock(lineAccountId);
    const lockInfo = this.locks.get(lineAccountId);
    return lockInfo ? { ...lockInfo } : null;
  }

  /**
   * Force release the lock regardless of source
   */
  forceRelease(lineAccountId: string): void {
    const lockInfo = this.locks.get(lineAccountId);
    if (lockInfo) {
      this.locks.delete(lineAccountId);
      this.logger.warn(`Lock force released for ${lineAccountId} (was: ${lockInfo.source})`);
      this.notifyQueueOnSlotFreed();
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
   * Get active lock count for a specific user
   */
  getLocksForOwner(ownerId: string): number {
    this.cleanupAllExpiredLocks();
    let count = 0;
    for (const lockInfo of this.locks.values()) {
      if (lockInfo.ownerId === ownerId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if user has reached their per-user concurrent limit
   */
  isUserAtLimit(ownerId: string): boolean {
    return this.getLocksForOwner(ownerId) >= this.MAX_PER_USER;
  }

  // ================================
  // LOGIN QUEUE
  // ================================

  /**
   * Add a login request to the queue
   * @returns queue position (1-based) and estimated wait time in seconds
   */
  addToQueue(lineAccountId: string, ownerId: string, source: string): {
    position: number;
    estimatedWaitSeconds: number;
  } {
    // Check if already in queue
    const existing = this.loginQueue.findIndex(q => q.lineAccountId === lineAccountId);
    if (existing !== -1) {
      return {
        position: existing + 1,
        estimatedWaitSeconds: this.estimateWaitTime(existing + 1),
      };
    }

    const item: LoginQueueItem = {
      lineAccountId,
      ownerId,
      source,
      queuedAt: new Date(),
      position: this.loginQueue.length + 1,
    };

    this.loginQueue.push(item);
    this.logger.log(`[Queue] Added ${lineAccountId} to login queue (position: ${item.position}, owner: ${ownerId})`);

    return {
      position: item.position,
      estimatedWaitSeconds: this.estimateWaitTime(item.position),
    };
  }

  /**
   * Remove from queue
   */
  removeFromQueue(lineAccountId: string): void {
    this.loginQueue = this.loginQueue.filter(q => q.lineAccountId !== lineAccountId);
    this.recalculatePositions();
  }

  /**
   * Get queue info for a specific account
   */
  getQueueInfo(lineAccountId: string): {
    inQueue: boolean;
    position: number;
    estimatedWaitSeconds: number;
  } | null {
    const idx = this.loginQueue.findIndex(q => q.lineAccountId === lineAccountId);
    if (idx === -1) return null;

    return {
      inQueue: true,
      position: idx + 1,
      estimatedWaitSeconds: this.estimateWaitTime(idx + 1),
    };
  }

  /**
   * Get full queue status
   */
  getQueueStatus(): {
    queueLength: number;
    activeLocks: number;
    items: LoginQueueItem[];
  } {
    return {
      queueLength: this.loginQueue.length,
      activeLocks: this.getAllLocks().length,
      items: [...this.loginQueue],
    };
  }

  /**
   * Register a callback for when a queue slot becomes available
   */
  onSlotAvailable(lineAccountId: string, callback: (item: LoginQueueItem) => void): void {
    this.queueListeners.set(lineAccountId, callback);
  }

  /**
   * Dequeue the next item when a slot becomes available
   * @returns the dequeued item, or null if queue is empty
   */
  dequeueNext(): LoginQueueItem | null {
    if (this.loginQueue.length === 0) return null;

    const item = this.loginQueue.shift()!;
    this.recalculatePositions();
    this.queueListeners.delete(item.lineAccountId);

    this.logger.log(`[Queue] Dequeued ${item.lineAccountId} (remaining: ${this.loginQueue.length})`);
    return item;
  }

  /**
   * Estimate wait time based on queue position
   * Each login takes ~3-4 minutes (browser launch + PIN wait + cleanup)
   */
  private estimateWaitTime(position: number): number {
    const avgLoginTimeSec = 180; // 3 minutes average per login
    const maxConcurrent = 3; // MAX_CONCURRENT_LOGINS from enhanced-automation
    const batchesAhead = Math.ceil(position / maxConcurrent);
    return batchesAhead * avgLoginTimeSec;
  }

  private recalculatePositions(): void {
    this.loginQueue.forEach((item, idx) => {
      item.position = idx + 1;
    });
  }

  /**
   * Notify queued items when a login slot is freed
   */
  private notifyQueueOnSlotFreed(): void {
    if (this.loginQueue.length === 0) return;

    // Notify all queue listeners about updated positions
    for (const [lineAccountId, callback] of this.queueListeners.entries()) {
      const item = this.loginQueue.find(q => q.lineAccountId === lineAccountId);
      if (item) {
        try {
          callback(item);
        } catch {
          // Ignore callback errors
        }
      }
    }
  }

  /**
   * Cleanup expired lock for a specific lineAccountId
   */
  private cleanupExpiredLock(lineAccountId: string): void {
    const lockInfo = this.locks.get(lineAccountId);

    if (lockInfo) {
      const now = new Date().getTime();
      const lockedAt = lockInfo.lockedAt.getTime();

      if (now - lockedAt >= this.LOCK_TIMEOUT_MS) {
        this.locks.delete(lineAccountId);
        this.logger.warn(`Lock expired and auto-released for ${lineAccountId}`);
        this.notifyQueueOnSlotFreed();
      }
    }
  }
}
