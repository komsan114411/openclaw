import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { BanksService } from './banks.service';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { RateLimitGuard, RateLimit } from '../common/guards/rate-limit.guard';

@Controller()
export class BanksController {
  constructor(private readonly banksService: BanksService) { }

  /**
   * Get all banks (public)
   */
  @Get('banks')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowSeconds: 60, keyPrefix: 'public:banks' })
  async getAllBanks() {
    const banks = await this.banksService.getAll();
    return { success: true, banks };
  }

  /**
   * Search banks (public)
   */
  @Get('banks/search')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowSeconds: 60, keyPrefix: 'public:banks-search' })
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
      res.status(404).json({ success: false, error: 'ไม่พบโลโก้ธนาคาร' });
      return;
    }

    res.set('Content-Type', logo.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(logo.data);
  }

  /**
   * Admin: Get all banks (including inactive)
   */
  @Get('admin/banks')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdminBanks() {
    const banks = await this.banksService.getAllForAdmin();
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
    @Param('id', ParseObjectIdPipe) id: string,
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
   * Admin: Sync banks from Thunder API using system API key
   */
  @Post('admin/banks/sync-from-thunder')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async syncFromThunder() {
    const result = await this.banksService.syncFromThunderUsingSystemKey();
    return {
      success: result.errors.length === 0,
      message: `ซิงค์แล้ว ${result.imported} ธนาคาร, อัปเดต ${result.updated} รายการ`,
      ...result,
    };
  }

  /**
   * Admin: Upload bank logo
   */
  @Post('admin/banks/:id/logo')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('logo'))
  async uploadBankLogo(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { success: false, message: 'กรุณาอัปโหลดรูปโลโก้' };
    }

    // Validate file
    const maxBytes = 2 * 1024 * 1024; // 2MB
    const size = file.size ?? file.buffer?.length ?? 0;
    if (!file.mimetype?.startsWith('image/') || size <= 0 || size > maxBytes) {
      return { success: false, message: 'ไฟล์ไม่ถูกต้อง (รองรับรูปภาพและต้องไม่เกิน 2MB)' };
    }

    const bank = await this.banksService.uploadLogo(id, file.buffer, file.mimetype);
    return { success: true, bank };
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
      message: `สร้าง ${result.created} ธนาคาร, ข้าม ${result.skipped} รายการที่มีอยู่แล้ว`,
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
      message: `นำเข้า ${result.imported} ธนาคาร`,
      ...result,
    };
  }
}
