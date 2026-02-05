import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PackageDocument = Package & Document;

@Schema({ timestamps: true, collection: 'packages' })
export class Package {
  @Prop({ required: true, unique: true, index: true })
  name: string;

  @Prop({ required: true })
  price: number;

  @Prop()
  priceUsdt: number;

  @Prop({ required: true })
  slipQuota: number;

  @Prop({ default: 0 })
  aiQuota: number;  // จำนวน AI quota ที่ได้รับ

  @Prop({ required: true })
  durationDays: number;

  // จำนวนครั้งที่ซื้อได้ต่อผู้ใช้ (null หรือ 0 = ไม่จำกัด)
  // เช่น 1 = โปรโมชั่นสมัครใหม่ ซื้อได้ครั้งเดียว
  @Prop({ default: null })
  maxPurchasesPerUser: number;

  @Prop()
  description: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ default: false })
  isFreeStarter: boolean;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: 0, index: true })
  sortOrder: number;

  // แพ็คเกจแนะนำ - แสดงเป็น highlight ในหน้า user/packages
  @Prop({ default: false })
  isRecommended: boolean;
}

export const PackageSchema = SchemaFactory.createForClass(Package);
