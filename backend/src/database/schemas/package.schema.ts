import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PackageDocument = Package & Document;

@Schema({ timestamps: true, collection: 'packages' })
export class Package {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  price: number;

  @Prop()
  priceUsdt: number;

  @Prop({ required: true })
  slipQuota: number;

  @Prop({ required: true })
  durationDays: number;

  @Prop()
  description: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ default: false })
  isFreeStarter: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const PackageSchema = SchemaFactory.createForClass(Package);

PackageSchema.index({ name: 1 }, { unique: true });
PackageSchema.index({ isActive: 1, sortOrder: 1 });
