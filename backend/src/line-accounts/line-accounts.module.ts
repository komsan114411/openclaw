import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LineAccountsService } from './line-accounts.service';
import { LineAccountsController } from './line-accounts.controller';
import { LineWebhookController } from './line-webhook.controller';
import { LineAccount, LineAccountSchema } from '../database/schemas/line-account.schema';
import { ChatMessage, ChatMessageSchema } from '../database/schemas/chat-message.schema';
import { SlipTemplate, SlipTemplateSchema } from '../database/schemas/slip-template.schema';
import { SlipVerificationModule } from '../slip-verification/slip-verification.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { WebhookRateLimitGuard } from '../common/guards/webhook-rate-limit.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LineAccount.name, schema: LineAccountSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: SlipTemplate.name, schema: SlipTemplateSchema },
    ]),
    SlipVerificationModule,
    ChatbotModule,
    SubscriptionsModule,
    SystemSettingsModule,
  ],
  providers: [LineAccountsService, WebhookRateLimitGuard],
  controllers: [LineAccountsController, LineWebhookController],
  exports: [LineAccountsService],
})
export class LineAccountsModule {}
