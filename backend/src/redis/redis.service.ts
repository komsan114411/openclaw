import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private memoryCache: Map<string, { value: string; expiry?: number }> = new Map();
  private memoryRateLimits: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {
    // Cleanup expired memory cache entries periodically
    setInterval(() => this.cleanupMemoryCache(), 60000); // Every minute
  }

  private isRedisAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expiry && now > value.expiry) {
        this.memoryCache.delete(key);
      }
    }
    for (const [key, value] of this.memoryRateLimits.entries()) {
      if (now > value.resetAt) {
        this.memoryRateLimits.delete(key);
      }
    }
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
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (cached.expiry && Date.now() > cached.expiry) {
        this.memoryCache.delete(key);
        return false;
      }
      return true;
    }
    return false;
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

  /**
   * Rate limiting with sliding window
   * Returns true if request is allowed, false if rate limit exceeded
   */
  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const rateLimitKey = `ratelimit:${key}`;
    
    if (this.isRedisAvailable()) {
      try {
        const current = await this.redis!.incr(rateLimitKey);
        if (current === 1) {
          await this.redis!.expire(rateLimitKey, windowSeconds);
        }
        return current <= limit;
      } catch (error) {
        this.logger.warn(`Redis rateLimit failed: ${error}`);
      }
    }
    
    // Fallback to memory-based rate limiting
    const now = Date.now();
    const existing = this.memoryRateLimits.get(rateLimitKey);
    
    if (existing && now < existing.resetAt) {
      existing.count++;
      return existing.count <= limit;
    }
    
    // Start new window
    this.memoryRateLimits.set(rateLimitKey, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return true;
  }

  /**
   * Get remaining rate limit count
   */
  async getRateLimitRemaining(key: string, limit: number): Promise<number> {
    const rateLimitKey = `ratelimit:${key}`;
    
    if (this.isRedisAvailable()) {
      try {
        const current = await this.redis!.get(rateLimitKey);
        return Math.max(0, limit - (parseInt(current || '0', 10)));
      } catch (error) {
        this.logger.warn(`Redis getRateLimitRemaining failed: ${error}`);
      }
    }
    
    const existing = this.memoryRateLimits.get(rateLimitKey);
    if (existing && Date.now() < existing.resetAt) {
      return Math.max(0, limit - existing.count);
    }
    return limit;
  }

  /**
   * Distributed lock using Redis SETNX
   * Returns lock token if acquired, null if lock is held by another process
   */
  async acquireLock(key: string, ttlSeconds: number = 30): Promise<string | null> {
    const lockKey = `lock:${key}`;
    const lockToken = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.isRedisAvailable()) {
      try {
        // Use SET with NX and EX for atomic lock acquisition
        const result = await this.redis!.set(lockKey, lockToken, 'EX', ttlSeconds, 'NX');
        return result === 'OK' ? lockToken : null;
      } catch (error) {
        this.logger.warn(`Redis acquireLock failed: ${error}`);
      }
    }
    
    // Fallback to memory-based lock
    const existing = this.memoryCache.get(lockKey);
    if (existing && existing.expiry && Date.now() < existing.expiry) {
      return null; // Lock is held
    }
    
    this.memoryCache.set(lockKey, {
      value: lockToken,
      expiry: Date.now() + ttlSeconds * 1000,
    });
    return lockToken;
  }

  /**
   * Release a distributed lock
   * Only releases if the token matches (to prevent releasing someone else's lock)
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    if (this.isRedisAvailable()) {
      try {
        // Use Lua script for atomic check-and-delete
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const result = await this.redis!.eval(script, 1, lockKey, token);
        return result === 1;
      } catch (error) {
        this.logger.warn(`Redis releaseLock failed: ${error}`);
      }
    }
    
    // Fallback to memory-based lock release
    const existing = this.memoryCache.get(lockKey);
    if (existing && existing.value === token) {
      this.memoryCache.delete(lockKey);
      return true;
    }
    return false;
  }

  /**
   * Execute a function with a distributed lock
   * Automatically acquires and releases the lock
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 30,
  ): Promise<T | null> {
    const token = await this.acquireLock(key, ttlSeconds);
    if (!token) {
      this.logger.warn(`Failed to acquire lock for key: ${key}`);
      return null;
    }
    
    try {
      return await fn();
    } finally {
      await this.releaseLock(key, token);
    }
  }

  /**
   * Increment a counter atomically
   */
  async incr(key: string): Promise<number> {
    if (this.isRedisAvailable()) {
      try {
        return await this.redis!.incr(key);
      } catch (error) {
        this.logger.warn(`Redis incr failed: ${error}`);
      }
    }
    
    // Fallback to memory
    const existing = this.memoryCache.get(key);
    const newValue = (parseInt(existing?.value || '0', 10) || 0) + 1;
    this.memoryCache.set(key, { value: newValue.toString(), expiry: existing?.expiry });
    return newValue;
  }

  /**
   * Decrement a counter atomically
   */
  async decr(key: string): Promise<number> {
    if (this.isRedisAvailable()) {
      try {
        return await this.redis!.decr(key);
      } catch (error) {
        this.logger.warn(`Redis decr failed: ${error}`);
      }
    }
    
    // Fallback to memory
    const existing = this.memoryCache.get(key);
    const newValue = (parseInt(existing?.value || '0', 10) || 0) - 1;
    this.memoryCache.set(key, { value: newValue.toString(), expiry: existing?.expiry });
    return newValue;
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

  /**
   * Get Redis connection status info
   */
  getStatus(): { connected: boolean; mode: 'redis' | 'memory' } {
    return {
      connected: this.isRedisAvailable(),
      mode: this.isRedisAvailable() ? 'redis' : 'memory',
    };
  }
}
