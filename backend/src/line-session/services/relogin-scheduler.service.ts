import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { KeyStorageService } from './key-storage.service';
import { EventBusService } from '../../core/events';

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
  private isProcessing = false;

  // Configuration
  private readonly RELOGIN_INTERVAL_MINUTES = 20;
  private readonly MAX_CONCURRENT_RELOGINS = 1;
  private readonly RELOGIN_COOLDOWN_MS = 60000; // 1 minute between relogins

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    private keyStorageService: KeyStorageService,
    private eventBusService: EventBusService,
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
   */
  @Cron('*/5 * * * *')
  async scheduledReloginCheck(): Promise<void> {
    this.logger.debug('Running scheduled relogin check...');
    await this.checkAndScheduleRelogins();
    await this.processReloginQueue();
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
      // Check if already in queue
      const alreadyQueued = this.reloginQueue.some(
        (job) => job.lineAccountId === session.lineAccountId,
      );

      if (!alreadyQueued) {
        this.addToQueue({
          lineAccountId: session.lineAccountId,
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
   * ประมวลผล relogin queue
   */
  async processReloginQueue(): Promise<void> {
    if (this.isProcessing || this.reloginQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.reloginQueue.length > 0) {
        const job = this.reloginQueue.shift();
        if (!job) break;

        this.logger.log(`Processing relogin for ${job.lineAccountId}`);

        try {
          await this.executeRelogin(job);

          // Emit success event
          this.eventBusService.publish({
            eventName: 'line-session.relogin-success' as any,
            occurredAt: new Date(),
            lineAccountId: job.lineAccountId,
          });
        } catch (error) {
          this.logger.error(
            `Relogin failed for ${job.lineAccountId}: ${error.message}`,
          );

          // Emit failure event
          this.eventBusService.publish({
            eventName: 'line-session.relogin-failed' as any,
            occurredAt: new Date(),
            lineAccountId: job.lineAccountId,
            error: error.message,
          });
        }

        // Cooldown between relogins
        if (this.reloginQueue.length > 0) {
          await this.delay(this.RELOGIN_COOLDOWN_MS);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute relogin สำหรับ LINE Account
   * NOTE: ต้อง implement LINE login logic จริงที่นี่
   */
  private async executeRelogin(job: ReloginJob): Promise<void> {
    this.logger.log(`Executing relogin for ${job.lineAccountId}, reason: ${job.reason}`);

    // Update status to show relogin in progress
    await this.lineSessionModel.updateOne(
      { lineAccountId: job.lineAccountId, isActive: true },
      { status: 'relogin_in_progress' },
    );

    // TODO: Implement actual LINE login logic here
    // This would involve:
    // 1. Get LINE credentials from somewhere (line_accounts collection)
    // 2. Launch Puppeteer with LINE extension
    // 3. Perform login
    // 4. Extract keys
    // 5. Save new keys

    // For now, emit an event that can be handled elsewhere
    this.eventBusService.publish({
      eventName: 'line-session.relogin-requested' as any,
      occurredAt: new Date(),
      lineAccountId: job.lineAccountId,
      reason: job.reason,
    });

    // Mark as pending manual relogin (until actual implementation)
    await this.lineSessionModel.updateOne(
      { lineAccountId: job.lineAccountId, isActive: true },
      { status: 'pending_relogin' },
    );
  }

  /**
   * Manual trigger relogin
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
