import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisModule } from '../redis/redis.module';
import { User, UserSchema } from '../database/schemas/user.schema';
import { SystemSettings, SystemSettingsSchema } from '../database/schemas/system-settings.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Module({
  imports: [
    RedisModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
  ],
  controllers: [HealthController],
  providers: [HealthService, SystemSettingsService],
  exports: [HealthService],
})
export class HealthModule {}
