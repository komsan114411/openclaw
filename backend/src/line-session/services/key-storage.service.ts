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

/**
 * Session lookup result interface
 * Used to track how a session was found (for debugging ambiguity issues)
 */
interface SessionLookupResult {
  session: LineSessionDocument | null;
  foundBy: 'objectId' | 'lineAccountId' | 'not_found';
  searchedId: string;
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
   * [FIX Issue #1] Helper function to find session by ID or lineAccountId field
   * This resolves the ambiguity where lineAccountId can be either:
   * - MongoDB ObjectId (_id)
   * - The actual lineAccountId field value
   *
   * Priority: 1) Try as ObjectId first, 2) Then try as lineAccountId field
   * Returns both the session and how it was found for debugging
   */
  private async findSessionByIdOrLineAccountId(
    identifier: string,
    requireActive = true,
  ): Promise<SessionLookupResult> {
    const result: SessionLookupResult = {
      session: null,
      foundBy: 'not_found',
      searchedId: identifier,
    };

    // First, check if identifier is a valid MongoDB ObjectId format
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);

    if (isValidObjectId) {
      try {
        // Try finding by _id first
        const sessionById = await this.lineSessionModel.findById(identifier);
        if (sessionById && (!requireActive || sessionById.isActive)) {
          result.session = sessionById;
          result.foundBy = 'objectId';
          this.logger.debug(`[SessionLookup] Found session by ObjectId: ${identifier}`);
          return result;
        }
      } catch (error) {
        // Invalid ObjectId format or DB error, continue to lineAccountId search
        this.logger.debug(`[SessionLookup] ObjectId lookup failed for ${identifier}: ${error.message}`);
      }
    }

    // If not found by _id, try by lineAccountId field
    const query: any = { lineAccountId: identifier };
    if (requireActive) {
      query.isActive = true;
    }

    const sessionByField = await this.lineSessionModel.findOne(query);
    if (sessionByField) {
      result.session = sessionByField;
      result.foundBy = 'lineAccountId';
      this.logger.debug(`[SessionLookup] Found session by lineAccountId field: ${identifier}`);
      return result;
    }

    this.logger.warn(`[SessionLookup] Session not found for identifier: ${identifier} (tried both ObjectId and lineAccountId field)`);
    return result;
  }

  /**
   * บันทึก keys ใหม่
   * - หา session ที่มีอยู่แล้ว update keys
   * - ถ้าไม่มี session ให้ throw error (ต้องสร้าง session ก่อน)
   * - บันทึก history
   *
   * [FIX Issue #1] Now uses unified session lookup to avoid ambiguity
   */
  async saveKeys(input: SaveKeysInput): Promise<LineSessionDocument> {
    const startTime = Date.now();
    this.logger.log(`[SaveKeys] Saving keys for identifier: ${input.lineAccountId}`);

    try {
      // [FIX Issue #1] Use unified lookup helper to avoid ambiguity
      const lookupResult = await this.findSessionByIdOrLineAccountId(input.lineAccountId, true);

      if (!lookupResult.session) {
        const errorMsg = `Session not found for ${input.lineAccountId}. Please create a session first.`;
        this.logger.error(`[SaveKeys] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const session = lookupResult.session;
      this.logger.log(`[SaveKeys] Found session (by ${lookupResult.foundBy}): _id=${session._id}, lineAccountId=${session.lineAccountId || 'N/A'}`);


      // 2. Update existing session with new keys
      session.xLineAccess = input.xLineAccess;
      session.xHmac = input.xHmac;
      session.userAgent = input.userAgent || this.getDefaultUserAgent();
      session.lineVersion = input.lineVersion || '3.4.0';
      session.extractedAt = new Date();
      session.isActive = true;
      session.source = input.source;
      session.status = 'active';
      session.consecutiveFailures = 0;
      if (input.performedBy) {
        session.performedBy = input.performedBy;
      }
      if (input.metadata) {
        session.metadata = { ...session.metadata, ...input.metadata };
      }

      // Generate cURL command
      session.cUrlBash = this.generateCurlCommand(
        input.xLineAccess,
        input.xHmac,
        session.chatMid || '',
        input.userAgent || this.getDefaultUserAgent(),
        input.lineVersion || '3.4.0',
      );

      await session.save();

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

  /**
   * Generate cURL command from keys
   * Format matches Chrome DevTools "Copy as cURL (bash)" for getRecentMessagesV2
   */
  generateCurlCommand(
    xLineAccess: string,
    xHmac: string,
    chatMid: string,
    userAgent: string,
    lineVersion: string = '3.7.1',
  ): string {
    // Build JSON request body for getRecentMessagesV2: ["chatMid", limit]
    const jsonBody = JSON.stringify([chatMid, 50]);
    
    return `curl 'https://line-chrome-gw.line-apps.com/api/talk/thrift/Talk/TalkService/getRecentMessagesV2' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'accept-language: th-TH' \\
  -H 'content-type: application/json' \\
  -b 'lct=${xLineAccess}' \\
  -H 'origin: chrome-extension://ophjlpahpchlmihnnnihgmmeilfjmjjc' \\
  -H 'sec-ch-ua: "Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"' \\
  -H 'sec-ch-ua-mobile: ?0' \\
  -H 'sec-ch-ua-platform: "Windows"' \\
  -H 'sec-fetch-dest: empty' \\
  -H 'sec-fetch-mode: cors' \\
  -H 'sec-fetch-site: none' \\
  -H 'user-agent: ${userAgent}' \\
  -H 'x-hmac: ${xHmac}' \\
  -H 'x-lal: th_TH' \\
  -H 'x-line-access: ${xLineAccess}' \\
  -H 'x-line-chrome-version: ${lineVersion}' \\
  --data-raw '${jsonBody}'`;
  }

  /**
   * Get cURL command for a session
   */
  async getCurlCommand(lineAccountId: string): Promise<string | null> {
    const session = await this.getActiveSession(lineAccountId);
    if (!session) return null;

    // Return stored cURL or generate new one
    if (session.cUrlBash) {
      return session.cUrlBash;
    }

    // Generate from stored keys
    if (session.xLineAccess && session.xHmac) {
      const curl = this.generateCurlCommand(
        session.xLineAccess,
        session.xHmac,
        session.chatMid || '',
        session.userAgent || this.getDefaultUserAgent(),
        session.lineVersion || '3.4.0',
      );

      // Save for next time
      session.cUrlBash = curl;
      await session.save();

      return curl;
    }

    return null;
  }
}
