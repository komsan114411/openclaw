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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemSettingsService } from './system-settings.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { HealthService } from '../health/health.service';
import { TasksService } from '../tasks/tasks.service';
import { Bank } from '../database/schemas/bank.schema';

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('system-settings')
export class SystemSettingsController {
  constructor(
    private settingsService: SystemSettingsService,
    @Optional() @Inject(forwardRef(() => HealthService))
    private healthService?: HealthService,
    @Optional() @Inject(forwardRef(() => TasksService))
    private tasksService?: TasksService,
    @InjectModel(Bank.name)
    private bankModel?: Model<Bank>,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get system settings (Admin only)' })
  async getSettings() {
    const settings = await this.settingsService.getSettings();
    
    // Hide sensitive data
    const safeSettings: any = {};
    if (settings) {
      safeSettings.publicBaseUrl = settings.publicBaseUrl || '';
      safeSettings.slipApiKeyPreview = settings.slipApiKey
        ? settings.slipApiKey.substring(0, 10) + '...'
        : '';
      safeSettings.aiApiKeyPreview = settings.aiApiKey
        ? settings.aiApiKey.substring(0, 10) + '...'
        : '';
      safeSettings.slipApiProvider = settings.slipApiProvider;
      safeSettings.aiModel = settings.aiModel;
      safeSettings.bankAccounts = settings.paymentBankAccounts;
      safeSettings.usdtEnabled = settings.usdtEnabled;
      safeSettings.usdtNetwork = settings.usdtNetwork;
      safeSettings.usdtWalletAddress = settings.usdtWalletAddress;
      safeSettings.usdtQrImage = settings.usdtQrImage;
      safeSettings.usdtDisabledMessage = settings.usdtDisabledMessage;
      safeSettings.quotaExceededResponseType = settings.quotaExceededResponseType;
      safeSettings.quotaExceededMessage = settings.quotaExceededMessage;
      safeSettings.quotaWarningThreshold = settings.quotaWarningThreshold;
      safeSettings.quotaWarningEnabled = settings.quotaWarningEnabled;
      safeSettings.duplicateRefundEnabled = settings.duplicateRefundEnabled;
      safeSettings.contactAdminUrl = settings.contactAdminUrl;
      safeSettings.contactAdminLine = settings.contactAdminLine;
      safeSettings.contactAdminEmail = settings.contactAdminEmail;
      // Preview settings
      safeSettings.previewSenderName = settings.previewSenderName || 'นาย ธันเดอร์ มานะ';
      safeSettings.previewReceiverName = settings.previewReceiverName || 'นาย ธันเดอร์ มานะ';
      safeSettings.previewSenderBankCode = settings.previewSenderBankCode || '004';
      safeSettings.previewReceiverBankCode = settings.previewReceiverBankCode || '014';
      safeSettings.previewAmount = settings.previewAmount || '1,000.00';
      // Rate Limiter settings
      safeSettings.webhookRateLimitEnabled = settings.webhookRateLimitEnabled ?? true;
      safeSettings.webhookRateLimitPerAccountPerSecond = settings.webhookRateLimitPerAccountPerSecond ?? 10;
      safeSettings.webhookRateLimitPerAccountPerMinute = settings.webhookRateLimitPerAccountPerMinute ?? 100;
      safeSettings.webhookRateLimitGlobalPerSecond = settings.webhookRateLimitGlobalPerSecond ?? 100;
      safeSettings.webhookRateLimitGlobalPerMinute = settings.webhookRateLimitGlobalPerMinute ?? 1000;
      safeSettings.webhookRateLimitMessage = settings.webhookRateLimitMessage || 'Too many requests, please try again later';
    }

    return {
      success: true,
      settings: safeSettings,
    };
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
    
    return {
      success: true,
      messageSettings: {
        quotaExceededMessage: settings?.quotaExceededMessage || '',
        quotaExceededResponseType: settings?.quotaExceededResponseType || 'text',
        quotaWarningEnabled: settings?.quotaWarningEnabled ?? true,
        quotaWarningThreshold: settings?.quotaWarningThreshold || 10,
        quotaLowWarningMessage: settings?.quotaLowWarningMessage || '',
        botDisabledSendMessage: settings?.botDisabledSendMessage ?? false,
        botDisabledMessage: settings?.botDisabledMessage || '',
        slipDisabledSendMessage: settings?.slipDisabledSendMessage ?? false,
        slipDisabledMessage: settings?.slipDisabledMessage || '',
        aiDisabledSendMessage: settings?.aiDisabledSendMessage ?? false,
        aiDisabledMessage: settings?.aiDisabledMessage || '',
        duplicateRefundEnabled: settings?.duplicateRefundEnabled ?? true,
        duplicateSlipMessage: settings?.duplicateSlipMessage || '',
        slipErrorMessage: settings?.slipErrorMessage || '',
        imageDownloadErrorMessage: settings?.imageDownloadErrorMessage || '',
        invalidImageMessage: settings?.invalidImageMessage || '',
        slipProcessingMessage: settings?.slipProcessingMessage || '',
        showSlipProcessingMessage: settings?.showSlipProcessingMessage ?? true,
        maxRetryAttempts: settings?.maxRetryAttempts || 3,
        retryDelayMs: settings?.retryDelayMs || 1000,
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
}
