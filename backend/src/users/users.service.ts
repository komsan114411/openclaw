import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from '../database/schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Session, SessionDocument } from '../database/schemas/session.schema';
import { RedisService } from '../redis/redis.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActorRole } from '../database/schemas/activity-log.schema';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private redisService: RedisService,
    private activityLogsService: ActivityLogsService,
  ) {}

  /**
   * Safe activity logging - never fails the main transaction
   */
  private async logActivity(params: {
    actorUserId?: string;
    actorRole: ActivityActorRole;
    subjectUserId?: string;
    action: string;
    entityId?: string;
    message?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.activityLogsService.log({
        ...params,
        entityType: 'user',
      });
    } catch (error) {
      this.logger.error(`Failed to log activity: ${params.action}`, error);
    }
  }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existingUser = await this.userModel.findOne({ username: createUserDto.username });
    if (existingUser) {
      throw new BadRequestException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    
    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      isActive: true,
      forcePasswordChange: createUserDto.forcePasswordChange ?? false,
    });

    return user.save();
  }

  async findAll(includeInactive = false): Promise<UserDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.userModel.find(query).select('-password').exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-password').exec();
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto, actorId?: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Don't allow password update through this method
    delete updateUserDto.password;

    // Track changes for activity log
    const changes: Record<string, { old: any; new: any }> = {};
    for (const key of Object.keys(updateUserDto)) {
      if (updateUserDto[key as keyof UpdateUserDto] !== undefined &&
          user.get(key) !== updateUserDto[key as keyof UpdateUserDto]) {
        changes[key] = {
          old: user.get(key),
          new: updateUserDto[key as keyof UpdateUserDto],
        };
      }
    }

    Object.assign(user, updateUserDto);
    const savedUser = await user.save();

    // Log activity: USER_UPDATED
    if (Object.keys(changes).length > 0) {
      this.logActivity({
        actorUserId: actorId,
        actorRole: actorId ? ActivityActorRole.ADMIN : ActivityActorRole.USER,
        subjectUserId: id,
        action: 'USER_UPDATED',
        entityId: id,
        message: `อัปเดตข้อมูลผู้ใช้ (${Object.keys(changes).join(', ')})`,
        metadata: {
          changes,
          updatedFields: Object.keys(changes),
        },
      });
    }

    return savedUser;
  }

  async delete(id: string, actorId?: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete
    user.isActive = false;
    await user.save();

    // Log activity: USER_DELETED
    this.logActivity({
      actorUserId: actorId,
      actorRole: actorId ? ActivityActorRole.ADMIN : ActivityActorRole.SYSTEM,
      subjectUserId: id,
      action: 'USER_DELETED',
      entityId: id,
      message: 'ลบผู้ใช้ (Soft Delete)',
      metadata: {
        username: user.username,
        deletedBy: actorId || 'system',
      },
    });
  }

  async restore(id: string, actorId?: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.isActive = true;
    await user.save();

    // Log activity: USER_RESTORED
    this.logActivity({
      actorUserId: actorId,
      actorRole: actorId ? ActivityActorRole.ADMIN : ActivityActorRole.SYSTEM,
      subjectUserId: id,
      action: 'USER_RESTORED',
      entityId: id,
      message: 'กู้คืนผู้ใช้',
      metadata: {
        username: user.username,
        restoredBy: actorId || 'system',
      },
    });
  }

  async blockUser(id: string, adminId: string, reason?: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.isBlocked = true;
    user.blockedAt = new Date();
    user.blockedBy = adminId;
    user.blockedReason = reason || '';
    await user.save();

    // Invalidate all sessions for this user (force logout)
    await this.invalidateUserSessions(id);

    // Log activity: USER_BLOCKED
    this.logActivity({
      actorUserId: adminId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: id,
      action: 'USER_BLOCKED',
      entityId: id,
      message: `ระงับผู้ใช้${reason ? ': ' + reason : ''}`,
      metadata: {
        username: user.username,
        reason: reason || 'ไม่ระบุเหตุผล',
        blockedBy: adminId,
        blockedAt: user.blockedAt,
      },
    });
  }

  async unblockUser(id: string, actorId?: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');

    const previousReason = user.blockedReason;

    user.isBlocked = false;
    user.blockedAt = undefined as any;
    user.blockedBy = undefined as any;
    user.blockedReason = undefined as any;
    await user.save();

    // Log activity: USER_UNBLOCKED
    this.logActivity({
      actorUserId: actorId,
      actorRole: actorId ? ActivityActorRole.ADMIN : ActivityActorRole.SYSTEM,
      subjectUserId: id,
      action: 'USER_UNBLOCKED',
      entityId: id,
      message: 'ปลดการระงับผู้ใช้',
      metadata: {
        username: user.username,
        previousBlockReason: previousReason,
        unblockedBy: actorId || 'system',
      },
    });
  }

  /**
   * Invalidate all sessions for a user (force logout everywhere)
   */
  private async invalidateUserSessions(userId: string): Promise<number> {
    const sessions = await this.sessionModel.find({ userId });
    
    // Delete from Redis first
    for (const session of sessions) {
      await this.redisService.deleteSession(session.sessionId);
    }
    
    // Then delete from database
    const result = await this.sessionModel.deleteMany({ userId });
    return result.deletedCount;
  }

  async addLineAccountToUser(userId: string, lineAccountId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $addToSet: { lineAccounts: lineAccountId } },
    );
  }

  async removeLineAccountFromUser(userId: string, lineAccountId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { lineAccounts: lineAccountId } },
    );
  }

  async getUserLineAccounts(userId: string): Promise<string[]> {
    const user = await this.userModel.findById(userId);
    return user?.lineAccounts || [];
  }

  async getStatistics(): Promise<{
    totalUsers: number;
    activeUsers: number;
    adminUsers: number;
    regularUsers: number;
  }> {
    const [total, active, admins] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ isActive: true }),
      this.userModel.countDocuments({ role: UserRole.ADMIN, isActive: true }),
    ]);

    return {
      totalUsers: total,
      activeUsers: active,
      adminUsers: admins,
      regularUsers: Math.max(0, active - admins),
    };
  }
}
