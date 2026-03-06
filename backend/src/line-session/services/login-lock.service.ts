import { Injectable, Logger } from '@nestjs/common';

export interface LockInfo {
  source: string;
  lockedAt: Date;
  ownerId?: string; // User who initiated the login
  accountName?: string; // ชื่อบัญชีที่กำลัง login
  stage?: string; // สถานะปัจจุบัน เช่น 'กำลังเปิดเบราว์เซอร์', 'รอยืนยัน PIN'
}

/** สถานะ lock ที่แยก own vs others สำหรับ privacy */
export interface GroupedLockSummary {
  ownLocks: Array<{ lineAccountId: string; info: LockInfo }>;
  othersCount: number;
  totalActive: number;
}

export interface LoginQueueItem {
  lineAccountId: string;
  ownerId: string;
  source: string;
  priority: number; // 1=manual, 2=relogin, 3=auto
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
 * - Priority login queue (manual > relogin > auto)
 * - Stale queue cleanup
 * - Auto-cleanup expired locks
 */
@Injectable()
export class LoginLockService {
  private readonly logger = new Logger(LoginLockService.name);
  private locks: Map<string, LockInfo> = new Map();
  private readonly LOCK_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes (LOGIN_TIMEOUT 5 min + sequential wait buffer)
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Per-user limit: prevent one user from occupying all slots
  private readonly MAX_PER_USER = 2;

  // Login queue for when concurrent limit is reached
  private loginQueue: LoginQueueItem[] = [];

  // Priority constants
  static readonly PRIORITY_MANUAL = 1;
  static readonly PRIORITY_RELOGIN = 2;
  static readonly PRIORITY_AUTO = 3;

