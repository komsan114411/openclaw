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
  Request,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { WalletService } from '../wallet/wallet.service';
import { RedisService } from '../redis/redis.service';
import { PaymentsService } from '../payments/payments.service';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { RateLimitGuard, RateLimit } from '../common/guards/rate-limit.guard';

@ApiTags('Packages')
@ApiBearerAuth()
@Controller('packages')
export class PackagesController {
  private readonly logger = new Logger(PackagesController.name);

  constructor(
    private packagesService: PackagesService,
    private walletService: WalletService,
    private redisService: RedisService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
  ) { }

  @Post()
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create package (Admin only)' })
  async create(@Body() dto: CreatePackageDto) {
    const pkg = await this.packagesService.create(dto);
    return {
      success: true,
      message: 'Package created successfully',
      package: pkg,
    };
  }

  @Get()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowSeconds: 60, keyPrefix: 'public:packages' })
  @ApiOperation({ summary: 'Get all active packages (public)' })
  async findAll() {
    // Public endpoint always returns active-only packages
    const packages = await this.packagesService.findAll(false);
    return {
      success: true,
      packages,
    };
  }

  @Get('admin/all')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all packages including inactive (Admin only)' })
  async findAllAdmin(@Query('includeInactive') includeInactive: boolean) {
    const packages = await this.packagesService.findAll(includeInactive);
    return {
      success: true,
      packages,
    };
  }

  @Get(':id')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowSeconds: 60, keyPrefix: 'public:package' })
  @ApiOperation({ summary: 'Get package by ID' })
  async findOne(@Param('id', ParseObjectIdPipe) id: string) {
    const pkg = await this.packagesService.findById(id);
    return {
      success: true,
      package: pkg,
    };
  }

  @Put(':id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update package (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    const pkg = await this.packagesService.update(id, dto);
    return {
      success: true,
      message: 'Package updated successfully',
      package: pkg,
    };
  }

  @Delete(':id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate package (Admin only)' })
  async deactivate(@Param('id') id: string) {
    await this.packagesService.deactivate(id);
    return {
      success: true,
      message: 'Package deactivated successfully',
    };
  }

  @Post(':id/activate')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activate package (Admin only)' })
  async activate(@Param('id') id: string) {
    await this.packagesService.activate(id);
    return {
      success: true,
      message: 'Package activated successfully',
    };
  }

  /**
   * Purchase package with wallet credits
   * Uses distributed lock to prevent race conditions when user clicks multiple times
   */
  @Post(':id/purchase')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purchase package with wallet credits' })
  async purchaseWithCredits(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.userId;

    this.logger.log(`[PURCHASE REQUEST] User ${userId} attempting to purchase package ${id}`);

    // SECURITY: Use distributed lock to prevent race condition
    // This ensures only one purchase request per user can be processed at a time
    const lockKey = `purchase:${userId}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 30); // 30 second timeout

    if (!lockToken) {
      // Another purchase is already in progress for this user
      this.logger.warn(`[PURCHASE BLOCKED] User ${userId} - another purchase in progress`);
      throw new HttpException(
        {
          success: false,
          message: 'มีรายการซื้อกำลังดำเนินการอยู่ กรุณารอสักครู่',
        },
        HttpStatus.CONFLICT,
      );
    }

    try {
      // Get package info
      const pkg = await this.packagesService.findById(id);
      if (!pkg) {
        this.logger.warn(`[PURCHASE FAILED] Package not found: ${id}`);
        return { success: false, message: 'ไม่พบแพ็คเกจ' };
      }
      if (!pkg.isActive) {
        this.logger.warn(`[PURCHASE FAILED] Package inactive: ${id}`);
        return { success: false, message: 'แพ็คเกจนี้ปิดให้บริการแล้ว' };
      }

      this.logger.log(`[PURCHASE] Package ${id} maxPurchasesPerUser=${pkg.maxPurchasesPerUser}`);

      // SECURITY: Check purchase limit (maxPurchasesPerUser)
      // This prevents users from buying limited packages (e.g., promotions) more than allowed
      const purchaseCheck = await this.paymentsService.canUserPurchase(userId, id);

      this.logger.log(
        `[PURCHASE LIMIT RESULT] User ${userId}, Package ${id}: ` +
        `canPurchase=${purchaseCheck.canPurchase}, count=${purchaseCheck.purchaseCount}, ` +
        `max=${purchaseCheck.maxPurchases}, remaining=${purchaseCheck.remainingPurchases}`
      );

      if (!purchaseCheck.canPurchase) {
        this.logger.warn(
          `[PURCHASE BLOCKED BY LIMIT] User ${userId} reached limit for package ${id} ` +
          `(${purchaseCheck.purchaseCount}/${purchaseCheck.maxPurchases})`
        );
        return {
          success: false,
          message: `คุณได้ซื้อแพ็คเกจนี้ครบ ${purchaseCheck.maxPurchases} ครั้งแล้ว ไม่สามารถซื้อเพิ่มได้`,
        };
      }

      // Purchase with wallet credits
      const result = await this.walletService.purchasePackage(
        userId,
        id,
        pkg.name,
        pkg.price,
      );

      this.logger.log(`[PURCHASE RESULT] User ${userId}, Package ${id}: success=${result.success}`);

      return result;
    } finally {
      // Always release the lock, even if an error occurred
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }
}
