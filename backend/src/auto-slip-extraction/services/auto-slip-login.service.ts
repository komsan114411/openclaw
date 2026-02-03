import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { EnhancedAutomationService } from '../../line-session/services/enhanced-automation.service';
import { KeyStorageService } from '../../line-session/services/key-storage.service';
import { LineSession, LineSessionDocument } from '../../line-session/schemas/line-session.schema';
import { BankStateMachineService } from './bank-state-machine.service';
import { BankStatus } from '../constants/bank-status.enum';
import { SecurityUtil } from '../../utils/security.util';

import {
  AutoSlipBankAccount,
  AutoSlipBankAccountDocument,
} from '../schemas/auto-slip-bank-account.schema';
import {
  AutoSlipPinCode,
  AutoSlipPinCodeDocument,
} from '../schemas/auto-slip-pin-code.schema';
import {
  AutoSlipKeyHistory,
  AutoSlipKeyHistoryDocument,
} from '../schemas/auto-slip-key-history.schema';

export interface LoginResult {
  success: boolean;
  status: string;
  pinCode?: string;
  message?: string;
  error?: string;
}

/**
 * Auto-Slip Login Service
 *
 * Bridges Auto-Slip system with LINE-Session automation
 * - Triggers login via EnhancedAutomationService
 * - Stores PIN codes in Auto-Slip system
 * - Syncs keys back to Auto-Slip bank accounts
 */
@Injectable()
export class AutoSlipLoginService {
  private readonly logger = new Logger(AutoSlipLoginService.name);

  // Map bankAccountId -> lineSessionId for tracking
  private loginMapping = new Map<string, string>();

  constructor(
    @InjectModel(AutoSlipBankAccount.name)
    private bankAccountModel: Model<AutoSlipBankAccountDocument>,
    @InjectModel(AutoSlipPinCode.name)
    private pinCodeModel: Model<AutoSlipPinCodeDocument>,
    @InjectModel(AutoSlipKeyHistory.name)
    private keyHistoryModel: Model<AutoSlipKeyHistoryDocument>,
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @Inject(forwardRef(() => EnhancedAutomationService))
    private enhancedAutomationService: EnhancedAutomationService,
    @Inject(forwardRef(() => KeyStorageService))
    private keyStorageService: KeyStorageService,
    private stateMachineService: BankStateMachineService,
    private eventEmitter: EventEmitter2,
    private securityUtil: SecurityUtil,
  ) {}

