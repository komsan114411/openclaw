import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { AuthUser } from './auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { RateLimitGuard, RateLimit } from '../common/guards/rate-limit.guard';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private systemSettingsService: SystemSettingsService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 15, windowSeconds: 60, keyPrefix: 'auth:login' }) // 15 attempts per minute (allows multiple users behind same IP)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Login is disabled by admin (for non-admin users)' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // First validate credentials to get user info
    const result = await this.authService.login(loginDto);

    // Check if login is disabled for non-admin users
    // Admin can always login even when system is disabled
    if (result.user.role !== UserRole.ADMIN) {
      const settings = await this.systemSettingsService.getSettings();
      if (settings?.allowLogin === false) {
        // Cleanup the session that was just created
        await this.authService.logout(result.sessionId);
        throw new ForbiddenException(
          settings.loginDisabledMessage || 'ระบบปิดให้บริการเข้าสู่ระบบชั่วคราว กรุณาติดต่อผู้ดูแลระบบ'
        );
      }
    }

    // Set session cookie
    res.cookie('session_id', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // Allow cookie in production deployments where frontend/backend may be on different origins
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return {
      success: true,
      message: 'Login successful',
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowSeconds: 300, keyPrefix: 'auth:register' }) // 10 attempts per 5 minutes
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 403, description: 'Registration is disabled by admin' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Check if registration is allowed
    const settings = await this.systemSettingsService.getSettings();
    if (settings?.allowRegistration === false) {
      throw new ForbiddenException(
        settings.registrationDisabledMessage || 'ระบบปิดรับสมัครสมาชิกใหม่ชั่วคราว กรุณาติดต่อผู้ดูแลระบบ'
      );
    }

    const result = await this.authService.register(registerDto);

    res.cookie('session_id', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      message: 'Registration successful',
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User logout' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.cookies?.session_id;
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
    
    res.clearCookie('session_id');
    
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get current user info' })
  async getCurrentUser(@CurrentUser() user: AuthUser) {
    return {
      success: true,
      user,
    };
  }

  @Post('change-password')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.userId, changePasswordDto);
    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  @Get('validate')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Validate session' })
  async validateSession(@CurrentUser() user: AuthUser) {
    return {
      success: true,
      valid: true,
      user,
    };
  }

  @Post('cleanup-sessions')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cleanup expired sessions (Admin only)' })
  @ApiResponse({ status: 200, description: 'Sessions cleaned up successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async cleanupSessions(@CurrentUser() user: AuthUser) {
    const deletedCount = await this.authService.cleanupExpiredSessions();
    return {
      success: true,
      message: `Cleaned up ${deletedCount} expired sessions`,
      deletedCount,
    };
  }
}
