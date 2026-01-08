import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ThunderApiService, QuotaInfo } from './thunder-api.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';

@Controller('thunder')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ThunderApiController {
  constructor(private readonly thunderApiService: ThunderApiService) {}

  /**
   * ดึงข้อมูลโควต้า API (เฉพาะ Admin)
   * Note: QuotaInfo already contains 'success' field
   */
  @Get('quota')
  @Roles(UserRole.ADMIN)
  async getQuota(@Query('token') customToken?: string) {
    return this.thunderApiService.getQuotaInfo(customToken);
  }

  /**
   * ตรวจสอบสถานะ API (เฉพาะ Admin)
   */
  @Get('health')
  @Roles(UserRole.ADMIN)
  async checkHealth(@Query('token') customToken?: string) {
    const health = await this.thunderApiService.checkApiHealth(customToken);
    return { success: health.healthy, ...health };
  }
}
