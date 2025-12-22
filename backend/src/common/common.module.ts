import { Module, Global } from '@nestjs/common';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RedisModule } from '../redis/redis.module';
import { ConfigurableMessagesService } from './configurable-messages.service';
import { ErrorHandlerService } from './error-handler.service';
import { TransactionService } from './transaction.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSettings, SystemSettingsSchema } from '../database/schemas/system-settings.schema';

@Global()
@Module({
  imports: [
    RedisModule,
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
  ],
  providers: [
    RateLimitGuard,
    ConfigurableMessagesService,
    ErrorHandlerService,
    TransactionService,
    SystemSettingsService,
  ],
  exports: [
    RateLimitGuard,
    ConfigurableMessagesService,
    ErrorHandlerService,
    TransactionService,
  ],
})
export class CommonModule {}
