import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemResponseTemplatesService } from './system-response-templates.service';
import { SystemResponseTemplatesController } from './system-response-templates.controller';
import {
  SystemResponseTemplate,
  SystemResponseTemplateSchema,
} from '../database/schemas/system-response-template.schema';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemResponseTemplate.name, schema: SystemResponseTemplateSchema },
    ]),
    RedisModule,
  ],
  controllers: [SystemResponseTemplatesController],
  providers: [SystemResponseTemplatesService],
  exports: [SystemResponseTemplatesService],
})
export class SystemResponseTemplatesModule {}
