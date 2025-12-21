import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LineAccountsService } from './line-accounts.service';
import { LineAccountsController } from './line-accounts.controller';
import { LineWebhookController } from './line-webhook.controller';
import { LineAccount, LineAccountSchema } from '../database/schemas/line-account.schema';
import { ChatMessage, ChatMessageSchema } from '../database/schemas/chat-message.schema';
import { SlipVerificationModule } from '../slip-verification/slip-verification.module';
import { ChatbotModule } from '../chatbot/chatbot.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LineAccount.name, schema: LineAccountSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    SlipVerificationModule,
    ChatbotModule,
  ],
  providers: [LineAccountsService],
  controllers: [LineAccountsController, LineWebhookController],
  exports: [LineAccountsService],
})
export class LineAccountsModule {}
