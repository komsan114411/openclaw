import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
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
                const receiverAccount = result.data.receiverAccountNumber || result.data.receiverAccount;
                const matchedAccount = bankAccounts.find(
                    (acc: any) => acc.accountNumber.replace(/[-\s]/g, '') === receiverAccount?.replace(/[-\s]/g, ''),
                );

                if (!matchedAccount) {
                    await this.transactionModel.findByIdAndUpdate(transaction._id, {
                        status: TransactionStatus.REJECTED,
                        adminNotes: `บัญชีผู้รับไม่ถูกต้อง (ได้รับ: ${receiverAccount})`,
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
     * Purchase package with credits
     */
    async purchasePackage(
        userId: string,
        packageId: string,
        packageName: string,
        packagePrice: number,
    ): Promise<{ success: boolean; message: string; balance?: number; transactionId?: string }> {
        // Use distributed lock
        const lockKey = `wallet:purchase:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 30);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการซื้อแพ็คเกจอยู่ กรุณารอสักครู่' };
        }

        try {
            const wallet = await this.getOrCreateWallet(userId);

            // Check if user has enough balance
            if (wallet.balance < packagePrice) {
                return {
                    success: false,
                    message: `เครดิตไม่เพียงพอ (มี ฿${wallet.balance} ต้องการ ฿${packagePrice}) กรุณาเติมเครดิตเพิ่ม`,
                };
            }

            // Deduct credits and add subscription
            const newBalance = wallet.balance - packagePrice;

            // Create transaction
            const transaction = await this.transactionModel.create({
                userId: new Types.ObjectId(userId),
                walletId: wallet._id,
                type: TransactionType.PURCHASE,
                amount: -packagePrice, // Negative for spending
                balanceAfter: newBalance,
                packageId: new Types.ObjectId(packageId),
                description: `ซื้อแพ็คเกจ: ${packageName}`,
                status: TransactionStatus.COMPLETED,
                completedAt: new Date(),
            });

            // Update wallet
            await this.walletModel.findByIdAndUpdate(wallet._id, {
                $inc: {
                    balance: -packagePrice,
                    totalSpent: packagePrice,
                },
            });

            // Add subscription/quota
            try {
                await this.subscriptionsService.addQuotaToExisting(
                    userId,
                    packageId,
                    transaction._id.toString(),
                );
            } catch (error) {
                // Rollback if subscription fails
                this.logger.error(`Failed to add subscription, rolling back: ${error}`);

                await this.walletModel.findByIdAndUpdate(wallet._id, {
                    $inc: {
                        balance: packagePrice,
                        totalSpent: -packagePrice,
                    },
                });

                await this.transactionModel.findByIdAndUpdate(transaction._id, {
                    status: TransactionStatus.CANCELLED,
                    adminNotes: 'ยกเลิกเนื่องจากเพิ่มโควต้าไม่สำเร็จ',
                });

                return { success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มแพ็คเกจ กรุณาลองใหม่' };
            }

            this.logger.log(`User ${userId} purchased package ${packageId} for ฿${packagePrice}, new balance: ฿${newBalance}`);

            return {
                success: true,
                message: `ซื้อแพ็คเกจ ${packageName} สำเร็จ`,
                balance: newBalance,
                transactionId: transaction._id.toString(),
            };
        } finally {
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

