import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const redisClientFactory = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('RedisModule');
    const redisUrl = configService.get<string>('REDIS_URL');
    
    // If no Redis URL, return null (will use memory fallback)
    if (!redisUrl) {
      logger.warn('⚠️ REDIS_URL not set, using memory fallback');
      return null;
    }
    
    try {
      const redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 3000);
        },
      });

      redis.on('connect', () => {
        logger.log('✅ Redis connected successfully');
      });

      redis.on('error', (err) => {
        logger.warn(`⚠️ Redis connection error: ${err.message}`);
      });

      // Try to connect but don't fail if Redis is unavailable
      redis.connect().catch((err) => {
        logger.warn(`⚠️ Redis not available: ${err.message}`);
      });

      return redis;
    } catch (error) {
      logger.warn('⚠️ Redis initialization failed, using memory fallback');
      return null;
    }
  },
  inject: [ConfigService],
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [redisClientFactory, RedisService],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
