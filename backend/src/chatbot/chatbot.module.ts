import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { AiQuotaService } from './ai-quota.service';
import { SpamDetectorService } from './spam-detector.service';
import { DuplicateDetectorService } from './duplicate-detector.service';
import { IntentClassifierService } from './intent-classifier.service';
import { SmartResponseService } from './smart-response.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import {
  AiQuotaReservation,
  AiQuotaReservationSchema,
} from '../database/schemas/ai-quota-reservation.schema';
import {
  LineAccount,
  LineAccountSchema,
} from '../database/schemas/line-account.schema';

@Module({
  imports: [
    SystemSettingsModule,
    MongooseModule.forFeature([
      { name: AiQuotaReservation.name, schema: AiQuotaReservationSchema },
      { name: LineAccount.name, schema: LineAccountSchema },
    ]),
  ],
  providers: [
    ChatbotService,
    AiQuotaService,
    SpamDetectorService,
    DuplicateDetectorService,
    IntentClassifierService,
    SmartResponseService,
  ],
  controllers: [ChatbotController],
  exports: [
    ChatbotService,
    AiQuotaService,
    SmartResponseService,
  ],
})
export class ChatbotModule {}
