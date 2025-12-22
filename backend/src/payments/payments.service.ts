import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus, PaymentType } from '../database/schemas/payment.schema';
import { PackagesService } from '../packages/packages.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

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

  /**
   * Validate ObjectId format
   */
  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  async createPayment(
    userId: string,
    packageId: string,
    paymentType: PaymentType,
    slipImageData?: Buffer,
    transactionHash?: string,
  ): Promise<PaymentDocument> {
    // Validate packageId
    if (!this.isValidObjectId(packageId)) {
      throw new BadRequestException('Invalid package ID format');
    }

    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    // Validate USDT payment has transaction hash
    if (paymentType === PaymentType.USDT && !transactionHash) {
      throw new BadRequestException('Transaction hash is required for USDT payment');
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

    this.logger.log(`Created payment for user ${userId}, package ${packageId}, type ${paymentType}`);
    return payment.save();
  }

  async upsertSlipPayment(
    userId: string,
    packageId: string,
    slipImageData: Buffer,
    paymentId?: string,
  ): Promise<PaymentDocument> {
    // Validate packageId
    if (!this.isValidObjectId(packageId)) {
      throw new BadRequestException('Invalid package ID format');
    }

    // If user is re-uploading for an existing payment, update it (idempotent)
    if (paymentId) {
      if (!this.isValidObjectId(paymentId)) {
        throw new BadRequestException('Invalid payment ID format');
      }

      const existing = await this.paymentModel.findById(paymentId);
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      if (existing.userId.toString() !== userId) {
        throw new BadRequestException('Access denied');
      }
      if (existing.paymentType !== PaymentType.BANK_TRANSFER) {
        throw new BadRequestException('Invalid payment type');
      }
      if (existing.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Payment is not pending');
      }
      if (existing.packageId.toString() !== packageId) {
        throw new BadRequestException('Package mismatch');
      }

      existing.slipImageData = slipImageData;
      await existing.save();
      this.logger.log(`Updated slip for existing payment ${paymentId}`);
      return existing;
    }

    // Otherwise, reuse latest pending payment for same user+package to prevent duplicates
    const pending = await this.paymentModel
      .findOne({
        userId,
        packageId,
        paymentType: PaymentType.BANK_TRANSFER,
        status: PaymentStatus.PENDING,
      })
      .sort({ createdAt: -1 });

    if (pending) {
      pending.slipImageData = slipImageData;
      await pending.save();
      this.logger.log(`Reused existing pending payment ${pending._id} for user ${userId}`);
      return pending;
    }

    return this.createPayment(userId, packageId, PaymentType.BANK_TRANSFER, slipImageData);
  }

  async verifySlipPayment(
    paymentId: string,
    slipImageData: Buffer,
  ): Promise<{
    success: boolean;
    message: string;
    verificationResult?: any;
  }> {
    if (!this.isValidObjectId(paymentId)) {
      return { success: false, message: 'Invalid payment ID format' };
    }

    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Prevent re-verification of already processed payments
    if (payment.status === PaymentStatus.VERIFIED) {
      return { success: true, message: 'Payment already verified' };
    }
    if (payment.status === PaymentStatus.REJECTED) {
      return { success: false, message: 'Payment was rejected' };
    }

    // Get system settings for bank accounts
    const settings = await this.systemSettingsService.getSettings();
    const bankAccounts = settings?.paymentBankAccounts || [];

    if (bankAccounts.length === 0) {
      this.logger.warn('No bank accounts configured for payment verification');
      return {
        success: false,
        message: 'ยังไม่ได้ตั้งค่าบัญชีธนาคารสำหรับรับชำระเงิน',
      };
    }

    // Verify slip with Thunder API
    const result = await this.slipVerificationService.verifySlip(
      slipImageData,
      'payment',
      payment.userId.toString(),
      paymentId,
    );

    if (result.status === 'success' && result.data) {
      // Check for duplicate transRef before processing
      if (result.data.transRef) {
        const duplicateCheck = await this.checkDuplicateSlip(result.data.transRef);
        if (duplicateCheck.isDuplicate) {
          payment.verificationResult = { duplicate: true, transRef: result.data.transRef };
          payment.adminNotes = 'สลิปซ้ำ: เลขอ้างอิงนี้เคยถูกใช้แล้ว';
          await payment.save();
          return {
            success: false,
            message: 'สลิปนี้เคยถูกใช้แล้ว',
          };
        }
      }

      payment.transRef = result.data.transRef;
      
      // Check if receiver account matches configured bank accounts
      const receiverAccount = result.data.receiverAccountNumber;
      const matchedAccount = bankAccounts.find(
        (acc: any) => acc.accountNumber.replace(/[-\s]/g, '') === receiverAccount?.replace(/[-\s]/g, ''),
      );

      const verified = !!matchedAccount;

      // Verify amount matches package price (with 1% tolerance for fees)
      const expectedAmount = payment.amount;
      const actualAmount = result.data.amount || 0;
      const amountTolerance = expectedAmount * 0.01; // 1% tolerance
      const amountMatched = Math.abs(actualAmount - expectedAmount) <= amountTolerance;

      payment.verificationResult = {
        ...result.data,
        accountMatched: verified,
        matchedAccountName: matchedAccount?.accountName,
        amountMatched,
        expectedAmount,
        actualAmount,
      };

      if (verified && amountMatched) {
        // Use atomic operation to prevent double-approval race condition
        const updateResult = await this.paymentModel.findOneAndUpdate(
          {
            _id: paymentId,
            status: PaymentStatus.PENDING, // Only update if still pending
          },
          {
            status: PaymentStatus.VERIFIED,
            verifiedAt: new Date(),
            adminNotes: 'ระบบอนุมัติอัตโนมัติ: ตรวจสอบสลิปสำเร็จ',
            verificationResult: payment.verificationResult,
            transRef: payment.transRef,
          },
          { new: true },
        );

        if (updateResult) {
          // Add subscription only if we successfully updated the payment
          try {
            await this.subscriptionsService.addQuotaToExisting(
              payment.userId.toString(),
              payment.packageId.toString(),
              paymentId,
            );
            this.logger.log(`Auto-approved payment ${paymentId} and added quota`);
          } catch (error) {
            // Rollback payment status if subscription fails
            this.logger.error(`Failed to add subscription for payment ${paymentId}:`, error);
            await this.paymentModel.findByIdAndUpdate(paymentId, {
              status: PaymentStatus.PENDING,
              adminNotes: 'ระบบอนุมัติแต่เพิ่มโควต้าไม่สำเร็จ รอตรวจสอบ',
            });
            return {
              success: false,
              message: 'ตรวจสอบสลิปสำเร็จแต่เกิดข้อผิดพลาดในการเพิ่มโควต้า กรุณาติดต่อผู้ดูแลระบบ',
              verificationResult: payment.verificationResult,
            };
          }
        }

        return {
          success: true,
          message: 'ตรวจสอบสลิปสำเร็จ ระบบเติมแพ็คเกจให้อัตโนมัติ',
          verificationResult: payment.verificationResult,
        };
      } else {
        // Account or amount didn't match - save for manual review
        let failReason = '';
        if (!verified) failReason += 'บัญชีผู้รับไม่ตรง ';
        if (!amountMatched) failReason += `ยอดเงินไม่ตรง (คาดหวัง ${expectedAmount} ได้รับ ${actualAmount})`;
        
        payment.adminNotes = failReason.trim() + ' - รอตรวจสอบจากผู้ดูแลระบบ';
        await payment.save();

        return {
          success: false,
          message: verified 
            ? 'ยอดเงินไม่ตรงกับราคาแพ็คเกจ รอตรวจสอบจากผู้ดูแลระบบ'
            : 'ข้อมูลบัญชีผู้รับไม่ตรง รอตรวจสอบจากผู้ดูแลระบบ',
          verificationResult: payment.verificationResult,
        };
      }
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
    if (!this.isValidObjectId(paymentId)) {
      throw new BadRequestException('Invalid payment ID format');
    }

    // Use atomic operation to prevent double-approval
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: { $in: [PaymentStatus.PENDING] }, // Only approve pending payments
      },
      {
        status: PaymentStatus.VERIFIED,
        adminId,
        verifiedAt: new Date(),
        adminNotes: `อนุมัติโดย Admin: ${adminId}`,
      },
      { new: true },
    );

    if (!payment) {
      const existing = await this.paymentModel.findById(paymentId);
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      if (existing.status === PaymentStatus.VERIFIED) {
        throw new BadRequestException('Payment already approved');
      }
      throw new BadRequestException('Cannot approve this payment');
    }

    // Add subscription
    try {
      await this.subscriptionsService.addQuotaToExisting(
        payment.userId.toString(),
        payment.packageId.toString(),
        paymentId,
      );
      this.logger.log(`Admin ${adminId} approved payment ${paymentId}`);
      return true;
    } catch (error) {
      // Rollback payment status if subscription fails
      this.logger.error(`Failed to add subscription after admin approval for payment ${paymentId}:`, error);
      await this.paymentModel.findByIdAndUpdate(paymentId, {
        status: PaymentStatus.PENDING,
        adminNotes: `อนุมัติโดย Admin แต่เพิ่มโควต้าไม่สำเร็จ: ${error.message}`,
      });
      throw new BadRequestException('อนุมัติสำเร็จแต่เพิ่มโควต้าไม่สำเร็จ กรุณาลองใหม่');
    }
  }

  async rejectPayment(paymentId: string, adminId: string, notes?: string): Promise<boolean> {
    if (!this.isValidObjectId(paymentId)) {
      throw new BadRequestException('Invalid payment ID format');
    }

    // Use atomic operation
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: { $in: [PaymentStatus.PENDING] }, // Only reject pending payments
      },
      {
        status: PaymentStatus.REJECTED,
        adminId,
        adminNotes: notes || 'ปฏิเสธโดย Admin',
      },
      { new: true },
    );

    if (!payment) {
      const existing = await this.paymentModel.findById(paymentId);
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      throw new BadRequestException('Cannot reject this payment');
    }

    this.logger.log(`Admin ${adminId} rejected payment ${paymentId}`);
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
      // Don't send slip image data in list view
      slipImageData: undefined,
      hasSlipImage: !!payment.slipImageData,
    }));
  }

  async findById(id: string): Promise<PaymentDocument | null> {
    if (!this.isValidObjectId(id)) {
      return null;
    }

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
      // Don't send slip image data in list view
      slipImageData: undefined,
      hasSlipImage: !!payment.slipImageData,
    }));
  }

  async checkDuplicateSlip(transRef: string): Promise<{
    isDuplicate: boolean;
    duplicateCount: number;
  }> {
    if (!transRef) {
      return { isDuplicate: false, duplicateCount: 0 };
    }

    const count = await this.paymentModel.countDocuments({ 
      transRef,
      status: { $in: [PaymentStatus.VERIFIED, PaymentStatus.PENDING] },
    });
    
    return {
      isDuplicate: count > 0,
      duplicateCount: count,
    };
  }

  /**
   * Get payment statistics for admin dashboard
   */
  async getStatistics(): Promise<{
    totalPending: number;
    totalVerified: number;
    totalRejected: number;
    totalRevenue: number;
  }> {
    const [pendingCount, verifiedStats, rejectedCount] = await Promise.all([
      this.paymentModel.countDocuments({ status: PaymentStatus.PENDING }),
      this.paymentModel.aggregate([
        { $match: { status: PaymentStatus.VERIFIED } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),
      this.paymentModel.countDocuments({ status: PaymentStatus.REJECTED }),
    ]);

    const verified = verifiedStats[0] || { count: 0, totalAmount: 0 };

    return {
      totalPending: pendingCount,
      totalVerified: verified.count,
      totalRejected: rejectedCount,
      totalRevenue: verified.totalAmount,
    };
  }

  /**
   * Cancel expired pending payments (older than 24 hours)
   */
  async cancelExpiredPayments(): Promise<number> {
    const expireTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    const result = await this.paymentModel.updateMany(
      {
        status: PaymentStatus.PENDING,
        createdAt: { $lt: expireTime },
      },
      {
        status: PaymentStatus.CANCELLED,
        adminNotes: 'ยกเลิกอัตโนมัติ: หมดเวลาชำระเงิน',
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Cancelled ${result.modifiedCount} expired payments`);
    }

    return result.modifiedCount;
  }
}
