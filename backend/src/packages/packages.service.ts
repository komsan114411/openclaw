import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Package, PackageDocument } from '../database/schemas/package.schema';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(
    @InjectModel(Package.name) private packageModel: Model<PackageDocument>,
  ) {}

  /**
   * Validate package data
   */
  private validatePackageData(dto: CreatePackageDto | UpdatePackageDto): void {
    if (dto.price !== undefined && dto.price < 0) {
      throw new BadRequestException('Price cannot be negative');
    }
    if ((dto as any).priceUsdt !== undefined && (dto as any).priceUsdt < 0) {
      throw new BadRequestException('USDT price cannot be negative');
    }
    if (dto.slipQuota !== undefined && dto.slipQuota <= 0) {
      throw new BadRequestException('Slip quota must be greater than 0');
    }
    if (dto.slipQuota !== undefined && dto.slipQuota > 10000000) {
      throw new BadRequestException('Slip quota cannot exceed 10,000,000');
    }
    if (dto.durationDays !== undefined && dto.durationDays <= 0) {
      throw new BadRequestException('Duration must be greater than 0 days');
    }
    if (dto.durationDays !== undefined && dto.durationDays > 3650) {
      throw new BadRequestException('Duration cannot exceed 10 years');
    }
  }

  async create(dto: CreatePackageDto): Promise<PackageDocument> {
    // Validate input
    this.validatePackageData(dto);

    const existing = await this.packageModel.findOne({ name: dto.name });
    if (existing) {
      throw new BadRequestException('Package name already exists');
    }

    const pkg = new this.packageModel({
      ...dto,
      isActive: true,
    });

    return pkg.save();
  }

  async findAll(includeInactive = false): Promise<PackageDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.packageModel.find(query).sort({ sortOrder: 1, price: 1 }).exec();
  }

  async findById(id: string): Promise<PackageDocument | null> {
    return this.packageModel.findById(id).exec();
  }

  async update(id: string, dto: UpdatePackageDto): Promise<PackageDocument> {
    // Validate input
    this.validatePackageData(dto);

    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    // Check for duplicate name if name is being changed
    if (dto.name && dto.name !== pkg.name) {
      const existing = await this.packageModel.findOne({ name: dto.name, _id: { $ne: id } });
      if (existing) {
        throw new BadRequestException('Package name already exists');
      }
    }

    Object.assign(pkg, dto);
    return pkg.save();
  }

  async deactivate(id: string): Promise<PackageDocument> {
    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    pkg.isActive = false;
    return pkg.save();
  }

  async activate(id: string): Promise<PackageDocument> {
    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    pkg.isActive = true;
    return pkg.save();
  }
}
