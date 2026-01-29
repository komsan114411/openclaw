import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { LineKeyHistory, LineKeyHistoryDocument } from '../schemas/line-key-history.schema';

export interface SaveKeysInput {
  lineAccountId: string;
  xLineAccess: string;
  xHmac: string;
  userAgent?: string;
  lineVersion?: string;
  source: string;
  performedBy?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class KeyStorageService {
  private readonly logger = new Logger(KeyStorageService.name);

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(LineKeyHistory.name)
    private keyHistoryModel: Model<LineKeyHistoryDocument>,
  ) {}

  /**
   * บันทึก keys ใหม่
   * - Deactivate keys เก่า
   * - สร้าง session ใหม่
   * - บันทึก history
   */
  async saveKeys(input: SaveKeysInput): Promise<LineSessionDocument> {
    const startTime = Date.now();
    this.logger.log(`Saving keys for lineAccountId: ${input.lineAccountId}`);

    try {
      // 1. Deactivate previous active sessions
      await this.lineSessionModel.updateMany(
        { lineAccountId: input.lineAccountId, isActive: true },
        { isActive: false, status: 'replaced' },
      );

      // 2. Create new session
      const session = await this.lineSessionModel.create({
        lineAccountId: input.lineAccountId,
        xLineAccess: input.xLineAccess,
        xHmac: input.xHmac,
        userAgent: input.userAgent || this.getDefaultUserAgent(),
        lineVersion: input.lineVersion || '3.4.0',
        extractedAt: new Date(),
        isActive: true,
        source: input.source,
        status: 'active',
        consecutiveFailures: 0,
        metadata: input.metadata,
      });

      // 3. Record history
      await this.keyHistoryModel.create({
        lineAccountId: input.lineAccountId,
        xLineAccess: input.xLineAccess,
        xHmac: input.xHmac,
        extractedAt: new Date(),
        source: input.source,
        status: 'success',
        performedBy: input.performedBy,
        ipAddress: input.ipAddress,
        durationMs: Date.now() - startTime,
        metadata: input.metadata,
      });

      this.logger.log(`Keys saved successfully for lineAccountId: ${input.lineAccountId}`);
      return session;
    } catch (error) {
      // Record failed history
      await this.keyHistoryModel.create({
        lineAccountId: input.lineAccountId,
        extractedAt: new Date(),
        source: input.source,
        status: 'failed',
        performedBy: input.performedBy,
        errorMessage: error.message,
        durationMs: Date.now() - startTime,
      });

      this.logger.error(`Failed to save keys: ${error.message}`);
      throw error;
    }
  }

  /**
   * ดึง active session ของ LINE Account
   */
  async getActiveSession(lineAccountId: string): Promise<LineSessionDocument | null> {
    return this.lineSessionModel.findOne({
      lineAccountId,
      isActive: true,
    });
  }

  /**
   * ดึง keys สำหรับใช้งาน
   */
  async getKeys(lineAccountId: string): Promise<{
    xLineAccess: string;
    xHmac: string;
    userAgent: string;
    lineVersion: string;
  } | null> {
    const session = await this.getActiveSession(lineAccountId);
    if (!session) return null;

    return {
      xLineAccess: session.xLineAccess,
      xHmac: session.xHmac,
      userAgent: session.userAgent,
      lineVersion: session.lineVersion,
    };
  }

  /**
   * Copy keys จาก LINE Account อื่นที่ใช้ email เดียวกัน
   */
  async copyKeysFromAccount(
    targetLineAccountId: string,
    sourceLineAccountId: string,
    performedBy?: string,
  ): Promise<LineSessionDocument> {
    const sourceSession = await this.getActiveSession(sourceLineAccountId);
    if (!sourceSession) {
      throw new NotFoundException('Source account has no active session');
    }

    return this.saveKeys({
      lineAccountId: targetLineAccountId,
      xLineAccess: sourceSession.xLineAccess,
      xHmac: sourceSession.xHmac,
      userAgent: sourceSession.userAgent,
      lineVersion: sourceSession.lineVersion,
      source: 'copied',
      performedBy,
      metadata: {
        copiedFrom: sourceLineAccountId,
        copiedAt: new Date(),
      },
    });
  }

  /**
   * ดึงประวัติ keys
   */
  async getKeyHistory(
    lineAccountId: string,
    limit = 20,
  ): Promise<LineKeyHistoryDocument[]> {
    return this.keyHistoryModel
      .find({ lineAccountId })
      .sort({ extractedAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * อัพเดทสถานะ session หลังตรวจสอบ
   */
  async updateSessionStatus(
    lineAccountId: string,
    status: string,
    checkResult: string,
    incrementFailure = false,
  ): Promise<void> {
    const update: any = {
      status,
      lastCheckedAt: new Date(),
      lastCheckResult: checkResult,
    };

    if (incrementFailure) {
      update.$inc = { consecutiveFailures: 1 };
    } else {
      update.consecutiveFailures = 0;
    }

    await this.lineSessionModel.updateOne(
      { lineAccountId, isActive: true },
      update,
    );
  }

  /**
   * Mark session as expired
   */
  async markAsExpired(lineAccountId: string): Promise<void> {
    await this.lineSessionModel.updateOne(
      { lineAccountId, isActive: true },
      {
        status: 'expired',
        lastCheckedAt: new Date(),
        lastCheckResult: 'expired',
      },
    );
  }

  /**
   * ดึง sessions ทั้งหมดที่ active
   */
  async getAllActiveSessions(): Promise<LineSessionDocument[]> {
    return this.lineSessionModel.find({ isActive: true });
  }

  /**
   * ดึง sessions ที่ต้อง relogin
   */
  async getSessionsNeedingRelogin(): Promise<LineSessionDocument[]> {
    return this.lineSessionModel.find({
      isActive: true,
      $or: [
        { status: 'expired' },
        { status: 'pending_relogin' },
        { consecutiveFailures: { $gte: 3 } },
      ],
    });
  }

  private getDefaultUserAgent(): string {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
}
