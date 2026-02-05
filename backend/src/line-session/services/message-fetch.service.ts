import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { LineMessage, LineMessageDocument } from '../schemas/line-message.schema';
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
  transactionType: 'deposit' | 'withdraw' | 'transfer' | 'unknown';
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
      const query: any = {
        isActive: true,
        xLineAccess: { $exists: true, $nin: [null, ''] },
        chatMid: { $exists: true, $nin: [null, ''] },
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
      // Match --data-raw '["xxx",50]' or similar formats
      const dataMatch = curlCommand.match(/(?:--data-raw|--data|-d)\s+['"]?\[['"]([^'"]+)['"],\s*\d+\]['"]?/);

      if (dataMatch && dataMatch[1] && dataMatch[1].length > 10) {
        this.logger.debug(`[ExtractChatMid] Found chatMid in cURL: ${dataMatch[1].substring(0, 20)}...`);
        return dataMatch[1];
      }

      return undefined;
    } catch (error) {
      this.logger.warn(`[ExtractChatMid] Error parsing cURL: ${error}`);
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

    // Parse transaction details
    const text = msg?.text || msg?.contentMetadata?.ALT_TEXT || '';
    const parsed = this.parseTransaction(text, session.bankCode);

    // Create message
    await this.lineMessageModel.create({
      sessionId: session._id.toString(),
      lineAccountId: session.lineAccountId,
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
      messageDate: parsed.messageDate || new Date(),
    });

    // Emit new message event
    if (parsed.transactionType !== 'unknown') {
      this.eventBusService.publish({
        eventName: 'line-session.new-transaction' as any,
        occurredAt: new Date(),
        lineAccountId: session.lineAccountId,
        transactionType: parsed.transactionType,
        amount: parsed.amount,
        balance: parsed.balance,
      });
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

  /**
   * Parse SCB message
   */
  private parseSCB(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    // Deposit pattern: "รับเงิน" or "เงินเข้า"
    if (text.includes('รับเงิน') || text.includes('เงินเข้า') || text.includes('โอนเข้า')) {
      result.transactionType = 'deposit';
    }
    // Withdraw pattern: "ถอนเงิน" or "เงินออก"
    else if (text.includes('ถอนเงิน') || text.includes('เงินออก') || text.includes('โอนออก')) {
      result.transactionType = 'withdraw';
    }
    // Transfer
    else if (text.includes('โอน')) {
      result.transactionType = 'transfer';
    }

    // Extract amount
    const amountMatch = text.match(/(?:จำนวน|จน\.|THB|฿)\s*([\d,]+\.?\d*)/i);
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    // Extract balance
    const balanceMatch = text.match(/(?:คงเหลือ|ยอดเงิน|bal|balance)\s*([\d,]+\.?\d*)/i);
    if (balanceMatch) {
      result.balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }

    // Extract date
    const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch) {
      const year = dateMatch[3].length === 2 ? parseInt('20' + dateMatch[3]) : parseInt(dateMatch[3]);
      result.messageDate = new Date(year, parseInt(dateMatch[2]) - 1, parseInt(dateMatch[1]));
    }

    return result;
  }

  /**
   * Parse GSB message
   */
  private parseGSB(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    if (text.includes('ฝาก') || text.includes('รับ') || text.includes('เงินเข้า')) {
      result.transactionType = 'deposit';
    } else if (text.includes('ถอน') || text.includes('โอน') || text.includes('ชำระ')) {
      result.transactionType = 'withdraw';
    }

    // Amount patterns for GSB
    const amountMatch = text.match(/(?:จำนวน|จน\.|บาท)\s*([\d,]+\.?\d*)/i) ||
                        text.match(/([\d,]+\.?\d*)\s*(?:บาท|THB)/i);
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    // Balance
    const balanceMatch = text.match(/(?:คงเหลือ|เงินคงเหลือ)\s*([\d,]+\.?\d*)/i);
    if (balanceMatch) {
      result.balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }

    return result;
  }

  /**
   * Parse KBank message
   */
  private parseKBank(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    if (text.includes('รับโอน') || text.includes('เงินเข้า') || text.includes('ฝาก')) {
      result.transactionType = 'deposit';
    } else if (text.includes('โอนเงิน') || text.includes('ถอน') || text.includes('จ่าย')) {
      result.transactionType = 'withdraw';
    }

    // Amount
    const amountMatch = text.match(/([\d,]+\.?\d*)\s*(?:บาท|THB|Baht)/i);
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    // Balance
    const balanceMatch = text.match(/(?:คงเหลือ|Bal|Balance)[:\s]*([\d,]+\.?\d*)/i);
    if (balanceMatch) {
      result.balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }

    return result;
  }

  /**
   * Parse generic bank message
   */
  private parseGeneric(text: string): ParsedTransaction {
    const result: ParsedTransaction = { transactionType: 'unknown' };

    // Generic deposit keywords
    if (/รับ|ฝาก|เข้า|deposit|receive/i.test(text)) {
      result.transactionType = 'deposit';
    }
    // Generic withdraw keywords
    else if (/โอน|ถอน|จ่าย|ออก|withdraw|transfer/i.test(text)) {
      result.transactionType = 'withdraw';
    }

    // Generic amount pattern
    const amountMatch = text.match(/([\d,]+\.?\d*)\s*(?:บาท|THB|Baht)/i);
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    // Generic balance pattern
    const balanceMatch = text.match(/(?:คงเหลือ|bal|balance)[:\s]*([\d,]+\.?\d*)/i);
    if (balanceMatch) {
      result.balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }

    return result;
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
