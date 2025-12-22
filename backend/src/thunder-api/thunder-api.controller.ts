import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ThunderApiService, QuotaInfo } from './thunder-api.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';

@Controller('api/thunder')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThunderApiController {
  constructor(private readonly thunderApiService: ThunderApiService) {}

  /**
   * ดึงข้อมูลโควต้า API (เฉพาะ Admin)
   */
  @Get('quota')
  @Roles(UserRole.ADMIN)
  async getQuota(@Query('token') customToken?: string): Promise<QuotaInfo> {
    return this.thunderApiService.getQuotaInfo(customToken);
  }

  /**
   * ตรวจสอบสถานะ API (เฉพาะ Admin)
   */
  @Get('health')
  @Roles(UserRole.ADMIN)
  async checkHealth(@Query('token') customToken?: string): Promise<{ healthy: boolean; message: string }> {
    return this.thunderApiService.checkApiHealth(customToken);
  }
}
