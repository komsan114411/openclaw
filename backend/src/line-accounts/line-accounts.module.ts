import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LineAccountsService } from './line-accounts.service';
import { LineAccountsController } from './line-accounts.controller';
import { LineWebhookController } from './line-webhook.controller';
import { LineAccount, LineAccountSchema } from '../database/schemas/line-account.schema';
import { ChatMessage, ChatMessageSchema } from '../database/schemas/chat-message.schema';
import { SlipTemplate, SlipTemplateSchema } from '../database/schemas/slip-template.schema';
import { SlipHistory, SlipHistorySchema } from '../database/schemas/slip-history.schema';
import { LineMessage, LineMessageSchema } from '../line-session/schemas/line-message.schema';
import { AccountAlert, AccountAlertSchema } from '../line-session/schemas/account-alert.schema';
import { AngpaoHistory, AngpaoHistorySchema } from '../angpao/schemas/angpao-history.schema';
import { SlipVerificationModule } from '../slip-verification/slip-verification.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { WebhookRateLimitGuard } from '../common/guards/webhook-rate-limit.guard';
import { AngpaoModule } from '../angpao/angpao.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LineAccount.name, schema: LineAccountSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: SlipTemplate.name, schema: SlipTemplateSchema },
      { name: LineMessage.name, schema: LineMessageSchema },
      { name: AccountAlert.name, schema: AccountAlertSchema },
      { name: SlipHistory.name, schema: SlipHistorySchema },
      { name: AngpaoHistory.name, schema: AngpaoHistorySchema },
    ]),
    SlipVerificationModule,
    ChatbotModule,
    SubscriptionsModule,
    SystemSettingsModule,
    AngpaoModule,
  ],
  providers: [LineAccountsService, WebhookRateLimitGuard],
  controllers: [LineAccountsController, LineWebhookController],
  exports: [LineAccountsService],
})
export class LineAccountsModule {}
