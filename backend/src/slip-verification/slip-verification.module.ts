import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlipVerificationService } from './slip-verification.service';
import { SlipVerificationController } from './slip-verification.controller';
import { SlipHistory, SlipHistorySchema } from '../database/schemas/slip-history.schema';
import { QuotaReservation, QuotaReservationSchema } from '../database/schemas/quota-reservation.schema';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SystemResponseTemplatesModule } from '../system-response-templates/system-response-templates.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SlipHistory.name, schema: SlipHistorySchema },
      { name: QuotaReservation.name, schema: QuotaReservationSchema },
    ]),
    SystemSettingsModule,
    SystemResponseTemplatesModule,
  ],
  providers: [SlipVerificationService],
  controllers: [SlipVerificationController],
  exports: [SlipVerificationService],
})
export class SlipVerificationModule {}
