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
  constructor(private lineAccountsService: LineAccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create LINE account' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLineAccountDto,
  ) {
    const account = await this.lineAccountsService.create(user.userId, dto);
    return {
      success: true,
      message: 'LINE account created successfully',
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
      return { success: false, message: 'Account not found' };
    }

    // Check ownership for non-admin
    if (user.role !== UserRole.ADMIN && account.ownerId !== user.userId) {
      return { success: false, message: 'Access denied' };
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

    const updated = await this.lineAccountsService.update(id, dto);
    return {
      success: true,
      message: 'Account updated successfully',
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
      message: 'Settings updated successfully',
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
      message: 'Account deleted successfully',
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
}
