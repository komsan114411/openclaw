import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(SessionAuthGuard)
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get('my')
  @ApiOperation({ summary: 'Get current user subscription' })
  async getMySubscription(@CurrentUser() user: AuthUser) {
    const subscription = await this.subscriptionsService.getActiveSubscription(user.userId);
    return {
      success: true,
      subscription,
    };
  }

  @Get('quota')
  @ApiOperation({ summary: 'Get current user quota' })
  async getQuota(@CurrentUser() user: AuthUser) {
    const quota = await this.subscriptionsService.checkQuota(user.userId);
    return {
      success: true,
      quota,
    };
  }

  @Get('ai-quota')
  @ApiOperation({ summary: 'Get current user AI quota' })
  async getAiQuota(@CurrentUser() user: AuthUser) {
    const aiQuota = await this.subscriptionsService.checkAiQuota(user.userId);
    return {
      success: true,
      aiQuota,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get user subscriptions' })
  async getUserSubscriptions(@CurrentUser() user: AuthUser) {
    const subscriptions = await this.subscriptionsService.getUserSubscriptions(
      user.userId,
    );
    return {
      success: true,
      subscriptions,
    };
  }

  @Post('grant')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Grant package to user (Admin only)' })
  async grantPackage(
    @CurrentUser() admin: AuthUser,
    @Body() body: { userId: string; packageId: string },
  ) {
    const result = await this.subscriptionsService.grantFreeQuota(
      body.userId,
      body.packageId,
      admin.userId,
    );
    return {
      success: result.success,
      message: result.success ? 'Package granted successfully' : 'Failed to grant package',
      subscriptionId: result.subscriptionId,
    };
  }

  @Post('expire')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Expire old subscriptions (Admin only)' })
  async expireSubscriptions() {
    const count = await this.subscriptionsService.expireSubscriptions();
    return {
      success: true,
      message: `Expired ${count} subscriptions`,
      expiredCount: count,
    };
  }

  @Post('cleanup-reservations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cleanup expired quota reservations (Admin only)' })
  async cleanupReservations() {
    const count = await this.subscriptionsService.cleanupExpiredReservations();
    return {
      success: true,
      message: `Cleaned up ${count} expired reservations`,
      cleanedCount: count,
    };
  }
}
