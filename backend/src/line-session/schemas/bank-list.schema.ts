import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BankListDocument = BankList & Document;

/**
 * Bank List Schema
 * รายชื่อธนาคารที่รองรับ
 *
 * Collection: bank_lists
 */
@Schema({
  collection: 'bank_lists',
  timestamps: true,
})
export class BankList {
  /**
   * รหัสธนาคาร (e.g., '014' = SCB, '030' = GSB, '004' = KBANK)
   */
  @Prop({ required: true, unique: true })
  bankCode: string;

  /**
   * ชื่อธนาคารภาษาไทย
   */
  @Prop({ required: true })
  bankNameTh: string;

  /**
   * ชื่อธนาคารภาษาอังกฤษ
   */
  @Prop({ required: true })
  bankNameEn: string;

  /**
   * Swift Code
   */
  @Prop()
  bankSwift: string;

  /**
   * URL รูปโลโก้ธนาคาร
   */
  @Prop()
  bankImg: string;

  /**
   * ChatMid ของ LINE OA ธนาคาร (ถ้าทราบ)
   */
  @Prop()
  defaultChatMid: string;

  /**
   * ระยะเวลา relogin (นาที)
   */
  @Prop({ default: 20 })
  reLoginAtMins: number;

  /**
   * เปิดใช้งานหรือไม่
   */
  @Prop({ default: true })
  isActive: boolean;
}

export const BankListSchema = SchemaFactory.createForClass(BankList);

// Default bank list data
export const DEFAULT_BANKS = [
  {
    bankCode: '014',
    bankNameTh: 'ธนาคารไทยพาณิชย์',
    bankNameEn: 'SCB',
    bankSwift: 'SICOTHBK',
    reLoginAtMins: 20,
  },
  {
    bankCode: '030',
    bankNameTh: 'ธนาคารออมสิน',
    bankNameEn: 'GSB',
    bankSwift: 'GABORHBK',
    reLoginAtMins: 20,
  },
  {
    bankCode: '004',
    bankNameTh: 'ธนาคารกสิกรไทย',
    bankNameEn: 'KBANK',
    bankSwift: 'KASITHBK',
    reLoginAtMins: 20,
  },
  {
    bankCode: '002',
    bankNameTh: 'ธนาคารกรุงเทพ',
    bankNameEn: 'BBL',
    bankSwift: 'BKKBTHBK',
    reLoginAtMins: 20,
  },
  {
    bankCode: '006',
    bankNameTh: 'ธนาคารกรุงไทย',
    bankNameEn: 'KTB',
    bankSwift: 'KRTHTHBK',
    reLoginAtMins: 20,
  },
  {
    bankCode: '025',
    bankNameTh: 'ธนาคารกรุงศรีอยุธยา',
    bankNameEn: 'BAY',
    bankSwift: 'AYUDTHBK',
    reLoginAtMins: 20,
  },
  {
    bankCode: '011',
    bankNameTh: 'ธนาคารทหารไทยธนชาต',
    bankNameEn: 'TTB',
    bankSwift: 'TABORHBK',
    reLoginAtMins: 20,
  },
];
