import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

interface DuplicateEntry {
  hash: string;
  normalized: string;
  timestamp: number;
}

@Injectable()
export class DuplicateDetectorService {
  private readonly logger = new Logger(DuplicateDetectorService.name);

  constructor(private redisService: RedisService) {}

  /**
   * Normalize message text for duplicate detection
   * - lowercase, trim, collapse whitespace, remove punctuation
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
   * Simple similarity check between two strings (character-based)
   * Returns a value between 0 and 1 (1 = identical)
   */
  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Use bigram overlap for Thai text (works better than Levenshtein for Thai)
    const bigramsA = this.getBigrams(a);
    const bigramsB = this.getBigrams(b);

    if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
    if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

    let intersection = 0;
    for (const bigram of bigramsA) {
      if (bigramsB.has(bigram)) intersection++;
    }

    // Dice coefficient
    return (2 * intersection) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Get character bigrams from a string
   */
  private getBigrams(str: string): Set<string> {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Check if the message is a duplicate within the window
   * Uses both exact hash match AND fuzzy similarity (≥ 0.8)
   */
  async isDuplicate(
    accountId: string,
    userId: string,
    message: string,
    windowMinutes: number,
  ): Promise<boolean> {
    const key = `dup:${accountId}:${userId}`;
    const hash = this.hashMessage(message);
    const normalized = this.normalize(message);

    try {
      const entries =
        (await this.redisService.getJson<DuplicateEntry[]>(key)) || [];
      const cutoff = Date.now() - windowMinutes * 60 * 1000;
      const recentEntries = entries.filter((e) => e.timestamp > cutoff);

      // Check exact hash match first (fast)
      if (recentEntries.some((e) => e.hash === hash)) {
        return true;
      }

      // Fuzzy match for near-duplicates (e.g. "ฝากเงินไม่เข้า" vs "ฝากเงินยังไม่เข้าครับ")
      // Only check if message is long enough (short messages like "ครับ" shouldn't fuzzy match)
      if (normalized.length >= 5) {
        for (const entry of recentEntries) {
          if (entry.normalized && this.similarity(normalized, entry.normalized) >= 0.8) {
            return true;
          }
        }
      }

      return false;
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
    const normalized = this.normalize(message);
    const now = Date.now();
    try {
      const entries =
        (await this.redisService.getJson<DuplicateEntry[]>(key)) || [];
      // Remove expired entries
      const cutoff = now - windowMinutes * 60 * 1000;
      const filtered = entries.filter((e) => e.timestamp > cutoff);
      filtered.push({ hash, normalized, timestamp: now });
      await this.redisService.setJson(key, filtered, windowMinutes * 60);
    } catch (error) {
      this.logger.warn('Failed to record duplicate:', error);
    }
  }
}
