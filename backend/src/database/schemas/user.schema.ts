import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, index: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ sparse: true, index: true })
  email: string;

  @Prop()
  fullName: string;

  @Prop({ default: false })
  forcePasswordChange: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop()
  blockedAt: Date;

  @Prop()
  blockedBy: string;

  @Prop()
  blockedReason: string;

  @Prop()
  lastLogin: Date;

  @Prop({ type: [String], default: [] })
  lineAccounts: string[];

  @Prop()
  currentSubscriptionId: string;

  @Prop({ default: 0 })
  totalSlipsVerified: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
