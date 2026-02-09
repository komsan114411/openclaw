import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { KeyStorageService } from './services/key-storage.service';
import { EnhancedAutomationService, EnhancedLoginStatus } from './services/enhanced-automation.service';
import { WorkerPoolService } from './services/worker-pool.service';
import { LoginCoordinatorService } from './services/login-coordinator.service';
import { SessionHealthService } from './services/session-health.service';
import { MessageFetchService } from './services/message-fetch.service';
import { LineSession, LineSessionDocument } from './schemas/line-session.schema';
import { LineMessage, LineMessageDocument } from './schemas/line-message.schema';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';
import { BankList, BankListDocument } from './schemas/bank-list.schema';
import { LineAutomationService } from './services/line-automation.service';

/**
 * User-facing LINE Session Controller
 *
 * ให้ User จัดการ LINE Session ของตัวเอง
 * ตรวจสอบ ownership ผ่าน ownerId โดยตรง (แยกจาก LINE Account)
 */
@ApiTags('LINE Session (User)')
@ApiBearerAuth()
@Controller('user/line-session')
@UseGuards(SessionAuthGuard)
export class LineSessionUserController {
  private readonly logger = new Logger(LineSessionUserController.name);

  constructor(
    private keyStorageService: KeyStorageService,
    private enhancedAutomationService: EnhancedAutomationService,
    private workerPoolService: WorkerPoolService,
    private loginCoordinatorService: LoginCoordinatorService,
    private lineAutomationService: LineAutomationService,
    private sessionHealthService: SessionHealthService,
    private messageFetchService: MessageFetchService,
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(LineAccount.name)
    private lineAccountModel: Model<LineAccountDocument>,
    @InjectModel(BankList.name)
    private bankListModel: Model<BankListDocument>,
    @InjectModel(LineMessage.name)
    private lineMessageModel: Model<LineMessageDocument>,
  ) {}

  /**
   * ตรวจสอบว่า user เป็นเจ้าของ Session หรือไม่
   */
  private async validateSessionOwnership(sessionId: string, userId: string): Promise<LineSessionDocument> {
    const session = await this.lineSessionModel.findById(sessionId);

    if (!session) {
      throw new NotFoundException('ไม่พบ LINE Session');
    }

    if (session.ownerId !== userId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึง Session นี้');
    }

    return session;
  }

  /**
   * ตรวจสอบว่า user เป็นเจ้าของ LINE Account หรือไม่ (สำหรับ backward compatibility)
   */
  private async validateLineAccountOwnership(lineAccountId: string, userId: string): Promise<LineAccountDocument> {
    const account = await this.lineAccountModel.findById(lineAccountId);

    if (!account) {
      throw new NotFoundException('ไม่พบบัญชี LINE');
    }

    if (account.ownerId?.toString() !== userId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงบัญชีนี้');
    }

    return account;
  }

  // ============================================
  // Static Routes (ต้องอยู่ก่อน dynamic routes)
  // ============================================

  /**
   * Get available banks for LINE session
   */
  @Get('banks/list')
  @ApiOperation({ summary: 'Get available banks for LINE session setup' })
  async getBanks() {
    const banks = await this.bankListModel.find({ isActive: true }).sort({ bankNameTh: 1 });

    return {
      success: true,
      banks: banks.map((b) => ({
        bankCode: b.bankCode,
        bankNameTh: b.bankNameTh,
        bankNameEn: b.bankNameEn,
        bankImg: b.bankImg,
        reLoginAtMins: b.reLoginAtMins,
      })),
    };
  }

  /**
   * ดึงรายการ LINE Session ของตัวเอง
   */
  @Get('my')
  @ApiOperation({ summary: 'Get my LINE sessions' })
  async getMyLineSessions(@CurrentUser() user: AuthUser) {
    const sessions = await this.lineSessionModel.find({
      ownerId: user.userId,
      isActive: true,
    }).sort({ createdAt: -1 });

    return {
      success: true,
      sessions: sessions.map((s) => ({
        _id: s._id,
        name: s.name,
        status: s.status,
        bankCode: s.bankCode,
        bankName: s.bankName,
        hasKeys: !!(s.xLineAccess && s.xHmac),
        hasCredentials: !!(s.lineEmail && s.linePassword),
        lastCheckedAt: s.lastCheckedAt,
        lastCheckResult: s.lastCheckResult,
        createdAt: (s as any).createdAt,
      })),
    };
  }

