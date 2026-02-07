import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

interface DuplicateEntry {
  hash: string;
  timestamp: number;
}

@Injectable()
export class DuplicateDetectorService {
  private readonly logger = new Logger(DuplicateDetectorService.name);

  constructor(private redisService: RedisService) {}

  /**
   * Normalize message text for duplicate detection
   * - lowercase, trim, collapse whitespace, remove common filler words
   */
  private normalize(message: string): string {
    return message
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[!?.,:;]+/g, '');
  }

  /**
   * Hash a normalized message
   */
  private hashMessage(message: string): string {
    const normalized = this.normalize(message);
    return createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Check if the message is a duplicate within the window
   */
  async isDuplicate(
    accountId: string,
    userId: string,
    message: string,
    windowMinutes: number,
  ): Promise<boolean> {
    const key = `dup:${accountId}:${userId}`;
    const hash = this.hashMessage(message);
    try {
      const entries =
        (await this.redisService.getJson<DuplicateEntry[]>(key)) || [];
      const cutoff = Date.now() - windowMinutes * 60 * 1000;
      return entries.some((e) => e.hash === hash && e.timestamp > cutoff);
    } catch (error) {
      this.logger.warn('Failed to check duplicate:', error);
      return false;
    }
  }

  /**
   * Record a message hash for future duplicate detection
   */
  async recordMessage(
    accountId: string,
    userId: string,
    message: string,
    windowMinutes: number,
  ): Promise<void> {
    const key = `dup:${accountId}:${userId}`;
    const hash = this.hashMessage(message);
    const now = Date.now();
    try {
      const entries =
        (await this.redisService.getJson<DuplicateEntry[]>(key)) || [];
      // Remove expired entries
      const cutoff = now - windowMinutes * 60 * 1000;
      const filtered = entries.filter((e) => e.timestamp > cutoff);
      filtered.push({ hash, timestamp: now });
      await this.redisService.setJson(key, filtered, windowMinutes * 60);
    } catch (error) {
      this.logger.warn('Failed to record duplicate:', error);
    }
  }
}
