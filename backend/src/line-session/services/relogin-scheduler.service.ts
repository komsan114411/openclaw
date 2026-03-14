import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { KeyStorageService } from './key-storage.service';
import { EventBusService } from '../../core/events';
import { EnhancedAutomationService, EnhancedLoginStatus } from './enhanced-automation.service';

export interface ReloginJob {
  lineAccountId: string;
  reason: string;
  scheduledAt: Date;
  priority: number; // 1 = highest
}

@Injectable()
export class ReloginSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReloginSchedulerService.name);
  private reloginQueue: ReloginJob[] = [];
  private processingPromise: Promise<void> | null = null;

  // Circuit breaker: stop auto-relogin after too many consecutive failures
  private readonly MAX_CONSECUTIVE_FAILURES = 10;

  // Configuration - Optimized for 100+ users
  private readonly RELOGIN_INTERVAL_MINUTES = 15;
  private readonly MAX_CONCURRENT_RELOGINS = 5; // Reduced from 20 to prevent resource exhaustion
  private readonly RELOGIN_COOLDOWN_MS = 10000; // 10 seconds between relogins to reduce memory pressure

  // Flag to enable/disable auto-relogin globally
  private autoReloginEnabled = false; // Disabled by default - must be enabled manually

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    private keyStorageService: KeyStorageService,
    private eventBusService: EventBusService,
    @Inject(forwardRef(() => EnhancedAutomationService))
    private enhancedAutomationService: EnhancedAutomationService,
  ) {}

  /**
   * Subscribe to events on module init
   */
  onModuleInit() {
    // Subscribe to session expired events
    this.eventBusService.subscribe('line-session.expired' as any, (event: any) => {
      this.handleSessionExpired({ lineAccountId: event.lineAccountId });
    });

    // Subscribe to session unhealthy events
    this.eventBusService.subscribe('line-session.unhealthy' as any, (event: any) => {
      this.handleSessionUnhealthy({
        lineAccountId: event.lineAccountId,
        consecutiveFailures: event.consecutiveFailures,
      });
    });

    this.logger.log('ReloginSchedulerService subscribed to events');
  }

  /**
   * Cron Job: ตรวจสอบและ relogin ทุก 5 นาที
   * จะทำงานเฉพาะเมื่อ autoReloginEnabled = true
   */
  @Cron('*/5 * * * *')
  async scheduledReloginCheck(): Promise<void> {
    // Skip if auto-relogin is disabled
    if (!this.autoReloginEnabled) {
      this.logger.debug('Auto-relogin is disabled, skipping scheduled check');
      return;
    }

    this.logger.debug('Running scheduled relogin check...');
    await this.checkAndScheduleRelogins();
    await this.processReloginQueue();
  }

  /**
   * Enable/Disable auto-relogin globally
   */
  setAutoReloginEnabled(enabled: boolean): void {
    this.autoReloginEnabled = enabled;
    this.logger.log(`Auto-relogin ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get auto-relogin status
   */
  isAutoReloginEnabled(): boolean {
    return this.autoReloginEnabled;
  }

  /**
   * Event Handler: เมื่อ session expired
   */
  async handleSessionExpired(payload: { lineAccountId: string }): Promise<void> {
    this.logger.log(`Session expired for ${payload.lineAccountId}, scheduling relogin`);
    this.addToQueue({
      lineAccountId: payload.lineAccountId,
      reason: 'session_expired',
      scheduledAt: new Date(),
      priority: 1,
    });
  }

  /**
   * Event Handler: เมื่อ session unhealthy
   */
  async handleSessionUnhealthy(payload: {
    lineAccountId: string;
    consecutiveFailures: number;
  }): Promise<void> {
    // Skip invalid lineAccountId
    if (!payload.lineAccountId || payload.lineAccountId === 'undefined') {
      this.logger.warn('Skipping unhealthy session with invalid lineAccountId');
      return;
    }

    // Circuit breaker: skip auto-relogin if too many consecutive failures
    if (payload.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      this.logger.warn(
        `Session ${payload.lineAccountId} has ${payload.consecutiveFailures} consecutive failures, circuit breaker activated - skipping auto-relogin`,
      );
      this.logger.warn(
        `Admin intervention needed for session ${payload.lineAccountId} - manually trigger relogin or investigate root cause`,
      );
      return;
    }

    if (payload.consecutiveFailures >= 3) {
      this.logger.log(
        `Session unhealthy for ${payload.lineAccountId} (${payload.consecutiveFailures} failures), scheduling relogin`,
      );
      this.addToQueue({
        lineAccountId: payload.lineAccountId,
        reason: 'consecutive_failures',
        scheduledAt: new Date(),
        priority: 2,
      });
    }
  }

  /**
   * ตรวจสอบและเพิ่ม sessions ที่ต้อง relogin
   */
  async checkAndScheduleRelogins(): Promise<void> {
    const sessionsNeedingRelogin =
      await this.keyStorageService.getSessionsNeedingRelogin();

    for (const session of sessionsNeedingRelogin) {
      // Use session._id if lineAccountId is not set (for Auto-Slip sessions)
      const sessionIdentifier = session.lineAccountId || session._id.toString();

      // Circuit breaker: skip sessions with too many consecutive failures
      const failures = (session as any).consecutiveFailures || 0;
      if (failures >= this.MAX_CONSECUTIVE_FAILURES) {
        this.logger.warn(
          `Session ${sessionIdentifier} has ${failures} consecutive failures, circuit breaker activated - skipping auto-relogin`,
        );
        continue;
      }

      // Check if already in queue
      const alreadyQueued = this.reloginQueue.some(
        (job) => job.lineAccountId === sessionIdentifier,
      );

      if (!alreadyQueued) {
        this.addToQueue({
          lineAccountId: sessionIdentifier,
          reason: session.status,
          scheduledAt: new Date(),
          priority: session.status === 'expired' ? 1 : 2,
        });
      }
    }
  }

  /**
   * เพิ่ม job เข้า queue
   */
  addToQueue(job: ReloginJob): void {
    // Skip invalid lineAccountId
    if (!job.lineAccountId || job.lineAccountId === 'undefined') {
      this.logger.warn('Skipping relogin job with invalid lineAccountId');
      return;
    }

    // Check if already queued
    const existingIndex = this.reloginQueue.findIndex(
      (j) => j.lineAccountId === job.lineAccountId,
    );

    if (existingIndex !== -1) {
      // Update priority if new job has higher priority
      if (job.priority < this.reloginQueue[existingIndex].priority) {
        this.reloginQueue[existingIndex] = job;
      }
      return;
    }

    this.reloginQueue.push(job);
    // Sort by priority (lower = higher priority)
    this.reloginQueue.sort((a, b) => a.priority - b.priority);

    this.logger.log(
      `Added relogin job for ${job.lineAccountId}, queue size: ${this.reloginQueue.length}`,
    );
  }

  /**
   * ประมวลผล relogin queue (mutex: callers wait for current batch then continue)
   */
  async processReloginQueue(): Promise<void> {
    if (this.reloginQueue.length === 0) return;

    // If already processing, wait for the current batch to finish
    if (this.processingPromise) {
      await this.processingPromise;
      // After previous batch is done, check if there are still items
      if (this.reloginQueue.length === 0) return;
    }

    this.processingPromise = this.doProcessQueue();
    try {
      await this.processingPromise;
    } finally {
      this.processingPromise = null;
    }
  }

  /**
   * Internal queue processor — runs as a single batch
   */
  private async doProcessQueue(): Promise<void> {
    while (this.reloginQueue.length > 0) {
      const job = this.reloginQueue.shift();
      if (!job) break;

      this.logger.log(`Processing relogin for ${job.lineAccountId}`);

      try {
        const concurrentLimitHit = await this.executeRelogin(job);

        if (concurrentLimitHit) {
          // Stop this batch — remaining jobs stay in queue for next cycle
          this.logger.log(`[ReloginQueue] Concurrent limit hit, pausing batch. ${this.reloginQueue.length} jobs deferred.`);
          break;
        }

        // Emit success event
        this.eventBusService.publish({
          eventName: 'line-session.relogin-success' as any,
          occurredAt: new Date(),
          lineAccountId: job.lineAccountId,
        });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Relogin failed for ${job.lineAccountId}: ${errMsg}`,
        );

        // Emit failure event
        this.eventBusService.publish({
          eventName: 'line-session.relogin-failed' as any,
          occurredAt: new Date(),
          lineAccountId: job.lineAccountId,
          error: errMsg,
        });
      }

      // Cooldown between relogins
      if (this.reloginQueue.length > 0) {
        await this.delay(this.RELOGIN_COOLDOWN_MS);
      }
    }
  }

  /**
   * Execute relogin สำหรับ LINE Account
   * @returns true if concurrent limit was hit (caller should stop batch)
   */
  private async executeRelogin(job: ReloginJob): Promise<boolean> {
    this.logger.log(`Executing relogin for ${job.lineAccountId}, reason: ${job.reason}`);

    // Update status to show relogin in progress
    await this.lineSessionModel.updateOne(
      { lineAccountId: job.lineAccountId, isActive: true },
      { status: 'relogin_in_progress' },
    );

    try {
      // Get session to check for credentials
      const session = await this.lineSessionModel.findOne({
        lineAccountId: job.lineAccountId,
        isActive: true,
      });

      if (!session || !session.lineEmail || !session.linePassword) {
        this.logger.warn(`No credentials found for ${job.lineAccountId}, cannot auto-relogin`);

        this.eventBusService.publish({
          eventName: 'line-session.relogin-requested' as any,
          occurredAt: new Date(),
          lineAccountId: job.lineAccountId,
          reason: job.reason,
          message: 'No credentials saved - manual login required',
        });

        await this.lineSessionModel.updateOne(
          { lineAccountId: job.lineAccountId, isActive: true },
          { status: 'pending_relogin' },
        );
        return false;
      }

      // Execute auto login using enhanced service
      // Use source='auto' so Step 2.5 silently succeeds if keys are valid
      // (relogin scheduler has no user to ask "confirm re-login?")
      this.logger.log(`Starting auto-relogin for ${job.lineAccountId}`);
      const result = await this.enhancedAutomationService.startLogin(
        job.lineAccountId,
        undefined, // Use saved credentials
        undefined,
        'auto',
      );

      if (result.success) {
        this.logger.log(`Auto-relogin successful for ${job.lineAccountId}`);

        await this.lineSessionModel.updateOne(
          { lineAccountId: job.lineAccountId, isActive: true },
          {
            status: 'active',
            lastCheckResult: 'valid',
            consecutiveFailures: 0,
          },
        );
      } else if (result.status === EnhancedLoginStatus.PIN_DISPLAYED && result.pinCode) {
        // PIN displayed - waiting for user verification
        this.logger.log(`PIN displayed for ${job.lineAccountId}: ${result.pinCode}`);

        this.eventBusService.publish({
          eventName: 'line-session.pin-required' as any,
          occurredAt: new Date(),
          lineAccountId: job.lineAccountId,
          pinCode: result.pinCode,
        });

        await this.lineSessionModel.updateOne(
          { lineAccountId: job.lineAccountId, isActive: true },
          { status: 'waiting_pin' },
        );
      } else if (result.error?.includes('สูงสุด')) {
        // Concurrent limit reached — not a real failure, re-queue for later
        this.logger.warn(`Concurrent limit reached for ${job.lineAccountId}, re-queuing for next cycle`);

        await this.lineSessionModel.updateOne(
          { lineAccountId: job.lineAccountId, isActive: true },
          { status: 'pending_relogin' },
        );

        // Put this job back at the front of the queue
        this.reloginQueue.unshift(job);
        return true; // Signal to stop this batch
      } else {
        // Login failed
        this.logger.error(`Auto-relogin failed for ${job.lineAccountId}: ${result.error}`);

        await this.lineSessionModel.updateOne(
          { lineAccountId: job.lineAccountId, isActive: true },
          { status: 'relogin_failed' },
        );

        throw new Error(result.error || 'Auto-relogin failed');
      }

      return false;
    } catch (error: any) {
      // Ensure status is updated on any exception
      this.logger.error(`Exception during relogin for ${job.lineAccountId}: ${error.message}`);

      await this.lineSessionModel.updateOne(
        { lineAccountId: job.lineAccountId, isActive: true },
        { status: 'relogin_failed' },
      );

      throw error;
    }
  }

  /**
   * Manual trigger relogin
   * NOTE: Manual triggers bypass the circuit breaker — admin can always force a relogin
   */
  async triggerRelogin(lineAccountId: string, reason = 'manual'): Promise<void> {
    this.addToQueue({
      lineAccountId,
      reason,
      scheduledAt: new Date(),
      priority: 1, // Highest priority for manual triggers
    });

    // Process immediately
    await this.processReloginQueue();
  }

  /**
   * ดึง queue ปัจจุบัน
   */
  getQueue(): ReloginJob[] {
    return [...this.reloginQueue];
  }

  /**
   * ลบ job ออกจาก queue
   */
  removeFromQueue(lineAccountId: string): boolean {
    const initialLength = this.reloginQueue.length;
    this.reloginQueue = this.reloginQueue.filter(
      (job) => job.lineAccountId !== lineAccountId,
    );
    return this.reloginQueue.length < initialLength;
  }

  /**
   * Clear queue ทั้งหมด
   */
  clearQueue(): void {
    this.reloginQueue = [];
    this.logger.log('Relogin queue cleared');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
