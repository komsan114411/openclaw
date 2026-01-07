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

@ApiTags('Packages')
@ApiBearerAuth()
@Controller('packages')
export class PackagesController {
  constructor(
    private packagesService: PackagesService,
    private walletService: WalletService,
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
  @ApiOperation({ summary: 'Get all packages' })
  async findAll(@Query('includeInactive') includeInactive: boolean) {
    const packages = await this.packagesService.findAll(includeInactive);
    return {
      success: true,
      packages,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get package by ID' })
  async findOne(@Param('id') id: string) {
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

  @Post(':id/purchase')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purchase package with wallet credits' })
  async purchaseWithCredits(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.userId;

    // Get package info
    const pkg = await this.packagesService.findById(id);
    if (!pkg) {
      return { success: false, message: 'ไม่พบแพ็คเกจ' };
    }
    if (!pkg.isActive) {
      return { success: false, message: 'แพ็คเกจนี้ปิดให้บริการแล้ว' };
    }

    // Purchase with wallet credits
    const result = await this.walletService.purchasePackage(
      userId,
      id,
      pkg.name,
      pkg.price,
    );

    return result;
  }
}

