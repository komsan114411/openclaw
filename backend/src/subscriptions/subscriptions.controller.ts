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
    @Body() body: { userId: string; packageId: string },
  ) {
    const success = await this.subscriptionsService.addQuotaToExisting(
      body.userId,
      body.packageId,
    );
    return {
      success,
      message: success ? 'Package granted successfully' : 'Failed to grant package',
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