  /**
   * Trigger login for a bank account
   */
  async triggerLogin(
    bankAccountId: string,
    email?: string,
    password?: string,
  ): Promise<LoginResult> {
    this.logger.log(`[AutoSlipLogin] Starting login for bank account: ${bankAccountId}`);

    try {
      // Get bank account
      const account = await this.bankAccountModel.findById(bankAccountId);
      if (!account) {
        return {
          success: false,
          status: 'error',
          error: 'Bank account not found',
        };
      }

      // Get credentials
      const loginEmail = email || account.lineEmail;
      // Decrypt stored password or use provided password
      const storedPassword = account.linePasswordEncrypted
        ? this.securityUtil.decrypt(account.linePasswordEncrypted)
        : '';
      const loginPassword = password || storedPassword;

      if (!loginEmail || !loginPassword) {
        return {
          success: false,
          status: 'error',
          error: 'Email and password are required',
        };
      }

      // Update credentials if provided
      if (email || password) {
        if (email) account.lineEmail = email;
        if (password) account.linePasswordEncrypted = this.securityUtil.encrypt(password);
        await account.save();
      }

      // Find or create LINE session for this bank account
      const lineSessionId = await this.findOrCreateLineSession(
        bankAccountId,
        account.userId,
        loginEmail,
        `Auto-Slip: ${account.bankType} ${account.accountNumber}`,
      );

      // Link LINE session to bank account (persists across restarts)
      if (!account.lineSessionId || account.lineSessionId.toString() !== lineSessionId) {
        account.lineSessionId = new Types.ObjectId(lineSessionId);
        await account.save();
        this.logger.log(`[AutoSlipLogin] Linked LINE session ${lineSessionId} to bank account ${bankAccountId}`);
      }

      // Update status to LOGGING_IN
      await this.stateMachineService.transition(
        bankAccountId,
        BankStatus.LOGGING_IN,
        { reason: 'Login triggered', triggeredBy: 'user' },
      );

      // Store mapping for callback (bankAccountId -> lineSessionId)
      this.loginMapping.set(bankAccountId, lineSessionId);

      // Call EnhancedAutomationService with LINE session ID
      // This ensures events will be emitted with the correct ID that we can correlate back
      const result = await this.enhancedAutomationService.startLogin(
        lineSessionId,
        loginEmail,
        loginPassword,
        'manual',
        true, // Force login (don't skip)
      );

      this.logger.log(`[AutoSlipLogin] Login result for ${bankAccountId}: ${JSON.stringify({
        success: result.success,
        status: result.status,
        hasPinCode: !!result.pinCode,
      })}`);

      // Handle PIN code
      if (result.pinCode) {
        // Store PIN in Auto-Slip system
        await this.storePinCode(bankAccountId, result.pinCode);

        // Update status to AWAITING_PIN
        await this.stateMachineService.transition(
          bankAccountId,
          BankStatus.AWAITING_PIN,
          { reason: 'PIN displayed', triggeredBy: 'system' },
        );

        // Emit event for frontend
        this.eventEmitter.emit('auto-slip.pin-displayed', {
          bankAccountId,
          pinCode: result.pinCode,
          expiresAt: new Date(Date.now() + 3 * 60 * 1000), // 3 minutes
        });
      }

      // Handle success (keys captured)
      if (result.success && result.keys) {
        await this.handleKeysCapture(bankAccountId, result.keys);
      }

      return {
        success: result.status === 'pin_displayed' || result.success,
        status: result.status,
        pinCode: result.pinCode,
        message: result.message,
      };
    } catch (error: any) {
      this.logger.error(`[AutoSlipLogin] Login error: ${error.message}`);

      // Update status to ERROR_SOFT
      await this.stateMachineService.transition(
        bankAccountId,
        BankStatus.ERROR_SOFT,
        { reason: error.message, triggeredBy: 'system' },
      );

      return {
        success: false,
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Store PIN code in database
   */
  private async storePinCode(bankAccountId: string, pinCode: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes

    // Expire old PINs
    await this.pinCodeModel.updateMany(
      {
        bankAccountId: new Types.ObjectId(bankAccountId),
        status: { $in: ['fresh', 'new'] },
      },
      { status: 'old' },
    );

    // Create new PIN record
    await this.pinCodeModel.create({
      bankAccountId: new Types.ObjectId(bankAccountId),
      pinCode,
      status: 'fresh',
      expiresAt,
      createdAt: new Date(),
    });

    this.logger.log(`[AutoSlipLogin] Stored PIN ${pinCode} for ${bankAccountId}`);
  }

  /**
   * Handle keys capture from login
   */
  private async handleKeysCapture(
    bankAccountId: string,
    keys: { xLineAccess: string; xHmac: string; chatMid?: string },
    cUrlBash?: string,
  ): Promise<void> {
    this.logger.log(`[AutoSlipLogin] Handling keys capture for ${bankAccountId}, hasCurl: ${!!cUrlBash}`);

    try {
      // Update bank account with keys and cURL
      const updateData: any = {
        xLineAccess: keys.xLineAccess,
        xHmac: keys.xHmac,
        chatMid: keys.chatMid || undefined,
        keysExtractedAt: new Date(),
        lastKeyCheck: new Date(),
      };

      // Add cURL if available
      if (cUrlBash) {
        updateData.cUrlBash = cUrlBash;
      }

      await this.bankAccountModel.updateOne(
        { _id: new Types.ObjectId(bankAccountId) },
        updateData,
      );

      // Record key history
      await this.keyHistoryModel.create({
        bankAccountId: new Types.ObjectId(bankAccountId),
        xLineAccessPreview: keys.xLineAccess.substring(0, 20) + '...',
        xHmacPreview: keys.xHmac.substring(0, 20) + '...',
        extractedAt: new Date(),
        source: 'auto_login',
        status: 'success',
        performedBy: 'system',
      });

      // Update status to KEYS_READY
      await this.stateMachineService.transition(
        bankAccountId,
        BankStatus.KEYS_READY,
        { reason: 'Keys captured from login', triggeredBy: 'system' },
      );

      // Emit success event
      this.eventEmitter.emit('auto-slip.keys-captured', {
        bankAccountId,
        hasKeys: true,
      });

      this.logger.log(`[AutoSlipLogin] Keys saved for ${bankAccountId}`);
    } catch (error: any) {
      this.logger.error(`[AutoSlipLogin] Error saving keys: ${error.message}`);
    }
  }

  /**
   * Listen for Enhanced-Login status events
   * This listens to 'enhanced-login.status' which is emitted by EnhancedAutomationService
   */
  @OnEvent('enhanced-login.status')
  async onEnhancedLoginStatus(data: {
    lineAccountId: string;
    status: string;
    pinCode?: string;
    keys?: { xLineAccess: string; xHmac: string; chatMid?: string };
    chatMid?: string;
    cUrlBash?: string;
  }): Promise<void> {
    const { lineAccountId, status, pinCode, keys, chatMid, cUrlBash } = data;

    this.logger.log(`[AutoSlipLogin] Received event: ${status} for ${lineAccountId}`);

    // Check if this lineAccountId corresponds to an Auto-Slip bank account
    // Try multiple lookup strategies:
    // 1. By _id (if bankAccountId was passed to startLogin)
    // 2. By lineSessionId (if LINE session ID was linked to bank account)
    // 3. By in-memory mapping (for current session)
    let bankAccount = await this.bankAccountModel.findById(lineAccountId);

    if (!bankAccount) {
      // Try to find by lineSessionId field
      bankAccount = await this.bankAccountModel.findOne({
        lineSessionId: lineAccountId,
        isActive: true,
      });
    }

    if (!bankAccount) {
      // Try in-memory mapping (for current session only)
      const mappedBankAccountId = this.findBankAccountIdByLineSession(lineAccountId);
      if (mappedBankAccountId) {
        bankAccount = await this.bankAccountModel.findById(mappedBankAccountId);
      }
    }

    if (!bankAccount) {
      // Not an Auto-Slip bank account, might be a regular LINE session
      this.logger.debug(`[AutoSlipLogin] Not a bank account, ignoring: ${lineAccountId}`);
      return;
    }

    const bankAccountId = bankAccount._id.toString();
    this.logger.log(`[AutoSlipLogin] Processing status update: ${status} for ${bankAccountId}`);

    // Emit status update to frontend
    this.eventEmitter.emit('auto-slip.login-status', {
      bankAccountId,
      status,
      pinCode,
    });

    // Handle different statuses
    switch (status) {
      case 'pin_displayed':
        if (pinCode) {
          await this.storePinCode(bankAccountId, pinCode);
          await this.stateMachineService.transition(
            bankAccountId,
            BankStatus.AWAITING_PIN,
            { reason: 'PIN displayed', triggeredBy: 'system' },
          );
        }
        break;

      case 'success':
        this.logger.log(`[AutoSlipLogin] Success received for ${bankAccountId}, keys: ${keys ? 'YES' : 'NO'}, chatMid: ${chatMid || 'NO'}, cUrl: ${cUrlBash ? 'YES' : 'NO'}`);
        if (keys) {
          // Merge chatMid into keys if provided separately
          const keysWithChatMid = {
            ...keys,
            chatMid: keys.chatMid || chatMid,
          };
          await this.handleKeysCapture(bankAccountId, keysWithChatMid, cUrlBash);
        } else {
          // Even without keys, try to get them from the LINE session via keyStorageService
          this.logger.warn(`[AutoSlipLogin] No keys in success event for ${bankAccountId}, trying to fetch from session`);
          try {
            const session = await this.keyStorageService.getActiveSession(bankAccountId);
            if (session?.xLineAccess && session?.xHmac) {
              await this.handleKeysCapture(bankAccountId, {
                xLineAccess: session.xLineAccess,
                xHmac: session.xHmac,
                chatMid: session.chatMid || chatMid,
              }, (session as any).cUrlBash || cUrlBash);
            }
          } catch (err: any) {
            this.logger.error(`[AutoSlipLogin] Failed to fetch keys from session: ${err.message}`);
          }
        }
        this.loginMapping.delete(bankAccountId);
        break;

      case 'failed':
      case 'error':
        await this.stateMachineService.transition(
          bankAccountId,
          BankStatus.ERROR_SOFT,
          { reason: 'Login failed', triggeredBy: 'system' },
        );
        this.loginMapping.delete(bankAccountId);
        break;
    }
  }

  /**
   * Get current login status for a bank account
   */
  async getLoginStatus(bankAccountId: string): Promise<{
    status: string;
    pinCode?: string;
    pinExpiresAt?: Date;
    hasKeys: boolean;
    message?: string;
  }> {
    const account = await this.bankAccountModel.findById(bankAccountId);
    if (!account) {
      return { status: 'not_found', hasKeys: false };
    }

    const activePIN = await this.pinCodeModel.findOne({
      bankAccountId: new Types.ObjectId(bankAccountId),
      status: { $in: ['fresh', 'new'] },
      expiresAt: { $gt: new Date() },
    });

    return {
      status: account.status,
      pinCode: activePIN?.pinCode,
      pinExpiresAt: activePIN?.expiresAt,
      hasKeys: !!(account.xLineAccess && account.xHmac),
      message: this.getStatusMessage(account.status),
    };
  }

  /**
   * Get human-readable status message
   */
  private getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      [BankStatus.DISABLED]: 'บัญชีถูกปิดใช้งาน',
      [BankStatus.INIT]: 'กรุณาเริ่มต้นล็อกอิน',
      [BankStatus.LOGIN_REQUIRED]: 'กรุณาล็อกอินใหม่',
      [BankStatus.LOGGING_IN]: 'กำลังล็อกอิน...',
      [BankStatus.AWAITING_PIN]: 'รอยืนยัน PIN บนมือถือ',
      [BankStatus.LOGGED_IN]: 'ล็อกอินสำเร็จ กำลังดึง Keys',
      [BankStatus.KEYS_READY]: 'พร้อมใช้งาน',
      [BankStatus.ACTIVE]: 'ระบบกำลังทำงานอัตโนมัติ',
      [BankStatus.ERROR_SOFT]: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
      [BankStatus.ERROR_FATAL]: 'เกิดข้อผิดพลาดร้ายแรง',
    };
    return messages[status] || status;
  }

  /**
   * Find bank account ID by LINE session ID from in-memory mapping
   * Note: This mapping is lost on server restart, so we also store lineSessionId in DB
   */
  private findBankAccountIdByLineSession(lineSessionId: string): string | null {
    for (const [bankAccountId, sessionId] of this.loginMapping.entries()) {
      if (sessionId === lineSessionId) {
        return bankAccountId;
      }
    }
    return null;
  }

  /**
   * Link a LINE session ID to a bank account
   * This allows events from LINE session to be correlated with bank account
   */
  async linkLineSession(bankAccountId: string, lineSessionId: string): Promise<void> {
    this.logger.log(`[AutoSlipLogin] Linking LINE session ${lineSessionId} to bank account ${bankAccountId}`);

    // Update database
    await this.bankAccountModel.updateOne(
      { _id: new Types.ObjectId(bankAccountId) },
      { lineSessionId: new Types.ObjectId(lineSessionId) },
    );

    // Update in-memory mapping
    this.loginMapping.set(bankAccountId, lineSessionId);
  }

  /**
   * Get linked LINE session ID for a bank account
   */
  async getLinkedLineSession(bankAccountId: string): Promise<string | null> {
    const account = await this.bankAccountModel.findById(bankAccountId).select('lineSessionId');
    return account?.lineSessionId?.toString() || null;
  }

  /**
   * Find or create a LINE session for a bank account
   * Returns the LINE session ID
   */
  private async findOrCreateLineSession(
    bankAccountId: string,
    userId: Types.ObjectId,
    email: string,
    name: string,
  ): Promise<string> {
    // First, check if bank account already has a linked LINE session
    const existingAccount = await this.bankAccountModel.findById(bankAccountId).select('lineSessionId');
    if (existingAccount?.lineSessionId) {
      const existingSession = await this.lineSessionModel.findById(existingAccount.lineSessionId);
      if (existingSession && existingSession.isActive) {
        this.logger.log(`[AutoSlipLogin] Using existing LINE session: ${existingSession._id}`);
        return existingSession._id.toString();
      }
    }

    // Check if there's a LINE session with lineAccountId = bankAccountId
    let session = await this.lineSessionModel.findOne({
      lineAccountId: bankAccountId,
      isActive: true,
    });

    if (session) {
      this.logger.log(`[AutoSlipLogin] Found LINE session by lineAccountId: ${session._id}`);
      return session._id.toString();
    }

    // Check if there's a LINE session with the same email
    session = await this.lineSessionModel.findOne({
      email: email,
      isActive: true,
    });

    if (session) {
      this.logger.log(`[AutoSlipLogin] Found LINE session by email: ${session._id}`);
      return session._id.toString();
    }

    // Create a new LINE session
    this.logger.log(`[AutoSlipLogin] Creating new LINE session for bank account: ${bankAccountId}`);
    const newSession = await this.lineSessionModel.create({
      ownerId: userId,
      lineAccountId: bankAccountId, // Use bankAccountId as lineAccountId for correlation
      email: email,
      name: name,
      status: 'pending',
      isActive: true,
      source: 'auto-slip',
    });

    this.logger.log(`[AutoSlipLogin] Created LINE session: ${newSession._id}`);
    return newSession._id.toString();
  }
}
