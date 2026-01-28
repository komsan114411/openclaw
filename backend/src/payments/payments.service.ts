import { Injectable, NotFoundException, BadRequestException, ConflictException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
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

// Processing timeout: 3 minutes
const PROCESSING_TIMEOUT_MS = 3 * 60 * 1000;

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
   * Compute SHA-256 hash of slip image for duplicate detection.
   * This enables blocking duplicate slips BEFORE verification starts.
   */
  private computeSlipHash(slipImageData: Buffer): string {
    return createHash('sha256').update(slipImageData).digest('hex');
  }

  /**
   * Generate idempotency key for verification operation.
   */
  private generateVerificationIdempotencyKey(paymentId: string, slipHash: string): string {
    return `verify:${paymentId}:${slipHash}:${Date.now()}`;
  }

  /**
   * Check if a slip hash is already being processed or verified.
   * This catches duplicates BEFORE calling Thunder API.
   */
  private async checkSlipHashDuplicate(slipHash: string, excludePaymentId?: string): Promise<{
    isDuplicate: boolean;
    existingPaymentId?: string;
    status?: PaymentStatus;
  }> {
    const query: any = {
      slipHash,
      status: { $in: [PaymentStatus.PROCESSING, PaymentStatus.VERIFIED] },
    };

    if (excludePaymentId) {
      query._id = { $ne: excludePaymentId };
    }

    const existing = await this.paymentModel.findOne(query).select('_id status').lean();

    if (existing) {
      return {
        isDuplicate: true,
        existingPaymentId: existing._id.toString(),
        status: existing.status,
      };
    }

    return { isDuplicate: false };
  }

  /**
   * ATOMIC: Claim payment for processing.
   * Returns null if payment is not in claimable state (already processing/verified/etc).
   * This is the CRITICAL function that prevents race conditions.
   */
  private async claimPaymentForProcessing(
    paymentId: string,
    slipHash: string,
  ): Promise<PaymentDocument | null> {
    const idempotencyKey = this.generateVerificationIdempotencyKey(paymentId, slipHash);

    // ATOMIC: Only one request can claim a PENDING payment
    const claimed = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: PaymentStatus.PENDING, // Only claim PENDING payments
      },
      {
        status: PaymentStatus.PROCESSING,
        processingStartedAt: new Date(),
        slipHash,
        verificationIdempotencyKey: idempotencyKey,
      },
      { new: true },
    );

    return claimed;
  }

  /**
   * Release payment from PROCESSING back to PENDING.
   * Used when verification fails or times out.
   */
  private async releasePaymentFromProcessing(
    paymentId: string,
    reason: string,
  ): Promise<void> {
    await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: PaymentStatus.PROCESSING,
      },
      {
        status: PaymentStatus.PENDING,
        processingStartedAt: null,
        adminNotes: reason,
      },
    );
    this.logger.log(`Released payment ${paymentId} from PROCESSING: ${reason}`);
  }

  /**
   * Cleanup stuck PROCESSING payments.
   * Payments stuck in PROCESSING for more than PROCESSING_TIMEOUT_MS are reset to PENDING.
   */
  async cleanupStuckProcessingPayments(): Promise<number> {
    const cutoffTime = new Date(Date.now() - PROCESSING_TIMEOUT_MS);

    const result = await this.paymentModel.updateMany(
      {
        status: PaymentStatus.PROCESSING,
        processingStartedAt: { $lt: cutoffTime },
      },
      {
        status: PaymentStatus.PENDING,
        processingStartedAt: null,
        adminNotes: 'ระบบรีเซ็ตอัตโนมัติ: การตรวจสอบหมดเวลา',
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(`Cleaned up ${result.modifiedCount} stuck PROCESSING payments`);
    }

    return result.modifiedCount;
  }

  /**
   * Count how many times a user has successfully purchased a specific package
   * Counts BOTH:
   * 1. VERIFIED payments (slip/USDT payments)
   * 2. COMPLETED wallet transactions (wallet credit purchases)
   * This prevents users from bypassing purchase limits by using different payment methods
   */
  async countUserPurchases(userId: string, packageId: string): Promise<number> {
    // Convert string IDs to ObjectId for proper matching
    // Schema stores userId and packageId as Types.ObjectId, so string comparison won't work
    const userObjectId = new Types.ObjectId(userId);
    const packageObjectId = new Types.ObjectId(packageId);

    // Count verified payments (slip/USDT)
    const paymentCount = await this.paymentModel.countDocuments({
      userId: userObjectId,
      packageId: packageObjectId,
      status: PaymentStatus.VERIFIED,
    });

    // Count completed wallet purchase transactions
    const walletPurchaseCount = await this.creditTransactionModel.countDocuments({
      userId: userObjectId,
      packageId: packageObjectId,
      type: TransactionType.PURCHASE,
      status: TransactionStatus.COMPLETED,
    });

    this.logger.debug(
      `[PURCHASE LIMIT] User ${userId}, Package ${packageId}: paymentCount=${paymentCount}, walletPurchaseCount=${walletPurchaseCount}, total=${paymentCount + walletPurchaseCount}`
    );

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
      this.logger.warn(`[PURCHASE LIMIT] Package not found: ${packageId}`);
      return { canPurchase: false, purchaseCount: 0, maxPurchases: null, remainingPurchases: null };
    }

    const maxPurchases = pkg.maxPurchasesPerUser;

    // null or 0 means unlimited
    if (!maxPurchases || maxPurchases <= 0) {
      this.logger.debug(`[PURCHASE LIMIT] Package ${packageId} has no limit (maxPurchasesPerUser=${maxPurchases})`);
      return { canPurchase: true, purchaseCount: 0, maxPurchases: null, remainingPurchases: null };
    }

    const purchaseCount = await this.countUserPurchases(userId, packageId);
    const canPurchase = purchaseCount < maxPurchases;
    const remainingPurchases = Math.max(0, maxPurchases - purchaseCount);

    this.logger.log(
      `[PURCHASE LIMIT CHECK] User ${userId}, Package ${packageId}: purchaseCount=${purchaseCount}, maxPurchases=${maxPurchases}, canPurchase=${canPurchase}`
    );

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

  /**
   * Verify slip payment with BULLETPROOF race condition protection.
   *
   * SECURITY FIX: Uses atomic claim-then-process pattern to prevent:
   * 1. Same payment being verified twice simultaneously
   * 2. Same slip being used for multiple payments simultaneously
   * 3. Double quota grant from single payment
   *
   * Flow:
   * 1. Compute slip hash for early duplicate detection
   * 2. Check if slip hash is already being processed/verified (BEFORE API call)
   * 3. ATOMIC: Claim payment by changing status PENDING → PROCESSING
   * 4. If claim fails, payment is already being processed → return
   * 5. Call Thunder API to verify slip
   * 6. Check transRef duplicates (AFTER API call)
   * 7. ATOMIC: Update payment to VERIFIED with quota grant
   * 8. On any failure, release payment back to PENDING
   */
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

    // STEP 1: Compute slip hash for duplicate detection
    const slipHash = this.computeSlipHash(slipImageData);
    this.logger.debug(`[VERIFY] Payment ${paymentId}, slipHash: ${slipHash.substring(0, 16)}...`);

    // STEP 2: Check if this slip is already being processed or verified (EARLY CHECK)
    // This catches duplicates BEFORE we even try to claim the payment
    const slipHashCheck = await this.checkSlipHashDuplicate(slipHash, paymentId);
    if (slipHashCheck.isDuplicate) {
      this.logger.warn(
        `[VERIFY BLOCKED] Slip hash duplicate detected: payment ${paymentId}, ` +
        `existing payment ${slipHashCheck.existingPaymentId} (${slipHashCheck.status})`
      );
      return {
        success: false,
        message: slipHashCheck.status === PaymentStatus.VERIFIED
          ? 'สลิปนี้เคยถูกใช้แล้ว'
          : 'สลิปนี้กำลังถูกตรวจสอบอยู่ กรุณารอสักครู่',
      };
    }

    // STEP 3: Use distributed lock for additional safety (belt and suspenders)
    // NOTE: Lock is PAYMENT-SPECIFIC, not USER-SPECIFIC - different users can verify simultaneously
    const lockKey = `payment:verify:${paymentId}`;
    this.logger.debug(`[VERIFY] Attempting to acquire lock: ${lockKey}`);
    const lockToken = await this.redisService.acquireLock(lockKey, 120); // 120 second lock

    if (!lockToken) {
      this.logger.warn(`[VERIFY] Failed to acquire lock for payment ${paymentId} - already being processed`);
      return { success: false, message: 'กำลังตรวจสอบสลิปอยู่ กรุณารอสักครู่' };
    }
    this.logger.debug(`[VERIFY] Lock acquired for payment ${paymentId}`);

    let payment: PaymentDocument | null = null;

    try {
      // STEP 4: Check payment exists and its current status
      const existingPayment = await this.paymentModel.findById(paymentId);
      if (!existingPayment) {
        throw new NotFoundException('Payment not found');
      }

      // Handle already processed payments (idempotent)
      if (existingPayment.status === PaymentStatus.VERIFIED) {
        this.logger.log(`[VERIFY] Payment ${paymentId} already verified - idempotent success`);
        return { success: true, message: 'Payment already verified' };
      }
      if (existingPayment.status === PaymentStatus.REJECTED) {
        return { success: false, message: 'Payment was rejected' };
      }
      if (existingPayment.status === PaymentStatus.PROCESSING) {
        // Check if same slip hash
        if (existingPayment.slipHash === slipHash) {
          return { success: false, message: 'กำลังตรวจสอบสลิปอยู่ กรุณารอสักครู่' };
        }
        // Different slip for same payment that's already processing - shouldn't happen
        return { success: false, message: 'รายการนี้กำลังถูกตรวจสอบอยู่' };
      }

      // STEP 5: ATOMIC CLAIM - Change status from PENDING to PROCESSING
      // This is the CRITICAL operation that prevents race conditions
      payment = await this.claimPaymentForProcessing(paymentId, slipHash);

      if (!payment) {
        // Failed to claim - another request got there first OR status changed
        const recheckPayment = await this.paymentModel.findById(paymentId);
        if (recheckPayment?.status === PaymentStatus.VERIFIED) {
          return { success: true, message: 'Payment already verified' };
        }
        if (recheckPayment?.status === PaymentStatus.PROCESSING) {
          return { success: false, message: 'กำลังตรวจสอบสลิปอยู่ กรุณารอสักครู่' };
        }
        return { success: false, message: 'ไม่สามารถตรวจสอบรายการนี้ได้' };
      }

      this.logger.log(`[VERIFY] Claimed payment ${paymentId} for processing`);

      // STEP 6: Get system settings for bank accounts
      const settings = await this.systemSettingsService.getSettings();
      const bankAccounts = settings?.paymentBankAccounts || [];

      if (bankAccounts.length === 0) {
        this.logger.warn('No bank accounts configured for payment verification');
        await this.releasePaymentFromProcessing(paymentId, 'ยังไม่ได้ตั้งค่าบัญชีธนาคาร');
        return {
          success: false,
          message: 'ยังไม่ได้ตั้งค่าบัญชีธนาคารสำหรับรับชำระเงิน',
        };
      }

      // STEP 7: Verify slip with Thunder API
      const result = await this.slipVerificationService.verifySlip(
        slipImageData,
        'payment',
        payment.userId.toString(),
        paymentId,
      );

      if (result.status === 'success' && result.data) {
        // STEP 8: Check for duplicate transRef (AFTER API call, using transRef)
        if (result.data.transRef) {
          const duplicateCheck = await this.checkDuplicateSlip(
            result.data.transRef,
            payment.userId.toString(),
          );

          // Block if already verified by someone
          if (duplicateCheck.isDuplicate) {
            await this.paymentModel.findByIdAndUpdate(paymentId, {
              status: PaymentStatus.REJECTED,
              verificationResult: { duplicate: true, transRef: result.data.transRef },
              adminNotes: 'สลิปซ้ำ: เลขอ้างอิงนี้เคยถูกใช้แล้ว',
              processingStartedAt: null,
            });
            return {
              success: false,
              message: 'สลิปนี้เคยถูกใช้แล้ว',
            };
          }

          // Also block if another user has pending/processing payment with same slip
          if (duplicateCheck.hasPendingFromOthers || duplicateCheck.hasProcessingFromOthers) {
            await this.paymentModel.findByIdAndUpdate(paymentId, {
              status: PaymentStatus.REJECTED,
              verificationResult: {
                duplicate: true,
                transRef: result.data.transRef,
                pendingConflict: duplicateCheck.hasPendingFromOthers,
                processingConflict: duplicateCheck.hasProcessingFromOthers,
              },
              adminNotes: 'สลิปซ้ำ: มีผู้ใช้รายอื่นกำลังใช้สลิปนี้',
              processingStartedAt: null,
            });
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
          // Payment is currently PROCESSING, change to VERIFIED
          const updateResult = await this.paymentModel.findOneAndUpdate(
            {
              _id: paymentId,
              status: PaymentStatus.PROCESSING, // Must be PROCESSING (we claimed it)
              quotaGranted: { $ne: true }, // Prevent double-granting
            },
            {
              status: PaymentStatus.VERIFIED,
              verifiedAt: new Date(),
              adminNotes: 'ระบบอนุมัติอัตโนมัติ: ตรวจสอบสลิปสำเร็จ',
              verificationResult: payment.verificationResult,
              transRef: payment.transRef,
              quotaGranted: true, // Set atomically with status change
              processingStartedAt: null, // Clear processing timestamp
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
                status: PaymentStatus.PENDING, // Revert to PENDING for retry
                quotaGranted: false, // Reset quotaGranted on rollback
                processingStartedAt: null,
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

          // Revert status to PENDING for manual review
          await this.paymentModel.findByIdAndUpdate(paymentId, {
            status: PaymentStatus.PENDING,
            processingStartedAt: null,
            verificationResult: payment.verificationResult,
            adminNotes: failReason + '\n- รอตรวจสอบจากผู้ดูแลระบบ',
          });

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
        // Thunder API detected duplicate - REJECT the payment
        await this.paymentModel.findByIdAndUpdate(paymentId, {
          status: PaymentStatus.REJECTED,
          verificationResult: { duplicate: true, source: 'thunder_api' },
          adminNotes: 'สลิปซ้ำ: Thunder API ตรวจพบว่าสลิปนี้เคยถูกใช้แล้ว',
          processingStartedAt: null,
        });

        this.logger.warn(`[VERIFY] Payment ${paymentId} rejected - duplicate detected by Thunder API`);

        return {
          success: false,
          message: 'สลิปนี้เคยถูกใช้แล้ว',
        };
      }

      // Other verification failures - release back to PENDING for retry
      await this.paymentModel.findByIdAndUpdate(paymentId, {
        status: PaymentStatus.PENDING,
        verificationResult: { error: result.message },
        processingStartedAt: null,
        adminNotes: `ตรวจสอบไม่สำเร็จ: ${result.message}`,
      });

      this.logger.warn(`[VERIFY] Payment ${paymentId} verification failed: ${result.message}`);

      return {
        success: false,
        message: result.message,
      };
    } catch (error: any) {
      // Unexpected error - release payment from PROCESSING if we claimed it
      if (payment && payment.status === PaymentStatus.PROCESSING) {
        this.logger.error(`[VERIFY] Unexpected error for payment ${paymentId}, releasing from PROCESSING:`, error);
        await this.releasePaymentFromProcessing(paymentId, `ข้อผิดพลาดระบบ: ${error.message}`);
      }
      throw error;
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
    // Can approve PENDING or PROCESSING payments (PROCESSING may need manual approval if stuck)
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: { $in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        quotaGranted: { $ne: true }, // Extra safety: ensure quota not already granted
      },
      {
        status: PaymentStatus.VERIFIED,
        adminId,
        verifiedAt: new Date(),
        adminNotes: `อนุมัติโดย Admin: ${adminId}`,
        quotaGranted: true, // Set atomically with status change
        processingStartedAt: null, // Clear processing timestamp
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

    // Use atomic operation - can reject PENDING or PROCESSING payments
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: paymentId,
        status: { $in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      },
      {
        status: PaymentStatus.REJECTED,
        adminId,
        adminNotes: notes || 'ปฏิเสธโดย Admin',
        processingStartedAt: null, // Clear processing timestamp
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
    hasProcessingFromOthers: boolean;
  }> {
    if (!transRef) {
      return { isDuplicate: false, duplicateCount: 0, hasPendingFromOthers: false, hasProcessingFromOthers: false };
    }

    // Check for VERIFIED or PROCESSING duplicates (definitely used or being processed)
    const verifiedOrProcessingCount = await this.paymentModel.countDocuments({
      transRef,
      status: { $in: [PaymentStatus.VERIFIED, PaymentStatus.PROCESSING] },
    });

    // Also check for PENDING/PROCESSING from OTHER users (potential fraud)
    const pendingFromOthersQuery: any = {
      transRef,
      status: PaymentStatus.PENDING,
    };
    if (excludeUserId) {
      pendingFromOthersQuery.userId = { $ne: excludeUserId };
    }
    const pendingFromOthers = await this.paymentModel.countDocuments(pendingFromOthersQuery);

    const processingFromOthersQuery: any = {
      transRef,
      status: PaymentStatus.PROCESSING,
    };
    if (excludeUserId) {
      processingFromOthersQuery.userId = { $ne: excludeUserId };
    }
    const processingFromOthers = await this.paymentModel.countDocuments(processingFromOthersQuery);

    return {
      isDuplicate: verifiedOrProcessingCount > 0,
      duplicateCount: verifiedOrProcessingCount,
      hasPendingFromOthers: pendingFromOthers > 0,
      hasProcessingFromOthers: processingFromOthers > 0,
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
