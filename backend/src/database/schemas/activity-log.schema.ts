import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActivityLogDocument = ActivityLog & Document;

export enum ActivityActorRole {
  ADMIN = 'admin',
  USER = 'user',
  SYSTEM = 'system',
}

@Schema({ timestamps: true, collection: 'activity_logs' })
export class ActivityLog {
  // Who performed the action (or "system")
  @Prop({ index: true })
  actorUserId?: string;

  @Prop({ type: String, enum: ActivityActorRole, default: ActivityActorRole.SYSTEM })
  actorRole: ActivityActorRole;

  // Who is affected by the action (optional, used for user-facing history)
  @Prop({ index: true })
  subjectUserId?: string;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ index: true })
  entityType?: string;

  @Prop({ index: true })
  entityId?: string;

  @Prop()
  message?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ actorUserId: 1, createdAt: -1 });
ActivityLogSchema.index({ subjectUserId: 1, createdAt: -1 });
ActivityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

