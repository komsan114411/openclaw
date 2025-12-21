import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatMessageDocument = ChatMessage & Document;

export enum MessageDirection {
  IN = 'in',
  OUT = 'out',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  STICKER = 'sticker',
  FLEX = 'flex',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ required: true })
  lineAccountId: string;

  @Prop({ required: true })
  lineUserId: string;

  @Prop()
  lineUserName: string;

  @Prop({ type: String, enum: MessageDirection, required: true })
  direction: MessageDirection;

  @Prop({ type: String, enum: MessageType, default: MessageType.TEXT })
  messageType: MessageType;

  @Prop()
  messageText: string;

  @Prop()
  messageId: string;

  @Prop()
  replyToken: string;

  @Prop({ type: Object })
  rawMessage: Record<string, any>;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

ChatMessageSchema.index({ lineAccountId: 1, createdAt: -1 });
ChatMessageSchema.index({ lineUserId: 1, createdAt: -1 });
