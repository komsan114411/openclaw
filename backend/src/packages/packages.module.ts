import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PackagesService } from './packages.service';
import { PackagesController } from './packages.controller';
import { Package, PackageSchema } from '../database/schemas/package.schema';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Package.name, schema: PackageSchema }]),
    forwardRef(() => WalletModule),
  ],
  providers: [PackagesService],
  controllers: [PackagesController],
  exports: [PackagesService],
})
export class PackagesModule { }