  // Queue limits
  private readonly MAX_QUEUE_SIZE = 20;
  private readonly QUEUE_STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Start periodic cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupAllExpiredLocks();
    }, 30000);
  }

  /**
   * Cleanup all expired locks + stale queue items
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

    // Also cleanup stale queue items
    this.cleanupStaleQueueItems();
  }

  /**
   * Attempt to acquire a lock for the given lineAccountId
   * @param lineAccountId - The LINE account ID to lock
   * @param source - The source service requesting the lock
   * @param ownerId - The user who initiated the login
   * @returns true if lock acquired successfully, false if already locked
   */
  acquireLock(lineAccountId: string, source: string, ownerId?: string, accountName?: string): boolean {
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
      accountName,
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
   * Update the stage of an active lock (e.g., 'รอยืนยัน PIN', 'กำลังดึง Keys')
   */
  updateLockStage(lineAccountId: string, stage: string): void {
    const lockInfo = this.locks.get(lineAccountId);
    if (lockInfo) {
      lockInfo.stage = stage;
    }
  }

  /**
   * Get locks grouped by owner — own accounts show names+stages, others show only count
   * ป้องกัน privacy: ผู้ใช้คนอื่นจะไม่เห็นชื่อบัญชีของเรา
   */
  getLocksGroupedByOwner(ownerId: string): GroupedLockSummary {
    // Cleanup expired first
    for (const lineAccountId of this.locks.keys()) {
      this.cleanupExpiredLock(lineAccountId);
    }

    const ownLocks: Array<{ lineAccountId: string; info: LockInfo }> = [];
    let othersCount = 0;

    for (const [lineAccountId, info] of this.locks.entries()) {
      if (info.ownerId === ownerId) {
        ownLocks.push({ lineAccountId, info: { ...info } });
      } else {
        othersCount++;
      }
    }

    return { ownLocks, othersCount, totalActive: this.locks.size };
  }

  /**
   * Refresh lock timestamp to prevent auto-expiry during long-running operations
   * (e.g., waiting for user to verify PIN on mobile)
   */
  refreshLock(lineAccountId: string, source: string): boolean {
    const lockInfo = this.locks.get(lineAccountId);
    if (lockInfo && lockInfo.source === source) {
      lockInfo.lockedAt = new Date();
      this.logger.log(`Lock refreshed for ${lineAccountId} (source: ${source})`);
      return true;
    }
    return false;
  }

  /**
   * Force release the lock regardless of source
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

  /**
   * Get number of available login slots
   */
  getAvailableSlots(maxConcurrent: number): number {
    return Math.max(0, maxConcurrent - this.locks.size);
  }

  // ================================
  // LOGIN QUEUE
  // ================================

  /**
   * Add a login request to the queue (sorted by priority)
   * @returns queue position and estimated wait time, or null if queue is full
   */
  addToQueue(lineAccountId: string, ownerId: string, source: string): {
    position: number;
    estimatedWaitSeconds: number;
  } | null {
    // Check if already in queue
    const existing = this.loginQueue.findIndex(q => q.lineAccountId === lineAccountId);
    if (existing !== -1) {
      return {
        position: existing + 1,
        estimatedWaitSeconds: this.estimateWaitTime(existing + 1),
      };
    }

    // Check max queue size
    if (this.loginQueue.length >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`[Queue] Queue full (${this.loginQueue.length}/${this.MAX_QUEUE_SIZE}), rejecting ${lineAccountId}`);
      return null;
    }

    const priority = this.getPriorityForSource(source);
    const item: LoginQueueItem = {
      lineAccountId,
      ownerId,
      source,
      priority,
      queuedAt: new Date(),
      position: 0, // will be set by insertByPriority
    };

    this.insertByPriority(item);
    this.recalculatePositions();

    this.logger.log(`[Queue] Added ${lineAccountId} to login queue (position: ${item.position}, priority: ${priority}, source: ${source}, owner: ${ownerId})`);

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
   * Dequeue the next item when a slot becomes available
   * @returns the dequeued item, or null if queue is empty
   */
  dequeueNext(): LoginQueueItem | null {
    if (this.loginQueue.length === 0) return null;

    const item = this.loginQueue.shift()!;
    this.recalculatePositions();

    this.logger.log(`[Queue] Dequeued ${item.lineAccountId} (source: ${item.source}, priority: ${item.priority}, remaining: ${this.loginQueue.length})`);
    return item;
  }

  /**
   * Cleanup stale queue items (older than QUEUE_STALE_TIMEOUT_MS)
   * @returns removed items so caller can emit failure events
   */
  cleanupStaleQueueItems(): LoginQueueItem[] {
    const now = Date.now();
    const staleItems: LoginQueueItem[] = [];
    const remaining: LoginQueueItem[] = [];

    for (const item of this.loginQueue) {
      if (now - item.queuedAt.getTime() >= this.QUEUE_STALE_TIMEOUT_MS) {
        staleItems.push(item);
        this.logger.warn(`[Queue] Removing stale item ${item.lineAccountId} (queued ${Math.round((now - item.queuedAt.getTime()) / 1000)}s ago)`);
      } else {
        remaining.push(item);
      }
    }

    if (staleItems.length > 0) {
      this.loginQueue = remaining;
      this.recalculatePositions();
      this.logger.log(`[Queue] Cleaned up ${staleItems.length} stale queue items`);
    }

    return staleItems;
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
   * Insert item into queue sorted by priority (lower number = higher priority)
   * Same priority → FIFO (append after existing same-priority items)
   */
  private insertByPriority(item: LoginQueueItem): void {
    const insertIdx = this.loginQueue.findIndex(q => q.priority > item.priority);
    if (insertIdx === -1) {
      this.loginQueue.push(item);
    } else {
      this.loginQueue.splice(insertIdx, 0, item);
    }
  }

  /**
   * Map source string to priority number
   */
  private getPriorityForSource(source: string): number {
    switch (source) {
      case 'manual': return LoginLockService.PRIORITY_MANUAL;
      case 'relogin': return LoginLockService.PRIORITY_RELOGIN;
      case 'auto': return LoginLockService.PRIORITY_AUTO;
      default: return LoginLockService.PRIORITY_AUTO;
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
      }
    }
  }
}
