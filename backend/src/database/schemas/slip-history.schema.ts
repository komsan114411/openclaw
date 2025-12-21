import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SlipHistoryDocument = SlipHistory & Document;

export enum SlipStatus {
  SUCCESS = 'success',
  DUPLICATE = 'duplicate',
  ERROR = 'error',
  NOT_FOUND = 'not_found',
}

@Schema({ timestamps: true, collection: 'slip_history' })
export class SlipHistory {
  @Prop({ required: true })
  lineAccountId: string;

  @Prop({ required: true })
  lineUserId: string;

  @Prop()
  messageId: string;

  @Prop({ type: String, enum: SlipStatus, required: true })
  status: SlipStatus;

  @Prop()
  transRef: string;

  @Prop()
  amount: number;

  @Prop()
  senderName: string;

  @Prop()
  senderBank: string;

  @Prop()
  receiverName: string;

  @Prop()
  receiverBank: string;

  @Prop()
  receiverAccountNumber: string;

  @Prop()
  transactionDate: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  rawData: Record<string, any>;

  @Prop()
  errorMessage: string;

  @Prop()
  verifiedBy: string;
}

export const SlipHistorySchema = SchemaFactory.createForClass(SlipHistory);

SlipHistorySchema.index({ lineAccountId: 1, createdAt: -1 });
SlipHistorySchema.index({ transRef: 1 });
SlipHistorySchema.index({ lineUserId: 1 });
