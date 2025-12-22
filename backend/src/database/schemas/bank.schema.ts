import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BankDocument = Bank & Document;

@Schema({ timestamps: true, collection: 'banks' })
export class Bank {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  nameTh?: string;

  @Prop()
  nameEn?: string;

  @Prop()
  shortName?: string;

  @Prop()
  color?: string;

  @Prop()
  logoUrl?: string;

  @Prop()
  logoBase64?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

export const BankSchema = SchemaFactory.createForClass(Bank);

// Index
BankSchema.index({ code: 1 }, { unique: true });
BankSchema.index({ isActive: 1, sortOrder: 1 });
