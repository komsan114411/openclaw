import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { LineAccount, LineAccountSchema } from './schemas/line-account.schema';
import { Package, PackageSchema } from './schemas/package.schema';
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { SystemSettings, SystemSettingsSchema } from './schemas/system-settings.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { SlipHistory, SlipHistorySchema } from './schemas/slip-history.schema';
import { QuotaReservation, QuotaReservationSchema } from './schemas/quota-reservation.schema';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: LineAccount.name, schema: LineAccountSchema },
      { name: Package.name, schema: PackageSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: SystemSettings.name, schema: SystemSettingsSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: SlipHistory.name, schema: SlipHistorySchema },
      { name: QuotaReservation.name, schema: QuotaReservationSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
