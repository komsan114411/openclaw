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
import { SystemSettingsService } from './system-settings.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { HealthService } from '../health/health.service';
import { TasksService } from '../tasks/tasks.service';

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
    @Body() account: { bankName: string; accountNumber: string; accountName: string },
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
    
    return {
      success: true,
      publicBaseUrl: settings?.publicBaseUrl || '',
      bankAccounts: settings?.paymentBankAccounts || [],
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
}
