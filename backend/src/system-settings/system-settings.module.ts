import { Module, Global, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettings, SystemSettingsSchema } from '../database/schemas/system-settings.schema';
import { Bank, BankSchema } from '../database/schemas/bank.schema';
import { HealthModule } from '../health/health.module';
import { TasksModule } from '../tasks/tasks.module';
import { WalletModule } from '../wallet/wallet.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
      // Used to enrich payment bank accounts with logo/name in `payment-info`
      { name: Bank.name, schema: BankSchema },
    ]),
    forwardRef(() => HealthModule),
    forwardRef(() => TasksModule),
    forwardRef(() => WalletModule),
  ],
  providers: [SystemSettingsService],
  controllers: [SystemSettingsController],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule { }
