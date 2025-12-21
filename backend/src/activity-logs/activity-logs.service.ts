import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ActivityActorRole,
  ActivityLog,
  ActivityLogDocument,
} from '../database/schemas/activity-log.schema';

export interface CreateActivityLogInput {
  actorUserId?: string;
  actorRole: ActivityActorRole;
  subjectUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  message?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectModel(ActivityLog.name)
    private activityLogModel: Model<ActivityLogDocument>,
  ) {}

  async log(input: CreateActivityLogInput): Promise<void> {
    await this.activityLogModel.create(input);
  }

  async getAll(params: {
    limit?: number;
    actorUserId?: string;
    subjectUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const query: any = {};
    if (params.actorUserId) query.actorUserId = params.actorUserId;
    if (params.subjectUserId) query.subjectUserId = params.subjectUserId;
    if (params.action) query.action = params.action;
    if (params.entityType) query.entityType = params.entityType;
    if (params.entityId) query.entityId = params.entityId;

    return this.activityLogModel.find(query).sort({ createdAt: -1 }).limit(limit).lean().exec();
  }

  async getForUser(userId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.activityLogModel
      .find({ subjectUserId: userId })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();
  }
}

