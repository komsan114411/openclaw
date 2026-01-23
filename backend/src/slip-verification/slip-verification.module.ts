import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlipVerificationService } from './slip-verification.service';
import { SlipVerificationController } from './slip-verification.controller';
import { SlipHistory, SlipHistorySchema } from '../database/schemas/slip-history.schema';
import { QuotaReservation, QuotaReservationSchema } from '../database/schemas/quota-reservation.schema';
import { SystemResponseTemplatesModule } from '../system-response-templates/system-response-templates.module';
import { SlipTemplatesModule } from '../slip-templates/slip-templates.module';
import { BanksModule } from '../banks/banks.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SlipHistory.name, schema: SlipHistorySchema },
      { name: QuotaReservation.name, schema: QuotaReservationSchema },
    ]),
    // SystemSettingsModule is @Global() - no need to import explicitly
    SystemResponseTemplatesModule,
    SlipTemplatesModule,
    BanksModule,
  ],
  providers: [SlipVerificationService],
  controllers: [SlipVerificationController],
  exports: [SlipVerificationService],
})
export class SlipVerificationModule {}
