import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BankList,
  BankListDocument,
  DEFAULT_BANKS,
} from '../schemas/bank-list.schema';

/**
 * Bank List Service
 *
 * บริการจัดการรายชื่อธนาคาร
 * - Seed ข้อมูลธนาคารเริ่มต้นอัตโนมัติ
 * - CRUD operations สำหรับธนาคาร
 */
@Injectable()
export class BankListService implements OnModuleInit {
  private readonly logger = new Logger(BankListService.name);

  constructor(
    @InjectModel(BankList.name)
    private readonly bankListModel: Model<BankListDocument>,
  ) {}

  /**
   * เมื่อ module เริ่มทำงาน จะ seed ข้อมูลธนาคารอัตโนมัติ
   */
  async onModuleInit() {
    await this.seedDefaultBanks();
  }

  /**
   * Seed ข้อมูลธนาคารเริ่มต้น
   * จะเพิ่มเฉพาะเมื่อยังไม่มีข้อมูลธนาคารในระบบ
   */
  async seedDefaultBanks(): Promise<void> {
    try {
      const count = await this.bankListModel.countDocuments();

      if (count === 0) {
        await this.bankListModel.insertMany(DEFAULT_BANKS);
        this.logger.log(
          `Seeded ${DEFAULT_BANKS.length} default banks successfully`,
        );
      } else {
        this.logger.log(`Banks already exist (${count} records), skipping seed`);
      }
    } catch (error) {
      this.logger.error('Failed to seed default banks', error);
    }
  }

  /**
   * ดึงรายชื่อธนาคารทั้งหมด
   */
  async findAll(): Promise<BankListDocument[]> {
    return this.bankListModel.find({ isActive: true }).exec();
  }

  /**
   * ดึงธนาคารตาม bankCode
   */
  async findByCode(bankCode: string): Promise<BankListDocument | null> {
    return this.bankListModel.findOne({ bankCode }).exec();
  }

  /**
   * สร้างธนาคารใหม่
   */
  async create(
    bankData: Partial<BankList>,
  ): Promise<BankListDocument> {
    const bank = new this.bankListModel(bankData);
    return bank.save();
  }

  /**
   * อัปเดตธนาคาร
   */
  async update(
    bankCode: string,
    updateData: Partial<BankList>,
  ): Promise<BankListDocument | null> {
    return this.bankListModel
      .findOneAndUpdate({ bankCode }, updateData, { new: true })
      .exec();
  }

  /**
   * ลบธนาคาร (soft delete โดยตั้ง isActive = false)
   */
  async deactivate(bankCode: string): Promise<BankListDocument | null> {
    return this.bankListModel
      .findOneAndUpdate({ bankCode }, { isActive: false }, { new: true })
      .exec();
  }
}
