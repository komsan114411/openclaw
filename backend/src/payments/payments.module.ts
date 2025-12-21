import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { PackagesModule } from '../packages/packages.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SlipVerificationModule } from '../slip-verification/slip-verification.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    forwardRef(() => PackagesModule),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => SystemSettingsModule),
    forwardRef(() => SlipVerificationModule),
    forwardRef(() => ActivityLogsModule),
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
