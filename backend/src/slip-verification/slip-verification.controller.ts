import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { SlipVerificationService } from './slip-verification.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@ApiTags('Slip Verification')
@ApiBearerAuth()
@Controller('slip-verification')
@UseGuards(SessionAuthGuard)
export class SlipVerificationController {
  constructor(
    private slipVerificationService: SlipVerificationService,
    private systemSettingsService: SystemSettingsService,
  ) {}

  @Post('test')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Test slip verification (Admin only)' })
  async testVerification(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { success: false, message: 'No file uploaded' };
    }

    const result = await this.slipVerificationService.verifySlip(
      file.buffer,
      'test',
      'test-user',
      'test-message',
    );

    return {
      success: result.status === 'success',
      ...result,
    };
  }

  @Post('test-connection')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Test API connection (Admin only)' })
  async testConnection(@Body() body: { apiKey: string }) {
    // Get the API key to test
    let keyToTest = body.apiKey;

    // If key is masked, placeholder, or empty, fetch DECRYPTED key from database
    if (!keyToTest || 
        keyToTest === 'use-saved' || 
        keyToTest.includes('....') || 
        keyToTest.includes('***') || 
        keyToTest.length < 10) {
      console.log('[test-connection] Fetching Slip API key from database (decrypted)...');
      // Use getDecryptedSettings() to get the actual API key, not the masked version
      const settings = await this.systemSettingsService.getDecryptedSettings();
      keyToTest = settings?.slipApiKey || '';
      console.log(`[test-connection] Got decrypted key from DB (length: ${keyToTest?.length || 0})`);
      
      if (!keyToTest) {
        return {
          success: false,
          status: 'error',
          message: 'ยังไม่ได้ตั้งค่า Slip API Key กรุณาบันทึก API Key ก่อนทดสอบ',
        };
      }
    }

    const result = await this.slipVerificationService.testConnection(keyToTest);
    return {
      success: result.status === 'success',
      ...result,
    };
  }

  @Get('history/:lineAccountId')
  @ApiOperation({ summary: 'Get slip verification history' })
  async getHistory(
    @Param('lineAccountId') lineAccountId: string,
    @Query('limit') limit: number = 50,
  ) {
    const history = await this.slipVerificationService.getSlipHistory(
      lineAccountId,
      limit,
    );
    return {
      success: true,
      history,
    };
  }
}
