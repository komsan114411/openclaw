import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SessionDocument = Session & Document;

@Schema({ timestamps: true, collection: 'sessions' })
export class Session {
  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  role: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  lastActivity: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// TTL index for automatic session expiration
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ sessionId: 1 }, { unique: true });
SessionSchema.index({ userId: 1 });