  /**
   * สร้าง LINE Session ใหม่
   */
  @Post('create')
  @ApiOperation({ summary: 'Create new LINE session' })
  async createLineSession(
    @Body() body: { name: string },
    @CurrentUser() user: AuthUser,
  ) {
    if (!body.name || body.name.trim().length === 0) {
      return { success: false, message: 'กรุณาระบุชื่อ Session' };
    }

    const session = await this.lineSessionModel.create({
      ownerId: user.userId,
      name: body.name.trim(),
      status: 'pending',
      isActive: true,
      source: 'manual',
    });

    return {
      success: true,
      session: {
        _id: session._id,
        name: session.name,
        status: session.status,
      },
    };
  }

  /**
   * ลบ LINE Session (soft delete)
   */
  @Delete(':sessionId')
  @ApiOperation({ summary: 'Delete LINE session' })
  async deleteLineSession(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // ตรวจสอบ ownership ก่อนลบ
    await this.validateSessionOwnership(sessionId, user.userId);

    await this.lineSessionModel.updateOne(
      { _id: sessionId },
      { isActive: false },
    );

    return { success: true, message: 'ลบ LINE Session สำเร็จ' };
  }

  /**
   * Get session info by sessionId
   */
  @Get(':sessionId')
  @ApiOperation({ summary: 'Get LINE session by ID' })
  async getSessionById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const session = await this.validateSessionOwnership(sessionId, user.userId);

