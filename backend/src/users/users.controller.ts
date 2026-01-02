import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActorRole } from '../database/schemas/activity-log.schema';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(SessionAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private activityLogsService: ActivityLogsService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create new user (Admin only)' })
  async create(@Body() createUserDto: CreateUserDto, @CurrentUser() admin: AuthUser) {
    const user = await this.usersService.create(createUserDto);
    await this.activityLogsService.log({
      actorUserId: admin.userId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: user._id.toString(),
      action: 'user.create',
      entityType: 'user',
      entityId: user._id.toString(),
      message: `สร้างผู้ใช้ ${user.username}`,
    });
    return {
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  async findAll(@Query('includeInactive') includeInactive: boolean) {
    const users = await this.usersService.findAll(includeInactive);
    return {
      success: true,
      users,
    };
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user statistics (Admin only)' })
  async getStatistics() {
    const stats = await this.usersService.getStatistics();
    return {
      success: true,
      statistics: stats,
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: AuthUser) {
    const fullUser = await this.usersService.findById(user.userId);
    return {
      success: true,
      user: fullUser,
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    return {
      success: true,
      user,
    };
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user (Admin only)' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() admin: AuthUser,
  ) {
    const user = await this.usersService.update(id, updateUserDto);
    await this.activityLogsService.log({
      actorUserId: admin.userId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: id,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      message: `อัปเดตผู้ใช้ ${user.username}`,
      metadata: { fields: Object.keys(updateUserDto || {}) },
    });
    return {
      success: true,
      message: 'User updated successfully',
      user,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    if (id === currentUser.userId) {
      throw new BadRequestException('Cannot delete your own account');
    }
    await this.usersService.delete(id);
    await this.activityLogsService.log({
      actorUserId: currentUser.userId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: id,
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      message: 'ลบผู้ใช้ (soft delete)',
    });
    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  @Post(':id/restore')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Restore deleted user (Admin only)' })
  async restore(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    await this.usersService.restore(id);
    await this.activityLogsService.log({
      actorUserId: admin.userId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: id,
      action: 'user.restore',
      entityType: 'user',
      entityId: id,
      message: 'กู้คืนผู้ใช้',
    });
    return {
      success: true,
      message: 'User restored successfully',
    };
  }

  @Post(':id/block')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block user (Admin only)' })
  async block(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() admin: AuthUser,
  ) {
    if (id === admin.userId) {
      throw new BadRequestException('Cannot block your own account');
    }
    await this.usersService.blockUser(id, admin.userId, body?.reason);
    await this.activityLogsService.log({
      actorUserId: admin.userId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: id,
      action: 'user.block',
      entityType: 'user',
      entityId: id,
      message: 'บล็อกผู้ใช้',
      metadata: { reason: body?.reason || '' },
    });
    return { success: true, message: 'User blocked' };
  }

  @Post(':id/unblock')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Unblock user (Admin only)' })
  async unblock(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    await this.usersService.unblockUser(id);
    await this.activityLogsService.log({
      actorUserId: admin.userId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: id,
      action: 'user.unblock',
      entityType: 'user',
      entityId: id,
      message: 'ปลดบล็อกผู้ใช้',
    });
    return { success: true, message: 'User unblocked' };
  }
}
