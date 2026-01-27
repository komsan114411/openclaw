import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Inject,
  forwardRef,
  Optional,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemSettingsService } from './system-settings.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, AuthService } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { HealthService } from '../health/health.service';
import { TasksService } from '../tasks/tasks.service';
import { Bank } from '../database/schemas/bank.schema';
import { BlockchainVerificationService } from '../wallet/blockchain-verification.service';

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('system-settings')
export class SystemSettingsController {
  private readonly logger = new Logger(SystemSettingsController.name);

  constructor(
    private settingsService: SystemSettingsService,
    private blockchainVerificationService: BlockchainVerificationService,
    private authService: AuthService,
    @Optional() @Inject(forwardRef(() => HealthService))
    private healthService?: HealthService,
    @Optional() @Inject(forwardRef(() => TasksService))
    private tasksService?: TasksService,
    @InjectModel(Bank.name)
    private bankModel?: Model<Bank>,
  ) { }

  // ===============================
  // PUBLIC ENDPOINTS (No Auth Required)
  // ===============================

  @Get('access-status')
  @ApiOperation({ summary: 'Get system access status (public - no auth required)' })
  async getAccessStatus() {
    const settings = await this.settingsService.getSettings();

    return {
      success: true,
      allowRegistration: settings?.allowRegistration ?? true,
      allowLogin: settings?.allowLogin ?? true,
      registrationDisabledMessage: settings?.registrationDisabledMessage || 'ระบบปิดรับสมัครสมาชิกใหม่ชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
      loginDisabledMessage: settings?.loginDisabledMessage || 'ระบบปิดให้บริการเข้าสู่ระบบชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
    };
  }

  // ===============================
  // ADMIN ENDPOINTS
  // ===============================

  @Get('access-control')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get access control settings (Admin only)' })
  async getAccessControl() {
    const settings = await this.settingsService.getSettings();

    return {
      success: true,
      accessControl: {
        allowRegistration: settings?.allowRegistration ?? true,
        registrationDisabledMessage: settings?.registrationDisabledMessage || 'ระบบปิดรับสมัครสมาชิกใหม่ชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
        allowLogin: settings?.allowLogin ?? true,
        loginDisabledMessage: settings?.loginDisabledMessage || 'ระบบปิดให้บริการเข้าสู่ระบบชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
      },
    };
  }

