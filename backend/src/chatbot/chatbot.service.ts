import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private openai: OpenAI | null = null;

  constructor(
    private systemSettingsService: SystemSettingsService,
    private redisService: RedisService,
  ) {}

  private async getOpenAIClient(): Promise<OpenAI | null> {
    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings?.aiApiKey;

    if (!apiKey) {
      return null;
    }

    if (!this.openai) {
      this.openai = new OpenAI({ apiKey });
    }

    return this.openai;
  }

  async getResponse(
    message: string,
    userId: string,
    lineAccountId: string,
    systemPrompt?: string,
  ): Promise<string> {
    try {
      const client = await this.getOpenAIClient();
      if (!client) {
        return 'ระบบ AI ยังไม่ได้ตั้งค่า API Key';
      }

      const settings = await this.systemSettingsService.getSettings();
      const model = settings?.aiModel || 'gpt-3.5-turbo';
      const defaultPrompt =
        systemPrompt ||
        'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย';

      // Get chat history from Redis
      const historyKey = `chat:${lineAccountId}:${userId}`;
      const history = (await this.redisService.getJson<any[]>(historyKey)) || [];

      // Build messages
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: defaultPrompt },
        ...history.slice(-10), // Last 10 messages
        { role: 'user', content: message },
      ];

      const completion = await client.chat.completions.create({
        model,
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || 'ขออภัย ไม่สามารถตอบได้';

      // Save to history
      history.push(
        { role: 'user', content: message },
        { role: 'assistant', content: response },
      );
      await this.redisService.setJson(historyKey, history.slice(-20), 3600); // Keep 20 messages for 1 hour

      return response;
    } catch (error: any) {
      this.logger.error('ChatBot error:', error);

      if (error.status === 401) {
        return 'API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า';
      } else if (error.status === 429) {
        return 'ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้ กรุณาลองใหม่ในภายหลัง';
      }

      return 'ขออภัย เกิดข้อผิดพลาดในระบบ AI';
    }
  }

  async testConnection(apiKey: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const client = new OpenAI({ apiKey });
      
      const completion = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Say "API test successful" if you can read this.' },
        ],
        max_tokens: 20,
      });

      return {
        success: true,
        message: completion.choices[0]?.message?.content || 'Connected',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Connection failed',
      };
    }
  }

  async clearHistory(userId: string, lineAccountId?: string): Promise<void> {
    if (lineAccountId) {
      await this.redisService.del(`chat:${lineAccountId}:${userId}`);
      return;
    }

    // Backward-compatible: clear legacy key
    await this.redisService.del(`chat:${userId}`);
  }
}
