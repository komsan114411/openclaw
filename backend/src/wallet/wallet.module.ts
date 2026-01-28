import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { UsdtRateService } from './usdt-rate.service';
import { TronVerificationService } from './tron-verification.service';
import { BlockchainVerificationService } from './blockchain-verification.service';
import { Wallet, WalletSchema } from '../database/schemas/wallet.schema';
import { CreditTransaction, CreditTransactionSchema } from '../database/schemas/credit-transaction.schema';
import { WalletOperationLog, WalletOperationLogSchema } from '../database/schemas/wallet-operation-log.schema';
import { SlipVerificationModule } from '../slip-verification/slip-verification.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RedisModule } from '../redis/redis.module';
import { SecurityUtil } from '../utils/security.util';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Wallet.name, schema: WalletSchema },
            { name: CreditTransaction.name, schema: CreditTransactionSchema },
            { name: WalletOperationLog.name, schema: WalletOperationLogSchema },
        ]),
        forwardRef(() => SlipVerificationModule),
        forwardRef(() => SystemSettingsModule),
        forwardRef(() => SubscriptionsModule),
        RedisModule,
    ],
    controllers: [WalletController],
    providers: [WalletService, UsdtRateService, TronVerificationService, BlockchainVerificationService, SecurityUtil],
    exports: [WalletService, UsdtRateService, TronVerificationService, BlockchainVerificationService],
})
export class WalletModule { }


