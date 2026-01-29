import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
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
import { RegisterDto } from './dto/register.dto';

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
  private readonly logger = new Logger(AuthService.name);

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
        // SECURITY: Use environment variable for initial password, or generate random
        // Never log the actual password
        const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
        let password: string;
        let forceChange = true;

        if (initialPassword && initialPassword.length >= 8) {
          password = initialPassword;
          this.logger.log('Using ADMIN_INITIAL_PASSWORD from environment variable');
        } else {
          // Generate secure random password - admin must use password reset flow
          password = crypto.randomBytes(16).toString('base64').slice(0, 20);
          this.logger.warn('No ADMIN_INITIAL_PASSWORD set - random password generated');
          this.logger.warn('Admin must use password reset flow to set password');
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await this.userModel.create({
          username: 'admin',
          password: hashedPassword,
          role: UserRole.ADMIN,
          email: 'admin@system.local',
          fullName: 'System Administrator',
          forcePasswordChange: forceChange,
          isActive: true,
        });

        this.logger.log('Default admin account created with username: admin');
        this.logger.log('Password change is required on first login');
      }
    } catch (error) {
      this.logger.error('Error creating default admin:', error);
    }
  }

  async validateUser(username: string, password: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ username, isActive: true, isBlocked: { $ne: true } });
    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null;

    return user;
  }

  // Generic error message to prevent username enumeration
  private readonly INVALID_CREDENTIALS_MSG = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  private readonly ACCOUNT_ISSUE_MSG = 'ไม่สามารถเข้าสู่ระบบได้ กรุณาติดต่อผู้ดูแลระบบ';

  // Simulate bcrypt timing to prevent timing attacks
  private async fakePasswordCheck(): Promise<void> {
    await bcrypt.hash('dummy_password_timing_safe', 12);
  }

  async login(loginDto: LoginDto): Promise<{
    accessToken: string;
    sessionId: string;
    user: AuthUser;
  }> {
    // SECURITY: Use generic error messages to prevent username enumeration
    const userExists = await this.userModel.findOne({ username: loginDto.username });

    if (!userExists) {
      // Simulate password check to prevent timing attacks
      await this.fakePasswordCheck();
      throw new UnauthorizedException(this.INVALID_CREDENTIALS_MSG);
    }

    // Validate password first before checking other conditions
    const isPasswordValid = await bcrypt.compare(loginDto.password, userExists.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(this.INVALID_CREDENTIALS_MSG);
    }

    // After password is validated, check account status
    // Use generic message to not reveal specific account issues
    if (userExists.isBlocked || !userExists.isActive) {
      this.logger.warn(`Blocked/inactive user attempted login: ${loginDto.username}`);
      throw new UnauthorizedException(this.ACCOUNT_ISSUE_MSG);
    }

    const user = userExists;

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

  async register(registerDto: RegisterDto): Promise<{
    accessToken: string;
    sessionId: string;
    user: AuthUser;
  }> {
    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(registerDto.username)) {
      throw new BadRequestException('ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ เท่านั้น');
    }

    if (registerDto.username.length < 3) {
      throw new BadRequestException('ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร');
    }

    if (registerDto.username.length > 30) {
      throw new BadRequestException('ชื่อผู้ใช้ต้องไม่เกิน 30 ตัวอักษร');
    }

    // Check if username already exists
    const existingUsername = await this.userModel.findOne({ username: registerDto.username });
    if (existingUsername) {
      throw new BadRequestException(`ชื่อผู้ใช้ "${registerDto.username}" ถูกใช้งานแล้ว กรุณาเลือกชื่อผู้ใช้อื่น`);
    }

    // Check if email already exists (if provided)
    if (registerDto.email) {
      const existingEmail = await this.userModel.findOne({ email: registerDto.email });
      if (existingEmail) {
        throw new BadRequestException(`อีเมล "${registerDto.email}" ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่นหรือเข้าสู่ระบบด้วยบัญชีที่มีอยู่`);
      }
    }

    // Validate password strength
    if (registerDto.password.length < 6) {
      throw new BadRequestException('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    try {
      const created = await this.userModel.create({
        username: registerDto.username,
        password: hashedPassword,
        role: UserRole.USER,
        email: registerDto.email,
        fullName: registerDto.fullName,
        forcePasswordChange: false,
        isActive: true,
      });

      // Auto-login after registration
      return this.login({ username: created.username, password: registerDto.password });
    } catch (error: any) {
      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        if (error.keyPattern?.username) {
          throw new BadRequestException(`ชื่อผู้ใช้ "${registerDto.username}" ถูกใช้งานแล้ว กรุณาเลือกชื่อผู้ใช้อื่น`);
        }
        if (error.keyPattern?.email) {
          throw new BadRequestException(`อีเมล "${registerDto.email}" ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น`);
        }
        throw new BadRequestException('ข้อมูลซ้ำกับที่มีอยู่ในระบบ กรุณาตรวจสอบและลองใหม่');
      }
      this.logger.error('Registration error:', error);
      throw new BadRequestException('เกิดข้อผิดพลาดในการสมัครสมาชิก กรุณาลองใหม่อีกครั้ง');
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionModel.deleteOne({ sessionId });
    await this.redisService.deleteSession(sessionId);
  }

  async validateSession(sessionId: string): Promise<AuthUser | null> {
    // Try Redis first
    const cached = await this.redisService.getSession(sessionId);
    if (cached) {
      // Ensure user still active/not blocked even if session cached
      const userDoc = await this.userModel.findById(cached.userId);
      if (!userDoc || !userDoc.isActive || userDoc.isBlocked) {
        return null;
      }

      // Update last activity in background
      this.sessionModel.updateOne(
        { sessionId },
        { lastActivity: new Date() },
      ).exec();
      
      return {
        userId: cached.userId,
        username: cached.username,
        role: cached.role,
        forcePasswordChange: userDoc.forcePasswordChange,
        email: userDoc.email,
        fullName: userDoc.fullName,
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
    if (!user || !user.isActive || user.isBlocked) return null;

    return {
      userId: session.userId,
      username: session.username,
      role: session.role as UserRole,
      email: user.email,
      fullName: user.fullName,
      forcePasswordChange: user.forcePasswordChange,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, currentSessionId?: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    await this.userModel.updateOne(
      { _id: userId },
      {
        password: hashedPassword,
        forcePasswordChange: false,
        updatedAt: new Date(),
      },
    );

    // SECURITY: Invalidate all sessions except the current one after password change
    // This ensures any compromised sessions are terminated
    if (currentSessionId) {
      // Invalidate all OTHER sessions, keep current one
      const sessions = await this.sessionModel.find({ userId, sessionId: { $ne: currentSessionId } });
      for (const session of sessions) {
        await this.redisService.deleteSession(session.sessionId);
      }
      await this.sessionModel.deleteMany({ userId, sessionId: { $ne: currentSessionId } });
      this.logger.log(`Invalidated ${sessions.length} other sessions after password change for user ${userId}`);
    } else {
      // Invalidate ALL sessions if no current session provided
      await this.invalidateUserSessions(userId);
      this.logger.log(`Invalidated all sessions after password change for user ${userId}`);
    }
  }

  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  /**
   * Cleanup expired sessions from database
   * Should be called periodically (e.g., via cron job or scheduled task)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessionModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result.deletedCount;
  }

  /**
   * Invalidate all sessions for a user (e.g., after password change or block)
   */
  async invalidateUserSessions(userId: string): Promise<number> {
    const sessions = await this.sessionModel.find({ userId });

    // Delete from Redis first
    for (const session of sessions) {
      await this.redisService.deleteSession(session.sessionId);
    }

    // Then delete from database
    const result = await this.sessionModel.deleteMany({ userId });
    return result.deletedCount;
  }

  /**
   * Invalidate all non-admin sessions (e.g., when system access is disabled)
   * This kicks all regular users from the system immediately
   */
  async invalidateAllNonAdminSessions(): Promise<number> {
    this.logger.log('Invalidating all non-admin sessions...');

    // Find all non-admin users
    const nonAdminUsers = await this.userModel.find({ role: { $ne: UserRole.ADMIN } }).select('_id');
    const userIds = nonAdminUsers.map(u => u._id.toString());

    if (userIds.length === 0) {
      this.logger.log('No non-admin users found');
      return 0;
    }

    // Find all sessions for non-admin users
    const sessions = await this.sessionModel.find({ userId: { $in: userIds } });

    this.logger.log(`Found ${sessions.length} sessions to invalidate`);

    // Delete from Redis first
    for (const session of sessions) {
      await this.redisService.deleteSession(session.sessionId);
    }

    // Then delete from database
    const result = await this.sessionModel.deleteMany({ userId: { $in: userIds } });

    this.logger.log(`Invalidated ${result.deletedCount} non-admin sessions`);
    return result.deletedCount;
  }
}
