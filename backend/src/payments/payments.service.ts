import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus, PaymentType } from '../database/schemas/payment.schema';
import { PackagesService } from '../packages/packages.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActorRole } from '../database/schemas/activity-log.schema';

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
    @Inject(forwardRef(() => ActivityLogsService))
    private activityLogsService: ActivityLogsService,
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

  /**
   * Upsert slip payment - creates or updates payment with slip image
   * Uses idempotent logic to prevent duplicate payments
   */
  async upsertSlipPayment(
    userId: string,
    packageId: string,
    slipImageData: Buffer,
    paymentId?: string,
  ): Promise<PaymentDocument> {
    // Validate slip data
    if (!slipImageData || slipImageData.length === 0) {
      throw new BadRequestException('Slip image data is required');
    }
    if (slipImageData.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Slip image too large (max 10MB)');
    }

    // If user is re-uploading for an existing payment, update it (idempotent)
    if (paymentId) {
      const existing = await this.paymentModel.findById(paymentId);
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      // Compare userId properly (handle ObjectId)
      const existingUserId = existing.userId?.toString() || existing.userId;
      if (existingUserId !== userId) {
        throw new BadRequestException('Access denied');
      }
      if (existing.paymentType !== PaymentType.BANK_TRANSFER) {
        throw new BadRequestException('Invalid payment type');
      }
      if (existing.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Payment is not pending');
      }
      // Compare packageId properly (handle ObjectId)
      const existingPackageId = existing.packageId?.toString() || existing.packageId;
      if (existingPackageId !== packageId) {
        throw new BadRequestException('Package mismatch');
      }

      existing.slipImageData = slipImageData;
      await existing.save();
      await this.activityLogsService.log({
        actorUserId: userId,
        actorRole: ActivityActorRole.USER,
        subjectUserId: userId,
        action: 'payment.slip.upload',
        entityType: 'payment',
        entityId: existing._id.toString(),
        message: 'อัปโหลดสลิปใหม่ (อัปเดตรายการเดิม)',
        metadata: { packageId },
      });
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
      await this.activityLogsService.log({
        actorUserId: userId,
        actorRole: ActivityActorRole.USER,
        subjectUserId: userId,
        action: 'payment.slip.upload',
        entityType: 'payment',
        entityId: pending._id.toString(),
        message: 'อัปโหลดสลิป (ใช้รายการ pending เดิม)',
        metadata: { packageId },
      });
      return pending;
    }

    const created = await this.createPayment(userId, packageId, PaymentType.BANK_TRANSFER, slipImageData);
    await this.activityLogsService.log({
      actorUserId: userId,
      actorRole: ActivityActorRole.USER,
      subjectUserId: userId,
      action: 'payment.create',
      entityType: 'payment',
      entityId: created._id.toString(),
      message: 'สร้างรายการชำระเงิน (แนบสลิป)',
      metadata: { packageId },
    });
    return created;
  }

  /**
   * Verify slip payment with atomic status check to prevent double processing
   */
  async verifySlipPayment(
    paymentId: string,
    slipImageData: Buffer,
  ): Promise<{
    success: boolean;
    message: string;
    verificationResult?: any;
  }> {
    // First check payment exists and is still pending
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Skip if already verified - prevent double processing
    if (payment.status === PaymentStatus.VERIFIED) {
      return {
        success: true,
        message: 'การชำระเงินนี้ได้รับการอนุมัติแล้ว',
        verificationResult: payment.verificationResult,
      };
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
      payment.userId.toString(),
      paymentId,
    );

    if (result.status === 'success' && result.data) {
      // Check for duplicate transRef in our database first
      if (result.data.transRef) {
        const existingWithRef = await this.paymentModel.findOne({
          transRef: result.data.transRef,
          _id: { $ne: paymentId },
          status: PaymentStatus.VERIFIED,
        });
        if (existingWithRef) {
          // This transRef was already used in another verified payment
          await this.paymentModel.updateOne(
            { _id: paymentId },
            {
              $set: {
                verificationResult: { duplicate: true, existingPaymentId: existingWithRef._id },
                adminNotes: 'สลิปซ้ำ: เลขอ้างอิงนี้เคยใช้ไปแล้ว',
              },
            },
          );
          return {
            success: false,
            message: 'สลิปนี้เคยถูกใช้แล้ว',
          };
        }
      }

      // Check if receiver account matches configured bank accounts
      const receiverAccount = result.data.receiverAccountNumber;
      const matchedAccount = bankAccounts.find(
        (acc: any) => acc.accountNumber.replace(/[-\s]/g, '') === receiverAccount?.replace(/[-\s]/g, ''),
      );

      const verified = !!matchedAccount;

      const verificationResult = {
        ...result.data,
        accountMatched: verified,
        matchedAccountName: matchedAccount?.accountName,
      };

      if (verified) {
        // Use atomic update to prevent race condition
        const updateResult = await this.paymentModel.findOneAndUpdate(
          {
            _id: paymentId,
            status: PaymentStatus.PENDING, // Only update if still pending
          },
          {
            $set: {
              transRef: result.data.transRef,
              verificationResult,
              status: PaymentStatus.VERIFIED,
              verifiedAt: new Date(),
              adminNotes: 'ระบบอนุมัติอัตโนมัติ: ตรวจสอบสลิปสำเร็จ',
            },
          },
          { new: true },
        );

        if (updateResult) {
          // Add subscription
          try {
            await this.subscriptionsService.addQuotaToExisting(
              payment.userId.toString(),
              payment.packageId.toString(),
              paymentId,
            );
          } catch (subError) {
            // Rollback payment status if subscription fails
            await this.paymentModel.updateOne(
              { _id: paymentId },
              {
                $set: {
                  status: PaymentStatus.PENDING,
                  adminNotes: 'ตรวจสอบสลิปสำเร็จ แต่เพิ่ม subscription ล้มเหลว - รอ admin อนุมัติ',
                },
              },
            );
            return {
              success: false,
              message: 'ตรวจสอบสลิปสำเร็จ แต่เกิดข้อผิดพลาดในการเพิ่มโควต้า รอตรวจสอบจากผู้ดูแลระบบ',
              verificationResult,
            };
          }

          return {
            success: true,
            message: 'ตรวจสอบสลิปสำเร็จ ระบบเติมแพ็คเกจให้อัตโนมัติ',
            verificationResult,
          };
        }
      }

      // Not verified (account not matched) - just save verification result
      await this.paymentModel.updateOne(
        { _id: paymentId },
        {
          $set: {
            transRef: result.data.transRef,
            verificationResult,
          },
        },
      );

      return {
        success: false,
        message: 'ข้อมูลบัญชีผู้รับไม่ตรง รอตรวจสอบจากผู้ดูแลระบบ',
        verificationResult,
      };
    } else if (result.status === 'duplicate') {
      await this.paymentModel.updateOne(
        { _id: paymentId },
        {
          $set: {
            verificationResult: { duplicate: true },
            adminNotes: 'สลิปซ้ำ: รอตรวจสอบจากผู้ดูแลระบบ',
          },
        },
      );

      return {
        success: false,
        message: 'สลิปนี้เคยถูกใช้แล้ว',
      };
    }

    // Error case
    await this.paymentModel.updateOne(
      { _id: paymentId },
      {
        $set: {
          verificationResult: { error: result.message },
        },
      },
    );

    return {
      success: false,
      message: result.message,
    };
  }

  /**
   * Approve payment (atomic operation to prevent double approval)
   * Uses findOneAndUpdate to ensure payment is only approved once
   */
  async approvePayment(paymentId: string, adminId: string): Promise<boolean> {
    // Use atomic update to prevent double approval race condition
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: PaymentStatus.PENDING, // Only approve if still pending
      },
      {
        $set: {
          status: PaymentStatus.VERIFIED,
          adminId: adminId,
          verifiedAt: new Date(),
          adminNotes: `อนุมัติโดย Admin: ${adminId}`,
        },
      },
      { new: true },
    );

    if (!payment) {
      // Check if payment exists but was already processed
      const existingPayment = await this.paymentModel.findById(paymentId);
      if (!existingPayment) {
        throw new NotFoundException('Payment not found');
      }
      if (existingPayment.status === PaymentStatus.VERIFIED) {
        throw new BadRequestException('Payment already approved');
      }
      throw new BadRequestException('Payment cannot be approved (status: ' + existingPayment.status + ')');
    }

    // Add subscription (this is safe even if called twice due to addQuotaToExisting logic)
    try {
      await this.subscriptionsService.addQuotaToExisting(
        payment.userId.toString(),
        payment.packageId.toString(),
        paymentId,
      );
    } catch (error) {
      // Rollback payment status if subscription fails
      await this.paymentModel.updateOne(
        { _id: paymentId },
        {
          $set: {
            status: PaymentStatus.PENDING,
            adminNotes: 'การเพิ่ม subscription ล้มเหลว - กรุณาลองอนุมัติใหม่',
          },
          $unset: { adminId: 1, verifiedAt: 1 },
        },
      );
      throw new BadRequestException('Failed to add subscription: ' + (error as Error).message);
    }

    await this.activityLogsService.log({
      actorUserId: adminId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: payment.userId.toString(),
      action: 'payment.approve',
      entityType: 'payment',
      entityId: paymentId,
      message: 'อนุมัติการชำระเงิน',
      metadata: { packageId: payment.packageId.toString() },
    });

    return true;
  }

  /**
   * Reject payment (atomic operation to prevent race condition with approve)
   */
  async rejectPayment(paymentId: string, adminId: string, notes?: string): Promise<boolean> {
    // Use atomic update to prevent race condition
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: PaymentStatus.PENDING, // Only reject if still pending
      },
      {
        $set: {
          status: PaymentStatus.REJECTED,
          adminId: adminId,
          adminNotes: notes || 'ปฏิเสธโดย Admin',
        },
      },
      { new: true },
    );

    if (!payment) {
      const existingPayment = await this.paymentModel.findById(paymentId);
      if (!existingPayment) {
        throw new NotFoundException('Payment not found');
      }
      if (existingPayment.status === PaymentStatus.REJECTED) {
        throw new BadRequestException('Payment already rejected');
      }
      if (existingPayment.status === PaymentStatus.VERIFIED) {
        throw new BadRequestException('Cannot reject an approved payment');
      }
      throw new BadRequestException('Payment cannot be rejected (status: ' + existingPayment.status + ')');
    }

    await this.activityLogsService.log({
      actorUserId: adminId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: payment.userId.toString(),
      action: 'payment.reject',
      entityType: 'payment',
      entityId: paymentId,
      message: 'ปฏิเสธการชำระเงิน',
      metadata: { notes: notes || '' },
    });

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
