import {
  Controller,
  Post,
  Body,
  UseGuards,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatbotService } from './chatbot.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';

@ApiTags('Chatbot')
@ApiBearerAuth()
@Controller('chatbot')
@UseGuards(SessionAuthGuard)
export class ChatbotController {
  constructor(private chatbotService: ChatbotService) {}

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
    const result = await this.chatbotService.testConnection(body.apiKey);
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