  @Put('access-control')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update access control settings (Admin only)' })
  async updateAccessControl(
    @Body() updates: {
      allowRegistration?: boolean;
      registrationDisabledMessage?: string;
      allowLogin?: boolean;
      loginDisabledMessage?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.settingsService.updateSettings(updates, user.userId);

    // If login is being disabled, kick all non-admin users immediately
    if (success && updates.allowLogin === false) {
      const kickedCount = await this.authService.invalidateAllNonAdminSessions();
      this.logger.log(`Login disabled - kicked ${kickedCount} non-admin sessions`);

      return {
        success,
        message: `ปิดการเข้าสู่ระบบสำเร็จ ยกเลิก session ผู้ใช้ ${kickedCount} คน`,
        kickedSessions: kickedCount,
      };
    }

    return {
      success,
      message: success ? 'บันทึกการตั้งค่าการเข้าถึงสำเร็จ' : 'ไม่สามารถบันทึกการตั้งค่าได้',
    };
  }

  @Post('test-usdt-api')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Test USDT API connection' })
  async testUsdtApiConnection(@Body() body: { network: 'TRC20' | 'ERC20' | 'BEP20', apiKey: string }) {
    // Get the API key to test
    let keyToTest = body.apiKey;

    // If key is masked or empty, fetch DECRYPTED key from database
    if (!keyToTest || keyToTest.includes('....') || keyToTest.includes('***') || keyToTest.length < 10) {
      this.logger.log(`Fetching ${body.network} API key from database (decrypted)...`);
      // Use getDecryptedSettings() to get the actual API key, not the masked version
      const settings = await this.settingsService.getDecryptedSettings();

      if (!settings) {
        return {
          success: false,
          status: 'error',
          message: 'ไม่สามารถโหลดการตั้งค่าระบบได้',
        };
      }

      if (body.network === 'ERC20') {
        keyToTest = settings.etherscanApiKey || '';
      } else if (body.network === 'BEP20') {
        keyToTest = settings.bscscanApiKey || '';
      } else if (body.network === 'TRC20') {
        keyToTest = settings.tronscanApiKey || '';
      }

      this.logger.log(`Got decrypted key from DB (length: ${keyToTest?.length || 0})`);

      if (!keyToTest) {
        return {
          success: false,
          status: 'error',
          message: `ยังไม่ได้ตั้งค่า ${body.network} API Key กรุณาบันทึก API Key ก่อนทดสอบ`,
        };
      }
    }

    return this.blockchainVerificationService.testApiKey(body.network, keyToTest);
  }

  @Get()
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get system settings (Admin only)' })
  async getSettings() {
    const settings = await this.settingsService.getSettings();

    if (!settings) {
      return { success: false, settings: null };
    }

    // Map paymentBankAccounts to bankAccounts for frontend compatibility
    const result = {
      success: true,
      settings: {
        ...settings,
        // Map paymentBankAccounts to bankAccounts (frontend expects this)
        bankAccounts: settings.paymentBankAccounts || [],
      },
    };

    return result;
  }


  @Put()
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update system settings (Admin only)' })
  async updateSettings(
    @Body() updates: any,
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.settingsService.updateSettings(updates, user.userId);
    return {
      success,
      message: success ? 'บันทึกการตั้งค่าสำเร็จ' : 'ไม่สามารถบันทึกการตั้งค่าได้',
    };
  }

  @Post('bank-accounts')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add bank account (Admin only)' })
  async addBankAccount(
    @Body() account: { bankName: string; accountNumber: string; accountName: string; bankCode?: string },
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.settingsService.addBankAccount(account as any, user.userId);
    return {
      success,
      message: success ? 'เพิ่มบัญชีธนาคารสำเร็จ' : 'เลขบัญชีนี้มีอยู่แล้ว',
    };
  }

  @Delete('bank-accounts/:index')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove bank account (Admin only)' })
  async removeBankAccount(
    @Param('index') index: number,
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.settingsService.removeBankAccount(index, user.userId);
    return {
      success,
      message: success ? 'ลบบัญชีธนาคารสำเร็จ' : 'ไม่พบบัญชีธนาคาร',
    };
  }

  @Get('api-status')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get API status (Admin only)' })
  async getApiStatus() {
    const status = await this.settingsService.getApiStatus();
    return {
      success: true,
      apiStatus: status,
    };
  }

  @Get('payment-info')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get payment information (for authenticated users)' })
  async getPaymentInfo() {
    const settings = await this.settingsService.getSettings();
    const accounts = settings?.paymentBankAccounts || [];

    // Enrich bank accounts with bank details (logo/name) for frontend display
    const banksByCode = new Map<string, any>();
    if (this.bankModel) {
      const codes = Array.from(
        new Set(
          accounts
            .map((a: any) => (a.bankCode ? String(a.bankCode).toUpperCase() : ''))
            .filter(Boolean),
        ),
      );
      if (codes.length > 0) {
        const banks = await this.bankModel
          .find({ code: { $in: codes } })
          .select({ code: 1, name: 1, nameTh: 1, nameEn: 1, shortName: 1, logoUrl: 1, logoBase64: 1, isActive: 1 })
          .lean()
          .exec();
        for (const b of banks) {
          banksByCode.set(String((b as any).code).toUpperCase(), b);
        }
      }
    }

    return {
      success: true,
      publicBaseUrl: settings?.publicBaseUrl || '',
      bankAccounts: accounts.map((a: any) => {
        const bankCode = a.bankCode ? String(a.bankCode).toUpperCase() : undefined;
        const bank = bankCode ? banksByCode.get(bankCode) : undefined;
        return {
          bankName: a.bankName,
          accountNumber: a.accountNumber,
          accountName: a.accountName,
          bankCode: bankCode || a.bankCode,
          bank: bank
            ? {
              code: bank.code,
              name: bank.name,
              nameTh: bank.nameTh,
              nameEn: bank.nameEn,
              shortName: bank.shortName,
              logoUrl: bank.logoUrl,
              logoBase64: bank.logoBase64,
            }
            : undefined,
        };
      }),
      usdtWallet: {
        enabled: settings?.usdtEnabled ?? true,
        address: settings?.usdtWalletAddress || '',
        network: settings?.usdtNetwork || 'TRC20',
        qrImage: settings?.usdtQrImage || '',
        disabledMessage: settings?.usdtDisabledMessage || '',
      },
    };
  }

  @Get('message-settings')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all message settings (Admin only)' })
  async getMessageSettings() {
    const settings = await this.settingsService.getSettings();

    // Control flags only - messages are now managed via SystemResponseTemplates
    return {
      success: true,
      messageSettings: {
        quotaWarningEnabled: settings?.quotaWarningEnabled ?? true,
        quotaWarningThreshold: settings?.quotaWarningThreshold || 10,
        botDisabledSendMessage: settings?.botDisabledSendMessage ?? false,
        slipDisabledSendMessage: settings?.slipDisabledSendMessage ?? true,
        aiDisabledSendMessage: settings?.aiDisabledSendMessage ?? false,
        duplicateRefundEnabled: settings?.duplicateRefundEnabled ?? true,
        showSlipProcessingMessage: settings?.showSlipProcessingMessage ?? true,
      },
    };
  }

  @Put('message-settings')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update message settings (Admin only)' })
  async updateMessageSettings(
    @Body() updates: any,
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.settingsService.updateSettings(updates, user.userId);
    return {
      success,
      message: success ? 'บันทึกการตั้งค่าข้อความสำเร็จ' : 'ไม่สามารถบันทึกการตั้งค่าได้',
    };
  }

  @Get('system-health')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get system health status (Admin only)' })
  async getSystemHealth() {
    if (!this.healthService) {
      return {
        success: false,
        message: 'Health service not available',
      };
    }

    const health = await this.healthService.checkHealth(true);
    return {
      success: true,
      health,
    };
  }

  @Post('run-cleanup')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Run system cleanup tasks (Admin only)' })
  async runCleanup() {
    if (!this.tasksService) {
      return {
        success: false,
        message: 'Tasks service not available',
      };
    }

    const results = await this.tasksService.runCleanupNow();
    return {
      success: true,
      message: 'Cleanup completed',
      results,
    };
  }

  @Get('contact-info')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get contact information' })
  async getContactInfo() {
    const settings = await this.settingsService.getSettings();

    return {
      success: true,
      contact: {
        url: settings?.contactAdminUrl || '',
        line: settings?.contactAdminLine || '',
        email: settings?.contactAdminEmail || '',
      },
    };
  }

  @Get('preview-config')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get slip preview configuration (for authenticated users)' })
  async getPreviewConfig() {
    const settings = await this.settingsService.getSettings();

    return {
      success: true,
      previewConfig: {
        senderName: settings?.previewSenderName || 'นาย ธันเดอร์ มานะ',
        receiverName: settings?.previewReceiverName || 'นาย ธันเดอร์ มานะ',
        senderBankCode: settings?.previewSenderBankCode || '004',
        receiverBankCode: settings?.previewReceiverBankCode || '014',
        amount: settings?.previewAmount || '1,000.00',
      },
    };
  }

  // ===============================
  // AI SETTINGS ENDPOINTS
  // ===============================

  @Get('ai-settings')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get AI settings (for authenticated users)' })
  async getAiSettings(@CurrentUser() user: AuthUser) {
    const settings = await this.settingsService.getSettings();

    // Base info for all users
    const baseInfo = {
      globalAiEnabled: settings?.globalAiEnabled ?? true,
      allowedAiModels: settings?.allowedAiModels || ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
    };

    // Admin-only info
    if (user.role === UserRole.ADMIN) {
      return {
        success: true,
        ...baseInfo,
        aiSettings: {
          ...baseInfo,
          aiModel: settings?.aiModel || 'gpt-4-mini',
          aiDisabledSendMessage: settings?.aiDisabledSendMessage ?? false,
          aiQuotaExhaustedSendMessage: settings?.aiQuotaExhaustedSendMessage ?? true,
        },
      };
    }

    // User gets limited info
    return {
      success: true,
      ...baseInfo,
    };
  }

  @Put('ai-settings')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update AI settings (Admin only)' })
  async updateAiSettings(
    @Body() updates: {
      globalAiEnabled?: boolean;
      allowedAiModels?: string[];
      aiModel?: string;
      aiDisabledSendMessage?: boolean;
      aiQuotaExhaustedSendMessage?: boolean;
    },
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.settingsService.updateSettings(updates, user.userId);

    return {
      success,
      message: success ? 'บันทึกการตั้งค่า AI สำเร็จ' : 'ไม่สามารถบันทึกการตั้งค่าได้',
    };
  }

  @Put('ai-toggle')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Toggle global AI (Admin only)' })
  async toggleGlobalAi(
    @Body() body: { enabled: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.settingsService.updateSettings(
      { globalAiEnabled: body.enabled },
      user.userId,
    );

    return {
      success,
      message: success
        ? body.enabled
          ? 'เปิดใช้งาน AI ทั้งระบบแล้ว'
          : 'ปิดใช้งาน AI ทั้งระบบแล้ว'
        : 'ไม่สามารถบันทึกการตั้งค่าได้',
    };
  }
}
