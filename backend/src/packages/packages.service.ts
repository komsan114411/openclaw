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

  async create(dto: CreatePackageDto): Promise<PackageDocument> {
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
    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    Object.assign(pkg, dto);
    return pkg.save();
  }

  async deactivate(id: string): Promise<void> {
    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    pkg.isActive = false;
    await pkg.save();
  }

  async activate(id: string): Promise<void> {
    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    pkg.isActive = true;
    await pkg.save();
  }
}
