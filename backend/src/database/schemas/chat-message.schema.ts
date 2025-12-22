import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
  AUDIO = 'audio',
  VIDEO = 'video',
  FILE = 'file',
  LOCATION = 'location',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ type: Types.ObjectId, ref: 'LineAccount', required: true, index: true })
  lineAccountId: Types.ObjectId;

  @Prop({ required: true, index: true })
  lineUserId: string;

  @Prop()
  lineUserName?: string;

  @Prop()
  lineUserPicture?: string;

  @Prop({ type: String, enum: MessageDirection, required: true })
  direction: MessageDirection;

  @Prop({ type: String, enum: MessageType, default: MessageType.TEXT })
  messageType: MessageType;

  @Prop()
  messageText?: string;

  @Prop()
  messageId?: string;

  @Prop()
  replyToken?: string;

  @Prop({ type: Object })
  rawMessage?: Record<string, any>;

  @Prop({ type: Object })
  content?: Record<string, any>;

  @Prop()
  imageUrl?: string;

  @Prop()
  stickerPackageId?: string;

  @Prop()
  stickerId?: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  @Prop()
  sentBy?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Indexes for efficient queries
ChatMessageSchema.index({ lineAccountId: 1, lineUserId: 1, createdAt: -1 });
ChatMessageSchema.index({ lineAccountId: 1, createdAt: -1 });
ChatMessageSchema.index({ lineUserId: 1, createdAt: -1 });
ChatMessageSchema.index({ lineAccountId: 1, isRead: 1 });