    return {
      success: true,
      session: {
        _id: session._id,
        name: session.name,
        ownerId: session.ownerId,
        lineAccountId: session.lineAccountId,
        hasKeys: !!(session.xLineAccess && session.xHmac),
        xLineAccess: session.xLineAccess ? `${session.xLineAccess.substring(0, 30)}...` : null,
        xHmac: session.xHmac ? `${session.xHmac.substring(0, 20)}...` : null,
        chatMid: session.chatMid,
        bankCode: session.bankCode,
        bankName: session.bankName,
        balance: session.balance,
        status: session.status,
        lastCheckedAt: session.lastCheckedAt,
        lastCheckResult: session.lastCheckResult,
        extractedAt: session.extractedAt,
        source: session.source,
        userAgent: session.userAgent,
        lineVersion: session.lineVersion,
      },
    };
  }

  /**
   * Setup LINE session with credentials and bank (by sessionId)
   */
  @Post(':sessionId/setup')
  @ApiOperation({ summary: 'Setup LINE session with credentials and bank' })
  async setupLineSessionById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @Body() body: {
      email: string;
      password: string;
      bankCode: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateSessionOwnership(sessionId, user.userId);

    if (!body.email || !body.password || !body.bankCode) {
      return { success: false, message: 'กรุณาระบุ Email, Password และธนาคาร' };
    }

    // Get bank info
    const bank = await this.bankListModel.findOne({ bankCode: body.bankCode, isActive: true });
    if (!bank) {
      return { success: false, message: 'ไม่พบธนาคารที่เลือก' };
    }

    // Save credentials to session
    await this.lineAutomationService.saveCredentials(sessionId, body.email, body.password);

    // Update session with bank info
    await this.lineSessionModel.updateOne(
      { _id: sessionId },
      {
        $set: {
          bankCode: bank.bankCode,
          bankName: bank.bankNameTh,
        },
      },
    );

    // Start enhanced login
    const result = await this.enhancedAutomationService.startLogin(
      sessionId,
      body.email,
      body.password,
      'manual',
    );

    return {
      ...result,
      bankCode: bank.bankCode,
      bankName: bank.bankNameTh,
    };
  }

  /**
   * Get credentials status (by sessionId)
   */
  @Get(':sessionId/credentials')
  @ApiOperation({ summary: 'Check if credentials are saved' })
  async getCredentialsStatusById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const session = await this.validateSessionOwnership(sessionId, user.userId);

    return {
      success: true,
      hasCredentials: !!(session.lineEmail && session.linePassword),
      email: session.lineEmail ? `${session.lineEmail.substring(0, 3)}***` : null,
      bankCode: session.bankCode || null,
      bankName: session.bankName || null,
    };
  }

  /**
   * Start enhanced login (by sessionId)
   */
  @Post(':sessionId/enhanced-login')
  @ApiOperation({ summary: 'Start enhanced login' })
  async startEnhancedLoginById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @Body() body: { email?: string; password?: string; source?: 'manual' | 'auto' | 'relogin' },
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    const result = await this.enhancedAutomationService.startLogin(
      sessionId,
      body.email,
      body.password,
      body.source || 'manual',
    );

    return result;
  }

  /**
   * Get enhanced login status (by sessionId)
   */
  @Get(':sessionId/enhanced-login/status')
  @ApiOperation({ summary: 'Get enhanced login status' })
  async getEnhancedLoginStatusById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    return this.enhancedAutomationService.getWorkerStatus(sessionId);
  }

  /**
   * Cancel enhanced login (by sessionId)
   */
  @Delete(':sessionId/enhanced-login')
  @ApiOperation({ summary: 'Cancel enhanced login' })
  async cancelEnhancedLoginById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    await this.enhancedAutomationService.cancelLogin(sessionId);
    return { success: true, message: 'ยกเลิกการเข้าสู่ระบบแล้ว' };
  }

  /**
   * Retry login after wrong PIN (by sessionId)
   * Quick retry: cancel → reset cooldown → start new login
   */
  @Post(':sessionId/retry-wrong-pin')
  @ApiOperation({ summary: 'Retry login after wrong PIN' })
  async retryWrongPinById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    const result = await this.enhancedAutomationService.retryLoginAfterWrongPin(sessionId);
    return result;
  }

  /**
   * Get cooldown info (by sessionId)
   */
  @Get(':sessionId/cooldown')
  @ApiOperation({ summary: 'Get cooldown info' })
  async getCooldownInfoById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    return this.loginCoordinatorService.getCooldownInfo(sessionId);
  }

  /**
   * Reset cooldown (by sessionId)
   */
  @Post(':sessionId/reset-cooldown')
  @ApiOperation({ summary: 'Reset cooldown' })
  async resetCooldownById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    this.enhancedAutomationService.resetCooldown(sessionId);
    return { success: true, message: 'รีเซ็ต cooldown แล้ว' };
  }

  /**
   * Get full keys (by sessionId)
   */
  @Get(':sessionId/keys')
  @ApiOperation({ summary: 'Get full keys for copying' })
  async getFullKeysById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const session = await this.validateSessionOwnership(sessionId, user.userId);

    if (!session.xLineAccess) {
      return {
        success: false,
        message: 'ไม่พบ Keys - กรุณาเข้าสู่ระบบ LINE ก่อน',
      };
    }

    return {
      success: true,
      keys: {
        xLineAccess: session.xLineAccess,
        xHmac: session.xHmac,
        chatMid: session.chatMid,
        userAgent: session.userAgent,
        lineVersion: session.lineVersion,
        extractedAt: session.extractedAt,
        status: session.status,
        cUrlBash: session.cUrlBash, // เพิ่ม cUrlBash สำหรับ copy
      },
    };
  }

  /**
   * Set keys manually (by sessionId)
   */
  @Post(':sessionId/keys')
  @ApiOperation({ summary: 'Set keys manually' })
  async setKeysById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @Body() body: {
      xLineAccess: string;
      xHmac: string;
      userAgent?: string;
      lineVersion?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    if (!body.xLineAccess || !body.xHmac) {
      return { success: false, message: 'กรุณาระบุ xLineAccess และ xHmac' };
    }

    await this.keyStorageService.saveKeys({
      lineAccountId: sessionId, // ใช้ sessionId แทน lineAccountId
      xLineAccess: body.xLineAccess,
      xHmac: body.xHmac,
      userAgent: body.userAgent,
      lineVersion: body.lineVersion,
      source: 'manual_input',
      performedBy: user.userId,
    });

    return { success: true, message: 'บันทึก Keys สำเร็จ' };
  }

  /**
   * Get key history (by sessionId)
   */
  @Get(':sessionId/history')
  @ApiOperation({ summary: 'Get key extraction history' })
  async getHistoryById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateSessionOwnership(sessionId, user.userId);

    const history = await this.keyStorageService.getKeyHistory(sessionId, 10);
    return { success: true, history };
  }

  // ============================================
  // Transactions Endpoints - For multi-account transaction viewing
  // ============================================

  /**
   * Get transactions for a specific LINE session
   * Returns transactions from LineMessage collection
   */
  @Get(':sessionId/transactions')
  @ApiOperation({ summary: 'Get transactions for LINE session' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'deposit, withdraw, transfer, payment, fee, interest, bill, unknown' })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getTransactionsById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    // Validate ownership
    const session = await this.validateSessionOwnership(sessionId, user.userId);

    // Build query - use sessionId to get transactions for this specific session
    const query: Record<string, unknown> = { sessionId };
    if (type) {
      query.transactionType = type;
    }

    // Search: regex search in text, originalMsg, amount
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { text: { $regex: escaped, $options: 'i' } },
        { originalMsg: { $regex: escaped, $options: 'i' } },
        { amount: { $regex: escaped, $options: 'i' } },
      ];
    }

    const actualLimit = Math.min(limit || 50, 100);
    const actualOffset = offset || 0;

    // Fetch transactions
    const [transactions, total] = await Promise.all([
      this.lineMessageModel
        .find(query)
        .sort({ messageDate: -1 })
        .skip(actualOffset)
        .limit(actualLimit),
      this.lineMessageModel.countDocuments(query),
    ]);

    return {
      success: true,
      transactions: transactions.map((t) => ({
        _id: t._id,
        messageId: t.messageId,
        text: t.text,
        transactionType: t.transactionType,
        amount: t.amount,
        balance: t.balance,
        messageDate: t.messageDate,
        bankCode: t.bankCode,
        createdAt: (t as any).createdAt,
      })),
      total,
      limit: actualLimit,
      offset: actualOffset,
      totalPages: Math.ceil(total / actualLimit),
      currentPage: Math.floor(actualOffset / actualLimit) + 1,
      sessionId,
      sessionName: session.name,
      bankName: session.bankName,
    };
  }

  /**
   * Fetch new transactions from LINE API
   * This triggers a manual fetch and returns the results
   */
  @Post(':sessionId/fetch-transactions')
  @ApiOperation({ summary: 'Fetch new transactions from LINE API' })
  async fetchTransactionsById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    const session = await this.validateSessionOwnership(sessionId, user.userId);

    // Check if session has keys
    if (!session.xLineAccess || !session.xHmac) {
      return {
        success: false,
        message: 'ไม่พบ Keys - กรุณาเข้าสู่ระบบ LINE ก่อน',
      };
    }

    if (!session.chatMid) {
      return {
        success: false,
        message: 'ไม่พบ Chat MID - กรุณาตั้งค่าธนาคารก่อน',
      };
    }

    this.logger.log(`[FetchTransactions] Starting fetch for session ${sessionId}`);

    try {
      // Use MessageFetchService to fetch messages
      const result = await this.messageFetchService.fetchMessages(sessionId);

      if (result.success) {
        this.logger.log(`[FetchTransactions] Fetched ${result.newMessages} new messages for session ${sessionId}`);

        return {
          success: true,
          message: `ดึงรายการสำเร็จ: ${result.newMessages} รายการใหม่จากทั้งหมด ${result.messageCount} รายการ`,
          newMessages: result.newMessages,
          totalMessages: result.messageCount,
          sessionId,
          sessionName: session.name,
        };
      } else {
        this.logger.warn(`[FetchTransactions] Fetch failed for session ${sessionId}: ${result.error}`);

        return {
          success: false,
          message: result.error || 'ไม่สามารถดึงรายการได้',
          error: result.error,
        };
      }
    } catch (error: any) {
      this.logger.error(`[FetchTransactions] Error fetching for session ${sessionId}: ${error.message}`);

      return {
        success: false,
        message: 'เกิดข้อผิดพลาดในการดึงรายการ',
        error: error.message,
      };
    }
  }

  /**
   * Get transaction summary for a session
   * Returns deposit/withdrawal totals
   */
  @Get(':sessionId/transactions/summary')
  @ApiOperation({ summary: 'Get transaction summary for LINE session' })
  async getTransactionSummaryById(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    const session = await this.validateSessionOwnership(sessionId, user.userId);

    // Get summary using aggregation
    const deposits = await this.lineMessageModel.aggregate([
      { $match: { sessionId, transactionType: 'deposit' } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
    ]);

    const withdrawals = await this.lineMessageModel.aggregate([
      { $match: { sessionId, transactionType: 'withdraw' } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
    ]);

    const totalTransactions = await this.lineMessageModel.countDocuments({ sessionId });

    return {
      success: true,
      summary: {
        deposits: deposits[0] || { total: 0, count: 0 },
        withdrawals: withdrawals[0] || { total: 0, count: 0 },
        totalTransactions,
        sessionId,
        sessionName: session.name,
        bankName: session.bankName,
        balance: session.balance,
      },
    };
  }

  // ============================================
  // Legacy Endpoints - LINE Account based (backward compatibility)
  // หมายเหตุ: Endpoints เหล่านี้ใช้ lineAccountId แทน sessionId
  // ============================================

  /**
   * Setup LINE session - save credentials, bank, and start login
   * Simple endpoint for users: just provide email, password, bank
   */
  @Post(':lineAccountId/setup')
  @ApiOperation({ summary: 'Setup LINE session with credentials and bank' })
  async setupLineSession(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @Body() body: {
      email: string;
      password: string;
      bankCode: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    const account = await this.validateLineAccountOwnership(lineAccountId, user.userId);

    if (!body.email || !body.password || !body.bankCode) {
      return { success: false, message: 'กรุณาระบุ Email, Password และธนาคาร' };
    }

    // Get bank info
    const bank = await this.bankListModel.findOne({ bankCode: body.bankCode, isActive: true });
    if (!bank) {
      return { success: false, message: 'ไม่พบธนาคารที่เลือก' };
    }

    // Save credentials to session
    await this.lineAutomationService.saveCredentials(lineAccountId, body.email, body.password);

    // Update session with bank info
    await this.lineSessionModel.updateOne(
      { lineAccountId, isActive: true },
      {
        $set: {
          bankCode: bank.bankCode,
          bankName: bank.bankNameTh,
        },
      },
      { upsert: true },
    );

    // Start enhanced login
    const result = await this.enhancedAutomationService.startLogin(
      lineAccountId,
      body.email,
      body.password,
      'manual',
    );

    return {
      ...result,
      bankCode: bank.bankCode,
      bankName: bank.bankNameTh,
    };
  }

  /**
   * Get saved credentials status (not the actual password)
   */
  @Get(':lineAccountId/credentials')
  @ApiOperation({ summary: 'Check if credentials are saved' })
  async getCredentialsStatus(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    const session = await this.lineSessionModel.findOne({ lineAccountId, isActive: true });

    return {
      success: true,
      hasCredentials: !!(session?.lineEmail && session?.linePassword),
      email: session?.lineEmail ? `${session.lineEmail.substring(0, 3)}***` : null,
      bankCode: session?.bankCode || null,
      bankName: session?.bankName || null,
    };
  }

  /**
   * Get session info for user's LINE Account
   */
  @Get(':lineAccountId')
  @ApiOperation({ summary: 'Get active session for LINE Account' })
  async getSession(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    return {
      success: true,
      session: session ? {
        lineAccountId: session.lineAccountId,
        hasKeys: !!(session.xLineAccess && session.xHmac),
        xLineAccess: session.xLineAccess ? `${session.xLineAccess.substring(0, 30)}...` : null,
        xHmac: session.xHmac ? `${session.xHmac.substring(0, 20)}...` : null,
        chatMid: session.chatMid,
        bankCode: session.bankCode,
        bankName: session.bankName,
        status: session.status,
        lastCheckedAt: session.lastCheckedAt,
        lastCheckResult: session.lastCheckResult,
        extractedAt: session.extractedAt,
        source: session.source,
        userAgent: session.userAgent,
        lineVersion: session.lineVersion,
      } : null,
    };
  }

  /**
   * Start enhanced login for user's LINE Account
   */
  @Post(':lineAccountId/enhanced-login')
  @ApiOperation({ summary: 'Start enhanced login with GSB-like features' })
  async startEnhancedLogin(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @Body() body: { email?: string; password?: string; source?: 'manual' | 'auto' | 'relogin' },
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    const result = await this.enhancedAutomationService.startLogin(
      lineAccountId,
      body.email,
      body.password,
      body.source || 'manual',
    );

    return result;
  }

  /**
   * Get enhanced login status for user's LINE Account
   */
  @Get(':lineAccountId/enhanced-login/status')
  @ApiOperation({ summary: 'Get enhanced login status' })
  async getEnhancedLoginStatus(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    return this.enhancedAutomationService.getWorkerStatus(lineAccountId);
  }

  /**
   * Cancel enhanced login for user's LINE Account
   */
  @Delete(':lineAccountId/enhanced-login')
  @ApiOperation({ summary: 'Cancel enhanced login' })
  async cancelEnhancedLogin(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    await this.enhancedAutomationService.cancelLogin(lineAccountId);
    return { success: true, message: 'ยกเลิกการเข้าสู่ระบบแล้ว' };
  }

  /**
   * Retry login after wrong PIN for user's LINE Account
   */
  @Post(':lineAccountId/retry-wrong-pin')
  @ApiOperation({ summary: 'Retry login after wrong PIN' })
  async retryWrongPin(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    const result = await this.enhancedAutomationService.retryLoginAfterWrongPin(lineAccountId);
    return result;
  }

  /**
   * Get cooldown info for user's LINE Account
   */
  @Get(':lineAccountId/cooldown')
  @ApiOperation({ summary: 'Get cooldown info' })
  async getCooldownInfo(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    return this.loginCoordinatorService.getCooldownInfo(lineAccountId);
  }

  /**
   * Reset cooldown for user's LINE Account
   */
  @Post(':lineAccountId/reset-cooldown')
  @ApiOperation({ summary: 'Reset cooldown for account' })
  async resetCooldown(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    this.enhancedAutomationService.resetCooldown(lineAccountId);
    return { success: true, message: 'รีเซ็ต cooldown แล้ว' };
  }

  /**
   * Get full keys for user's LINE Account (for copying)
   */
  @Get(':lineAccountId/keys')
  @ApiOperation({ summary: 'Get full keys for copying' })
  async getFullKeys(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    if (!session || !session.xLineAccess) {
      return {
        success: false,
        message: 'ไม่พบ Keys - กรุณาเข้าสู่ระบบ LINE ก่อน',
      };
    }

    return {
      success: true,
      keys: {
        xLineAccess: session.xLineAccess,
        xHmac: session.xHmac,
        chatMid: session.chatMid,
        userAgent: session.userAgent,
        lineVersion: session.lineVersion,
        extractedAt: session.extractedAt,
        status: session.status,
        cUrlBash: session.cUrlBash, // เพิ่ม cUrlBash สำหรับ copy
      },
    };
  }

  /**
   * Set keys manually for user's LINE Account
   */
  @Post(':lineAccountId/keys')
  @ApiOperation({ summary: 'Set keys manually' })
  async setKeys(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @Body() body: {
      xLineAccess: string;
      xHmac: string;
      userAgent?: string;
      lineVersion?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    if (!body.xLineAccess || !body.xHmac) {
      return { success: false, message: 'กรุณาระบุ xLineAccess และ xHmac' };
    }

    await this.keyStorageService.saveKeys({
      lineAccountId,
      xLineAccess: body.xLineAccess,
      xHmac: body.xHmac,
      userAgent: body.userAgent,
      lineVersion: body.lineVersion,
      source: 'manual_input',
      performedBy: user.userId,
    });

    return { success: true, message: 'บันทึก Keys สำเร็จ' };
  }

  /**
   * Validate keys for user's LINE Account
   * Check if existing keys are still valid by calling LINE API
   */
  @Post(':lineAccountId/validate-keys')
  @ApiOperation({ summary: 'Validate keys by calling LINE API' })
  async validateKeysForUser(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    const result = await this.sessionHealthService.validateKeysDirectly(lineAccountId);

    return {
      success: true,
      validation: result,
    };
  }

  /**
   * Get key history for user's LINE Account
   */
  @Get(':lineAccountId/history')
  @ApiOperation({ summary: 'Get key extraction history' })
  async getHistory(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateLineAccountOwnership(lineAccountId, user.userId);

    const history = await this.keyStorageService.getKeyHistory(lineAccountId, 10);
    return { success: true, history };
  }

  // ============================================
  // Auto-Fetch Status (Read-only for users)
  // ============================================

  /**
   * Get auto-fetch status for users
   * Shows current auto-fetch settings and countdown info
   */
  @Get('settings/auto-fetch-status')
  @ApiOperation({ summary: 'Get auto-fetch status (read-only)' })
  async getAutoFetchStatusForUser() {
    const status = this.messageFetchService.getAutoFetchStatus();

    return {
      success: true,
      isRunning: status.isRunning,
      config: {
        enabled: status.config.enabled,
        intervalSeconds: status.config.intervalSeconds,
      },
      lastFetchTime: status.lastFetchTime,
      stats: {
        totalFetches: status.stats.totalFetches,
        totalNewMessages: status.stats.totalNewMessages,
      },
    };
  }
}
