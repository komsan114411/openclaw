import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from '../database/schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

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

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Don't allow password update through this method
    delete updateUserDto.password;

    Object.assign(user, updateUserDto);
    return user.save();
  }

  async delete(id: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete
    user.isActive = false;
    await user.save();
  }

  async restore(id: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.isActive = true;
    await user.save();
  }

  async blockUser(id: string, adminId: string, reason?: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.isBlocked = true;
    user.blockedAt = new Date();
    user.blockedBy = adminId;
    user.blockedReason = reason || '';
    await user.save();
  }

  async unblockUser(id: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.isBlocked = false;
    user.blockedAt = undefined as any;
    user.blockedBy = undefined as any;
    user.blockedReason = undefined as any;
    await user.save();
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
      regularUsers: active - admins,
    };
  }
}
