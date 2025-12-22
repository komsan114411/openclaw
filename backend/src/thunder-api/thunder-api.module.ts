import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThunderApiService } from './thunder-api.service';
import { ThunderApiController } from './thunder-api.controller';
import { SystemSettings, SystemSettingsSchema } from '../database/schemas/system-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
  ],
  controllers: [ThunderApiController],
  providers: [ThunderApiService],
  exports: [ThunderApiService],
})
export class ThunderApiModule {}
