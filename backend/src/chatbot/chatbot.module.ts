import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { AiQuotaService } from './ai-quota.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import {
  AiQuotaReservation,
  AiQuotaReservationSchema,
} from '../database/schemas/ai-quota-reservation.schema';

@Module({
  imports: [
    SystemSettingsModule,
    MongooseModule.forFeature([
      { name: AiQuotaReservation.name, schema: AiQuotaReservationSchema },
    ]),
  ],
  providers: [ChatbotService, AiQuotaService],
  controllers: [ChatbotController],
  exports: [ChatbotService, AiQuotaService],
})
export class ChatbotModule {}
