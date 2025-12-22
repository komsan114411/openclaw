import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlipTemplatesController, AdminSlipTemplatesController } from './slip-templates.controller';
import { SlipTemplatesService } from './slip-templates.service';
import { SlipTemplate, SlipTemplateSchema } from '../database/schemas/slip-template.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SlipTemplate.name, schema: SlipTemplateSchema },
    ]),
    AuthModule,
  ],
  controllers: [SlipTemplatesController, AdminSlipTemplatesController],
  providers: [SlipTemplatesService],
  exports: [SlipTemplatesService],
})
export class SlipTemplatesModule {}
