import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { LineMessage, LineMessageDocument } from '../schemas/line-message.schema';
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

@Injectable()
export class MessageFetchService {
  private readonly logger = new Logger(MessageFetchService.name);
  private readonly LINE_API = 'https://line-chrome-gw.line-apps.com';

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(LineMessage.name)
    private lineMessageModel: Model<LineMessageDocument>,
    private keyStorageService: KeyStorageService,
    private configService: ConfigService,
    private eventBusService: EventBusService,
  ) {}

  // Flag to enable/disable automatic message fetch
  private autoMessageFetchEnabled = false; // Disabled by default

  /**
   * Enable/Disable automatic message fetch
   */
  setAutoMessageFetchEnabled(enabled: boolean): void {
    this.autoMessageFetchEnabled = enabled;
    this.logger.log(`Auto message fetch ${enabled ? 'enabled' : 'disabled'}`);
  }

  isAutoMessageFetchEnabled(): boolean {
    return this.autoMessageFetchEnabled;
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
   * Cron Job: ดึงข้อความทุก 2 นาที
   * ปิดโดย default - ต้องเปิดผ่าน API
   */
  @Cron('*/2 * * * *')
  async scheduledMessageFetch(): Promise<void> {
    // Skip if auto message fetch is disabled
    if (!this.autoMessageFetchEnabled) {
      return;
    }

    this.logger.debug('Running scheduled message fetch...');

    const activeSessions = await this.lineSessionModel.find({
      isActive: true,
      status: 'active',
      xLineAccess: { $exists: true, $ne: null },
      chatMid: { $exists: true, $ne: null },
    });

    this.logger.log(`Fetching messages for ${activeSessions.length} active sessions`);

    for (const session of activeSessions) {
      try {
        await this.fetchMessages(session.lineAccountId);
      } catch (error: any) {
        this.logger.error(
          `Failed to fetch messages for ${session.lineAccountId}: ${error.message}`,
        );
      }
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
   */
  async fetchMessages(lineAccountId: string): Promise<FetchResult> {
    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    if (!session) {
      return { success: false, messageCount: 0, newMessages: 0, error: 'No active session' };
    }

    if (!session.xLineAccess || !session.xHmac) {
      return { success: false, messageCount: 0, newMessages: 0, error: 'No keys found' };
    }

    if (!session.chatMid) {
      return { success: false, messageCount: 0, newMessages: 0, error: 'No chatMid configured' };
    }

    try {
      const headers = this.buildHeaders(session);

      // Fetch messages from LINE API
      const response = await axios.post(
        `${this.LINE_API}/api/talk/thrift/Talk/TalkService/getRecentMessagesV2`,
        [session.chatMid, 50], // chatMid, limit
        {
          headers,
          timeout: 30000,
        },
      );

      if (response.data?.code !== 0) {
        throw new Error(`API error: ${response.data?.code}`);
      }

      const messages = response.data?.data || [];
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
      this.logger.error(`Error fetching messages: ${error.message}`);

      // Check if keys are expired
      if (error.response?.status === 401 || error.response?.status === 403) {
        await this.keyStorageService.updateSessionStatus(
          lineAccountId,
          'expired',
          'keys_expired',
          true,
        );

        this.eventBusService.publish({
          eventName: 'line-session.expired' as any,
          occurredAt: new Date(),
          lineAccountId,
        });
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
