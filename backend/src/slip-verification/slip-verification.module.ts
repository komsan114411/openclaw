import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlipVerificationService } from './slip-verification.service';
import { SlipVerificationController } from './slip-verification.controller';
import { SlipHistory, SlipHistorySchema } from '../database/schemas/slip-history.schema';
import { QuotaReservation, QuotaReservationSchema } from '../database/schemas/quota-reservation.schema';
import { SystemResponseTemplatesModule } from '../system-response-templates/system-response-templates.module';
import { SlipTemplatesModule } from '../slip-templates/slip-templates.module';
import { BanksModule } from '../banks/banks.module';

// Multi-Provider System
import { ThunderProvider } from './providers/thunder.provider';
import { SlipMateProvider } from './providers/slipmate.provider';
import { Slip2GoProvider } from './providers/slip2go.provider';
import { SlipVerificationManager } from './slip-verification.manager';

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
  providers: [
    // Slip Verification Providers
    ThunderProvider,
    SlipMateProvider,
    Slip2GoProvider,

    // Manager (Auto-Failover)
    SlipVerificationManager,

    // Main Service
    SlipVerificationService,
  ],
  controllers: [SlipVerificationController],
  exports: [
    SlipVerificationService,
    SlipVerificationManager,
    ThunderProvider,
    SlipMateProvider,
    Slip2GoProvider,
  ],
})
export class SlipVerificationModule {}
