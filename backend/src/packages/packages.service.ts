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
      throw new BadRequestException({ message: 'ราคา (บาท) ต้องไม่ติดลบ', field: 'price', code: 'PRICE_NEGATIVE' });
    }
    const priceUsdt = (dto as CreatePackageDto).priceUsdt;
    if (priceUsdt !== undefined && priceUsdt < 0) {
      throw new BadRequestException({ message: 'ราคา (USDT) ต้องไม่ติดลบ', field: 'priceUsdt', code: 'PRICE_USDT_NEGATIVE' });
    }
    if (dto.slipQuota !== undefined && dto.slipQuota <= 0) {
      throw new BadRequestException({ message: 'โควต้าสลิปต้องมากกว่า 0', field: 'slipQuota', code: 'SLIP_QUOTA_INVALID' });
    }
    if (dto.slipQuota !== undefined && dto.slipQuota > 10000000) {
      throw new BadRequestException({ message: 'โควต้าสลิปต้องไม่เกิน 10,000,000', field: 'slipQuota', code: 'SLIP_QUOTA_EXCEEDED' });
    }
    if (dto.durationDays !== undefined && dto.durationDays <= 0) {
      throw new BadRequestException({ message: 'ระยะเวลาต้องมากกว่า 0 วัน', field: 'durationDays', code: 'DURATION_INVALID' });
    }
    if (dto.durationDays !== undefined && dto.durationDays > 3650) {
      throw new BadRequestException({ message: 'ระยะเวลาต้องไม่เกิน 10 ปี (3,650 วัน)', field: 'durationDays', code: 'DURATION_EXCEEDED' });
    }
  }

  async create(dto: CreatePackageDto): Promise<PackageDocument> {
    // Validate input
    this.validatePackageData(dto);

    const existing = await this.packageModel.findOne({ name: dto.name });
    if (existing) {
      throw new BadRequestException({ message: `ชื่อแพ็คเกจ "${dto.name}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`, field: 'name', code: 'NAME_DUPLICATE' });
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
      throw new NotFoundException({ message: 'ไม่พบแพ็คเกจที่ต้องการแก้ไข อาจถูกลบไปแล้ว', code: 'PACKAGE_NOT_FOUND' });
    }

    // Check for duplicate name if name is being changed
    if (dto.name && dto.name !== pkg.name) {
      const existing = await this.packageModel.findOne({ name: dto.name, _id: { $ne: id } });
      if (existing) {
        throw new BadRequestException({ message: `ชื่อแพ็คเกจ "${dto.name}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`, field: 'name', code: 'NAME_DUPLICATE' });
      }
    }

    Object.assign(pkg, dto);
    return pkg.save();
  }

  async deactivate(id: string): Promise<PackageDocument> {
    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException({ message: 'ไม่พบแพ็คเกจที่ต้องการปิดใช้งาน', code: 'PACKAGE_NOT_FOUND' });
    }

    pkg.isActive = false;
    return pkg.save();
  }

  async activate(id: string): Promise<PackageDocument> {
    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException({ message: 'ไม่พบแพ็คเกจที่ต้องการเปิดใช้งาน', code: 'PACKAGE_NOT_FOUND' });
    }

    pkg.isActive = true;
    return pkg.save();
  }
}
