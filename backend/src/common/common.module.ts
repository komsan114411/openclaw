import { Module, Global, forwardRef } from '@nestjs/common';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RedisModule } from '../redis/redis.module';
import { ConfigurableMessagesService } from './configurable-messages.service';
import { ErrorHandlerService } from './error-handler.service';
import { TransactionService } from './transaction.service';
import { SystemResponseTemplatesModule } from '../system-response-templates/system-response-templates.module';

@Global()
@Module({
  imports: [
    RedisModule,
    // Import SystemResponseTemplatesModule to get the single instance of SystemResponseTemplatesService
    SystemResponseTemplatesModule,
  ],
  providers: [
    RateLimitGuard,
    ConfigurableMessagesService,
    ErrorHandlerService,
    TransactionService,
  ],
  exports: [
    RateLimitGuard,
    ConfigurableMessagesService,
    ErrorHandlerService,
    TransactionService,
    // Re-export so other modules can use it via CommonModule
    SystemResponseTemplatesModule,
  ],
})
export class CommonModule {}
