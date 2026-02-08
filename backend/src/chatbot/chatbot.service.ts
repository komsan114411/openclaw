import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private openai: OpenAI | null = null;
  private cachedApiKey: string | null = null;

  constructor(
    private systemSettingsService: SystemSettingsService,
    private redisService: RedisService,
  ) {}

  /**
   * Get OpenAI client, recreating if API key has changed
   */
  private async getOpenAIClient(): Promise<OpenAI | null> {
    // IMPORTANT: Use getDecryptedSettings to get the actual API key, not the masked version
    const settings = await this.systemSettingsService.getDecryptedSettings();
    const apiKey = settings?.aiApiKey;

    if (!apiKey) {
      // Clear cached client if API key is removed
      this.openai = null;
      this.cachedApiKey = null;
      return null;
    }

    // Recreate client if API key has changed
    if (!this.openai || this.cachedApiKey !== apiKey) {
      this.logger.log('Creating new OpenAI client (API key changed or first initialization)');
      this.openai = new OpenAI({ apiKey });
      this.cachedApiKey = apiKey;
    }

    return this.openai;
  }

  /**
   * Invalidate cached OpenAI client - call this when settings change
   */
  invalidateClient(): void {
    this.openai = null;
    this.cachedApiKey = null;
    this.logger.log('OpenAI client cache invalidated');
  }

  async getResponse(
    message: string,
    userId: string,
    lineAccountId: string,
    systemPrompt?: string,
    accountModel?: string,
    maxTokens?: number,
    temperature?: number,
  ): Promise<string> {
    // Input validation
    if (!message || message.trim().length === 0) {
      return 'กรุณาส่งข้อความที่ต้องการ';
    }

    // Limit message length to prevent abuse
    const maxMessageLength = 2000;
    const sanitizedMessage = message.slice(0, maxMessageLength);

    try {
      const client = await this.getOpenAIClient();
      if (!client) {
        return 'ระบบ AI ยังไม่ได้ตั้งค่า API Key';
      }

      const settings = await this.systemSettingsService.getSettings();
      // Use account-specific model if provided, otherwise use system default
      const model = accountModel || settings?.aiModel || 'gpt-3.5-turbo';
      const defaultPrompt =
        systemPrompt ||
        'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น';

      // Get chat history from Redis
      const historyKey = `chat:${lineAccountId}:${userId}`;
      let history: any[] = [];
      try {
        history = (await this.redisService.getJson<any[]>(historyKey)) || [];
      } catch (cacheError) {
        this.logger.warn('Failed to get chat history from cache:', cacheError);
        // Continue without history
      }

      // Build messages
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: defaultPrompt },
        ...history.slice(-10), // Last 10 messages
        { role: 'user', content: sanitizedMessage },
      ];

      const completion = await client.chat.completions.create(
        {
          model,
          messages,
          max_tokens: maxTokens || 500,
          temperature: temperature ?? 0.7,
        },
        {
          timeout: 30000,
        },
      );

      const response = completion.choices[0]?.message?.content || 'ขออภัย ไม่สามารถตอบได้';

      // Save to history (non-blocking)
      this.saveToHistory(historyKey, sanitizedMessage, response, history).catch((err) => {
        this.logger.warn('Failed to save chat history:', err);
      });

      return response;
    } catch (error: any) {
      this.logger.error('ChatBot error:', error);

      if (error.status === 401) {
        return 'API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า';
      } else if (error.status === 429) {
        return 'ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้ กรุณาลองใหม่ในภายหลัง';
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return 'ขออภัย ระบบ AI ตอบช้าเกินไป กรุณาลองใหม่อีกครั้ง';
      } else if (error.status === 400) {
        return 'ขออภัย ข้อความไม่ถูกต้อง กรุณาลองใหม่';
      } else if (error.status === 500 || error.status === 502 || error.status === 503) {
        return 'ขออภัย ระบบ AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่ในภายหลัง';
      }

      return 'ขออภัย เกิดข้อผิดพลาดในระบบ AI';
    }
  }

  /**
   * Save chat history in background
   */
  private async saveToHistory(
    historyKey: string,
    userMessage: string,
    assistantResponse: string,
    existingHistory: any[],
  ): Promise<void> {
    const history = [
      ...existingHistory,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantResponse },
    ];
    await this.redisService.setJson(historyKey, history.slice(-20), 3600);
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

  /**
   * Single-turn OpenAI call for classification/short tasks.
   * No chat history, reuses getOpenAIClient().
   */
  async classifyWithModel(
    systemPrompt: string,
    userMessage: string,
    model: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    const client = await this.getOpenAIClient();
    if (!client) {
      throw new Error('OpenAI client not configured');
    }

    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
      },
      { timeout: 15000 },
    );

    return completion.choices[0]?.message?.content || '';
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
