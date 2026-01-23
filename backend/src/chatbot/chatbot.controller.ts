import {
  Controller,
  Post,
  Body,
  UseGuards,
  Delete,
  Param,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatbotService } from './chatbot.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@ApiTags('Chatbot')
@ApiBearerAuth()
@Controller('chatbot')
@UseGuards(SessionAuthGuard)
export class ChatbotController {
  private readonly logger = new Logger(ChatbotController.name);

  constructor(
    private chatbotService: ChatbotService,
    private systemSettingsService: SystemSettingsService,
  ) {}

  @Post('test')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
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
