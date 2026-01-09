import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RateLimitController } from './controllers/rate-limit.controller';
import { RateLimitService } from './services/rate-limit.service';
import { RateLimitLog, RateLimitLogSchema } from '../database/schemas/rate-limit-log.schema';
import { RedisModule } from '../redis/redis.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RateLimitLog.name, schema: RateLimitLogSchema },
    ]),
    RedisModule,
    forwardRef(() => SystemSettingsModule),
  ],
  controllers: [RateLimitController],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
