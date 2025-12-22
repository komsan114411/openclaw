import { Module, Global, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettings, SystemSettingsSchema } from '../database/schemas/system-settings.schema';
import { HealthModule } from '../health/health.module';
import { TasksModule } from '../tasks/tasks.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
    forwardRef(() => HealthModule),
    forwardRef(() => TasksModule),
  ],
  providers: [SystemSettingsService],
  controllers: [SystemSettingsController],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
