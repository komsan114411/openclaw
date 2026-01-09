import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksService } from './tasks.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentsModule } from '../payments/payments.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { RedisModule } from '../redis/redis.module';
import { Session, SessionSchema } from '../database/schemas/session.schema';
import { QuotaReservation, QuotaReservationSchema } from '../database/schemas/quota-reservation.schema';

@Module({
  imports: [
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => SystemSettingsModule),
    RedisModule,
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: QuotaReservation.name, schema: QuotaReservationSchema },
    ]),
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
