import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RateLimitLogDocument = RateLimitLog & Document;

export enum RateLimitType {
  PER_IP = 'per_ip',
  PER_ACCOUNT = 'per_account',
  GLOBAL = 'global',
}

export enum RateLimitAction {
  BLOCKED = 'blocked',
  ALLOWED = 'allowed',
  TEST = 'test',
}

@Schema({ timestamps: true, collection: 'rate_limit_logs' })
export class RateLimitLog {
  @Prop({ required: true, type: String, enum: RateLimitType })
  type: RateLimitType;

  @Prop({ required: true, type: String, enum: RateLimitAction })
  action: RateLimitAction;

  @Prop()
  clientIp: string;

  @Prop()
  accountSlug: string;

  @Prop()
  endpoint: string;

  @Prop()
  userAgent: string;

  @Prop({ default: 0 })
  requestCount: number;

  @Prop({ default: 0 })
  limit: number;

  @Prop()
  retryAfter: number;

  @Prop()
  resetAt: Date;

  @Prop()
  message: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isTest: boolean;
}

export const RateLimitLogSchema = SchemaFactory.createForClass(RateLimitLog);

// Indexes for efficient querying
RateLimitLogSchema.index({ createdAt: -1 });
RateLimitLogSchema.index({ type: 1, createdAt: -1 });
RateLimitLogSchema.index({ action: 1, createdAt: -1 });
RateLimitLogSchema.index({ clientIp: 1, createdAt: -1 });
RateLimitLogSchema.index({ accountSlug: 1, createdAt: -1 });
RateLimitLogSchema.index({ isTest: 1, createdAt: -1 });

// TTL index to auto-delete logs older than 7 days
RateLimitLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
