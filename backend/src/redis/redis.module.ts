import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const redisUrl = configService.get<string>('REDIS_URL');
        
        let redis: Redis;
        try {
          if (redisUrl) {
            redis = new Redis(redisUrl, {
              maxRetriesPerRequest: 3,
              lazyConnect: true,
              retryStrategy: (times) => {
                if (times > 3) return null;
                return Math.min(times * 100, 3000);
              },
            });
          } else {
            redis = new Redis({
              host: configService.get<string>('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6379),
              password: configService.get<string>('REDIS_PASSWORD'),
              db: configService.get<number>('REDIS_DB', 0),
              maxRetriesPerRequest: 3,
              lazyConnect: true,
              retryStrategy: (times) => {
                if (times > 3) return null;
                return Math.min(times * 100, 3000);
              },
            });
          }

          redis.on('connect', () => {
            logger.log('✅ Redis connected successfully');
          });

          redis.on('error', (err) => {
            logger.warn(`⚠️ Redis connection error: ${err.message}`);
          });

          // Try to connect but don't fail if Redis is unavailable
          redis.connect().catch((err) => {
            logger.warn(`⚠️ Redis not available, using fallback: ${err.message}`);
          });

          return redis;
        } catch (error) {
          logger.warn('⚠️ Redis initialization failed, using null client');
          return null;
        }
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
