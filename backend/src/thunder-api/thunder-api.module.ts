import { Module } from '@nestjs/common';
import { ThunderApiService } from './thunder-api.service';
import { ThunderApiController } from './thunder-api.controller';

@Module({
  providers: [ThunderApiService],
  controllers: [ThunderApiController],
  exports: [ThunderApiService],
})
export class ThunderApiModule {}
