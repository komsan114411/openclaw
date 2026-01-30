import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { LineSession, LineSessionSchema } from './schemas/line-session.schema';
import { LineKeyHistory, LineKeyHistorySchema } from './schemas/line-key-history.schema';
import { BankList, BankListSchema } from './schemas/bank-list.schema';
import { LineMessage, LineMessageSchema } from './schemas/line-message.schema';

// Services
import { KeyStorageService } from './services/key-storage.service';
import { SessionHealthService } from './services/session-health.service';
import { ReloginSchedulerService } from './services/relogin-scheduler.service';
import { LineAutomationService } from './services/line-automation.service';
import { MessageFetchService } from './services/message-fetch.service';

// Controller
import { LineSessionController } from './line-session.controller';

// Import EventBusModule from core
import { EventBusModule } from '../core/events';
import { ConfigModule } from '@nestjs/config';

/**
 * LINE Session Module
 *
 * Module แยกอิสระสำหรับจัดการ LINE Session และ Keys
 *
 * Features:
 * - เก็บ/จัดการ LINE keys (xLineAccess, xHmac)
 * - ตรวจสอบ health ของ sessions
 * - Auto-relogin เมื่อ keys หมดอายุ
 * - ประวัติการสกัด keys
 *
 * การติดตั้ง:
 * - เพิ่ม LineSessionModule ใน app.module.ts imports
 *
 * การถอดออก:
 * - ลบ folder src/line-session/
 * - ลบ LineSessionModule จาก app.module.ts imports
 *
 * Collections ที่สร้าง:
 * - line_sessions
 * - line_key_histories
 */
@Module({
  imports: [
    // Database schemas
    MongooseModule.forFeature([
      { name: LineSession.name, schema: LineSessionSchema },
      { name: LineKeyHistory.name, schema: LineKeyHistorySchema },
      { name: BankList.name, schema: BankListSchema },
      { name: LineMessage.name, schema: LineMessageSchema },
    ]),
    // EventBus for publishing/subscribing to events
    EventBusModule,
    // Config for encryption keys
    ConfigModule,
  ],
  controllers: [LineSessionController],
  providers: [
    KeyStorageService,
    SessionHealthService,
    ReloginSchedulerService,
    LineAutomationService,
    MessageFetchService,
  ],
  exports: [
    KeyStorageService,
    SessionHealthService,
    ReloginSchedulerService,
    LineAutomationService,
    MessageFetchService,
  ],
})
export class LineSessionModule {}
