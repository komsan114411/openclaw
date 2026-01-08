import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThunderApiService } from './thunder-api.service';
import { ThunderApiController } from './thunder-api.controller';
import { SystemSettings, SystemSettingsSchema } from '../database/schemas/system-settings.schema';
import { SecurityUtil } from '../utils/security.util';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
  ],
  controllers: [ThunderApiController],
  providers: [ThunderApiService, SecurityUtil],
  exports: [ThunderApiService],
})
export class ThunderApiModule { }

