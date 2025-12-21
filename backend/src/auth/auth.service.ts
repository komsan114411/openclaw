import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole } from '../database/schemas/user.schema';
import { Session, SessionDocument } from '../database/schemas/session.schema';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

export interface AuthUser {
  userId: string;
  username: string;
  role: UserRole;
  email?: string;
  fullName?: string;
  forcePasswordChange: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {
    this.ensureDefaultAdmin();
  }

  private async ensureDefaultAdmin(): Promise<void> {
    try {
      const adminExists = await this.userModel.findOne({ username: 'admin' });
      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await this.userModel.create({
          username: 'admin',
          password: hashedPassword,
          role: UserRole.ADMIN,
          email: 'admin@system.local',
          fullName: 'System Administrator',
          forcePasswordChange: true,
          isActive: true,
        });
        console.log('✅ Default admin user created (username: admin, password: admin123)');
      }
    } catch (error) {
      console.error('Error creating default admin:', error);
    }
  }

  async validateUser(username: string, password: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ username, isActive: true });
    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null;

    return user;
  }

  async login(loginDto: LoginDto): Promise<{
    accessToken: string;
    sessionId: string;
    user: AuthUser;
  }> {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Update last login
    await this.userModel.updateOne({ _id: user._id }, { lastLogin: new Date() });

    // Generate JWT
    const payload: JwtPayload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);

    // Create session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.sessionModel.create({
      sessionId,
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      expiresAt,
      lastActivity: new Date(),
    });

    // Cache session in Redis
    await this.redisService.setSession(sessionId, {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    }, 86400);

    return {
      accessToken,
      sessionId,
      user: {
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        forcePasswordChange: user.forcePasswordChange,
      },
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionModel.deleteOne({ sessionId });
    await this.redisService.deleteSession(sessionId);
  }

  async validateSession(sessionId: string): Promise<AuthUser | null> {
    // Try Redis first
    const cached = await this.redisService.getSession(sessionId);
    if (cached) {
      // Update last activity in background
      this.sessionModel.updateOne(
        { sessionId },
        { lastActivity: new Date() },
      ).exec();
      
      return {
        userId: cached.userId,
        username: cached.username,
        role: cached.role,
        forcePasswordChange: false,
      };
    }

    // Fallback to database
    const session = await this.sessionModel.findOne({
      sessionId,
      expiresAt: { $gt: new Date() },
    });

    if (!session) return null;

    // Update last activity
    session.lastActivity = new Date();
    await session.save();

    // Cache in Redis
    await this.redisService.setSession(sessionId, {
      userId: session.userId,
      username: session.username,
      role: session.role,
    }, 86400);

    // Get full user info
    const user = await this.userModel.findById(session.userId);
    if (!user) return null;

    return {
      userId: session.userId,
      username: session.username,
      role: session.role as UserRole,
      email: user.email,
      fullName: user.fullName,
      forcePasswordChange: user.forcePasswordChange,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userModel.updateOne(
      { _id: userId },
      {
        password: hashedPassword,
        forcePasswordChange: false,
        updatedAt: new Date(),
      },
    );
  }

  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }
}
