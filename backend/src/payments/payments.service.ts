import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus, PaymentType } from '../database/schemas/payment.schema';
import { PackagesService } from '../packages/packages.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @Inject(forwardRef(() => PackagesService))
    private packagesService: PackagesService,
    @Inject(forwardRef(() => SubscriptionsService))
    private subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => SystemSettingsService))
    private systemSettingsService: SystemSettingsService,
    @Inject(forwardRef(() => SlipVerificationService))
    private slipVerificationService: SlipVerificationService,
  ) {}

  async createPayment(
    userId: string,
    packageId: string,
    paymentType: PaymentType,
    slipImageData?: Buffer,
    transactionHash?: string,
  ): Promise<PaymentDocument> {
    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    const payment = new this.paymentModel({
      userId,
      packageId,
      amount: paymentType === PaymentType.USDT ? pkg.priceUsdt : pkg.price,
      paymentType,
      status: PaymentStatus.PENDING,
      slipImageData,
      transactionHash,
    });

    return payment.save();
  }

  async verifySlipPayment(
    paymentId: string,
    slipImageData: Buffer,
  ): Promise<{
    success: boolean;
    message: string;
    verificationResult?: any;
  }> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Get system settings for bank accounts
    const settings = await this.systemSettingsService.getSettings();
    const bankAccounts = settings?.paymentBankAccounts || [];

    if (bankAccounts.length === 0) {
      return {
        success: false,
        message: 'ยังไม่ได้ตั้งค่าบัญชีธนาคารสำหรับรับชำระเงิน',
      };
    }

    // Verify slip with Thunder API
    const result = await this.slipVerificationService.verifySlip(
      slipImageData,
      'payment',
      payment.userId,
      paymentId,
    );

    if (result.status === 'success' && result.data) {
      // Check if receiver account matches configured bank accounts
      const receiverAccount = result.data.receiverAccountNumber;
      const matchedAccount = bankAccounts.find(
        (acc: any) => acc.accountNumber.replace(/[-\s]/g, '') === receiverAccount?.replace(/[-\s]/g, ''),
      );

      const verified = !!matchedAccount;

      payment.verificationResult = {
        ...result.data,
        accountMatched: verified,
        matchedAccountName: matchedAccount?.accountName,
      };

      if (verified) {
        payment.status = PaymentStatus.VERIFIED;
        payment.verifiedAt = new Date();
        payment.adminNotes = 'ระบบอนุมัติอัตโนมัติ: ตรวจสอบสลิปสำเร็จ';

        // Add subscription
        await this.subscriptionsService.addQuotaToExisting(
          payment.userId,
          payment.packageId,
          paymentId,
        );
      }

      await payment.save();

      return {
        success: verified,
        message: verified
          ? 'ตรวจสอบสลิปสำเร็จ ระบบเติมแพ็คเกจให้อัตโนมัติ'
          : 'ข้อมูลบัญชีผู้รับไม่ตรง รอตรวจสอบจากผู้ดูแลระบบ',
        verificationResult: payment.verificationResult,
      };
    } else if (result.status === 'duplicate') {
      payment.verificationResult = { duplicate: true };
      payment.adminNotes = 'สลิปซ้ำ: รอตรวจสอบจากผู้ดูแลระบบ';
      await payment.save();

      return {
        success: false,
        message: 'สลิปนี้เคยถูกใช้แล้ว',
      };
    }

    payment.verificationResult = { error: result.message };
    await payment.save();

    return {
      success: false,
      message: result.message,
    };
  }

  async approvePayment(paymentId: string, adminId: string): Promise<boolean> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.VERIFIED) {
      throw new BadRequestException('Payment already approved');
    }

    payment.status = PaymentStatus.VERIFIED;
    payment.adminId = adminId;
    payment.verifiedAt = new Date();
    payment.adminNotes = `อนุมัติโดย Admin: ${adminId}`;
    await payment.save();

    // Add subscription
    await this.subscriptionsService.addQuotaToExisting(
      payment.userId,
      payment.packageId,
      paymentId,
    );

    return true;
  }

  async rejectPayment(paymentId: string, adminId: string, notes?: string): Promise<boolean> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    payment.status = PaymentStatus.REJECTED;
    payment.adminId = adminId;
    payment.adminNotes = notes || 'ปฏิเสธโดย Admin';
    await payment.save();

    return true;
  }

  async findAll(status?: PaymentStatus): Promise<any[]> {
    const query = status ? { status } : {};
    const payments = await this.paymentModel
      .find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'username email fullName')
      .populate('packageId', 'name price slipQuota durationDays')
      .lean()
      .exec();

    // Transform to include user and package as nested objects
    return payments.map((payment: any) => ({
      ...payment,
      user: payment.userId ? {
        username: payment.userId.username,
        email: payment.userId.email,
        fullName: payment.userId.fullName,
      } : null,
      package: payment.packageId ? {
        name: payment.packageId.name,
        price: payment.packageId.price,
        slipQuota: payment.packageId.slipQuota,
        durationDays: payment.packageId.durationDays,
      } : null,
      userId: payment.userId?._id || payment.userId,
      packageId: payment.packageId?._id || payment.packageId,
    }));
  }

  async findById(id: string): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findById(id)
      .populate('userId', 'username email fullName')
      .populate('packageId', 'name price slipQuota durationDays')
      .exec();
  }

  async findByUser(userId: string, limit = 20): Promise<any[]> {
    const payments = await this.paymentModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('packageId', 'name price slipQuota durationDays')
      .lean()
      .exec();

    return payments.map((payment: any) => ({
      ...payment,
      package: payment.packageId ? {
        name: payment.packageId.name,
        price: payment.packageId.price,
        slipQuota: payment.packageId.slipQuota,
        durationDays: payment.packageId.durationDays,
      } : null,
      packageId: payment.packageId?._id || payment.packageId,
    }));
  }

  async checkDuplicateSlip(transRef: string): Promise<{
    isDuplicate: boolean;
    duplicateCount: number;
  }> {
    const count = await this.paymentModel.countDocuments({ transRef });
    return {
      isDuplicate: count > 0,
      duplicateCount: count,
    };
  }
}
