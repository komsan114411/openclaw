import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { BanksService } from './banks.service';

@Controller('api')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  /**
   * Get all banks (public)
   */
  @Get('banks')
  async getAllBanks() {
    const banks = await this.banksService.getAll();
    return { success: true, banks };
  }

  /**
   * Search banks (public)
   */
  @Get('banks/search')
  async searchBanks(@Query('q') query: string) {
    const banks = await this.banksService.search(query || '');
    return { success: true, banks };
  }

  /**
   * Get bank logo (public)
   */
  @Get('bank-logo/:code')
  async getBankLogo(@Param('code') code: string, @Res() res: Response) {
    const logo = await this.banksService.getBankLogo(code);

    if (!logo) {
      res.status(404).json({ success: false, error: 'Bank logo not found' });
      return;
    }

    res.set('Content-Type', logo.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(logo.data);
  }

  /**
   * Admin: Get all banks
   */
  @Get('admin/banks')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdminBanks() {
    const banks = await this.banksService.getAll();
    return { success: true, banks };
  }

  /**
   * Admin: Create bank
   */
  @Post('admin/banks')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createBank(
    @Body()
    body: {
      code: string;
      name: string;
      nameTh?: string;
      nameEn?: string;
      shortName?: string;
      color?: string;
      logoUrl?: string;
    },
  ) {
    const bank = await this.banksService.create(body);
    return { success: true, bank };
  }

  /**
   * Admin: Update bank
   */
  @Put('admin/banks/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateBank(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      nameTh?: string;
      nameEn?: string;
      shortName?: string;
      color?: string;
      logoUrl?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const bank = await this.banksService.update(id, body);
    return { success: true, bank };
  }

  /**
   * Admin: Delete bank
   */
  @Delete('admin/banks/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteBank(@Param('id') id: string) {
    await this.banksService.delete(id);
    return { success: true, message: 'Bank deleted' };
  }

  /**
   * Admin: Initialize default banks
   */
  @Post('admin/banks/init-defaults')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async initDefaultBanks() {
    const result = await this.banksService.initDefaultBanks();
    return {
      success: true,
      message: `Created ${result.created} banks, skipped ${result.skipped} existing`,
      ...result,
    };
  }

  /**
   * Admin: Import banks from Thunder API
   */
  @Post('admin/banks/init-thunder-banks')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async initThunderBanks(@Body() body: { apiKey: string }) {
    const result = await this.banksService.importFromThunderApi(body.apiKey);
    return {
      success: result.errors.length === 0,
      message: `Imported ${result.imported} banks`,
      ...result,
    };
  }
}
