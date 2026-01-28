import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnnouncementDocument = Announcement & Document;

@Schema({ timestamps: true, collection: 'announcements' })
export class Announcement {
  @Prop({ required: true })
  title: string;

  @Prop()
  message?: string;

  @Prop()
  imageUrl?: string;

  @Prop()
  imageBase64?: string;

  @Prop()
  linkUrl?: string;

  @Prop()
  linkText?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ default: true })
  allowDismiss: boolean;

  @Prop({ default: true })
  allowDismissFor7Days: boolean;

  @Prop({
    type: String,
    enum: ['banner', 'popup', 'slide'],
    default: 'banner'
  })
  displayType: string;

  @Prop({
    type: String,
    enum: ['top', 'center', 'bottom'],
    default: 'top'
  })
  position: string;

  @Prop({ default: '#06C755' })
  backgroundColor?: string;

  @Prop({ default: '#FFFFFF' })
  textColor?: string;

  @Prop({ default: 0 })
  priority: number;

  @Prop({ type: [String], default: ['user'] })
  targetPages: string[];

  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ default: 0 })
  dismissCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

AnnouncementSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
AnnouncementSchema.index({ priority: -1 });
