import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionEventHandlers } from './subscription.handlers';
import { Subscription, SubscriptionSchema } from '../database/schemas/subscription.schema';
import { Package, PackageSchema } from '../database/schemas/package.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Package.name, schema: PackageSchema },
    ]),
  ],
  providers: [SubscriptionsService, SubscriptionEventHandlers],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule { }

