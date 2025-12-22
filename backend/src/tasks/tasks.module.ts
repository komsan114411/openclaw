import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [SubscriptionsModule, PaymentsModule],
  providers: [TasksService],
})
export class TasksModule {}
