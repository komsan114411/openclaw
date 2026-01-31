import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { KeyStorageService } from './services/key-storage.service';
import { EnhancedAutomationService, EnhancedLoginStatus } from './services/enhanced-automation.service';
import { WorkerPoolService } from './services/worker-pool.service';
import { LoginCoordinatorService } from './services/login-coordinator.service';
import { LineSession, LineSessionDocument } from './schemas/line-session.schema';
import { LineAccount, LineAccountDocument } from '../database/schemas/line-account.schema';

/**
 * User-facing LINE Session Controller
 *
 * ให้ User จัดการ LINE Session ของ LINE Account ที่เป็นเจ้าของ
 * ต้องตรวจสอบ ownership ผ่าน LineAccount ก่อนทุกครั้ง
 */
@ApiTags('LINE Session (User)')
@ApiBearerAuth()
@Controller('api/user/line-session')
@UseGuards(SessionAuthGuard)
export class LineSessionUserController {
  private readonly logger = new Logger(LineSessionUserController.name);

  constructor(
    private keyStorageService: KeyStorageService,
    private enhancedAutomationService: EnhancedAutomationService,
    private workerPoolService: WorkerPoolService,
    private loginCoordinatorService: LoginCoordinatorService,
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(LineAccount.name)
    private lineAccountModel: Model<LineAccountDocument>,
  ) {}

  /**
   * ตรวจสอบว่า user เป็นเจ้าของ LINE Account หรือไม่
   */
  private async validateOwnership(lineAccountId: string, userId: string): Promise<LineAccountDocument> {
    const account = await this.lineAccountModel.findById(lineAccountId);

    if (!account) {
      throw new NotFoundException('ไม่พบบัญชี LINE');
    }

    if (account.ownerId?.toString() !== userId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงบัญชีนี้');
    }

    return account;
  }

  /**
   * Get session info for user's LINE Account
   */
  @Get(':lineAccountId')
  @ApiOperation({ summary: 'Get active session for LINE Account' })
  async getSession(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    return {
      success: true,
      session: session ? {
        lineAccountId: session.lineAccountId,
        hasKeys: !!session.xLineAccess,
        xLineAccess: session.xLineAccess ? `${session.xLineAccess.substring(0, 30)}...` : null,
        xHmac: session.xHmac ? `${session.xHmac.substring(0, 20)}...` : null,
        chatMid: session.chatMid,
        bankCode: session.bankCode,
        bankName: session.bankName,
        status: session.status,
        lastCheckedAt: session.lastCheckedAt,
        lastCheckResult: session.lastCheckResult,
        extractedAt: session.extractedAt,
        source: session.source,
        userAgent: session.userAgent,
        lineVersion: session.lineVersion,
      } : null,
    };
  }

  /**
   * Start enhanced login for user's LINE Account
   */
  @Post(':lineAccountId/enhanced-login')
  @ApiOperation({ summary: 'Start enhanced login with GSB-like features' })
  async startEnhancedLogin(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @Body() body: { email?: string; password?: string; source?: 'manual' | 'auto' | 'relogin' },
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    const result = await this.enhancedAutomationService.startLogin(
      lineAccountId,
      body.email,
      body.password,
      body.source || 'manual',
    );

    return result;
  }

  /**
   * Get enhanced login status for user's LINE Account
   */
  @Get(':lineAccountId/enhanced-login/status')
  @ApiOperation({ summary: 'Get enhanced login status' })
  async getEnhancedLoginStatus(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    return this.enhancedAutomationService.getWorkerStatus(lineAccountId);
  }

  /**
   * Cancel enhanced login for user's LINE Account
   */
  @Delete(':lineAccountId/enhanced-login')
  @ApiOperation({ summary: 'Cancel enhanced login' })
  async cancelEnhancedLogin(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    await this.enhancedAutomationService.cancelLogin(lineAccountId);
    return { success: true, message: 'ยกเลิกการเข้าสู่ระบบแล้ว' };
  }

  /**
   * Get cooldown info for user's LINE Account
   */
  @Get(':lineAccountId/cooldown')
  @ApiOperation({ summary: 'Get cooldown info' })
  async getCooldownInfo(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    return this.loginCoordinatorService.getCooldownInfo(lineAccountId);
  }

  /**
   * Reset cooldown for user's LINE Account
   */
  @Post(':lineAccountId/reset-cooldown')
  @ApiOperation({ summary: 'Reset cooldown for account' })
  async resetCooldown(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    this.enhancedAutomationService.resetCooldown(lineAccountId);
    return { success: true, message: 'รีเซ็ต cooldown แล้ว' };
  }

  /**
   * Get full keys for user's LINE Account (for copying)
   */
  @Get(':lineAccountId/keys')
  @ApiOperation({ summary: 'Get full keys for copying' })
  async getFullKeys(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    if (!session || !session.xLineAccess) {
      return {
        success: false,
        message: 'ไม่พบ Keys - กรุณาเข้าสู่ระบบ LINE ก่อน',
      };
    }

    return {
      success: true,
      keys: {
        xLineAccess: session.xLineAccess,
        xHmac: session.xHmac,
        chatMid: session.chatMid,
        userAgent: session.userAgent,
        lineVersion: session.lineVersion,
        extractedAt: session.extractedAt,
        status: session.status,
      },
    };
  }

  /**
   * Set keys manually for user's LINE Account
   */
  @Post(':lineAccountId/keys')
  @ApiOperation({ summary: 'Set keys manually' })
  async setKeys(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @Body() body: {
      xLineAccess: string;
      xHmac: string;
      userAgent?: string;
      lineVersion?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    if (!body.xLineAccess || !body.xHmac) {
      return { success: false, message: 'กรุณาระบุ xLineAccess และ xHmac' };
    }

    await this.keyStorageService.saveKeys({
      lineAccountId,
      xLineAccess: body.xLineAccess,
      xHmac: body.xHmac,
      userAgent: body.userAgent,
      lineVersion: body.lineVersion,
      source: 'manual_input',
      performedBy: user.userId,
    });

    return { success: true, message: 'บันทึก Keys สำเร็จ' };
  }

  /**
   * Get key history for user's LINE Account
   */
  @Get(':lineAccountId/history')
  @ApiOperation({ summary: 'Get key extraction history' })
  async getHistory(
    @Param('lineAccountId', ParseObjectIdPipe) lineAccountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Validate ownership
    await this.validateOwnership(lineAccountId, user.userId);

    const history = await this.keyStorageService.getKeyHistory(lineAccountId, 10);
    return { success: true, history };
  }
}
