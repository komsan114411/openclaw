import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SlipTemplateDocument = SlipTemplate & Document;

export enum TemplateType {
  SUCCESS = 'success',
  DUPLICATE = 'duplicate',
  ERROR = 'error',
  NOT_FOUND = 'not_found',
}

@Schema({ timestamps: true, collection: 'slip_templates' })
export class SlipTemplate {
  // For global templates (admin-created), lineAccountId is null
  @Prop({ type: Types.ObjectId, ref: 'LineAccount', index: true })
  lineAccountId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerId?: Types.ObjectId;

  // Global template flag - admin creates these for all users to use
  @Prop({ default: false })
  isGlobal: boolean;

  // Created by admin flag
  @Prop({ default: false })
  isSystemTemplate: boolean;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: TemplateType, required: true })
  type: TemplateType;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: true })
  isActive: boolean;

  // Flex Message Template
  @Prop({ type: Object })
  flexTemplate?: Record<string, any>;

  // Text Template (fallback)
  @Prop()
  textTemplate?: string;

  // Template Variables
  @Prop({ type: [String], default: [] })
  variables: string[];

  // Styling options
  @Prop()
  primaryColor?: string;

  @Prop()
  secondaryColor?: string;

  // Linked Bank for styling
  @Prop({ type: Types.ObjectId, ref: 'Bank' })
  bankId?: Types.ObjectId;

  @Prop()
  headerText?: string;

  @Prop()
  footerText?: string;

  // Footer link settings
  @Prop()
  footerLink?: string;

  @Prop()
  footerLinkText?: string;

  // Delay warning settings (for duplicate/late verification)
  @Prop({ default: false })
  showDelayWarning: boolean;

  @Prop({ default: 5 })
  delayWarningMinutes: number;

  @Prop({ default: true })
  showAmount: boolean;

  @Prop({ default: true })
  showSender: boolean;

  @Prop({ default: true })
  showReceiver: boolean;

  @Prop({ default: true })
  showDate: boolean;

  @Prop({ default: true })
  showTime: boolean;

  @Prop({ default: true })
  showTransRef: boolean;

  @Prop({ default: false })
  showBankLogo: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const SlipTemplateSchema = SchemaFactory.createForClass(SlipTemplate);

// Indexes
SlipTemplateSchema.index({ lineAccountId: 1, type: 1 });
SlipTemplateSchema.index({ lineAccountId: 1, isDefault: 1 });
SlipTemplateSchema.index({ isGlobal: 1, isActive: 1 });
SlipTemplateSchema.index({ isSystemTemplate: 1 });
