import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { LineMessage, LineMessageDocument } from '../schemas/line-message.schema';
import { AccountAlert, AccountAlertDocument } from '../schemas/account-alert.schema';
import { SystemSettings, SystemSettingsDocument } from '../../database/schemas/system-settings.schema';
import { KeyStorageService } from './key-storage.service';
import { EventBusService } from '../../core/events';

// Bank code constants
export const BankCodes = {
  SCB: '014',
  GSB: '030',
  KBANK: '004',
  BBL: '002',
  KTB: '006',
  BAY: '025',
  TTB: '011',
};

export interface FetchResult {
  success: boolean;
  messageCount: number;
  newMessages: number;
  error?: string;
}

export interface ParsedTransaction {
  transactionType: 'deposit' | 'withdraw' | 'transfer' | 'payment' | 'fee' | 'interest' | 'bill' | 'unknown';
  amount?: number;
  balance?: number;
  messageDate?: Date;
  accountNumber?: string;
  description?: string;
}

export interface AutoFetchConfig {
  enabled: boolean;
  intervalSeconds: number;
  activeOnly: boolean;
  fetchLimit: number;
}

@Injectable()
export class MessageFetchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageFetchService.name);
  private readonly LINE_API = 'https://line-chrome-gw.line-apps.com';

  // Dynamic interval timer
  private fetchInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastFetchTime: Date | null = null;
  private fetchStats = {
    totalFetches: 0,
    successfulFetches: 0,
    failedFetches: 0,
    totalNewMessages: 0,
  };

  // Configuration from database
  private config: AutoFetchConfig = {
    enabled: false,
    intervalSeconds: 60,
    activeOnly: true,
    fetchLimit: 50,
  };

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(LineMessage.name)
    private lineMessageModel: Model<LineMessageDocument>,
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
    @InjectModel(AccountAlert.name)
    private accountAlertModel: Model<AccountAlertDocument>,
    private keyStorageService: KeyStorageService,
    private configService: ConfigService,
    private eventBusService: EventBusService,
  ) {}

  async onModuleInit() {
    this.logger.log('MessageFetchService initializing...');
    await this.loadSettings();
    await this.startAutoFetch();
  }

  onModuleDestroy() {
    this.stopAutoFetch();
  }

  /**
   * Load settings from database
   */
  async loadSettings(): Promise<void> {
    try {
      const settings = await this.systemSettingsModel.findOne({ settingsId: 'main' });
      if (settings) {
        this.config = {
          enabled: settings.autoMessageFetchEnabled ?? false,
          intervalSeconds: Math.max(10, Math.min(3600, settings.autoMessageFetchIntervalSeconds ?? 60)),
          activeOnly: settings.autoMessageFetchActiveOnly ?? true,
          fetchLimit: settings.autoMessageFetchLimit ?? 50,
        };
        this.logger.log(`[AutoFetch] Settings loaded: enabled=${this.config.enabled}, interval=${this.config.intervalSeconds}s`);
      }
    } catch (error: any) {
      this.logger.error(`[AutoFetch] Failed to load settings: ${error.message}`);
    }
  }

  /**
   * Start auto-fetch loop with dynamic interval
   */
  async startAutoFetch(): Promise<void> {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }

    if (!this.config.enabled) {
      this.logger.log('[AutoFetch] Disabled in settings');
      this.isRunning = false;
      return;
    }

    const intervalMs = this.config.intervalSeconds * 1000;
    this.fetchInterval = setInterval(() => {
      this.runAutoFetch();
    }, intervalMs);

    this.isRunning = true;
    this.logger.log(`[AutoFetch] Started - fetching every ${this.config.intervalSeconds} seconds`);

    // Run immediately on start
    await this.runAutoFetch();
  }

  /**
   * Stop auto-fetch loop
   */
  stopAutoFetch(): void {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
    this.isRunning = false;
    this.logger.log('[AutoFetch] Stopped');
  }

  /**
   * Restart auto-fetch with new settings
   */
  async restartAutoFetch(): Promise<void> {
    this.stopAutoFetch();
    await this.loadSettings();
    await this.startAutoFetch();
  }

  /**
   * Run auto-fetch for all accounts
   */
  private async runAutoFetch(): Promise<void> {
    this.logger.debug('[AutoFetch] Running scheduled fetch...');
    this.lastFetchTime = new Date();
    this.fetchStats.totalFetches++;

    try {
      // [FIX] Query sessions that have either:
      // 1. chatMid (direct chatMid stored)
      // 2. OR cUrlBash containing getRecentMessagesV2 (chatMid can be extracted)
      const query: any = {
        isActive: true,
        xLineAccess: { $exists: true, $nin: [null, ''] },
        $or: [
          { chatMid: { $exists: true, $nin: [null, ''] } },
          { cUrlBash: { $regex: 'getRecentMessagesV2', $options: 'i' } },
        ],
      };

      if (this.config.activeOnly) {
        query.status = 'active';
      }

      const sessions = await this.lineSessionModel.find(query);
      this.logger.log(`[AutoFetch] Found ${sessions.length} sessions to fetch`);

      let successCount = 0;
      let newMessagesTotal = 0;

      for (const session of sessions) {
        try {
          const result = await this.fetchMessages(session._id.toString());
          if (result.success) {
            successCount++;
            newMessagesTotal += result.newMessages;
          }
        } catch (error: any) {
          this.logger.error(`[AutoFetch] Error fetching ${session.name}: ${error.message}`);
        }

        // Rate limiting - wait 300ms between each fetch
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      this.fetchStats.successfulFetches += successCount;
      this.fetchStats.totalNewMessages += newMessagesTotal;

      if (newMessagesTotal > 0) {
        this.logger.log(`[AutoFetch] Completed: ${successCount}/${sessions.length} success, ${newMessagesTotal} new messages`);

        // Publish event for real-time notification
        this.eventBusService.publish({
          eventName: 'line-session.auto-fetch-batch-completed',
          occurredAt: new Date(),
          sessionsCount: sessions.length,
          successCount,
          newMessagesTotal,
        });
      }
    } catch (error: any) {
      this.fetchStats.failedFetches++;
      this.logger.error(`[AutoFetch] Error: ${error.message}`);
    }
  }

  /**
   * Get current auto-fetch status
   */
  getAutoFetchStatus(): {
    isRunning: boolean;
    config: AutoFetchConfig;
    lastFetchTime: Date | null;
    stats: typeof this.fetchStats;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      lastFetchTime: this.lastFetchTime,
      stats: this.fetchStats,
    };
  }

  /**
   * Update settings and restart
   */
  async updateSettings(newSettings: Partial<AutoFetchConfig>): Promise<void> {
    // Update in database
    await this.systemSettingsModel.updateOne(
      { settingsId: 'main' },
      {
        $set: {
          autoMessageFetchEnabled: newSettings.enabled ?? this.config.enabled,
          autoMessageFetchIntervalSeconds: newSettings.intervalSeconds ?? this.config.intervalSeconds,
          autoMessageFetchActiveOnly: newSettings.activeOnly ?? this.config.activeOnly,
          autoMessageFetchLimit: newSettings.fetchLimit ?? this.config.fetchLimit,
        },
      },
      { upsert: true },
    );

    // Restart with new settings
    await this.restartAutoFetch();
  }

  // Legacy methods for backwards compatibility
  setAutoMessageFetchEnabled(enabled: boolean): void {
    this.updateSettings({ enabled });
  }

  isAutoMessageFetchEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Event Listener: ดึงข้อความอัตโนมัติเมื่อ login สำเร็จ
   * จะทำงานทุกครั้งที่มีการ login สำเร็จและได้ keys ใหม่
   */
  @OnEvent('login.completed')
  async handleLoginCompleted(payload: {
    requestId: string;
    lineAccountId: string;
    keys?: any;
    chatMid?: string;
  }): Promise<void> {
    const { lineAccountId, chatMid } = payload;
    this.logger.log(`[AutoFetch] Login completed for ${lineAccountId}, triggering message fetch...`);

    // รอ 3 วินาทีเพื่อให้ keys บันทึกลง database เรียบร้อย
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const result = await this.fetchMessages(lineAccountId);
      if (result.success) {
        this.logger.log(`[AutoFetch] ดึงข้อความสำเร็จ: ${result.newMessages} ข้อความใหม่จากทั้งหมด ${result.messageCount}`);

        // Publish event for frontend notification
        this.eventBusService.publish({
          eventName: 'line-session.auto-fetch-completed',
          occurredAt: new Date(),
          lineAccountId,
          newMessages: result.newMessages,
          totalMessages: result.messageCount,
        });
      } else {
        this.logger.warn(`[AutoFetch] ดึงข้อความไม่สำเร็จ: ${result.error}`);
      }
    } catch (error: any) {
      this.logger.error(`[AutoFetch] Error fetching messages after login: ${error.message}`);
    }
  }

  /**
   * Event Listener: ดึงข้อความเมื่อมีการ capture keys สำเร็จ
   */
  @OnEvent('line-session.keys-captured')
  async handleKeysCaptured(payload: {
    lineAccountId: string;
    chatMid?: string;
  }): Promise<void> {
    const { lineAccountId } = payload;
    this.logger.log(`[AutoFetch] Keys captured for ${lineAccountId}, scheduling message fetch...`);

    // รอ 2 วินาทีเพื่อให้ระบบเสถียร
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const result = await this.fetchMessages(lineAccountId);
      if (result.success) {
        this.logger.log(`[AutoFetch] Keys captured fetch: ${result.newMessages} new messages`);
      }
    } catch (error: any) {
      this.logger.error(`[AutoFetch] Error in keys-captured fetch: ${error.message}`);
    }
  }

  /**
   * ดึงข้อความสำหรับทุกบัญชีที่ active (Manual trigger)
   */
  async fetchAllMessages(): Promise<{
    success: boolean;
    totalSessions: number;
    successCount: number;
    failedCount: number;
    totalNewMessages: number;
    results: Array<{ lineAccountId: string; name?: string; result: FetchResult }>;
  }> {
    this.logger.log('[FetchAll] Starting fetch for all active sessions...');

    const activeSessions = await this.lineSessionModel.find({
      isActive: true,
      xLineAccess: { $exists: true, $nin: [null, ''] },
      chatMid: { $exists: true, $nin: [null, ''] },
    });

    this.logger.log(`[FetchAll] Found ${activeSessions.length} sessions with keys`);

    const results: Array<{ lineAccountId: string; name?: string; result: FetchResult }> = [];
    let successCount = 0;
    let failedCount = 0;
    let totalNewMessages = 0;

    for (const session of activeSessions) {
      try {
        const sessionId = session._id.toString();
        const result = await this.fetchMessages(sessionId);
        results.push({
          lineAccountId: sessionId,
          name: session.name,
          result,
        });

        if (result.success) {
          successCount++;
          totalNewMessages += result.newMessages;
          this.logger.log(`[FetchAll] ${session.name}: ${result.newMessages} new messages`);
        } else {
          failedCount++;
          this.logger.warn(`[FetchAll] ${session.name}: failed - ${result.error}`);
        }
      } catch (error: any) {
        failedCount++;
        results.push({
          lineAccountId: session._id.toString(),
          name: session.name,
          result: { success: false, messageCount: 0, newMessages: 0, error: error.message },
        });
        this.logger.error(`[FetchAll] ${session.name}: error - ${error.message}`);
      }

      // หน่วงเวลา 500ms ระหว่างแต่ละ session เพื่อไม่ให้ถูก rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.logger.log(`[FetchAll] Completed: ${successCount}/${activeSessions.length} success, ${totalNewMessages} new messages`);

    return {
      success: successCount > 0,
      totalSessions: activeSessions.length,
      successCount,
      failedCount,
      totalNewMessages,
      results,
    };
  }

  /**
   * Fetch messages for a specific LINE Account
   * [FIX] x-hmac is computed per-request, so we must use the captured cURL command
   */
  async fetchMessages(lineAccountId: string): Promise<FetchResult> {
    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    if (!session) {
      this.logger.warn(`[FetchMessages] No active session found for ${lineAccountId}`);
      return { success: false, messageCount: 0, newMessages: 0, error: 'No active session' };
    }

    // Debug logging
    this.logger.log(`[FetchMessages] Session found: id=${session._id}, name=${session.name}`);
    this.logger.log(`[FetchMessages] Keys: hasAccess=${!!session.xLineAccess}, hasHmac=${!!session.xHmac}, chatMid=${session.chatMid || 'MISSING'}`);
    this.logger.log(`[FetchMessages] Has cURL: ${!!session.cUrlBash}`);

    if (!session.xLineAccess || !session.xHmac) {
      return { success: false, messageCount: 0, newMessages: 0, error: 'No keys found' };
    }

    // [FIX] If chatMid is missing but cUrlBash exists, try to extract from cURL
    if (!session.chatMid && session.cUrlBash) {
      const extractedChatMid = this.extractChatMidFromCurl(session.cUrlBash);
      if (extractedChatMid) {
        this.logger.log(`[FetchMessages] Extracted chatMid from cURL: ${extractedChatMid}`);
        // Update session with extracted chatMid
        session.chatMid = extractedChatMid;
        await (session as any).save();
      }
    }

    try {
      let messages: any[] = [];
      let responseData: any = null;

      // [FIX] Prefer using captured cURL command since x-hmac is request-specific
      if (session.cUrlBash && session.cUrlBash.includes('getRecentMessagesV2')) {
        this.logger.log(`[FetchMessages] Using captured cURL command for ${lineAccountId}`);
        const curlResult = await this.executeCurlCommand(session.cUrlBash);

        if (curlResult.success) {
          responseData = curlResult.data;
          messages = responseData?.data || [];
          this.logger.log(`[FetchMessages] cURL execution successful: ${messages.length} messages`);
        } else {
          this.logger.warn(`[FetchMessages] cURL execution failed: ${curlResult.error}`);
          // Fall back to manual request (will likely fail due to x-hmac)
          return this.fetchMessagesManual(session, lineAccountId);
        }
      } else if (!session.chatMid) {
        return { success: false, messageCount: 0, newMessages: 0, error: 'No chatMid configured and no cURL available' };
      } else {
        // Fall back to manual request (may fail due to x-hmac mismatch)
        this.logger.warn(`[FetchMessages] No cURL available, trying manual request (may fail)`);
        return this.fetchMessagesManual(session, lineAccountId);
      }

      this.logger.log(`Fetched ${messages.length} messages for ${lineAccountId}`);

      // Process and save messages
      let newMessages = 0;
      for (const msg of messages) {
        const saved = await this.processMessage(session, msg);
        if (saved) newMessages++;
      }

      // Update session balance if we have new messages
      if (newMessages > 0) {
        await this.updateSessionBalance(lineAccountId);
      }

      // Emit success event
      this.eventBusService.publish({
        eventName: 'line-session.messages-fetched' as any,
        occurredAt: new Date(),
        lineAccountId,
        messageCount: messages.length,
        newMessages,
      });

      return { success: true, messageCount: messages.length, newMessages };

    } catch (error: any) {
      // Enhanced error logging
      this.logger.error(`[FetchMessages] Error: ${error.message}`);
      return { success: false, messageCount: 0, newMessages: 0, error: error.message };
    }
  }

  /**
   * Execute captured cURL command by converting it to axios request
   * [FIX] cURL bash commands don't work on Windows cmd.exe
   * This parses the cURL and converts it to a cross-platform axios request
   */
  private async executeCurlCommand(curlCommand: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      this.logger.debug(`[ExecuteCurl] Parsing cURL command (${curlCommand.length} chars)`);

      // Parse cURL command to extract URL, headers, and data
      const parsed = this.parseCurlCommand(curlCommand);

      if (!parsed.url) {
        return { success: false, error: 'Failed to parse URL from cURL command' };
      }

      this.logger.log(`[ExecuteCurl] Executing as axios request to: ${parsed.url.substring(0, 60)}...`);
      this.logger.debug(`[ExecuteCurl] Headers: ${Object.keys(parsed.headers).join(', ')}`);
      this.logger.debug(`[ExecuteCurl] Has data: ${!!parsed.data}`);

      // Execute as axios request
      const response = await axios({
        method: parsed.method || 'POST',
        url: parsed.url,
        headers: parsed.headers,
        data: parsed.data,
        timeout: 30000,
      });

      const data = response.data;

      if (data?.code !== 0) {
        this.logger.warn(`[ExecuteCurl] API returned error code: ${data?.code}`);
        return { success: false, error: `API error code: ${data?.code}` };
      }

      return { success: true, data };
    } catch (error: any) {
      this.logger.error(`[ExecuteCurl] Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`[ExecuteCurl] Response status: ${error.response.status}`);
        this.logger.error(`[ExecuteCurl] Response data: ${JSON.stringify(error.response.data || {}).substring(0, 200)}`);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse cURL command to extract URL, headers, and body
   * Handles bash-style cURL commands
   */
  private parseCurlCommand(curlCommand: string): {
    url?: string;
    method?: string;
    headers: Record<string, string>;
    data?: any;
  } {
    const result: {
      url?: string;
      method?: string;
      headers: Record<string, string>;
      data?: any;
    } = { headers: {} };

    try {
      // Remove newlines and backslash continuations
      const normalized = curlCommand
        .replace(/\\\n/g, ' ')
        .replace(/\\\r\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Extract URL (first quoted string after 'curl')
      const urlMatch = normalized.match(/curl\s+['"]([^'"]+)['"]/i) ||
                       normalized.match(/curl\s+(\S+)/i);
      if (urlMatch) {
        result.url = urlMatch[1];
      }

      // Extract headers (-H 'Header: Value' or -H "Header: Value")
      const headerRegex = /-H\s+['"]([^'"]+)['"]/gi;
      let headerMatch;
      while ((headerMatch = headerRegex.exec(normalized)) !== null) {
        const headerLine = headerMatch[1];
        const colonIndex = headerLine.indexOf(':');
        if (colonIndex > 0) {
          const key = headerLine.substring(0, colonIndex).trim().toLowerCase();
          const value = headerLine.substring(colonIndex + 1).trim();
          result.headers[key] = value;
        }
      }

      // Extract data (--data-raw 'data' or --data 'data' or -d 'data')
      const dataMatch = normalized.match(/(?:--data-raw|--data|-d)\s+['"](.+?)['"]\s*(?:-|$)/i) ||
                        normalized.match(/(?:--data-raw|--data|-d)\s+['"](.+)['"]/i);
      if (dataMatch) {
        let dataStr = dataMatch[1];
        // Unescape escaped quotes
        dataStr = dataStr.replace(/\\'/g, "'").replace(/\\"/g, '"');
        try {
          result.data = JSON.parse(dataStr);
        } catch {
          // If not valid JSON, use as-is
          result.data = dataStr;
        }
      }

      // Extract method (-X POST, -X GET, etc.)
      const methodMatch = normalized.match(/-X\s+['"]?(\w+)['"]?/i);
      if (methodMatch) {
        result.method = methodMatch[1].toUpperCase();
      } else if (result.data) {
        result.method = 'POST';
      } else {
        result.method = 'GET';
      }

      this.logger.debug(`[ParseCurl] Parsed: url=${result.url?.substring(0, 50)}..., method=${result.method}, headers=${Object.keys(result.headers).length}, hasData=${!!result.data}`);

    } catch (error: any) {
      this.logger.error(`[ParseCurl] Error parsing cURL: ${error.message}`);
    }

    return result;
  }

  /**
   * Extract chatMid from cURL command body
   * Handles format: --data-raw '["chatMid",50]'
   */
  private extractChatMidFromCurl(curlCommand: string): string | undefined {
    try {
      this.logger.debug(`[ExtractChatMid] Parsing cURL (${curlCommand.length} chars)`);

      // Method 1: Match --data-raw '["xxx",50]' format
      // The outer quotes are single, inner quotes are double: '["chatMid",50]'
      let match = curlCommand.match(/--data(?:-raw)?\s+'?\["([^"]+)",\s*(\d+)\]'?/);

      if (match && match[1] && match[1].length > 10) {
        this.logger.log(`[ExtractChatMid] Found chatMid (method 1): ${match[1].substring(0, 30)}...`);
        return match[1];
      }

      // Method 2: Try with escaped quotes or different format
      match = curlCommand.match(/\["([A-Za-z0-9_-]{20,})",\s*\d+\]/);

      if (match && match[1]) {
        this.logger.log(`[ExtractChatMid] Found chatMid (method 2): ${match[1].substring(0, 30)}...`);
        return match[1];
      }

      // Method 3: Look for base64-like string that looks like chatMid
      match = curlCommand.match(/\["([A-Za-z0-9+/=_-]{30,})",/);

      if (match && match[1]) {
        this.logger.log(`[ExtractChatMid] Found chatMid (method 3): ${match[1].substring(0, 30)}...`);
        return match[1];
      }

      this.logger.warn(`[ExtractChatMid] Could not extract chatMid from cURL`);
      return undefined;
    } catch (error) {
      this.logger.error(`[ExtractChatMid] Error parsing cURL: ${error}`);
      return undefined;
    }
  }

  /**
   * Fallback: Manual fetch using axios (may fail due to x-hmac mismatch)
   */
  private async fetchMessagesManual(session: LineSessionDocument, lineAccountId: string): Promise<FetchResult> {
    if (!session.chatMid) {
      return { success: false, messageCount: 0, newMessages: 0, error: 'No chatMid configured' };
    }

    try {
      const headers = this.buildHeaders(session);

      this.logger.debug(`[FetchMessagesManual] Request URL: ${this.LINE_API}/api/talk/thrift/Talk/TalkService/getRecentMessagesV2`);
      this.logger.debug(`[FetchMessagesManual] Request body: ["${session.chatMid}", 50]`);

      const response = await axios.post(
        `${this.LINE_API}/api/talk/thrift/Talk/TalkService/getRecentMessagesV2`,
        [session.chatMid, 50],
        {
          headers,
          timeout: 30000,
        },
      );

      this.logger.debug(`[FetchMessagesManual] Response status: ${response.status}`);

      if (response.data?.code !== 0) {
        throw new Error(`API error: ${response.data?.code}`);
      }

      const messages = response.data?.data || [];
      this.logger.log(`[FetchMessagesManual] Fetched ${messages.length} messages`);

      // Process and save messages
      let newMessages = 0;
      for (const msg of messages) {
        const saved = await this.processMessage(session, msg);
        if (saved) newMessages++;
      }

      if (newMessages > 0) {
        await this.updateSessionBalance(lineAccountId);
      }

      this.eventBusService.publish({
        eventName: 'line-session.messages-fetched' as any,
        occurredAt: new Date(),
        lineAccountId,
        messageCount: messages.length,
        newMessages,
      });

      return { success: true, messageCount: messages.length, newMessages };
    } catch (error: any) {
      this.logger.error(`[FetchMessagesManual] Error: ${error.message}`);
      this.logger.error(`[FetchMessagesManual] Status: ${error.response?.status}`);
      this.logger.error(`[FetchMessagesManual] Response: ${JSON.stringify(error.response?.data || {})}`);

      if (error.response?.status === 401 || error.response?.status === 403) {
        await this.keyStorageService.updateSessionStatus(lineAccountId, 'expired', 'keys_expired', true);
        return { success: false, messageCount: 0, newMessages: 0, error: 'Keys expired - please re-login' };
      }

      if (error.response?.status === 400) {
        return { success: false, messageCount: 0, newMessages: 0, error: `Bad request (x-hmac mismatch) - need fresh cURL from login` };
      }

      return { success: false, messageCount: 0, newMessages: 0, error: error.message };
    }
  }

  /**
   * Process and save a single message
   */
  private async processMessage(
    session: LineSessionDocument,
    msg: any,
  ): Promise<boolean> {
    const messageId = String(msg.id);

    // Check if already exists
    const existing = await this.lineMessageModel.findOne({ messageId });
    if (existing) return false;

    // Parse transaction details (wrapped in try/catch to prevent crashes on unexpected input)
    const text = msg?.text || msg?.contentMetadata?.ALT_TEXT || '';
    let parsed: ParsedTransaction;
    try {
      parsed = this.parseTransaction(text, session.bankCode);
    } catch (parseErr: unknown) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      this.logger.warn(`[processMessage] Parser error for msg ${messageId}: ${errMsg}`);
      parsed = { transactionType: 'unknown' };
    }

    // Create message
    // [FIX] Use session._id as lineAccountId fallback if session.lineAccountId is undefined
    const lineAccountId = session.lineAccountId || session._id.toString();

    // Determine messageDate — priority: LINE timestamp > parsed from text > now
    // LINE createdTime = epoch milliseconds (UTC), always accurate
    // parsed.messageDate = from Thai text (UTC+7 aware), may lack time
    // new Date() = server time, last resort
    let messageDate: Date;
    let dateSource: string;

    if (msg.createdTime) {
      const ts = Number(msg.createdTime);
      const candidate = new Date(ts > 1e12 ? ts : ts * 1000);
      if (!isNaN(candidate.getTime()) && candidate.getFullYear() >= 2020 && candidate.getFullYear() <= 2035) {
        messageDate = candidate;
        dateSource = 'LINE-createdTime';
      } else {
        messageDate = parsed.messageDate || new Date();
        dateSource = parsed.messageDate ? 'parsed-text(LINE-invalid)' : 'now(LINE-invalid)';
        this.logger.warn(`[processMessage] Invalid LINE createdTime: ${msg.createdTime} → ${candidate.toISOString()}`);
      }
    } else if (parsed.messageDate) {
      messageDate = parsed.messageDate;
      dateSource = 'parsed-text';
    } else {
      messageDate = new Date();
      dateSource = 'now(no-source)';
    }

    this.logger.debug(`[processMessage] msg=${messageId} dateSource=${dateSource} messageDate=${messageDate.toISOString()} createdTime=${msg.createdTime || 'N/A'}`);

    await this.lineMessageModel.create({
      sessionId: session._id.toString(),
      lineAccountId: lineAccountId,
      messageId,
      from: msg.from,
      to: msg.to,
      createdTime: msg.createdTime ? String(msg.createdTime) : null,
      deliveredTime: msg.deliveredTime ? String(msg.deliveredTime) : null,
      text,
      originalMsg: msg?.contentMetadata?.ALT_TEXT || null,
      bankCode: session.bankCode,
      transactionType: parsed.transactionType,
      amount: parsed.amount ? String(parsed.amount) : null,
      balance: parsed.balance ? String(parsed.balance) : null,
      messageDate,
    });

    // Emit new message event
    if (parsed.transactionType !== 'unknown') {
      this.eventBusService.publish({
        eventName: 'line-session.new-transaction' as any,
        occurredAt: new Date(),
        lineAccountId: lineAccountId,
        transactionType: parsed.transactionType,
        amount: parsed.amount,
        balance: parsed.balance,
      });
    }

    // Create alert for non-deposit/withdraw transactions
    if (!['deposit', 'withdraw'].includes(parsed.transactionType)) {
      try {
        const originalMsg = msg?.contentMetadata?.ALT_TEXT || '';
        await this.accountAlertModel.create({
          lineAccountId,
          messageId,
          transactionType: parsed.transactionType,
          amount: parsed.amount ? String(parsed.amount) : '',
          text: (text || originalMsg || '').substring(0, 200),
          messageDate,
          isRead: false,
        });

        this.eventBusService.publish({
          eventName: 'account.new-alert' as any,
          occurredAt: new Date(),
          lineAccountId,
          transactionType: parsed.transactionType,
          amount: parsed.amount,
          text: (text || originalMsg || '').substring(0, 100),
        });
      } catch (alertErr: unknown) {
        const errMsg = alertErr instanceof Error ? alertErr.message : String(alertErr);
        this.logger.warn(`Failed to create alert for ${lineAccountId}: ${errMsg}`);
      }
    }

    return true;
  }

  /**
   * Parse transaction from message text
   */
  parseTransaction(text: string, bankCode?: string): ParsedTransaction {
    if (!text) {
      return { transactionType: 'unknown' };
    }

    // Try bank-specific parsing
    switch (bankCode) {
      case BankCodes.SCB:
        return this.parseSCB(text);
      case BankCodes.GSB:
        return this.parseGSB(text);
      case BankCodes.KBANK:
        return this.parseKBank(text);
      default:
        return this.parseGeneric(text);
    }
  }

  // ================================
  // SHARED HELPERS
  // ================================

  /**
   * Thai month names → 0-indexed month number
   */
  private static readonly THAI_MONTHS: Record<string, number> = {
    'ม.ค.': 0, 'มกราคม': 0, 'มค': 0,
    'ก.พ.': 1, 'กุมภาพันธ์': 1, 'กพ': 1,
    'มี.ค.': 2, 'มีนาคม': 2, 'มีค': 2,
    'เม.ย.': 3, 'เมษายน': 3, 'เมย': 3,
    'พ.ค.': 4, 'พฤษภาคม': 4, 'พค': 4,
    'มิ.ย.': 5, 'มิถุนายน': 5, 'มิย': 5,
    'ก.ค.': 6, 'กรกฎาคม': 6, 'กค': 6,
    'ส.ค.': 7, 'สิงหาคม': 7, 'สค': 7,
    'ก.ย.': 8, 'กันยายน': 8, 'กย': 8,
    'ต.ค.': 9, 'ตุลาคม': 9, 'ตค': 9,
    'พ.ย.': 10, 'พฤศจิกายน': 10, 'พย': 10,
    'ธ.ค.': 11, 'ธันวาคม': 11, 'ธค': 11,
  };

  /**
   * Parse Thai date: "12 ก.พ. 2569" or "12/02/69" or "12-02-2569"
   */
  private parseThaiDate(text: string): Date | undefined {
    // Pattern 1: "12 ก.พ. 2569" / "12 กุมภาพันธ์ 2569"
    const thaiMonthNames = Object.keys(MessageFetchService.THAI_MONTHS).join('|');
    const thaiPattern = new RegExp(`(\\d{1,2})\\s+(${thaiMonthNames})\\s*(\\d{2,4})`, 'i');
    const thaiMatch = text.match(thaiPattern);
    if (thaiMatch) {
      const day = parseInt(thaiMatch[1]);
      const month = MessageFetchService.THAI_MONTHS[thaiMatch[2]];
      let year = parseInt(thaiMatch[3]);
      // Convert Buddhist Era to CE (พ.ศ. → ค.ศ.)
      if (year > 2400) year -= 543;
      else if (year < 100) year += 2000;
      if (month !== undefined) {
        return new Date(year, month, day);
      }
    }

    // Pattern 2: "12/02/69" or "12-02-2569" or "12/02/2569"
    const numericMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (numericMatch) {
      const day = parseInt(numericMatch[1]);
      const month = parseInt(numericMatch[2]) - 1;
      let year = parseInt(numericMatch[3]);
      if (year > 2400) year -= 543;
      else if (year < 100) year += 2000;
      return new Date(year, month, day);
    }

    return undefined;
  }

  /**
   * Parse Thai time: "เวลา 14:24 น." or "14:24"
   */
  private parseThaiTime(text: string): { hours: number; minutes: number } | undefined {
    const timeMatch = text.match(/(?:เวลา\s*)?(\d{1,2})[:\.](\d{2})\s*(?:น\.|นาฬิกา)?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return { hours, minutes };
      }
    }
    return undefined;
  }

  /**
   * Parse Thai date + time combined, returning Date in Asia/Bangkok (UTC+7)
   * เวลาในข้อความธนาคารเป็นเวลาไทย (UTC+7) เสมอ
   */
  private parseThaiDateTime(text: string): Date | undefined {
    const date = this.parseThaiDate(text);
    if (!date) return undefined;

    const time = this.parseThaiTime(text);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const hours = time?.hours ?? 0;
    const minutes = time?.minutes ?? 0;

    // สร้าง Date ใน timezone ไทย (+07:00)
    // Thai bank messages always show Thai local time
    const pad = (n: number) => n.toString().padStart(2, '0');
    const isoString = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00+07:00`;
    const result = new Date(isoString);

    // Validate result
    if (isNaN(result.getTime())) return undefined;
    return result;
  }

  /**
   * Extract amount from text (shared across all parsers)
   */
  private extractAmount(text: string): number | undefined {
    // "200.00 บาท" or "จำนวน 200.00" or "THB 200.00" or "฿200.00"
    const patterns = [
      /(?:จำนวน|จน\.)\s*([\d,]+\.?\d*)/i,
      /([\d,]+\.?\d*)\s*(?:บาท|THB|Baht)/i,
      /(?:THB|฿)\s*([\d,]+\.?\d*)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (val > 0) return val;
      }
    }
    return undefined;
  }

  /**
   * Extract balance from text (shared across all parsers)
   */
  private extractBalance(text: string): number | undefined {
    const match = text.match(/(?:คงเหลือ|เงินคงเหลือ|ยอดเงิน|Bal(?:ance)?)[:\s]*([\d,]+\.?\d*)/i);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return undefined;
  }

  /**
   * Classify outgoing transaction type by analyzing context:
   *  - has destination account ("เข้าบัญชี") → transfer
   *  - ATM keywords → withdraw
   *  - otherwise → payment (debit card / POS / unknown spending)
   */
  private classifyOutgoing(text: string): 'withdraw' | 'transfer' | 'payment' {
    // Has destination account → transfer
    if (/เข้าบัญชี|ไปบัญชี|ไปยังบัญชี|to\s*acc/i.test(text)) {
      return 'transfer';
    }
    // ATM withdrawal keywords
    if (/ATM|ตู้\s*(?:ATM|เอทีเอ็ม|กด)|ถอนเงินสด|ถอน\s*ATM|cash\s*withdraw/i.test(text)) {
      return 'withdraw';
    }
    // Debit card / POS / spending without destination → payment
    return 'payment';
  }

  // ================================
  // BANK-SPECIFIC PARSERS
  // ================================

  /**
   * Parse SCB message
   */
  private parseSCB(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    // 1) Fee (most specific — check first)
    if (/ค่าธรรมเนียม|fee|ค่าบริการ|annual\s*fee|ค่ารักษา|ค่าใช้จ่ายประจำ/i.test(text)) {
      result.transactionType = 'fee';
    }
    // 2) Interest
    else if (/ดอกเบี้ย|interest/i.test(text)) {
      result.transactionType = 'interest';
    }
    // 3) Bill payment / loan
    else if (/ชำระบิล|bill\s*pay|สินเชื่อ|ผ่อน|งวด|ค่าน้ำ|ค่าไฟ|ค่าโทรศัพท์|ค่าเช่า/i.test(text)) {
      result.transactionType = 'bill';
    }
    // 4) Deposit: "รับเงิน", "เงินเข้า", "โอนเข้า", "ฝาก"
    else if (/รับเงิน|เงินเข้า|โอนเข้า|ฝากเงิน|ฝาก/i.test(text)) {
      result.transactionType = 'deposit';
    }
    // 5) Outgoing: "เงินออก", "ถอน", "โอน", "จ่าย", "ชำระ"
    else if (/เงินออก|ถอน|โอน|จ่าย|ชำระ|หักบัญชี/i.test(text)) {
      result.transactionType = this.classifyOutgoing(text);
    }
    // 6) Debit card / POS (fallback)
    else if (/บัตรเดบิต|debit|POS|EDC|ซื้อสินค้า|visa|mastercard|jcb/i.test(text)) {
      result.transactionType = 'payment';
    }

    result.amount = this.extractAmount(text);
    result.balance = this.extractBalance(text);
    result.messageDate = this.parseThaiDateTime(text);

    return result;
  }

  /**
   * Parse GSB message
   *
   * GSB patterns:
   *   เงินเข้า: มีการฝาก/โอนเงิน X บาท เข้าบัญชี GSBA ... คงเหลือ ...
   *   เงินออก (โอน): มีการถอน/โอนเงิน X บาท จากบัญชี GSBA ... เข้าบัญชี KTBA ... คงเหลือ ...
   *   เงินออก (บัตร): มีการถอน/โอนเงิน X บาท จากบัญชี GSBA ... คงเหลือ ... (ไม่มีเข้าบัญชี)
   */
  private parseGSB(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    // 1) Fee
    if (/ค่าธรรมเนียม|fee|ค่าบริการ|annual\s*fee|ค่ารักษา|ค่าใช้จ่ายประจำ/i.test(text)) {
      result.transactionType = 'fee';
    }
    // 2) Interest
    else if (/ดอกเบี้ย|interest/i.test(text)) {
      result.transactionType = 'interest';
    }
    // 3) Bill payment / loan
    else if (/ชำระบิล|bill\s*pay|สินเชื่อ|ผ่อน|งวด|ค่าน้ำ|ค่าไฟ|ค่าโทรศัพท์|ค่าเช่า/i.test(text)) {
      result.transactionType = 'bill';
    }
    // 4) Deposit: "เงินเข้า", "ฝาก", "รับโอน", "รับเงิน", "โอนเข้า"
    else if (/เงินเข้า|ฝาก|รับโอน|รับเงิน|โอนเข้า/i.test(text)) {
      result.transactionType = 'deposit';
    }
    // 5) Outgoing: "เงินออก", "ถอน/โอนเงิน", "ชำระ", "จ่าย", "หักบัญชี"
    else if (/เงินออก|ถอน|โอน|ชำระ|จ่าย|หักบัญชี/i.test(text)) {
      result.transactionType = this.classifyOutgoing(text);
    }
    // 6) Debit card / POS (fallback)
    else if (/บัตรเดบิต|debit|POS|EDC|ซื้อสินค้า|visa|mastercard|jcb/i.test(text)) {
      result.transactionType = 'payment';
    }

    result.amount = this.extractAmount(text);
    result.balance = this.extractBalance(text);
    result.messageDate = this.parseThaiDateTime(text);

    return result;
  }

  /**
   * Parse KBank message
   */
  private parseKBank(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    // 1) Fee
    if (/ค่าธรรมเนียม|fee|ค่าบริการ|annual\s*fee|ค่ารักษา|ค่าใช้จ่ายประจำ/i.test(text)) {
      result.transactionType = 'fee';
    }
    // 2) Interest
    else if (/ดอกเบี้ย|interest/i.test(text)) {
      result.transactionType = 'interest';
    }
    // 3) Bill payment / loan
    else if (/ชำระบิล|bill\s*pay|สินเชื่อ|ผ่อน|งวด|ค่าน้ำ|ค่าไฟ|ค่าโทรศัพท์|ค่าเช่า/i.test(text)) {
      result.transactionType = 'bill';
    }
    // 4) Deposit
    else if (/รับโอน|เงินเข้า|ฝาก|รับเงิน|โอนเข้า/i.test(text)) {
      result.transactionType = 'deposit';
    }
    // 5) Outgoing
    else if (/โอนเงิน|โอน|ถอน|จ่าย|ชำระ|เงินออก|หักบัญชี/i.test(text)) {
      result.transactionType = this.classifyOutgoing(text);
    }
    // 6) Debit card / POS (fallback)
    else if (/บัตรเดบิต|debit|POS|EDC|ซื้อสินค้า|visa|mastercard|jcb/i.test(text)) {
      result.transactionType = 'payment';
    }

    result.amount = this.extractAmount(text);
    result.balance = this.extractBalance(text);
    result.messageDate = this.parseThaiDateTime(text);

    return result;
  }

  /**
   * Parse generic bank message (BBL, KTB, BAY, TTB, etc.)
   */
  private parseGeneric(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    // 1) Fee
    if (/ค่าธรรมเนียม|fee|ค่าบริการ|annual\s*fee|ค่ารักษา|ค่าใช้จ่ายประจำ/i.test(text)) {
      result.transactionType = 'fee';
    }
    // 2) Interest
    else if (/ดอกเบี้ย|interest/i.test(text)) {
      result.transactionType = 'interest';
    }
    // 3) Bill payment / loan
    else if (/ชำระบิล|bill\s*pay|สินเชื่อ|ผ่อน|งวด|ค่าน้ำ|ค่าไฟ|ค่าโทรศัพท์|ค่าเช่า/i.test(text)) {
      result.transactionType = 'bill';
    }
    // 4) Deposit
    else if (/รับโอน|รับเงิน|เงินเข้า|ฝาก|โอนเข้า|deposit|receive|credit/i.test(text)) {
      result.transactionType = 'deposit';
    }
    // 5) Outgoing
    else if (/เงินออก|ถอน|โอน|จ่าย|ชำระ|หักบัญชี|withdraw|transfer|debit/i.test(text)) {
      result.transactionType = this.classifyOutgoing(text);
    }
    // 6) Debit card / POS (fallback)
    else if (/บัตรเดบิต|POS|EDC|ซื้อสินค้า|visa|mastercard|jcb/i.test(text)) {
      result.transactionType = 'payment';
    }

    result.amount = this.extractAmount(text);
    result.balance = this.extractBalance(text);
    result.messageDate = this.parseThaiDateTime(text);

    return result;
  }

  /**
   * Get batch transaction summary across all sessions
   */
  async getBatchTransactionSummary(): Promise<{
    totalDeposits: { total: number; count: number };
    totalWithdrawals: { total: number; count: number };
    latestBalance: { total: number; perSession: Array<{ lineAccountId: string; balance: number; updatedAt: string }> };
    perSession: Array<{
      lineAccountId: string;
      deposits: { total: number; count: number };
      withdrawals: { total: number; count: number };
    }>;
  }> {
    const results = await this.lineMessageModel.aggregate([
      {
        $match: {
          transactionType: { $in: ['deposit', 'withdraw'] },
          amount: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $addFields: {
          numericAmount: {
            $convert: {
              input: '$amount',
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: {
            lineAccountId: '$lineAccountId',
            transactionType: '$transactionType',
          },
          total: { $sum: '$numericAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build per-session map
    const sessionMap = new Map<string, { deposits: { total: number; count: number }; withdrawals: { total: number; count: number } }>();

    for (const row of results) {
      const lid = row._id.lineAccountId;
      if (!sessionMap.has(lid)) {
        sessionMap.set(lid, {
          deposits: { total: 0, count: 0 },
          withdrawals: { total: 0, count: 0 },
        });
      }
      const entry = sessionMap.get(lid)!;
      if (row._id.transactionType === 'deposit') {
        entry.deposits = { total: row.total, count: row.count };
      } else if (row._id.transactionType === 'withdraw') {
        entry.withdrawals = { total: row.total, count: row.count };
      }
    }

    // Calculate totals
    let totalDepositAmount = 0;
    let totalDepositCount = 0;
    let totalWithdrawAmount = 0;
    let totalWithdrawCount = 0;
    const perSession: Array<{
      lineAccountId: string;
      deposits: { total: number; count: number };
      withdrawals: { total: number; count: number };
    }> = [];

    for (const [lineAccountId, data] of sessionMap) {
      totalDepositAmount += data.deposits.total;
      totalDepositCount += data.deposits.count;
      totalWithdrawAmount += data.withdrawals.total;
      totalWithdrawCount += data.withdrawals.count;
      perSession.push({ lineAccountId, ...data });
    }

    // Get latest balance per session (from most recent message with balance)
    const latestBalances = await this.lineMessageModel.aggregate([
      {
        $match: {
          balance: { $exists: true, $nin: [null, ''] },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$lineAccountId',
          balance: { $first: { $convert: { input: '$balance', to: 'double', onError: 0, onNull: 0 } } },
          updatedAt: { $first: '$createdAt' },
        },
      },
    ]);

    let totalBalance = 0;
    const balancePerSession: Array<{ lineAccountId: string; balance: number; updatedAt: string }> = [];
    for (const row of latestBalances) {
      totalBalance += row.balance;
      balancePerSession.push({
        lineAccountId: row._id,
        balance: row.balance,
        updatedAt: row.updatedAt?.toISOString?.() || String(row.updatedAt),
      });
    }

    return {
      totalDeposits: { total: totalDepositAmount, count: totalDepositCount },
      totalWithdrawals: { total: totalWithdrawAmount, count: totalWithdrawCount },
      latestBalance: { total: totalBalance, perSession: balancePerSession },
      perSession,
    };
  }

  /**
   * Build headers for LINE API
   */
  private buildHeaders(session: LineSessionDocument) {
    return {
      'authority': 'line-chrome-gw.line-apps.com',
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US',
      'content-type': 'application/json',
      'x-hmac': session.xHmac,
      'x-line-access': session.xLineAccess,
      'x-line-chrome-version': session.lineVersion || '3.4.0',
      'user-agent': session.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
  }

  /**
   * Update session balance from latest message
   */
  private async updateSessionBalance(lineAccountId: string): Promise<void> {
    const latestMsg = await this.lineMessageModel.findOne({
      lineAccountId,
      balance: { $exists: true, $ne: null },
    }).sort({ messageDate: -1 });

    if (latestMsg?.balance) {
      await this.lineSessionModel.updateOne(
        { lineAccountId, isActive: true },
        { balance: latestMsg.balance },
      );
    }
  }

  /**
   * Get messages for a LINE Account
   */
  async getMessages(
    lineAccountId: string,
    options?: {
      limit?: number;
      offset?: number;
      transactionType?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const query: any = { lineAccountId };

    if (options?.transactionType) {
      query.transactionType = options.transactionType;
    }

    if (options?.startDate || options?.endDate) {
      query.messageDate = {};
      if (options.startDate) query.messageDate.$gte = options.startDate;
      if (options.endDate) query.messageDate.$lte = options.endDate;
    }

    const messages = await this.lineMessageModel
      .find(query)
      .sort({ messageDate: -1 })
      .skip(options?.offset || 0)
      .limit(options?.limit || 50);

    const total = await this.lineMessageModel.countDocuments(query);

    return { messages, total };
  }

  /**
   * Get transaction summary
   */
  async getTransactionSummary(
    lineAccountId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const query: any = { lineAccountId };

    if (startDate || endDate) {
      query.messageDate = {};
      if (startDate) query.messageDate.$gte = startDate;
      if (endDate) query.messageDate.$lte = endDate;
    }

    const deposits = await this.lineMessageModel.aggregate([
      { $match: { ...query, transactionType: 'deposit' } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
    ]);

    const withdrawals = await this.lineMessageModel.aggregate([
      { $match: { ...query, transactionType: 'withdraw' } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
    ]);

    return {
      deposits: deposits[0] || { total: 0, count: 0 },
      withdrawals: withdrawals[0] || { total: 0, count: 0 },
    };
  }
}
