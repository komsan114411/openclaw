import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { EnhancedAutomationService } from '../../line-session/services/enhanced-automation.service';
import { KeyStorageService } from '../../line-session/services/key-storage.service';
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

      // Update status to LOGGING_IN
      await this.stateMachineService.transition(
        bankAccountId,
        BankStatus.LOGGING_IN,
        { reason: 'Login triggered', triggeredBy: 'user' },
      );

      // Store mapping for callback
      this.loginMapping.set(bankAccountId, bankAccountId);

      // Call EnhancedAutomationService
      // Note: We use bankAccountId as the session identifier
      const result = await this.enhancedAutomationService.startLogin(
        bankAccountId,
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
  ): Promise<void> {
    this.logger.log(`[AutoSlipLogin] Handling keys capture for ${bankAccountId}`);

    try {
      // Update bank account with keys
      await this.bankAccountModel.updateOne(
        { _id: new Types.ObjectId(bankAccountId) },
        {
          xLineAccess: keys.xLineAccess,
          xHmac: keys.xHmac,
          chatMid: keys.chatMid || undefined,
          keysExtractedAt: new Date(),
          lastKeyCheck: new Date(),
        },
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
   * Listen for LINE-Session login status events
   */
  @OnEvent('line-session.login-status')
  async onLineSessionLoginStatus(data: {
    lineAccountId: string;
    status: string;
    pinCode?: string;
    keys?: { xLineAccess: string; xHmac: string; chatMid?: string };
  }): Promise<void> {
    const { lineAccountId, status, pinCode, keys } = data;

    // Check if this is an Auto-Slip managed login
    if (!this.loginMapping.has(lineAccountId)) {
      return;
    }

    const bankAccountId = lineAccountId;
    this.logger.log(`[AutoSlipLogin] Received status update: ${status} for ${bankAccountId}`);

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
        if (keys) {
          await this.handleKeysCapture(bankAccountId, keys);
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
}
