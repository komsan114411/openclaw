import { Injectable, NotFoundException, BadRequestException, ConflictException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus, PaymentType } from '../database/schemas/payment.schema';
import { CreditTransaction, CreditTransactionDocument, TransactionType, TransactionStatus } from '../database/schemas/credit-transaction.schema';
import { PackagesService } from '../packages/packages.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { RedisService } from '../redis/redis.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActorRole } from '../database/schemas/activity-log.schema';
import { EventBusService, EventNames, PaymentCompletedEvent } from '../core/events';
import { isValidObjectId } from '../common/utils/validation.util';
import { createActivityLogger } from '../common/utils/activity-logger.util';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private logActivity!: ReturnType<typeof createActivityLogger>;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(CreditTransaction.name) private creditTransactionModel: Model<CreditTransactionDocument>,
    @Inject(forwardRef(() => PackagesService))
    private packagesService: PackagesService,
    @Inject(forwardRef(() => SystemSettingsService))
    private systemSettingsService: SystemSettingsService,
    @Inject(forwardRef(() => SlipVerificationService))
    private slipVerificationService: SlipVerificationService,
    private redisService: RedisService,
    @Inject(forwardRef(() => ActivityLogsService))
    private activityLogsService: ActivityLogsService,
    private eventBus: EventBusService,
  ) {
    // Initialize after all dependencies are injected
    this.logActivity = createActivityLogger(this.activityLogsService, this.logger, 'payment');
  }

  /**
   * Count how many times a user has successfully purchased a specific package
   * Counts BOTH:
   * 1. VERIFIED payments (slip/USDT payments)
   * 2. COMPLETED wallet transactions (wallet credit purchases)
   * This prevents users from bypassing purchase limits by using different payment methods
   */
  async countUserPurchases(userId: string, packageId: string): Promise<number> {
    // Count verified payments (slip/USDT)
    const paymentCount = await this.paymentModel.countDocuments({
      userId,
      packageId,
      status: PaymentStatus.VERIFIED,
    });

    // Count completed wallet purchase transactions
    const walletPurchaseCount = await this.creditTransactionModel.countDocuments({
      userId,
      packageId,
      type: TransactionType.PURCHASE,
      status: TransactionStatus.COMPLETED,
    });

    return paymentCount + walletPurchaseCount;
  }

  /**
   * Check if user can purchase a package based on maxPurchasesPerUser limit
   */
  async canUserPurchase(userId: string, packageId: string): Promise<{
    canPurchase: boolean;
    purchaseCount: number;
    maxPurchases: number | null;
    remainingPurchases: number | null;
  }> {
    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      return { canPurchase: false, purchaseCount: 0, maxPurchases: null, remainingPurchases: null };
    }

    const maxPurchases = pkg.maxPurchasesPerUser;

    // null or 0 means unlimited
    if (!maxPurchases || maxPurchases <= 0) {
      return { canPurchase: true, purchaseCount: 0, maxPurchases: null, remainingPurchases: null };
    }

    const purchaseCount = await this.countUserPurchases(userId, packageId);
    const canPurchase = purchaseCount < maxPurchases;
    const remainingPurchases = Math.max(0, maxPurchases - purchaseCount);

    return { canPurchase, purchaseCount, maxPurchases, remainingPurchases };
  }

  async createPayment(
    userId: string,
    packageId: string,
    paymentType: PaymentType,
    slipImageData?: Buffer,
    transactionHash?: string,
  ): Promise<PaymentDocument> {
    // Validate packageId
    if (!isValidObjectId(packageId)) {
      throw new BadRequestException('Invalid package ID format');
    }

    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    // Check purchase limit
    const purchaseCheck = await this.canUserPurchase(userId, packageId);
    if (!purchaseCheck.canPurchase) {
      throw new BadRequestException(
        `คุณได้ซื้อแพ็คเกจนี้ครบ ${purchaseCheck.maxPurchases} ครั้งแล้ว ไม่สามารถซื้อเพิ่มได้`
      );
    }

    // Validate USDT payment has transaction hash
    if (paymentType === PaymentType.USDT && !transactionHash) {
      throw new BadRequestException('Transaction hash is required for USDT payment');
    }

    // Use distributed lock to prevent double-click race conditions
    const lockKey = `payment:create:${userId}:${packageId}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 10); // 10 second lock

    if (!lockToken) {
      throw new ConflictException('กำลังดำเนินการชำระเงินอยู่ กรุณารอสักครู่');
    }

    try {
      // Check for existing pending payment first (belt and suspenders with unique index)
      const existingPending = await this.paymentModel.findOne({
        userId,
        packageId,
        status: PaymentStatus.PENDING,
      });

      if (existingPending) {
        this.logger.log(`Returning existing pending payment ${existingPending._id} for user ${userId}`);
        return existingPending;
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

      try {
        await payment.save();
        this.logger.log(`Created payment for user ${userId}, package ${packageId}, type ${paymentType}`);

        // Log activity: PAYMENT_CREATED
        this.logActivity({
          actorUserId: userId,
          actorRole: ActivityActorRole.USER,
          subjectUserId: userId,
          action: 'PAYMENT_CREATED',
          entityId: payment._id.toString(),
          message: `สร้างรายการชำระเงินใหม่ (${paymentType})`,
          metadata: {
            packageId,
            amount: payment.amount,
            paymentType,
          },
        });

        return payment;
      } catch (error: any) {
        // Handle duplicate key error from unique index (race condition safety net)
        if (error.code === 11000) {
          const existing = await this.paymentModel.findOne({
            userId,
            packageId,
            status: PaymentStatus.PENDING,
          });
          if (existing) {
            this.logger.log(`Returning existing payment after duplicate key error: ${existing._id}`);
            return existing;
          }
        }
        throw error;
      }
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  async upsertSlipPayment(
    userId: string,
    packageId: string,
    slipImageData: Buffer,
    paymentId?: string,
  ): Promise<PaymentDocument> {
    // Validate packageId
    if (!isValidObjectId(packageId)) {
      throw new BadRequestException('Invalid package ID format');
    }

    // If user is re-uploading for an existing payment, update it atomically
    if (paymentId) {
      if (!isValidObjectId(paymentId)) {
        throw new BadRequestException('Invalid payment ID format');
      }

      // Use atomic findOneAndUpdate with all conditions
      const updated = await this.paymentModel.findOneAndUpdate(
        {
          _id: paymentId,
          userId,
          packageId,
          paymentType: PaymentType.BANK_TRANSFER,
          status: PaymentStatus.PENDING,
        },
        {
          $set: { slipImageData },
        },
        { new: true },
      );

      if (!updated) {
        // Check why it failed
        const existing = await this.paymentModel.findById(paymentId);
        if (!existing) {
          throw new NotFoundException('Payment not found');
        }
        if (existing.userId.toString() !== userId) {
          throw new BadRequestException('Access denied');
        }
        if (existing.status !== PaymentStatus.PENDING) {
          throw new BadRequestException('Payment is not pending');
        }
        throw new BadRequestException('Payment update failed');
      }

      this.logger.log(`Updated slip for existing payment ${paymentId}`);

      // Log activity: SLIP_UPLOADED (re-upload)
      this.logActivity({
        actorUserId: userId,
        actorRole: ActivityActorRole.USER,
        subjectUserId: userId,
        action: 'SLIP_UPLOADED',
        entityId: paymentId,
        message: 'อัปโหลดสลิปใหม่สำหรับรายการที่มีอยู่',
        metadata: {
          packageId,
          isReupload: true,
        },
      });

      return updated;
    }

    // Use distributed lock for atomic upsert
    const lockKey = `payment:slip:${userId}:${packageId}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 15);

    if (!lockToken) {
      throw new ConflictException('กำลังอัปโหลดสลิปอยู่ กรุณารอสักครู่');
    }

    try {
      // Atomic: find existing or prepare for creation
      const pkg = await this.packagesService.findById(packageId);
      if (!pkg) {
        throw new NotFoundException('Package not found');
      }

      // Try to update existing pending payment first (atomic)
      const existingUpdated = await this.paymentModel.findOneAndUpdate(
        {
          userId,
          packageId,
          paymentType: PaymentType.BANK_TRANSFER,
          status: PaymentStatus.PENDING,
        },
        {
          $set: { slipImageData },
        },
        { new: true },
      );

      if (existingUpdated) {
        this.logger.log(`Reused existing pending payment ${existingUpdated._id} for user ${userId}`);

        // Log activity: SLIP_UPLOADED (update existing)
        this.logActivity({
          actorUserId: userId,
          actorRole: ActivityActorRole.USER,
          subjectUserId: userId,
          action: 'SLIP_UPLOADED',
          entityId: existingUpdated._id.toString(),
          message: 'อัปโหลดสลิปใหม่สำหรับรายการที่รอดำเนินการ',
          metadata: {
            packageId,
            isReupload: true,
          },
        });

        return existingUpdated;
      }

      // No existing pending payment - check purchase limit before creating new one
      const purchaseCheck = await this.canUserPurchase(userId, packageId);
      if (!purchaseCheck.canPurchase) {
        throw new BadRequestException(
          `คุณได้ซื้อแพ็คเกจนี้ครบ ${purchaseCheck.maxPurchases} ครั้งแล้ว ไม่สามารถซื้อเพิ่มได้`
        );
      }

      // Create new payment
      const payment = new this.paymentModel({
        userId,
        packageId,
        amount: pkg.price,
        paymentType: PaymentType.BANK_TRANSFER,
        status: PaymentStatus.PENDING,
        slipImageData,
      });

      try {
        await payment.save();
        this.logger.log(`Created new slip payment for user ${userId}, package ${packageId}`);

        // Log activity: SLIP_UPLOADED (new payment)
        this.logActivity({
          actorUserId: userId,
          actorRole: ActivityActorRole.USER,
          subjectUserId: userId,
          action: 'SLIP_UPLOADED',
          entityId: payment._id.toString(),
          message: 'สร้างรายการชำระเงินและอัปโหลดสลิป',
          metadata: {
            packageId,
            amount: payment.amount,
            isNewPayment: true,
          },
        });

        return payment;
      } catch (error: any) {
        // Handle race condition: unique index violation
        if (error.code === 11000) {
          const existing = await this.paymentModel.findOneAndUpdate(
            {
              userId,
              packageId,
              status: PaymentStatus.PENDING,
            },
            { $set: { slipImageData } },
            { new: true },
          );
          if (existing) {
            this.logger.log(`Recovered from race condition, updated payment ${existing._id}`);
            return existing;
          }
        }
        throw error;
      }
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  async verifySlipPayment(
    paymentId: string,
    slipImageData: Buffer,
  ): Promise<{
    success: boolean;
    message: string;
    verificationResult?: any;
  }> {
    if (!isValidObjectId(paymentId)) {
      return { success: false, message: 'Invalid payment ID format' };
    }

    // Use distributed lock to prevent concurrent verification of same payment
    const lockKey = `payment:verify:${paymentId}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 60); // 60 second lock for verification

    if (!lockToken) {
      return { success: false, message: 'กำลังตรวจสอบสลิปอยู่ กรุณารอสักครู่' };
    }

    try {
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
          const duplicateCheck = await this.checkDuplicateSlip(
            result.data.transRef,
            payment.userId.toString(), // Exclude current user's own pending payments
          );

          // Block if already verified by someone
          if (duplicateCheck.isDuplicate) {
            payment.verificationResult = { duplicate: true, transRef: result.data.transRef };
            payment.adminNotes = 'สลิปซ้ำ: เลขอ้างอิงนี้เคยถูกใช้แล้ว';
            await payment.save();
            return {
              success: false,
              message: 'สลิปนี้เคยถูกใช้แล้ว',
            };
          }

          // Also block if another user has pending payment with same slip
          if (duplicateCheck.hasPendingFromOthers) {
            payment.verificationResult = { duplicate: true, transRef: result.data.transRef, pendingConflict: true };
            payment.adminNotes = 'สลิปซ้ำ: มีผู้ใช้รายอื่นกำลังใช้สลิปนี้';
            await payment.save();
            return {
              success: false,
              message: 'สลิปนี้กำลังถูกใช้โดยผู้อื่น กรุณาใช้สลิปอื่น',
            };
          }
        }

        payment.transRef = result.data.transRef;

        // Get receiver info from slip
        const receiverAccount = result.data.receiverAccountNumber || result.data.receiverAccount;
        const receiverName = result.data.receiverName || '';

        // Check if receiver account matches configured bank accounts
        const matchedAccount = bankAccounts.find(
          (acc: any) => acc.accountNumber.replace(/[-\s]/g, '') === receiverAccount?.replace(/[-\s]/g, ''),
        );

        // Check if receiver name matches (case-insensitive, ignore spaces)
        const normalizeText = (text: string) => (text || '').toLowerCase().replace(/\s+/g, '');
        const nameMatched = matchedAccount ?
          normalizeText(matchedAccount.accountName).includes(normalizeText(receiverName)) ||
          normalizeText(receiverName).includes(normalizeText(matchedAccount.accountName)) : false;

        const accountMatched = !!matchedAccount;

        // Verify amount matches package price (with 1% tolerance for fees)
        const expectedAmount = payment.amount;
        const actualAmount = result.data.amount || 0;
        const amountTolerance = expectedAmount * 0.01; // 1% tolerance
        const amountMatched = Math.abs(actualAmount - expectedAmount) <= amountTolerance;

        // Store detailed verification result
        payment.verificationResult = {
          ...result.data,
          accountMatched,
          nameMatched,
          amountMatched,
          matchedAccountName: matchedAccount?.accountName,
          expectedAccountNumber: matchedAccount?.accountNumber,
          expectedAmount,
          actualAmount,
          amountDifference: actualAmount - expectedAmount,
        };

        // All checks passed - auto approve
        if (accountMatched && amountMatched) {
          // BULLETPROOF: Set quotaGranted=true ATOMICALLY with status change
          // This prevents race conditions where event is published but quotaGranted not set
          const updateResult = await this.paymentModel.findOneAndUpdate(
            {
              _id: paymentId,
              status: PaymentStatus.PENDING,
              quotaGranted: { $ne: true }, // Prevent double-granting
            },
            {
              status: PaymentStatus.VERIFIED,
              verifiedAt: new Date(),
              adminNotes: 'ระบบอนุมัติอัตโนมัติ: ตรวจสอบสลิปสำเร็จ',
              verificationResult: payment.verificationResult,
              transRef: payment.transRef,
              quotaGranted: true, // Set atomically with status change
            },
            { new: true },
          );

          if (updateResult) {
            // Publish PaymentCompleted event (Event-Driven Architecture)
            try {
              await this.eventBus.publish<PaymentCompletedEvent>({
                eventName: EventNames.PAYMENT_COMPLETED,
                occurredAt: new Date(),
                paymentId,
                userId: payment.userId.toString(),
                amount: payment.amount,
                packageId: payment.packageId.toString(),
                paymentMethod: 'bank_transfer',
                transactionRef: payment.transRef,
              });

              this.logger.log(
                `Auto-approved payment ${paymentId}, published PaymentCompletedEvent`,
              );

              // Log activity: PAYMENT_APPROVED (auto)
              this.logActivity({
                actorRole: ActivityActorRole.SYSTEM,
                subjectUserId: payment.userId.toString(),
                action: 'PAYMENT_APPROVED',
                entityId: paymentId,
                message: 'ระบบอนุมัติอัตโนมัติหลังตรวจสอบสลิปสำเร็จ',
                metadata: {
                  packageId: payment.packageId.toString(),
                  amount: payment.amount,
                  transRef: payment.transRef,
                  approvedBy: 'system',
                },
              });
            } catch (error) {
              // Rollback payment status AND quotaGranted if event publishing fails
              this.logger.error(`Failed to publish event for payment ${paymentId}:`, error);
              await this.paymentModel.findByIdAndUpdate(paymentId, {
                status: PaymentStatus.PENDING,
                quotaGranted: false, // Reset quotaGranted on rollback
                adminNotes: 'ระบบอนุมัติแต่ publish event ไม่สำเร็จ รอตรวจสอบ',
              });
              return {
                success: false,
                message: 'ตรวจสอบสลิปสำเร็จแต่เกิดข้อผิดพลาดในการเพิ่มโควต้า กรุณาติดต่อผู้ดูแลระบบ',
                verificationResult: payment.verificationResult,
              };
            }
          } else {
            // Check if payment was already processed (idempotent handling)
            const existingPayment = await this.paymentModel.findById(paymentId);
            if (existingPayment?.quotaGranted) {
              this.logger.warn(`Payment ${paymentId} already processed - returning success`);
              return {
                success: true,
                message: 'การชำระเงินได้รับการอนุมัติแล้ว',
                verificationResult: existingPayment.verificationResult,
              };
            }
          }

          return {
            success: true,
            message: 'ตรวจสอบสลิปสำเร็จ ระบบเติมแพ็คเกจให้อัตโนมัติ',
            verificationResult: payment.verificationResult,
          };
        } else {
          // Account or amount didn't match - create detailed error message
          const errors: string[] = [];

          if (!accountMatched) {
            errors.push(`❌ เลขบัญชีผู้รับไม่ถูกต้อง (ได้รับ: ${receiverAccount || 'ไม่พบ'})`);
          }

          if (!amountMatched) {
            const diff = actualAmount - expectedAmount;
            if (diff > 0) {
              errors.push(`⚠️ ยอดเงินมากกว่าที่ต้องชำระ (ต้องชำระ ฿${expectedAmount} แต่โอนมา ฿${actualAmount})`);
            } else {
              errors.push(`⚠️ ยอดเงินไม่ครบ (ต้องชำระ ฿${expectedAmount} แต่โอนมา ฿${actualAmount} ขาดอีก ฿${Math.abs(diff)})`);
            }
          }

          const failReason = errors.join('\n');
          const userMessage = !accountMatched
            ? `เลขบัญชีผู้รับไม่ถูกต้อง กรุณาโอนเงินไปยังบัญชีที่ระบบกำหนดเท่านั้น`
            : `ยอดเงินไม่ตรงกับราคาแพ็คเกจ (ต้องชำระ ฿${expectedAmount} แต่โอนมา ฿${actualAmount})`;

          payment.adminNotes = failReason + '\n- รอตรวจสอบจากผู้ดูแลระบบ';
          await payment.save();

          // Log activity: PAYMENT_REJECTED (verification failed)
          this.logActivity({
            actorRole: ActivityActorRole.SYSTEM,
            subjectUserId: payment.userId.toString(),
            action: 'PAYMENT_REJECTED',
            entityId: paymentId,
            message: 'ตรวจสอบสลิปไม่ผ่าน - รอตรวจสอบจากผู้ดูแลระบบ',
            metadata: {
              packageId: payment.packageId.toString(),
              reason: failReason,
              accountMatched,
              nameMatched,
              amountMatched,
              expectedAmount,
              actualAmount,
              receiverAccount,
              receiverName,
              rejectedBy: 'system',
            },
          });

          return {
            success: false,
            message: userMessage,
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
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Approve a payment and grant quota to user.
   *
   * BULLETPROOF IMPLEMENTATION:
   * 1. Uses atomic operations throughout
   * 2. Prevents double-approval via quotaGranted flag
   * 3. Subscription service is idempotent - safe to retry
   * 4. Tracks subscription ID for audit trail
   */
  async approvePayment(paymentId: string, adminId: string): Promise<boolean> {
    if (!isValidObjectId(paymentId)) {
      throw new BadRequestException('Invalid payment ID format');
    }

    // STEP 1: Atomically claim the payment AND set quotaGranted=true
    // This prevents race conditions where two admins try to approve simultaneously
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: PaymentStatus.PENDING,
        quotaGranted: { $ne: true }, // Extra safety: ensure quota not already granted
      },
      {
        status: PaymentStatus.VERIFIED,
        adminId,
        verifiedAt: new Date(),
        adminNotes: `อนุมัติโดย Admin: ${adminId}`,
        quotaGranted: true, // Set atomically with status change
      },
      { new: true },
    );

    if (!payment) {
      const existing = await this.paymentModel.findById(paymentId);
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      if (existing.status === PaymentStatus.VERIFIED) {
        // Check if quota was already granted
        if (existing.quotaGranted) {
          this.logger.warn(`Payment ${paymentId} already approved and quota granted`);
          return true; // Idempotent success
        }
        // Status is verified but quota not granted - try to recover
        this.logger.warn(`Payment ${paymentId} is verified but quota not granted - attempting recovery`);
        return this.recoverPaymentQuota(paymentId, adminId);
      }
      throw new BadRequestException('Cannot approve this payment');
    }

    // STEP 2: Publish PaymentCompleted event (Event-Driven Architecture)
    // The SubscriptionEventHandlers will listen and activate subscription
    try {
      // Get package details for event payload
      const pkg = await this.packagesService.findById(payment.packageId.toString());

      // Publish event - SubscriptionEventHandlers will process this
      await this.eventBus.publish<PaymentCompletedEvent>({
        eventName: EventNames.PAYMENT_COMPLETED,
        occurredAt: new Date(),
        paymentId,
        userId: payment.userId.toString(),
        amount: payment.amount,
        packageId: payment.packageId.toString(),
        paymentMethod: payment.paymentType === PaymentType.USDT ? 'usdt' : 'bank_transfer',
        transactionRef: payment.transRef,
      });

      // quotaGranted already set atomically in STEP 1

      this.logger.log(
        `Admin ${adminId} approved payment ${paymentId}, published PaymentCompletedEvent`,
      );

      // Log activity: PAYMENT_APPROVED (admin)
      this.logActivity({
        actorUserId: adminId,
        actorRole: ActivityActorRole.ADMIN,
        subjectUserId: payment.userId.toString(),
        action: 'PAYMENT_APPROVED',
        entityId: paymentId,
        message: `Admin อนุมัติการชำระเงิน`,
        metadata: {
          packageId: payment.packageId.toString(),
          amount: payment.amount,
          approvedBy: adminId,
        },
      });

      return true;
    } catch (error: any) {
      // ROLLBACK: Revert payment status AND quotaGranted since event publishing failed
      this.logger.error(`Failed to publish event for payment ${paymentId}:`, error);

      await this.paymentModel.findByIdAndUpdate(paymentId, {
        status: PaymentStatus.PENDING,
        adminId: undefined,
        verifiedAt: undefined,
        quotaGranted: false, // Reset quotaGranted on rollback
        adminNotes: `อนุมัติโดย Admin แต่ publish event ไม่สำเร็จ: ${error.message}`,
      });

      throw new BadRequestException('อนุมัติสำเร็จแต่ระบบมีปัญหา กรุณาลองใหม่');
    }
  }

  /**
   * Recovery function for payments that are verified but quota not granted
   * This handles edge cases where the process crashed after setting VERIFIED but before granting quota
   */
  private async recoverPaymentQuota(paymentId: string, adminId: string): Promise<boolean> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment || payment.status !== PaymentStatus.VERIFIED) {
      throw new BadRequestException('Payment not in recoverable state');
    }

    try {
      // Publish PaymentCompleted event for recovery
      await this.eventBus.publish<PaymentCompletedEvent>({
        eventName: EventNames.PAYMENT_COMPLETED,
        occurredAt: new Date(),
        paymentId,
        userId: payment.userId.toString(),
        amount: payment.amount,
        packageId: payment.packageId.toString(),
        paymentMethod: payment.paymentType === PaymentType.USDT ? 'usdt' : 'bank_transfer',
        transactionRef: payment.transRef,
      });

      await this.paymentModel.findByIdAndUpdate(paymentId, {
        quotaGranted: true,
        adminNotes: `${payment.adminNotes} | กู้คืนโควต้าโดย: ${adminId}`,
      });

      this.logger.log(`Recovered quota for payment ${paymentId}, published PaymentCompletedEvent`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to recover quota for payment ${paymentId}:`, error);
      throw new BadRequestException('ไม่สามารถกู้คืนโควต้าได้ กรุณาติดต่อผู้ดูแลระบบ');
    }
  }

  async rejectPayment(paymentId: string, adminId: string, notes?: string): Promise<boolean> {
    if (!isValidObjectId(paymentId)) {
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

    // Log activity: PAYMENT_REJECTED (admin)
    this.logActivity({
      actorUserId: adminId,
      actorRole: ActivityActorRole.ADMIN,
      subjectUserId: payment.userId.toString(),
      action: 'PAYMENT_REJECTED',
      entityId: paymentId,
      message: `Admin ปฏิเสธการชำระเงิน`,
      metadata: {
        packageId: payment.packageId.toString(),
        amount: payment.amount,
        reason: notes || 'ปฏิเสธโดย Admin',
        rejectedBy: adminId,
      },
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
      // Don't send slip image data in list view
      slipImageData: undefined,
      hasSlipImage: !!payment.slipImageData,
    }));
  }

  async findById(id: string): Promise<PaymentDocument | null> {
    if (!isValidObjectId(id)) {
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

  async checkDuplicateSlip(transRef: string, excludeUserId?: string): Promise<{
    isDuplicate: boolean;
    duplicateCount: number;
    hasPendingFromOthers: boolean;
  }> {
    if (!transRef) {
      return { isDuplicate: false, duplicateCount: 0, hasPendingFromOthers: false };
    }

    // Check for VERIFIED duplicates (definitely used)
    const verifiedCount = await this.paymentModel.countDocuments({
      transRef,
      status: PaymentStatus.VERIFIED,
    });

    // Also check for PENDING from OTHER users (potential fraud)
    const pendingFromOthersQuery: any = {
      transRef,
      status: PaymentStatus.PENDING,
    };
    if (excludeUserId) {
      pendingFromOthersQuery.userId = { $ne: excludeUserId };
    }
    const pendingFromOthers = await this.paymentModel.countDocuments(pendingFromOthersQuery);

    return {
      isDuplicate: verifiedCount > 0,
      duplicateCount: verifiedCount,
      hasPendingFromOthers: pendingFromOthers > 0,
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

    // Find payments to be cancelled first (for logging)
    const expiredPayments = await this.paymentModel.find({
      status: PaymentStatus.PENDING,
      createdAt: { $lt: expireTime },
    }).select('_id userId packageId amount').lean();

    if (expiredPayments.length === 0) {
      return 0;
    }

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

      // Log activity for each cancelled payment
      for (const payment of expiredPayments) {
        this.logActivity({
          actorRole: ActivityActorRole.SYSTEM,
          subjectUserId: payment.userId?.toString(),
          action: 'PAYMENT_CANCELLED',
          entityId: payment._id.toString(),
          message: 'ระบบยกเลิกอัตโนมัติ: หมดเวลาชำระเงิน (24 ชม.)',
          metadata: {
            packageId: payment.packageId?.toString(),
            amount: payment.amount,
            reason: 'expired',
            cancelledBy: 'system',
          },
        });
      }
    }

    return result.modifiedCount;
  }
}
