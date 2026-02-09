import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SpamDetectorService {
  private readonly logger = new Logger(SpamDetectorService.name);

  constructor(private redisService: RedisService) {}

  /**
   * Record a message timestamp for spam tracking
   * @param windowSeconds - time window to keep timestamps for (matches isSpamming window)
   */
  async recordMessage(accountId: string, userId: string, windowSeconds = 120): Promise<void> {
    const key = `spam:${accountId}:${userId}`;
    const now = Date.now();
    try {
      const timestamps = (await this.redisService.getJson<number[]>(key)) || [];
      const cutoff = now - windowSeconds * 1000;
      const filtered = timestamps.filter((t) => t > cutoff);
      filtered.push(now);
      await this.redisService.setJson(key, filtered, windowSeconds);
    } catch (error) {
      this.logger.warn('Failed to record spam message:', error);
    }
  }

  /**
   * Check if a user is spamming
   * @param threshold - max messages allowed in the window
   * @param windowSeconds - time window in seconds
   */
  async isSpamming(
    accountId: string,
    userId: string,
    threshold: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const key = `spam:${accountId}:${userId}`;
    try {
      const timestamps = (await this.redisService.getJson<number[]>(key)) || [];
      const cutoff = Date.now() - windowSeconds * 1000;
      const count = timestamps.filter((t) => t > cutoff).length;
      return count >= threshold;
    } catch (error) {
      this.logger.warn('Failed to check spam:', error);
      return false;
    }
  }
}
