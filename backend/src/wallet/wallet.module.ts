import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { Wallet, WalletSchema } from '../database/schemas/wallet.schema';
import { CreditTransaction, CreditTransactionSchema } from '../database/schemas/credit-transaction.schema';
import { SlipVerificationModule } from '../slip-verification/slip-verification.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Wallet.name, schema: WalletSchema },
            { name: CreditTransaction.name, schema: CreditTransactionSchema },
        ]),
        forwardRef(() => SlipVerificationModule),
        forwardRef(() => SystemSettingsModule),
        forwardRef(() => SubscriptionsModule),
        RedisModule,
    ],
    controllers: [WalletController],
    providers: [WalletService],
    exports: [WalletService],
})
export class WalletModule { }
