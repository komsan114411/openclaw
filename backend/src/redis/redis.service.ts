import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private memoryCache: Map<string, { value: string; expiry?: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Maximum memory cache size to prevent memory leaks
  private readonly MAX_MEMORY_CACHE_SIZE = 10000;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  onModuleInit() {
    // Start periodic cleanup of expired memory cache entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMemoryCache();
    }, 60 * 1000); // Cleanup every minute
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleanup expired entries from memory cache
   */
  private cleanupExpiredMemoryCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, data] of this.memoryCache.entries()) {
      if (data.expiry && now > data.expiry) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    // If cache is still too large, remove oldest entries
    if (this.memoryCache.size > this.MAX_MEMORY_CACHE_SIZE) {
      const entriesToRemove = this.memoryCache.size - this.MAX_MEMORY_CACHE_SIZE;
      const keys = Array.from(this.memoryCache.keys()).slice(0, entriesToRemove);
      for (const key of keys) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired memory cache entries`);
    }
  }

  private isRedisAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  // Basic operations
  async get(key: string): Promise<string | null> {
    if (this.isRedisAvailable()) {
      try {
        return await this.redis!.get(key);
      } catch (error) {
        this.logger.warn(`Redis get failed, using memory cache: ${error}`);
      }
    }
    
    // Fallback to memory cache
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (cached.expiry && Date.now() > cached.expiry) {
        this.memoryCache.delete(key);
        return null;
      }
      return cached.value;
    }
    return null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isRedisAvailable()) {
      try {
        if (ttlSeconds) {
          await this.redis!.setex(key, ttlSeconds, value);
        } else {
          await this.redis!.set(key, value);
        }
        return;
      } catch (error) {
        this.logger.warn(`Redis set failed, using memory cache: ${error}`);
      }
    }
    
    // Fallback to memory cache
    this.memoryCache.set(key, {
      value,
      expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    if (this.isRedisAvailable()) {
      try {
        await this.redis!.del(key);
        return;
      } catch (error) {
        this.logger.warn(`Redis del failed: ${error}`);
      }
    }
    this.memoryCache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.isRedisAvailable()) {
      try {
        const result = await this.redis!.exists(key);
        return result === 1;
      } catch (error) {
        this.logger.warn(`Redis exists failed: ${error}`);
      }
    }
    return this.memoryCache.has(key);
  }

  // JSON operations
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  // Session management
  async setSession(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<void> {
    await this.setJson(`session:${sessionId}`, data, ttlSeconds);
  }

  async getSession(sessionId: string): Promise<any | null> {
    return this.getJson(`session:${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  // Cache operations
  async cache<T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getJson<T>(`cache:${key}`);
    if (cached) return cached;

    const data = await fetchFn();
    await this.setJson(`cache:${key}`, data, ttlSeconds);
    return data;
  }

  async invalidateCache(key: string): Promise<void> {
    await this.del(`cache:${key}`);
  }

  async invalidateCachePattern(pattern: string): Promise<void> {
    if (this.isRedisAvailable()) {
      try {
        const keys = await this.redis!.keys(`cache:${pattern}`);
        if (keys.length > 0) {
          await this.redis!.del(...keys);
        }
      } catch (error) {
        this.logger.warn(`Redis invalidateCachePattern failed: ${error}`);
      }
    }
  }

  // Rate limiting
  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (this.isRedisAvailable()) {
      try {
        const current = await this.redis!.incr(`ratelimit:${key}`);
        if (current === 1) {
          await this.redis!.expire(`ratelimit:${key}`, windowSeconds);
        }
        return current <= limit;
      } catch (error) {
        this.logger.warn(`Redis rateLimit failed: ${error}`);
      }
    }
    // Without Redis, allow all requests (no rate limiting)
    return true;
  }

  // Pub/Sub
  async publish(channel: string, message: any): Promise<void> {
    if (this.isRedisAvailable()) {
      try {
        await this.redis!.publish(channel, JSON.stringify(message));
      } catch (error) {
        this.logger.warn(`Redis publish failed: ${error}`);
      }
    }
  }

  subscribe(channel: string, callback: (message: any) => void): void {
    if (this.isRedisAvailable()) {
      try {
        const subscriber = this.redis!.duplicate();
        subscriber.subscribe(channel);
        subscriber.on('message', (ch, msg) => {
          if (ch === channel) {
            try {
              callback(JSON.parse(msg));
            } catch {
              callback(msg);
            }
          }
        });
      } catch (error) {
        this.logger.warn(`Redis subscribe failed: ${error}`);
      }
    }
  }

  // Check if Redis is connected
  isConnected(): boolean {
    return this.isRedisAvailable();
  }
}
