import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Rate limit result with detailed info for headers
 */
export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

/**
 * LRU Cache Entry
 */
interface CacheEntry {
  value: string;
  expiry?: number;
  accessTime: number;
}

/**
 * Configuration for memory cache bounds
 */
const MEMORY_CACHE_CONFIG = {
  MAX_CACHE_ENTRIES: 10000,      // Max entries in cache
  MAX_RATE_LIMIT_ENTRIES: 5000,  // Max rate limit tracking entries
  MAX_SLIDING_LOG_ENTRIES: 5000, // Max sliding window logs
  CLEANUP_INTERVAL_MS: 30000,    // Cleanup every 30 seconds
  STRICT_MODE_ON_REDIS_DOWN: true, // Reject requests when Redis is down (safer)
};

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  // Bounded LRU-style cache
  private memoryCache: Map<string, CacheEntry> = new Map();
  private memoryRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
  private memorySlidingLogs: Map<string, number[]> = new Map();

  // Track Redis downtime for alerting
  private redisDownSince: number | null = null;
  private redisDownAlerted: boolean = false;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {
    // Cleanup expired memory cache entries periodically (more frequent)
    setInterval(() => this.cleanupMemoryCache(), MEMORY_CACHE_CONFIG.CLEANUP_INTERVAL_MS);

    // Log cache stats every 5 minutes
    setInterval(() => this.logCacheStats(), 300000);
  }

  /**
   * Log cache statistics for monitoring
   */
  private logCacheStats(): void {
    const stats = {
      cacheSize: this.memoryCache.size,
      rateLimitSize: this.memoryRateLimits.size,
      slidingLogSize: this.memorySlidingLogs.size,
      redisConnected: this.isRedisAvailable(),
      redisDownSince: this.redisDownSince,
    };
    this.logger.log(`[CACHE STATS] ${JSON.stringify(stats)}`);
  }

  private isRedisAvailable(): boolean {
    const available = this.redis !== null && this.redis.status === 'ready';

    // Track Redis downtime
    if (!available && this.redisDownSince === null) {
      this.redisDownSince = Date.now();
      this.logger.warn('[REDIS] Redis connection lost - using memory fallback');
    } else if (available && this.redisDownSince !== null) {
      const downtime = Date.now() - this.redisDownSince;
      this.logger.log(`[REDIS] Redis connection restored after ${downtime}ms`);
      this.redisDownSince = null;
      this.redisDownAlerted = false;
    }

    // Alert if Redis down for more than 1 minute
    if (!available && this.redisDownSince && !this.redisDownAlerted) {
      const downtime = Date.now() - this.redisDownSince;
      if (downtime > 60000) {
        this.logger.error(`[REDIS ALERT] Redis has been down for ${Math.round(downtime / 1000)}s!`);
        this.redisDownAlerted = true;
      }
    }

    return available;
  }

  /**
   * Cleanup expired entries and enforce LRU eviction when over capacity
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    let expiredCount = 0;
    let evictedCount = 0;

    // 1. Remove expired cache entries
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiry && now > entry.expiry) {
        this.memoryCache.delete(key);
        expiredCount++;
      }
    }

    // 2. LRU eviction if over capacity
    if (this.memoryCache.size > MEMORY_CACHE_CONFIG.MAX_CACHE_ENTRIES) {
      const entriesToEvict = this.memoryCache.size - MEMORY_CACHE_CONFIG.MAX_CACHE_ENTRIES + 100; // Evict 100 extra for buffer
      const sortedEntries = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].accessTime - b[1].accessTime);

      for (let i = 0; i < entriesToEvict && i < sortedEntries.length; i++) {
        this.memoryCache.delete(sortedEntries[i][0]);
        evictedCount++;
      }
    }

    // 3. Cleanup rate limit entries
    for (const [key, value] of this.memoryRateLimits.entries()) {
      if (now > value.resetAt) {
        this.memoryRateLimits.delete(key);
      }
    }

    // 4. LRU eviction for rate limits
    if (this.memoryRateLimits.size > MEMORY_CACHE_CONFIG.MAX_RATE_LIMIT_ENTRIES) {
      const entriesToEvict = this.memoryRateLimits.size - MEMORY_CACHE_CONFIG.MAX_RATE_LIMIT_ENTRIES;
      let evicted = 0;
      for (const key of this.memoryRateLimits.keys()) {
        if (evicted >= entriesToEvict) break;
        this.memoryRateLimits.delete(key);
        evicted++;
      }
    }

    // 5. Cleanup sliding window logs (remove entries older than 2 minutes)
    const twoMinutesAgo = now - 120000;
    for (const [key, log] of this.memorySlidingLogs.entries()) {
      // Remove all expired entries
      while (log.length > 0 && log[0] < twoMinutesAgo) {
        log.shift();
      }
      // Delete empty logs
      if (log.length === 0) {
        this.memorySlidingLogs.delete(key);
      }
    }

    // 6. LRU eviction for sliding logs
    if (this.memorySlidingLogs.size > MEMORY_CACHE_CONFIG.MAX_SLIDING_LOG_ENTRIES) {
      const entriesToEvict = this.memorySlidingLogs.size - MEMORY_CACHE_CONFIG.MAX_SLIDING_LOG_ENTRIES;
      let evicted = 0;
      for (const key of this.memorySlidingLogs.keys()) {
        if (evicted >= entriesToEvict) break;
        this.memorySlidingLogs.delete(key);
        evicted++;
      }
    }

    // Log cleanup stats if significant
    if (expiredCount > 10 || evictedCount > 0) {
      this.logger.debug(`[CACHE CLEANUP] Expired: ${expiredCount}, Evicted: ${evictedCount}, Remaining: ${this.memoryCache.size}`);
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

    // Fallback to memory cache with LRU tracking
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (cached.expiry && Date.now() > cached.expiry) {
        this.memoryCache.delete(key);
        return null;
      }
      // Update access time for LRU
      cached.accessTime = Date.now();
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

    // Fallback to memory cache with LRU tracking
    const now = Date.now();
    this.memoryCache.set(key, {
      value,
      expiry: ttlSeconds ? now + ttlSeconds * 1000 : undefined,
      accessTime: now,
    });
  }

  /**
   * Atomic set-if-not-exists with TTL. Returns true if lock acquired, false if key already exists.
   * Used for distributed locking (e.g., slip processing lock).
   */
  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.isRedisAvailable()) {
      try {
        const result = await this.redis!.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch (error) {
        this.logger.warn(`Redis setNX failed: ${error}`);
      }
    }
    // Memory cache fallback — check if key exists and not expired
    const existing = this.memoryCache.get(key);
    if (existing && (!existing.expiry || existing.expiry > Date.now())) {
      return false; // Key exists, lock not acquired
    }
    this.memoryCache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
      accessTime: Date.now(),
    });
    return true;
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
   * Delete all keys matching a pattern (no prefix).
   * Used for clearing chat history, etc.
   */
  async deleteKeysByPattern(pattern: string): Promise<number> {
    if (this.isRedisAvailable()) {
      try {
        let cursor = '0';
        let totalDeleted = 0;
        // Use SCAN instead of KEYS to avoid blocking Redis on large datasets
        do {
          const [nextCursor, keys] = await this.redis!.scan(
            cursor, 'MATCH', pattern, 'COUNT', 100,
          );
          cursor = nextCursor;
          if (keys.length > 0) {
            await this.redis!.del(...keys);
            totalDeleted += keys.length;
          }
        } while (cursor !== '0');
        if (totalDeleted > 0) {
          this.logger.log(`Deleted ${totalDeleted} keys matching pattern: ${pattern}`);
        }
        return totalDeleted;
      } catch (error) {
        this.logger.warn(`Redis deleteKeysByPattern failed: ${error}`);
        return 0;
      }
    }
    return 0;
  }

  /**
   * Rate limiting with TRUE Sliding Window Log Algorithm
   * Uses Redis sorted sets for accurate sliding window
   * Returns object with allowed status, current count, and reset time
   */
  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const result = await this.rateLimitWithInfo(key, limit, windowSeconds);
    return result.allowed;
  }

  /**
   * Rate limiting with detailed info (for headers)
   * Uses Sliding Window Log algorithm with Redis sorted sets
   */
  async rateLimitWithInfo(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const rateLimitKey = `ratelimit:${key}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    if (this.isRedisAvailable()) {
      try {
        // Use Lua script for atomic sliding window operation
        const luaScript = `
          local key = KEYS[1]
          local now = tonumber(ARGV[1])
          local window_start = tonumber(ARGV[2])
          local limit = tonumber(ARGV[3])
          local window_seconds = tonumber(ARGV[4])

          -- Remove expired entries
          redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

          -- Count current requests in window
          local current = redis.call('ZCARD', key)

          -- Check if under limit
          if current < limit then
            -- Add new request with current timestamp as score
            redis.call('ZADD', key, now, now .. '-' .. math.random())
            -- Set expiry on the key
            redis.call('EXPIRE', key, window_seconds + 1)
            return {1, current + 1, window_start + (window_seconds * 1000)}
          else
            -- Get oldest entry to calculate reset time
            local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
            local reset_at = oldest[2] and (tonumber(oldest[2]) + (window_seconds * 1000)) or (now + (window_seconds * 1000))
            return {0, current, reset_at}
          end
        `;

        const result = await this.redis!.eval(
          luaScript,
          1,
          rateLimitKey,
          now.toString(),
          windowStart.toString(),
          limit.toString(),
          windowSeconds.toString(),
        ) as [number, number, number];

        return {
          allowed: result[0] === 1,
          current: result[1],
          limit,
          remaining: Math.max(0, limit - result[1]),
          resetAt: Math.ceil(result[2]),
          retryAfter: result[0] === 0 ? Math.ceil((result[2] - now) / 1000) : 0,
        };
      } catch (error) {
        this.logger.warn(`Redis rateLimit failed: ${error}`);
      }
    }

    // Fallback to memory-based sliding window
    return this.memoryRateLimitSlidingWindow(rateLimitKey, limit, windowSeconds);
  }

  /**
   * Memory-based sliding window rate limiting (fallback)
   */
  private memoryRateLimitSlidingWindow(
    key: string,
    limit: number,
    windowSeconds: number,
  ): RateLimitResult {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Get or create sliding window log
    let log = this.memorySlidingLogs.get(key);
    if (!log) {
      log = [];
      this.memorySlidingLogs.set(key, log);
    }

    // Remove expired entries
    while (log.length > 0 && log[0] < windowStart) {
      log.shift();
    }

    // Check if under limit
    if (log.length < limit) {
      log.push(now);
      return {
        allowed: true,
        current: log.length,
        limit,
        remaining: limit - log.length,
        resetAt: log.length > 0 ? log[0] + windowMs : now + windowMs,
        retryAfter: 0,
      };
    }

    // Over limit
    const resetAt = log[0] + windowMs;
    return {
      allowed: false,
      current: log.length,
      limit,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil((resetAt - now) / 1000),
    };
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
    
    const now = Date.now();
    this.memoryCache.set(lockKey, {
      value: lockToken,
      expiry: now + ttlSeconds * 1000,
      accessTime: now,
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
    const now = Date.now();
    const existing = this.memoryCache.get(key);
    const newValue = (parseInt(existing?.value || '0', 10) || 0) + 1;
    this.memoryCache.set(key, {
      value: newValue.toString(),
      expiry: existing?.expiry,
      accessTime: now,
    });
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
    const now = Date.now();
    const existing = this.memoryCache.get(key);
    const newValue = (parseInt(existing?.value || '0', 10) || 0) - 1;
    this.memoryCache.set(key, {
      value: newValue.toString(),
      expiry: existing?.expiry,
      accessTime: now,
    });
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
  getStatus(): { connected: boolean; mode: 'redis' | 'memory'; downSince: number | null } {
    return {
      connected: this.isRedisAvailable(),
      mode: this.isRedisAvailable() ? 'redis' : 'memory',
      downSince: this.redisDownSince,
    };
  }

  /**
   * Strict rate limiting - rejects requests when Redis is unavailable
   * Use for critical endpoints that should fail-safe (e.g., webhooks)
   */
  async strictRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
    rejectOnRedisDown: boolean = true,
  ): Promise<RateLimitResult> {
    // If Redis is down and strict mode is enabled, reject new requests
    if (!this.isRedisAvailable() && rejectOnRedisDown) {
      this.logger.warn(`[STRICT RATE LIMIT] Rejecting request - Redis unavailable: ${key}`);
      return {
        allowed: false,
        current: limit,
        limit,
        remaining: 0,
        resetAt: Date.now() + 60000, // Retry after 1 minute
        retryAfter: 60,
      };
    }

    // Normal rate limiting
    return this.rateLimitWithInfo(key, limit, windowSeconds);
  }

  /**
   * Get memory cache stats for monitoring
   */
  getCacheStats(): {
    cacheSize: number;
    rateLimitSize: number;
    slidingLogSize: number;
    maxCacheSize: number;
    maxRateLimitSize: number;
    utilizationPercent: number;
  } {
    const cacheSize = this.memoryCache.size;
    const maxCacheSize = MEMORY_CACHE_CONFIG.MAX_CACHE_ENTRIES;
    return {
      cacheSize,
      rateLimitSize: this.memoryRateLimits.size,
      slidingLogSize: this.memorySlidingLogs.size,
      maxCacheSize,
      maxRateLimitSize: MEMORY_CACHE_CONFIG.MAX_RATE_LIMIT_ENTRIES,
      utilizationPercent: Math.round((cacheSize / maxCacheSize) * 100),
    };
  }
}
