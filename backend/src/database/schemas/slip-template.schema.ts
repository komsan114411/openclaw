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

  @Prop({ default: true })
  showBankLogo: boolean;

  // Extended fields (from Thunder payload) - optional toggles
  @Prop({ default: false })
  showCountryCode: boolean;

  @Prop({ default: false })
  showFee: boolean;

  @Prop({ default: false })
  showRefs: boolean; // ref1/ref2/ref3

  @Prop({ default: false })
  showPayload: boolean; // raw payload/hash (truncated)

  @Prop({ default: false })
  showSenderBankId: boolean;

  @Prop({ default: false })
  showReceiverBankId: boolean;

  @Prop({ default: false })
  showReceiverProxy: boolean;

  // New fields for enhanced slip display
  @Prop({ default: false })
  showSenderAccount: boolean; // Show sender account number

  @Prop({ default: false })
  showReceiverAccount: boolean; // Show receiver account number

  @Prop({ default: false })
  showSenderNameEn: boolean; // Show sender English name

  @Prop({ default: false })
  showReceiverNameEn: boolean; // Show receiver English name

  @Prop({ default: false })
  showLocalAmount: boolean; // Show local currency amount

  // Preview sample data - admin configurable per template
  @Prop({ default: 'นาย ธันเดอร์ มานะ' })
  previewSenderName?: string;

  @Prop({ default: 'นาย ธันเดอร์ มานะ' })
  previewReceiverName?: string;

  @Prop()
  previewSenderBankId?: string;

  @Prop()
  previewReceiverBankId?: string;

  @Prop({ default: '1,000.00' })
  previewAmount?: string;

  @Prop({ default: '1234xxxx5678' })
  previewSenderAccount?: string;

  @Prop({ default: '12xxxx3456' })
  previewReceiverAccount?: string;

  // ============================================
  // Enhanced Styling Options (New)
  // ============================================

  // Theme Preset - quick selection for predefined styles
  @Prop({
    type: String,
    enum: ['default', 'green', 'green-gradient', 'orange', 'pink', 'blue', 'purple', 'festive-cat', 'festive-flower', 'custom'],
    default: 'default'
  })
  themePreset: string;

  // Header Styling
  @Prop()
  headerBackgroundColor?: string;  // e.g., "#4ADE80"

  @Prop()
  headerBackgroundGradient?: string;  // e.g., "linear-gradient(135deg, #4ADE80, #22C55E)"

  @Prop()
  headerBackgroundImage?: string;  // URL to header background image

  @Prop()
  headerTextColor?: string;  // e.g., "#FFFFFF"

  @Prop({
    type: String,
    enum: ['checkmark', 'warning', 'error', 'info', 'none'],
    default: 'checkmark'
  })
  headerIcon: string;

  @Prop()
  headerIconUrl?: string;  // Custom icon URL

  // Body Styling
  @Prop({ default: '#FFFFFF' })
  bodyBackgroundColor?: string;

  @Prop()
  bodyBackgroundImage?: string;  // URL for decorative background

  @Prop({ default: 0.1 })
  bodyBackgroundOpacity?: number;  // 0-1 for watermark effect

  // Amount Styling
  @Prop({ default: '#22C55E' })
  amountColor?: string;

  @Prop({ default: '32px' })
  amountFontSize?: string;

  // Sender/Receiver Card Styling
  @Prop({ default: '#F5F5F5' })
  cardBackgroundColor?: string;

  @Prop({ default: '12px' })
  cardBorderRadius?: string;

  @Prop({ default: true })
  showCardBorder: boolean;

  @Prop({ default: '#E5E5E5' })
  cardBorderColor?: string;

  // Footer Branding
  @Prop({ default: true })
  showFooterBranding: boolean;

  @Prop({ default: 'ตรวจสอบสลิปโดย' })
  footerBrandingText?: string;

  @Prop()
  footerBrandingName?: string;  // e.g., "ธันเดอร์ โซลูชั่น"

  @Prop()
  footerBrandingLogo?: string;  // URL to branding logo

  @Prop({ default: false })
  showQrCode: boolean;

  @Prop()
  qrCodeContent?: string;  // Content for QR code

  @Prop()
  qrCodeLabel?: string;  // Label below QR code

  // Layout Options
  @Prop({
    type: String,
    enum: ['standard', 'compact', 'detailed'],
    default: 'standard'
  })
  layoutStyle: string;

  @Prop({ default: true })
  showSlipImage: boolean;  // Show slip preview image in header

  // Thumbnail/Preview
  @Prop()
  thumbnailUrl?: string;  // Thumbnail for template selection

  createdAt: Date;
  updatedAt: Date;
}

export const SlipTemplateSchema = SchemaFactory.createForClass(SlipTemplate);

// Indexes
SlipTemplateSchema.index({ lineAccountId: 1, type: 1 });
SlipTemplateSchema.index({ lineAccountId: 1, isDefault: 1 });
SlipTemplateSchema.index({ isGlobal: 1, isActive: 1 });
SlipTemplateSchema.index({ isSystemTemplate: 1 });
