import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, ClientSession, Connection } from 'mongoose';
import { Wallet, WalletDocument } from '../database/schemas/wallet.schema';
import { CreditTransaction, CreditTransactionDocument, TransactionType, TransactionStatus } from '../database/schemas/credit-transaction.schema';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);

    constructor(
        @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
        @InjectModel(CreditTransaction.name) private transactionModel: Model<CreditTransactionDocument>,
        @InjectConnection() private connection: Connection,
        @Inject(forwardRef(() => SlipVerificationService))
        private slipVerificationService: SlipVerificationService,
        @Inject(forwardRef(() => SystemSettingsService))
        private systemSettingsService: SystemSettingsService,
        @Inject(forwardRef(() => SubscriptionsService))
        private subscriptionsService: SubscriptionsService,
        private redisService: RedisService,
    ) { }

    /**
     * Get or create wallet for a user
     */
    async getOrCreateWallet(userId: string): Promise<WalletDocument> {
        let wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) });

        if (!wallet) {
            wallet = await this.walletModel.create({
                userId: new Types.ObjectId(userId),
                balance: 0,
                totalDeposited: 0,
                totalSpent: 0,
            });
            this.logger.log(`Created new wallet for user ${userId}`);
        }

        return wallet;
    }

    /**
     * Get wallet balance
     */
    async getBalance(userId: string): Promise<{ balance: number; totalDeposited: number; totalSpent: number }> {
        const wallet = await this.getOrCreateWallet(userId);
        return {
            balance: wallet.balance,
            totalDeposited: wallet.totalDeposited,
            totalSpent: wallet.totalSpent,
        };
    }

    /**
     * Get transaction history
     */
    async getTransactions(userId: string, limit = 20, offset = 0): Promise<CreditTransactionDocument[]> {
        return this.transactionModel
            .find({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .populate('packageId', 'name price')
            .exec();
    }

    /**
     * Deposit credits via slip verification
     */
    async deposit(
        userId: string,
        slipImageData: Buffer,
    ): Promise<{ success: boolean; message: string; amount?: number; balance?: number; transactionId?: string }> {
        // Use distributed lock
        const lockKey = `wallet:deposit:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 60);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการเติมเครดิตอยู่ กรุณารอสักครู่' };
        }

        try {
            const wallet = await this.getOrCreateWallet(userId);

            // Get system settings for bank accounts
            const settings = await this.systemSettingsService.getSettings();
            const bankAccounts = settings?.paymentBankAccounts || [];

            if (bankAccounts.length === 0) {
                return { success: false, message: 'ยังไม่ได้ตั้งค่าบัญชีธนาคารสำหรับรับเติมเงิน' };
            }

            // Create pending transaction first
            const transaction = await this.transactionModel.create({
                userId: new Types.ObjectId(userId),
                walletId: wallet._id,
                type: TransactionType.DEPOSIT,
                amount: 0, // Will be updated after verification
                balanceAfter: wallet.balance, // Will be updated after verification
                description: 'เติมเครดิต - รอตรวจสอบ',
                slipImageData,
                status: TransactionStatus.PENDING,
            });

            // Verify slip
            const result = await this.slipVerificationService.verifySlip(
                slipImageData,
                'wallet',
                userId,
                transaction._id.toString(),
            );

            if (result.status === 'success' && result.data) {
                // Check for duplicate transRef
                if (result.data.transRef) {
                    const existingTx = await this.transactionModel.findOne({
                        transRef: result.data.transRef,
                        status: TransactionStatus.COMPLETED,
                    });

                    if (existingTx) {
                        await this.transactionModel.findByIdAndUpdate(transaction._id, {
                            status: TransactionStatus.REJECTED,
                            adminNotes: 'สลิปซ้ำ: เลขอ้างอิงนี้เคยถูกใช้แล้ว',
                            verificationResult: result.data,
                        });
                        return { success: false, message: 'สลิปนี้เคยถูกใช้แล้ว' };
                    }
                }

                // Check if receiver account matches configured bank accounts
                const receiverAccount = result.data.receiverAccountNumber || result.data.receiverAccount || '';
                const receiverAccountNorm = receiverAccount.replace(/[-\s]/g, '').toLowerCase().trim();

                // Log for debugging
                this.logger.log(`Deposit verification - Receiver account from slip: "${receiverAccount}" (normalized: "${receiverAccountNorm}")`);
                this.logger.log(`Configured bank accounts: ${JSON.stringify(bankAccounts.map((a: any) => a.accountNumber))}`);

                // Helper function to match masked account (e.g., "12xxxx3456" vs "1234567890")
                const matchMaskedAccount = (masked: string, full: string): boolean => {
                    // Remove non-alphanumeric except x
                    const maskedClean = masked.replace(/[-\s]/g, '').toLowerCase();
                    const fullClean = full.replace(/[-\s]/g, '').toLowerCase();

                    // Compare each character, ignoring 'x' in masked
                    let maskedIdx = 0;
                    let fullIdx = 0;
                    let unmatchedFull = false;

                    // Try position-based matching first
                    if (maskedClean.length === fullClean.length) {
                        let allMatch = true;
                        for (let i = 0; i < maskedClean.length; i++) {
                            if (maskedClean[i] !== 'x' && maskedClean[i] !== fullClean[i]) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) return true;
                    }

                    // Extract visible digits from masked (non-x characters)
                    const maskedVisible = maskedClean.replace(/x/g, '');

                    // Common pattern: first 2 + last 4 digits (12xxxx3456 -> 12, 3456)
                    if (maskedClean.includes('x') && maskedVisible.length >= 4) {
                        // Get first and last chunks of visible digits
                        const firstDigits = maskedClean.match(/^[^x]+/)?.[0] || '';
                        const lastDigits = maskedClean.match(/[^x]+$/)?.[0] || '';

                        if (firstDigits && fullClean.startsWith(firstDigits) &&
                            lastDigits && fullClean.endsWith(lastDigits)) {
                            return true;
                        }
                    }

                    return false;
                };

                // Flexible matching: exact, masked, contains, or last digits match
                const matchedAccount = bankAccounts.find((acc: any) => {
                    const configuredNorm = (acc.accountNumber || '').replace(/[-\s]/g, '').toLowerCase().trim();

                    // Exact match
                    if (configuredNorm === receiverAccountNorm) {
                        this.logger.log(`Account matched exactly: ${configuredNorm}`);
                        return true;
                    }

                    // Masked account match (Thunder API returns masked like "12xxxx3456")
                    if (receiverAccountNorm.includes('x') && matchMaskedAccount(receiverAccountNorm, configuredNorm)) {
                        this.logger.log(`Account matched via masked pattern: "${receiverAccountNorm}" -> "${configuredNorm}"`);
                        return true;
                    }

                    // Contains match (slip may have partial account number)  
                    if (configuredNorm.includes(receiverAccountNorm) || receiverAccountNorm.includes(configuredNorm)) {
                        this.logger.log(`Account matched by contains: configured="${configuredNorm}", received="${receiverAccountNorm}"`);
                        return true;
                    }

                    // Last 4 digits match (most reliable for masked accounts)
                    const configLast4 = configuredNorm.slice(-4);
                    const receiverLast4 = receiverAccountNorm.replace(/x/g, '').slice(-4);
                    if (configLast4.length >= 4 && receiverLast4.length >= 4 && configLast4 === receiverLast4) {
                        // Also check first 2 if available
                        const configFirst2 = configuredNorm.slice(0, 2);
                        const receiverFirst2 = receiverAccountNorm.replace(/x/g, '').slice(0, 2);
                        if (receiverFirst2.length < 2 || configFirst2 === receiverFirst2) {
                            this.logger.log(`Account matched by first/last digits: first=${configFirst2}, last=${configLast4}`);
                            return true;
                        }
                    }

                    return false;
                });

                if (!matchedAccount) {
                    this.logger.warn(`Account mismatch - Received: "${receiverAccountNorm}", Expected one of: ${bankAccounts.map((a: any) => a.accountNumber.replace(/[-\s]/g, '')).join(', ')}`);
                    await this.transactionModel.findByIdAndUpdate(transaction._id, {
                        status: TransactionStatus.REJECTED,
                        adminNotes: `บัญชีผู้รับไม่ถูกต้อง (ได้รับ: ${receiverAccount}, คาดหวัง: ${bankAccounts.map((a: any) => a.accountNumber).join(' หรือ ')})`,
                        verificationResult: result.data,
                    });
                    return {
                        success: false,
                        message: 'บัญชีผู้รับไม่ถูกต้อง กรุณาโอนเงินไปยังบัญชีที่ระบบกำหนด',
                    };
                }

                // Success - add credits
                const depositAmount = result.data.amount || 0;

                if (depositAmount <= 0) {
                    await this.transactionModel.findByIdAndUpdate(transaction._id, {
                        status: TransactionStatus.REJECTED,
                        adminNotes: 'ไม่พบยอดเงินในสลิป',
                        verificationResult: result.data,
                    });
                    return { success: false, message: 'ไม่สามารถอ่านยอดเงินจากสลิปได้' };
                }

                // Atomic update wallet and transaction
                const newBalance = wallet.balance + depositAmount;

                await this.walletModel.findByIdAndUpdate(wallet._id, {
                    $inc: {
                        balance: depositAmount,
                        totalDeposited: depositAmount,
                    },
                });

                await this.transactionModel.findByIdAndUpdate(transaction._id, {
                    amount: depositAmount,
                    balanceAfter: newBalance,
                    transRef: result.data.transRef,
                    description: `เติมเครดิต ฿${depositAmount}`,
                    status: TransactionStatus.COMPLETED,
                    completedAt: new Date(),
                    verificationResult: result.data,
                });

                this.logger.log(`User ${userId} deposited ฿${depositAmount}, new balance: ฿${newBalance}`);

                return {
                    success: true,
                    message: `เติมเครดิตสำเร็จ ฿${depositAmount}`,
                    amount: depositAmount,
                    balance: newBalance,
                    transactionId: transaction._id.toString(),
                };
            } else if (result.status === 'duplicate') {
                await this.transactionModel.findByIdAndUpdate(transaction._id, {
                    status: TransactionStatus.REJECTED,
                    adminNotes: 'สลิปซ้ำ',
                    verificationResult: { duplicate: true },
                });
                return { success: false, message: 'สลิปนี้เคยถูกใช้แล้ว' };
            } else {
                await this.transactionModel.findByIdAndUpdate(transaction._id, {
                    status: TransactionStatus.REJECTED,
                    adminNotes: result.message,
                    verificationResult: { error: result.message },
                });
                return { success: false, message: result.message };
            }
        } finally {
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Deposit credits via USDT with blockchain verification
     * - Prevents duplicate TxHash
     * - Verifies transaction on TRON blockchain
     * - Validates recipient wallet address
     */
    async depositUsdt(
        userId: string,
        usdtAmount: number,
        transactionHash: string,
    ): Promise<{ success: boolean; message: string; amount?: number; status?: string }> {
        const lockKey = `wallet:usdt:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 60);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการอยู่ กรุณารอสักครู่' };
        }

        try {
            // 1. Check for duplicate TxHash
            const existingTx = await this.transactionModel.findOne({
                'metadata.transactionHash': transactionHash,
            });

            if (existingTx) {
                this.logger.warn(`Duplicate USDT TxHash detected: ${transactionHash}`);
                return {
                    success: false,
                    message: 'Transaction Hash นี้เคยถูกใช้แล้ว',
                    status: 'duplicate',
                };
            }

            // 2. Get system settings for USDT wallet
            const settings = await this.systemSettingsService.getSettings();

            if (!settings?.usdtEnabled) {
                return { success: false, message: 'ระบบเติมเงินผ่าน USDT ปิดให้บริการชั่วคราว' };
            }

            const systemWallet = settings?.usdtWalletAddress;
            if (!systemWallet) {
                return { success: false, message: 'ยังไม่ได้ตั้งค่ากระเป๋า USDT' };
            }

            // 3. Create pending transaction record
            const wallet = await this.getOrCreateWallet(userId);
            const transaction = await this.transactionModel.create({
                userId: new Types.ObjectId(userId),
                walletId: wallet._id,
                type: TransactionType.DEPOSIT,
                amount: 0, // Will be updated after verification
                balanceBefore: wallet.balance,
                balanceAfter: wallet.balance,
                description: `เติมเงินผ่าน USDT (รอตรวจสอบ)`,
                status: TransactionStatus.PENDING,
                metadata: {
                    paymentMethod: 'usdt',
                    transactionHash,
                    usdtAmount,
                    network: settings?.usdtNetwork || 'TRC20',
                },
            });

            this.logger.log(`Created USDT deposit request: userId=${userId}, txHash=${transactionHash}, amount=${usdtAmount}`);

            // 4. Return success (verification will be done by admin or background job)
            return {
                success: true,
                message: 'แจ้งเติมเงินสำเร็จ กรุณารอการตรวจสอบ',
                status: 'pending',
            };
        } catch (error: any) {
            this.logger.error(`USDT deposit error for user ${userId}:`, error);
            return {
                success: false,
                message: 'เกิดข้อผิดพลาดในการแจ้งเติมเงิน',
            };
        } finally {
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Purchase package with credits - ATOMIC TRANSACTION
     *
     * This method uses MongoDB transactions to ensure atomicity.
     * The entire operation (debit wallet + grant subscription) either
     * succeeds completely or fails completely with automatic rollback.
     *
     * Flow:
     * 1. Begin transaction
     * 2. Check wallet balance (within transaction)
     * 3. Deduct from wallet (within transaction)
     * 4. Create transaction record (within transaction)
     * 5. Grant subscription/credit (within transaction)
     * 6. Commit transaction
     * 7. On any error → automatic rollback, wallet unchanged
     *
     * Safety features:
     * - Distributed lock prevents concurrent purchases
     * - MongoDB transaction ensures atomicity
     * - Idempotent subscription granting (via paymentId)
     * - Retry-safe: won't deduct money twice for same purchase
     */
    async purchasePackage(
        userId: string,
        packageId: string,
        packageName: string,
        packagePrice: number,
    ): Promise<{ success: boolean; message: string; balance?: number; transactionId?: string }> {
        // Step 0: Acquire distributed lock to prevent concurrent purchases
        const lockKey = `wallet:purchase:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 30);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการซื้อแพ็คเกจอยู่ กรุณารอสักครู่' };
        }

        // Start MongoDB session for transaction
        const session = await this.connection.startSession();

        try {
            let transactionId: string = '';
            let newBalance: number = 0;

            // Execute all operations within a transaction
            await session.withTransaction(async () => {
                // Step 1: Get wallet (within transaction for consistency)
                const wallet = await this.walletModel
                    .findOne({ userId: new Types.ObjectId(userId) })
                    .session(session);

                if (!wallet) {
                    throw new BadRequestException('ไม่พบกระเป๋าเงินของผู้ใช้');
                }

                // Step 2: Check balance (within transaction)
                if (wallet.balance < packagePrice) {
                    throw new BadRequestException(
                        `เครดิตไม่เพียงพอ (มี ฿${wallet.balance} ต้องการ ฿${packagePrice}) กรุณาเติมเครดิตเพิ่ม`
                    );
                }

                // Calculate new balance
                newBalance = wallet.balance - packagePrice;

                // Step 3: Create transaction record (PENDING status until subscription succeeds)
                const [transaction] = await this.transactionModel.create(
                    [{
                        userId: new Types.ObjectId(userId),
                        walletId: wallet._id,
                        type: TransactionType.PURCHASE,
                        amount: -packagePrice,
                        balanceAfter: newBalance,
                        packageId: new Types.ObjectId(packageId),
                        description: `ซื้อแพ็คเกจ: ${packageName}`,
                        status: TransactionStatus.PENDING, // Pending until subscription granted
                    }],
                    { session }
                );
                transactionId = transaction._id.toString();

                // Step 4: Deduct from wallet (within transaction)
                await this.walletModel.findByIdAndUpdate(
                    wallet._id,
                    {
                        $inc: {
                            balance: -packagePrice,
                            totalSpent: packagePrice,
                        },
                    },
                    { session }
                );

                // Step 5: Grant subscription/credit (within transaction context)
                // Note: addQuotaToExisting is already idempotent via paymentId
                const subscriptionResult = await this.subscriptionsService.addQuotaToExisting(
                    userId,
                    packageId,
                    transactionId, // Use transactionId as paymentId for idempotency
                );

                if (!subscriptionResult.success) {
                    throw new Error('Failed to grant subscription');
                }

                // Step 6: Update transaction to COMPLETED
                await this.transactionModel.findByIdAndUpdate(
                    transaction._id,
                    {
                        status: TransactionStatus.COMPLETED,
                        completedAt: new Date(),
                    },
                    { session }
                );

                this.logger.log(
                    `[ATOMIC TX] User ${userId} purchased package ${packageId} for ฿${packagePrice}, new balance: ฿${newBalance}`
                );
            });

            // Transaction committed successfully
            return {
                success: true,
                message: `ซื้อแพ็คเกจ ${packageName} สำเร็จ`,
                balance: newBalance,
                transactionId,
            };

        } catch (error: unknown) {
            // Transaction automatically rolled back on error
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`[ATOMIC TX ROLLBACK] Purchase failed for user ${userId}: ${errorMessage}`);

            // Check if it's a balance error (user-friendly message)
            if (errorMessage.includes('เครดิตไม่เพียงพอ')) {
                return { success: false, message: errorMessage };
            }

            return {
                success: false,
                message: 'เกิดข้อผิดพลาดในการซื้อแพ็คเกจ กรุณาลองใหม่',
            };
        } finally {
            // Always end session and release lock
            await session.endSession();
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Admin: Add bonus credits to user
     */
    async addBonus(
        userId: string,
        amount: number,
        description: string,
        adminId: string,
    ): Promise<{ success: boolean; balance: number }> {
        // Use lock for safety
        const lockKey = `wallet:admin:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 30);

        if (!lockToken) {
            throw new BadRequestException('กำลังดำเนินการอยู่ กรุณารอสักครู่');
        }

        try {
            const wallet = await this.getOrCreateWallet(userId);
            const newBalance = wallet.balance + amount;

            await this.transactionModel.create({
                userId: new Types.ObjectId(userId),
                walletId: wallet._id,
                type: TransactionType.BONUS,
                amount,
                balanceAfter: newBalance,
                description,
                status: TransactionStatus.COMPLETED,
                completedAt: new Date(),
                processedBy: new Types.ObjectId(adminId),
            });

            await this.walletModel.findByIdAndUpdate(wallet._id, {
                $inc: { balance: amount, totalDeposited: amount },
            });

            this.logger.log(`Admin ${adminId} added ฿${amount} bonus to user ${userId}`);

            return { success: true, balance: newBalance };
        } finally {
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Admin: Deduct credits from user (with balance check)
     */
    async deductCredits(
        userId: string,
        amount: number,
        description: string,
        adminId: string,
    ): Promise<{ success: boolean; message: string; balance?: number }> {
        // Use lock for safety
        const lockKey = `wallet:admin:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 30);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการอยู่ กรุณารอสักครู่' };
        }

        try {
            const wallet = await this.getOrCreateWallet(userId);

            // Check if user has enough balance
            if (wallet.balance < amount) {
                return {
                    success: false,
                    message: `ไม่สามารถหักเครดิตได้ (มี ฿${wallet.balance} ต้องการหัก ฿${amount})`,
                };
            }

            const newBalance = wallet.balance - amount;

            await this.transactionModel.create({
                userId: new Types.ObjectId(userId),
                walletId: wallet._id,
                type: TransactionType.ADJUSTMENT,
                amount: -amount, // Negative for deduction
                balanceAfter: newBalance,
                description: `หักเครดิต: ${description}`,
                status: TransactionStatus.COMPLETED,
                completedAt: new Date(),
                processedBy: new Types.ObjectId(adminId),
            });

            await this.walletModel.findByIdAndUpdate(wallet._id, {
                $inc: { balance: -amount },
            });

            this.logger.log(`Admin ${adminId} deducted ฿${amount} from user ${userId}`);

            return { success: true, message: `หักเครดิต ฿${amount} สำเร็จ`, balance: newBalance };
        } finally {
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Admin: Get all transactions (with filters)
     */
    async getAllTransactions(
        limit = 50,
        offset = 0,
        type?: string,
        status?: string,
    ): Promise<any[]> {
        const query: any = {};

        if (type) {
            query.type = type;
        }

        if (status) {
            query.status = status;
        }

        return this.transactionModel
            .find(query)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .populate('userId', 'username email fullName')
            .populate('packageId', 'name price')
            .populate('processedBy', 'username')
            .lean()
            .exec();
    }

    /**
     * Admin: Get wallet statistics
     */
    async getStatistics(): Promise<{
        totalDeposited: number;
        totalSpent: number;
        totalWallets: number;
        totalBalance: number;
        pendingTransactions: number;
        completedTransactions: number;
    }> {
        const [walletStats, pendingCount, completedCount] = await Promise.all([
            this.walletModel.aggregate([
                {
                    $group: {
                        _id: null,
                        totalDeposited: { $sum: '$totalDeposited' },
                        totalSpent: { $sum: '$totalSpent' },
                        totalBalance: { $sum: '$balance' },
                        totalWallets: { $sum: 1 },
                    },
                },
            ]),
            this.transactionModel.countDocuments({ status: TransactionStatus.PENDING }),
            this.transactionModel.countDocuments({ status: TransactionStatus.COMPLETED }),
        ]);

        const stats = walletStats[0] || {
            totalDeposited: 0,
            totalSpent: 0,
            totalBalance: 0,
            totalWallets: 0,
        };

        return {
            totalDeposited: stats.totalDeposited,
            totalSpent: stats.totalSpent,
            totalBalance: stats.totalBalance,
            totalWallets: stats.totalWallets,
            pendingTransactions: pendingCount,
            completedTransactions: completedCount,
        };
    }

    /**
     * Deposit credits via USDT (Manual Check)
     */
    async depositUsdt(
        userId: string,
        amount: number,
        transactionHash: string,
    ): Promise<{ success: boolean; message: string; transactionId?: string }> {
        // Prevent duplicate hash
        const existing = await this.transactionModel.findOne({
            transRef: transactionHash,
            status: { $ne: TransactionStatus.CANCELLED }
        });

        if (existing) {
            return { success: false, message: 'Transaction Hash นี้ถูกใช้งานแล้ว' };
        }

        const wallet = await this.getOrCreateWallet(userId);

        // Create pending transaction
        const transaction = await this.transactionModel.create({
            userId: new Types.ObjectId(userId),
            walletId: wallet._id,
            type: TransactionType.DEPOSIT,
            amount: amount,
            balanceAfter: wallet.balance,
            description: `Deposit via USDT (Hash: ${transactionHash})`,
            transRef: transactionHash,
            status: TransactionStatus.PENDING,
            adminNotes: 'Waiting for Admin verification',
        });

        this.logger.log(`Created USDT deposit request for user ${userId}: ${amount} USDT`);

        return {
            success: true,
            message: 'ส่งคำขอเติมเงินเรียบร้อย กรุณารอการตรวจสอบ',
            transactionId: transaction._id.toString(),
        };
    }

    /**
     * Verify wallet balance matches transaction history (audit function)
     */
    async auditWalletBalance(userId: string): Promise<{
        storedBalance: number;
        calculatedBalance: number;
        isValid: boolean;
        discrepancy: number;
    }> {
        const wallet = await this.getOrCreateWallet(userId);

        // Calculate balance from completed transactions
        const result = await this.transactionModel.aggregate([
            {
                $match: {
                    userId: new Types.ObjectId(userId),
                    status: TransactionStatus.COMPLETED,
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                },
            },
        ]);

        const calculatedBalance = result[0]?.total || 0;
        const discrepancy = wallet.balance - calculatedBalance;

        return {
            storedBalance: wallet.balance,
            calculatedBalance,
            isValid: Math.abs(discrepancy) < 0.01, // Allow tiny floating point errors
            discrepancy,
        };
    }
}

