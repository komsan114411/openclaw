import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LineAccountsService } from './line-accounts.service';
import { CreateLineAccountDto } from './dto/create-line-account.dto';
import { UpdateLineAccountDto } from './dto/update-line-account.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';

@ApiTags('LINE Accounts')
@ApiBearerAuth()
@Controller('line-accounts')
@UseGuards(SessionAuthGuard)
export class LineAccountsController {
  constructor(private lineAccountsService: LineAccountsService) { }

  @Post()
  @ApiOperation({ summary: 'Create LINE account' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLineAccountDto,
  ) {
    const account = await this.lineAccountsService.create(user.userId, dto);
    return {
      success: true,
      message: 'สร้างบัญชี LINE สำเร็จ',
      account,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all LINE accounts' })
  async findAll(@CurrentUser() user: AuthUser) {
    let accounts;
    if (user.role === UserRole.ADMIN) {
      accounts = await this.lineAccountsService.findAll();
    } else {
      accounts = await this.lineAccountsService.findByOwner(user.userId);
    }
    return {
      success: true,
      accounts,
    };
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my LINE accounts' })
  async findMyAccounts(@CurrentUser() user: AuthUser) {
    const accounts = await this.lineAccountsService.findByOwner(user.userId);
    return {
      success: true,
      accounts,
    };
  }

  @Get('my/templates')
  @ApiOperation({ summary: 'Get all templates owned by current user' })
  async getMyTemplates(@CurrentUser() user: AuthUser) {
    const templates = await this.lineAccountsService.getTemplatesByOwner(user.userId);
    return {
      success: true,
      templates: templates.map((t) => ({
        _id: t._id,
        name: t.name,
        type: t.type,
        isDefault: t.isDefault,
        isGlobal: t.isGlobal,
        description: t.description,
        // Design fields for preview
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        headerText: t.headerText,
        footerText: t.footerText,
        // Display toggle fields
        showAmount: t.showAmount ?? true,
        showSender: t.showSender ?? true,
        showReceiver: t.showReceiver ?? true,
        showDate: t.showDate ?? true,
        showTime: t.showTime ?? true,
        showTransRef: t.showTransRef ?? true,
        showBankLogo: t.showBankLogo ?? true,
        showFee: t.showFee ?? false,
        showSenderAccount: t.showSenderAccount ?? false,
        showReceiverAccount: t.showReceiverAccount ?? false,
        // Advanced styling
        themePreset: t.themePreset,
        headerBackgroundColor: t.headerBackgroundColor,
        headerTextColor: t.headerTextColor,
        headerIcon: t.headerIcon,
        amountColor: t.amountColor,
        bodyBackgroundColor: t.bodyBackgroundColor,
        cardBackgroundColor: t.cardBackgroundColor,
        showFooterBranding: t.showFooterBranding ?? true,
        footerBrandingText: t.footerBrandingText,
        footerBrandingName: t.footerBrandingName,
        layoutStyle: t.layoutStyle,
      })),
    };
  }

  @Get('statistics')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get LINE accounts statistics (Admin only)' })
  async getStatistics() {
    const stats = await this.lineAccountsService.getStatistics();
    return {
      success: true,
      statistics: stats,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get LINE account by ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.lineAccountsService.findById(id);
    if (!account) {
      return { success: false, message: 'ไม่พบบัญชี LINE' };
    }

    // Check ownership for non-admin
    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'ไม่มีสิทธิ์เข้าถึง' };
    }

    return {
      success: true,
      account,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update LINE account' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLineAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.lineAccountsService.findById(id);
    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    // Check ownership for non-admin
    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'Access denied' };
    }

    const updated = await this.lineAccountsService.update(id, dto, user.userId);
    return {
      success: true,
      message: 'อัปเดตบัญชีสำเร็จ',
      account: updated,
    };
  }

  @Put(':id/settings')
  @ApiOperation({ summary: 'Update LINE account settings' })
  async updateSettings(
    @Param('id') id: string,
    @Body() settings: any,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.lineAccountsService.findById(id);
    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'Access denied' };
    }

    await this.lineAccountsService.updateSettings(id, settings);
    return {
      success: true,
      message: 'อัปเดตการตั้งค่าสำเร็จ',
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete LINE account' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.lineAccountsService.findById(id);
    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'Access denied' };
    }

    await this.lineAccountsService.delete(id);
    return {
      success: true,
      message: 'ลบบัญชีสำเร็จ',
    };
  }

  @Post(':id/regenerate-webhook')
  @ApiOperation({ summary: 'Regenerate webhook URL' })
  async regenerateWebhook(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.lineAccountsService.findById(id);
    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'Access denied' };
    }

    const newSlug = await this.lineAccountsService.regenerateWebhookSlug(id);
    return {
      success: true,
      message: 'สร้าง Webhook URL ใหม่สำเร็จ',
      webhookSlug: newSlug,
    };
  }

  @Get(':id/chat-history')
  @ApiOperation({ summary: 'Get chat history' })
  async getChatHistory(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Query('limit') limit: number = 50,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.lineAccountsService.findById(id);
    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'Access denied' };
    }

    const messages = await this.lineAccountsService.getChatHistory(id, userId, limit);
    return {
      success: true,
      messages,
    };
  }

  @Post(':id/test-connection')
  @ApiOperation({ summary: 'Test LINE channel connection' })
  async testConnection(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.lineAccountsService.findById(id);
    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'Access denied' };
    }

    const result = await this.lineAccountsService.testConnection(account.accessToken);
    return {
      ...result,
    };
  }

  @Post('test-connection')
  @ApiOperation({ summary: 'Test LINE channel connection with access token' })
  async testConnectionWithToken(
    @Body() body: { accessToken: string },
  ) {
    if (!body.accessToken) {
      return { success: false, message: 'Access token is required' };
    }

    const result = await this.lineAccountsService.testConnection(body.accessToken);
    return {
      ...result,
    };
  }
}
