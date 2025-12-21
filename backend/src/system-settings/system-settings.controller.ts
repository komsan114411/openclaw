import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SystemSettingsService } from './system-settings.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('system-settings')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SystemSettingsController {
  constructor(private settingsService: SystemSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get system settings (Admin only)' })
  async getSettings() {
    const settings = await this.settingsService.getSettings();
    
    // Hide sensitive data
    const safeSettings: any = {};
    if (settings) {
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
  @ApiOperation({ summary: 'Get API status (Admin only)' })
  async getApiStatus() {
    const status = await this.settingsService.getApiStatus();
    return {
      success: true,
      apiStatus: status,
    };
  }

  @Get('payment-info')
  @ApiOperation({ summary: 'Get payment information (for users)' })
  async getPaymentInfo() {
    const settings = await this.settingsService.getSettings();
    
    return {
      success: true,
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
}
