import {
  Controller,
  Post,
  Body,
  UseGuards,
  Delete,
  Param,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotService } from './chatbot.service';
import { SmartResponseService } from './smart-response.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';
import { buildSmartAiSettings } from './types/smart-ai.types';
import { RateLimitGuard, RateLimit } from '../common/guards/rate-limit.guard';

@ApiTags('Chatbot')
@ApiBearerAuth()
@Controller('chatbot')
@UseGuards(SessionAuthGuard)
export class ChatbotController {
  private readonly logger = new Logger(ChatbotController.name);

  constructor(
    private chatbotService: ChatbotService,
    private smartResponseService: SmartResponseService,
    private systemSettingsService: SystemSettingsService,
    @InjectModel(LineAccount.name) private lineAccountModel: Model<LineAccountDocument>,
  ) {}

  @Post('test')
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles(UserRole.ADMIN)
  @RateLimit({ limit: 20, windowSeconds: 60, keyPrefix: 'chatbot:test' })
  @ApiOperation({ summary: 'Test chatbot (Admin only)' })
  async testChat(@Body() body: { message: string; systemPrompt?: string; lineAccountId?: string }) {
    const response = await this.chatbotService.getResponse(
      body.message,
      'test-user',
      body.lineAccountId || 'test-line-account',
      body.systemPrompt,
    );
    return {
      success: true,
      response,
    };
  }

  @Post('test-connection')
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles(UserRole.ADMIN)
  @RateLimit({ limit: 10, windowSeconds: 60, keyPrefix: 'chatbot:test-conn' })
  @ApiOperation({ summary: 'Test AI API connection (Admin only)' })
  async testConnection(@Body() body: { apiKey: string }) {
    // Get the API key to test
    let keyToTest = body.apiKey;

    // If key is masked, placeholder, or empty, fetch DECRYPTED key from database
    if (!keyToTest ||
        keyToTest === 'use-saved' ||
        keyToTest.includes('....') ||
        keyToTest.includes('***') ||
        keyToTest.length < 10) {
      this.logger.log('Fetching AI API key from database (decrypted)...');
      // Use getDecryptedSettings() to get the actual API key, not the masked version
      const settings = await this.systemSettingsService.getDecryptedSettings();
      keyToTest = settings?.aiApiKey || '';
      this.logger.log(`Got decrypted key from DB (length: ${keyToTest?.length || 0})`);
      
      if (!keyToTest) {
        return {
          success: false,
          message: 'ยังไม่ได้ตั้งค่า AI API Key กรุณาบันทึก API Key ก่อนทดสอบ',
        };
      }
    }

    const result = await this.chatbotService.testConnection(keyToTest);
    return result;
  }

  @Post('test-classification')
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles(UserRole.ADMIN)
  @RateLimit({ limit: 20, windowSeconds: 60, keyPrefix: 'chatbot:test-classify' })
  @ApiOperation({ summary: 'Test Smart AI intent classification (Admin only)' })
  async testClassification(
    @Body() body: { message: string; lineAccountId: string },
  ) {
    if (!body.message || !body.lineAccountId) {
      throw new BadRequestException('message and lineAccountId are required');
    }

    const account = await this.lineAccountModel.findById(body.lineAccountId);
    if (!account) {
      throw new BadRequestException('LINE account not found');
    }

    const settings = buildSmartAiSettings((account.settings || {}) as unknown as Record<string, unknown>);
    // Override for testing: no delay, single attempt
    settings.smartAiResponseDelayMs = 0;
    settings.smartAiMaxRetries = 1;
    settings.smartAiRetryDelayMs = 0;

    const result = await this.smartResponseService.testClassification(
      body.message,
      settings,
    );

    return { success: true, ...result };
  }

  @Delete('history/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Clear chat history (Admin only)' })
  async clearHistory(
    @Param('userId') userId: string,
    @Query('lineAccountId') lineAccountId?: string,
  ) {
    await this.chatbotService.clearHistory(userId, lineAccountId);
    return {
      success: true,
      message: 'Chat history cleared',
    };
  }
}
