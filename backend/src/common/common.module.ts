import { Module, Global, forwardRef } from '@nestjs/common';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RedisModule } from '../redis/redis.module';
import { ConfigurableMessagesService } from './configurable-messages.service';
import { ErrorHandlerService } from './error-handler.service';
import { TransactionService } from './transaction.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SystemResponseTemplatesService } from '../system-response-templates/system-response-templates.service';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSettings, SystemSettingsSchema } from '../database/schemas/system-settings.schema';
import { SystemResponseTemplate, SystemResponseTemplateSchema } from '../database/schemas/system-response-template.schema';

@Global()
@Module({
  imports: [
    RedisModule,
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
      { name: SystemResponseTemplate.name, schema: SystemResponseTemplateSchema },
    ]),
  ],
  providers: [
    RateLimitGuard,
    ConfigurableMessagesService,
    ErrorHandlerService,
    TransactionService,
    SystemSettingsService,
    SystemResponseTemplatesService,
  ],
  exports: [
    RateLimitGuard,
    ConfigurableMessagesService,
    ErrorHandlerService,
    TransactionService,
    SystemResponseTemplatesService,
  ],
})
export class CommonModule {}
