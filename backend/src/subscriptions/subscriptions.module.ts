import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionEventHandlers } from './subscription.handlers';
import { Subscription, SubscriptionSchema } from '../database/schemas/subscription.schema';
import { Package, PackageSchema } from '../database/schemas/package.schema';
import { PackagesModule } from '../packages/packages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Package.name, schema: PackageSchema },
    ]),
    // PackagesModule needed for SubscriptionsService to get package details
    forwardRef(() => PackagesModule),
  ],
  providers: [SubscriptionsService, SubscriptionEventHandlers],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule { }


