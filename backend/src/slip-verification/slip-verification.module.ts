import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlipVerificationService } from './slip-verification.service';
import { SlipVerificationController } from './slip-verification.controller';
import { SlipHistory, SlipHistorySchema } from '../database/schemas/slip-history.schema';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SlipHistory.name, schema: SlipHistorySchema },
    ]),
    SystemSettingsModule,
  ],
  providers: [SlipVerificationService],
  controllers: [SlipVerificationController],
  exports: [SlipVerificationService],
})
export class SlipVerificationModule {}
