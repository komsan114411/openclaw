import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AngpaoService } from './angpao.service';
import { AngpaoHistory, AngpaoHistorySchema } from './schemas/angpao-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AngpaoHistory.name, schema: AngpaoHistorySchema },
    ]),
  ],
  providers: [AngpaoService],
  exports: [AngpaoService],
})
export class AngpaoModule {}
