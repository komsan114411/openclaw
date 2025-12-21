import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { ActivityLogsService } from './activity-logs.service';

@ApiTags('Activity Logs')
@ApiBearerAuth()
@Controller('activity-logs')
@UseGuards(SessionAuthGuard)
export class ActivityLogsController {
  constructor(private activityLogsService: ActivityLogsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all activity logs (Admin only)' })
  async getAll(
    @Query('limit') limit?: number,
    @Query('actorUserId') actorUserId?: string,
    @Query('subjectUserId') subjectUserId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const logs = await this.activityLogsService.getAll({
      limit: limit ? Number(limit) : undefined,
      actorUserId,
      subjectUserId,
      action,
      entityType,
      entityId,
    });
    return { success: true, logs };
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my activity logs (User)' })
  async getMy(@CurrentUser() user: AuthUser, @Query('limit') limit?: number) {
    const logs = await this.activityLogsService.getForUser(
      user.userId,
      limit ? Number(limit) : 50,
    );
    return { success: true, logs };
  }
}

