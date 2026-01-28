import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, ClientSession, Connection } from 'mongoose';
import { Wallet, WalletDocument } from '../database/schemas/wallet.schema';
import { CreditTransaction, CreditTransactionDocument, TransactionType, TransactionStatus } from '../database/schemas/credit-transaction.schema';
import { WalletOperationLog, WalletOperationLogDocument, WalletOperationType, WalletOperationStatus } from '../database/schemas/wallet-operation-log.schema';
import { SlipVerificationService } from '../slip-verification/slip-verification.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RedisService } from '../redis/redis.service';

import { BlockchainVerificationService } from './blockchain-verification.service';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);

    constructor(
        @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
        @InjectModel(CreditTransaction.name) private transactionModel: Model<CreditTransactionDocument>,
        @InjectModel(WalletOperationLog.name) private operationLogModel: Model<WalletOperationLogDocument>,
        @InjectConnection() private connection: Connection,
        @Inject(forwardRef(() => SlipVerificationService))
        private slipVerificationService: SlipVerificationService,
        @Inject(forwardRef(() => SystemSettingsService))
        private systemSettingsService: SystemSettingsService,
        @Inject(forwardRef(() => SubscriptionsService))
        private subscriptionsService: SubscriptionsService,
        private redisService: RedisService,
        private blockchainVerificationService: BlockchainVerificationService,
    ) { }

    /**
     * Generate idempotency key for an operation
     */
    private generateIdempotencyKey(
        operationType: WalletOperationType,
        userId: string,
        uniqueId: string,
    ): string {
        return `${operationType}:${userId}:${uniqueId}`;
    }

    /**
     * Check if an operation was already processed (idempotency check)
     */
    private async checkIdempotency(idempotencyKey: string): Promise<WalletOperationLogDocument | null> {
        return this.operationLogModel.findOne({
            idempotencyKey,
            status: { $in: [WalletOperationStatus.COMMITTED, WalletOperationStatus.REFUNDED] },
        });
    }

    /**
     * Log operation start
     */
    private async logOperationStart(
        idempotencyKey: string,
        userId: string,
        walletId: Types.ObjectId,
        operationType: WalletOperationType,
        amount: number,
        balanceBefore: number,
        description: string,
        metadata?: Record<string, unknown>,
    ): Promise<WalletOperationLogDocument> {
        return this.operationLogModel.create({
            idempotencyKey,
            userId: new Types.ObjectId(userId),
            walletId,
            operationType,
            status: WalletOperationStatus.STARTED,
            amount,
            balanceBefore,
            description,
            metadata,
            startedAt: new Date(),
            steps: [{
                step: 'Operation started',
                status: 'success',
                timestamp: new Date(),
            }],
        });
    }

    /**
     * Update operation log with step progress
     */
    private async logOperationStep(
        logId: Types.ObjectId,
        step: string,
        status: 'pending' | 'success' | 'failed',
        data?: Record<string, unknown>,
        error?: string,
    ): Promise<void> {
        await this.operationLogModel.findByIdAndUpdate(logId, {
            $push: {
                steps: {
                    step,
                    status,
                    timestamp: new Date(),
                    data,
                    error,
                },
            },
        });
    }

    /**
     * Mark operation as committed
     */
    private async logOperationCommit(
        logId: Types.ObjectId,
        balanceAfter: number,
        transactionId?: Types.ObjectId,
        subscriptionId?: Types.ObjectId,
    ): Promise<void> {
        await this.operationLogModel.findByIdAndUpdate(logId, {
            status: WalletOperationStatus.COMMITTED,
            balanceAfter,
            transactionId,
            subscriptionId,
            committedAt: new Date(),
            $push: {
                steps: {
                    step: 'Operation committed',
                    status: 'success',
                    timestamp: new Date(),
                },
            },
        });
    }

    /**
     * Mark operation as rolled back
     */
    private async logOperationRollback(
        logId: Types.ObjectId,
        errorMessage: string,
        errorStack?: string,
    ): Promise<void> {
        await this.operationLogModel.findByIdAndUpdate(logId, {
            status: WalletOperationStatus.ROLLED_BACK,
            errorMessage,
            errorStack: process.env.NODE_ENV !== 'production' ? errorStack : undefined,
            rolledBackAt: new Date(),
            $push: {
                steps: {
                    step: 'Operation rolled back',
                    status: 'failed',
                    timestamp: new Date(),
                    error: errorMessage,
                },
            },
        });
    }

    /**
     * Mark operation as failed (needs manual intervention)
     */
    private async logOperationFailed(
        logId: Types.ObjectId,
        errorMessage: string,
        errorStack?: string,
    ): Promise<void> {
        await this.operationLogModel.findByIdAndUpdate(logId, {
            status: WalletOperationStatus.FAILED,
            errorMessage,
            errorStack: process.env.NODE_ENV !== 'production' ? errorStack : undefined,
            failedAt: new Date(),
            $push: {
                steps: {
                    step: 'Operation failed - needs manual review',
                    status: 'failed',
                    timestamp: new Date(),
                    error: errorMessage,
                },
            },
        });
    }



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

                // CRITICAL FIX: Use MongoDB transaction for atomic wallet + transaction update
                const depositSession = await this.connection.startSession();
                let newBalance = 0;

                try {
                    await depositSession.withTransaction(async () => {
                        // Get fresh wallet balance within transaction
                        const freshWallet = await this.walletModel
                            .findById(wallet._id)
                            .session(depositSession);

                        if (!freshWallet) {
                            throw new Error('Wallet not found');
                        }

                        newBalance = freshWallet.balance + depositAmount;

                        // Update wallet atomically
                        await this.walletModel.findByIdAndUpdate(
                            wallet._id,
                            {
                                $inc: {
                                    balance: depositAmount,
                                    totalDeposited: depositAmount,
                                },
                            },
                            { session: depositSession }
                        );

                        // Update transaction atomically
                        await this.transactionModel.findByIdAndUpdate(
                            transaction._id,
                            {
                                amount: depositAmount,
                                balanceBefore: freshWallet.balance,
                                balanceAfter: newBalance,
                                transRef: result.data!.transRef,
                                description: `เติมเครดิต ฿${depositAmount}`,
                                status: TransactionStatus.COMPLETED,
                                completedAt: new Date(),
                                verificationResult: result.data!,
                            },
                            { session: depositSession }
                        );
                    });

                    this.logger.log(`[ATOMIC] User ${userId} deposited ฿${depositAmount}, new balance: ฿${newBalance}`);

                    return {
                        success: true,
                        message: `เติมเครดิตสำเร็จ ฿${depositAmount}`,
                        amount: depositAmount,
                        balance: newBalance,
                        transactionId: transaction._id.toString(),
                    };
                } catch (txError) {
                    this.logger.error(`Deposit transaction failed for user ${userId}:`, txError);
                    // Mark transaction as failed
                    await this.transactionModel.findByIdAndUpdate(transaction._id, {
                        status: TransactionStatus.REJECTED,
                        adminNotes: 'Transaction failed during commit',
                    });
                    return { success: false, message: 'เกิดข้อผิดพลาดในการเติมเครดิต กรุณาลองใหม่' };
                } finally {
                    await depositSession.endSession();
                }
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
     * Deposit credits via USDT with AUTO blockchain verification
     * 
     * IMPORTANT: Only VERIFIED transactions are saved to database!
     * - Rejected transactions (wrong recipient, wrong token, insufficient amount) 
     *   will NOT be saved - user gets immediate error message
     * - Pending/not found transactions will NOT be saved - user gets error message
     * - Only successfully verified transactions are saved and credited
     * 
     * Security Features:
     * - Distributed lock prevents race conditions
     * - Duplicate TxHash prevention
     * - Input validation (amount, txHash format)
     * - Blockchain verification (contract, recipient, amount)
     * - Rate limiting via Redis lock
     */
    async depositUsdt(
        userId: string,
        usdtAmount: number,
        transactionHash: string,
    ): Promise<{ success: boolean; message: string; amount?: number; status?: string; thbCredits?: number }> {
        // === SECURITY: Input validation ===

        // Validate userId
        if (!userId || !Types.ObjectId.isValid(userId)) {
            this.logger.warn(`Invalid userId: ${userId}`);
            return { success: false, message: 'ข้อมูลผู้ใช้ไม่ถูกต้อง' };
        }

        // Validate amount
        if (typeof usdtAmount !== 'number' || !Number.isFinite(usdtAmount) || usdtAmount <= 0) {
            this.logger.warn(`Invalid amount: ${usdtAmount}`);
            return { success: false, message: 'จำนวนเงินไม่ถูกต้อง' };
        }

        // Minimum amount check (prevent micro-transactions)
        const minAmount = 1; // Minimum 1 USDT
        if (usdtAmount < minAmount) {
            this.logger.warn(`Amount below minimum: ${usdtAmount}`);
            return { success: false, message: `จำนวนเงินต่ำกว่าขั้นต่ำ (${minAmount} USDT)` };
        }

        // Maximum amount check
        const maxAmount = 100000; // 100k USDT max
        if (usdtAmount > maxAmount) {
            this.logger.warn(`Amount exceeds limit: ${usdtAmount}`);
            return { success: false, message: `จำนวนเงินเกินขีดจำกัด (สูงสุด ${maxAmount.toLocaleString()} USDT)` };
        }

        // Validate decimal precision (USDT has 6 decimals max)
        const decimalStr = usdtAmount.toString();
        const decimalPart = decimalStr.split('.')[1];
        if (decimalPart && decimalPart.length > 6) {
            this.logger.warn(`Too many decimal places: ${usdtAmount}`);
            return { success: false, message: 'จำนวนทศนิยมเกินขีดจำกัด (สูงสุด 6 ตำแหน่ง)' };
        }

        // Validate and sanitize transaction hash
        if (!transactionHash || typeof transactionHash !== 'string') {
            return { success: false, message: 'กรุณาระบุ Transaction Hash' };
        }

        const sanitizedTxHash = transactionHash.trim();

        // Validate length based on network (will be checked later, but do basic check here)
        // ERC20/BEP20: 66 chars (0x + 64 hex), TRC20: 64 chars
        if (sanitizedTxHash.length < 64 || sanitizedTxHash.length > 66) {
            this.logger.warn(`Invalid txHash length: ${sanitizedTxHash.length}`);
            return {
                success: false,
                message: `Transaction Hash ความยาวไม่ถูกต้อง (ต้องมี 64-66 ตัวอักษร, ปัจจุบัน: ${sanitizedTxHash.length})`
            };
        }

        // Validate hex pattern
        const hexPattern = /^(0x)?[a-fA-F0-9]{64}$/;
        if (!hexPattern.test(sanitizedTxHash)) {
            this.logger.warn(`Invalid txHash format: ${sanitizedTxHash}`);
            return { success: false, message: 'รูปแบบ Transaction Hash ไม่ถูกต้อง (ต้องเป็นตัวเลขฐาน 16 เท่านั้น)' };
        }

        // === SECURITY: Distributed lock to prevent race conditions ===
        const lockKey = `wallet:usdt:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 120);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการอยู่ กรุณารอสักครู่' };
        }

        try {
            // === SECURITY: Check for duplicate TxHash (case-insensitive) ===
            const normalizedTxHash = sanitizedTxHash.toLowerCase();
            const existingTx = await this.transactionModel.findOne({
                $or: [
                    { 'metadata.transactionHash': { $regex: new RegExp(`^${normalizedTxHash}$`, 'i') } },
                    { transRef: { $regex: new RegExp(`^${normalizedTxHash}$`, 'i') } },
                ],
            });

            if (existingTx) {
                this.logger.warn(`Duplicate USDT TxHash detected: ${transactionHash}`);
                return {
                    success: false,
                    message: 'Transaction Hash นี้เคยถูกใช้แล้ว',
                    status: 'duplicate',
                };
            }

            // Get system settings for USDT wallet
            const settings = await this.systemSettingsService.getSettings();

            if (!settings?.usdtEnabled) {
                return { success: false, message: 'ระบบเติมเงินผ่าน USDT ปิดให้บริการชั่วคราว' };
            }

            const systemWallet = settings?.usdtWalletAddress;
            if (!systemWallet) {
                return { success: false, message: 'ยังไม่ได้ตั้งค่ากระเป๋า USDT' };
            }

            const network = (settings?.usdtNetwork || 'TRC20') as 'TRC20' | 'ERC20' | 'BEP20';

            // === BLOCKCHAIN VERIFICATION ===
            // Get decrypted API keys
            const decryptedSettings = await this.systemSettingsService.getDecryptedSettings();
            const apiKeys = {
                etherscan: decryptedSettings?.etherscanApiKey,
                bscscan: decryptedSettings?.bscscanApiKey,
                tronscan: decryptedSettings?.tronscanApiKey,
            };

            let verificationResult: any;
            try {
                verificationResult = await this.blockchainVerificationService.verifyTransaction(
                    sanitizedTxHash,
                    systemWallet,
                    usdtAmount,
                    network,
                    apiKeys
                );
            } catch (verifyError: any) {
                this.logger.error(`Blockchain verification error: ${verifyError.message}`);
                return {
                    success: false,
                    message: 'ไม่สามารถตรวจสอบธุรกรรมได้ กรุณาลองใหม่อีกครั้ง',
                    status: 'error',
                };
            }

            // === HANDLE VERIFICATION RESULT ===
            // Only save transaction if verification is SUCCESSFUL

            if (!verificationResult.verified) {
                // Log the rejection but DO NOT save to database
                this.logger.warn(`USDT verification failed: ${sanitizedTxHash}, status=${verificationResult.status}, message=${verificationResult.message}`);

                // Use detailed message from verification service
                // Include additional data for frontend to display
                const responseData: any = {
                    success: false,
                    message: verificationResult.message || 'ไม่สามารถตรวจสอบธุรกรรมได้',
                    status: verificationResult.status,
                };

                // Include transaction details if available
                if (verificationResult.actualAmount !== undefined) {
                    responseData.actualAmount = verificationResult.actualAmount;
                }
                if (verificationResult.expectedAmount !== undefined) {
                    responseData.expectedAmount = verificationResult.expectedAmount;
                }
                if (verificationResult.suggestedAmount !== undefined) {
                    responseData.suggestedAmount = verificationResult.suggestedAmount;
                }
                if (verificationResult.fromAddress) {
                    responseData.fromAddress = verificationResult.fromAddress;
                }
                if (verificationResult.toAddress) {
                    responseData.toAddress = verificationResult.toAddress;
                }
                if (verificationResult.expectedWallet) {
                    responseData.expectedWallet = verificationResult.expectedWallet;
                }
                if (verificationResult.confirmations !== undefined) {
                    responseData.confirmations = verificationResult.confirmations;
                }
                if (verificationResult.contractAddress) {
                    responseData.contractAddress = verificationResult.contractAddress;
                }

                return responseData;
            }

            // === VERIFICATION SUCCESSFUL - SAVE TRANSACTION ===
            // Use creditAmount (what user entered) instead of actualAmount (what blockchain shows)
            // This ensures user gets exactly what they requested (within tolerance)
            // creditAmount is only set when verification passes strict amount validation
            const creditUsdtAmount = verificationResult.creditAmount || verificationResult.expectedAmount || usdtAmount;
            const actualAmount = verificationResult.actualAmount || usdtAmount;

            // Double-check: creditAmount should match what user entered
            if (Math.abs(creditUsdtAmount - usdtAmount) > usdtAmount * 0.01) {
                this.logger.error(`SECURITY: creditAmount mismatch! credit=${creditUsdtAmount}, userInput=${usdtAmount}`);
                return {
                    success: false,
                    message: '❌ เกิดข้อผิดพลาดในการตรวจสอบยอด กรุณาลองใหม่',
                    status: 'error',
                };
            }

            this.logger.log(`USDT verified successfully: ${sanitizedTxHash}, creditAmount=${creditUsdtAmount}, actualAmount=${actualAmount}`);

            // Calculate THB credits using the CREDIT amount (what user entered)
            let thbCredits = Math.floor(creditUsdtAmount * 31.5); // Fallback rate
            try {
                const { UsdtRateService } = await import('./usdt-rate.service');
                const rateService = new UsdtRateService();
                const rateInfo = await rateService.getUsdtThbRate();
                thbCredits = Math.floor(creditUsdtAmount * rateInfo.rate);
            } catch (rateError: any) {
                this.logger.warn(`Rate fetch failed, using fallback: ${rateError.message}`);
            }

            // CRITICAL FIX: Use MongoDB transaction for atomic wallet + transaction creation
            const usdtSession = await this.connection.startSession();
            let newBalance = 0;
            let transactionId = '';

            try {
                await usdtSession.withTransaction(async () => {
                    // Get wallet within transaction
                    let wallet = await this.walletModel
                        .findOne({ userId: new Types.ObjectId(userId) })
                        .session(usdtSession);

                    if (!wallet) {
                        // Create wallet within transaction if not exists
                        [wallet] = await this.walletModel.create([{
                            userId: new Types.ObjectId(userId),
                            balance: 0,
                            totalDeposited: 0,
                            totalSpent: 0,
                        }], { session: usdtSession });
                    }

                    newBalance = wallet.balance + thbCredits;

                    // Create COMPLETED transaction record within transaction
                    const [transaction] = await this.transactionModel.create([{
                        userId: new Types.ObjectId(userId),
                        walletId: wallet._id,
                        type: TransactionType.DEPOSIT,
                        amount: thbCredits,
                        balanceBefore: wallet.balance,
                        balanceAfter: newBalance,
                        description: `เติมเงินผ่าน USDT - ${creditUsdtAmount} USDT`,
                        status: TransactionStatus.COMPLETED,
                        completedAt: new Date(),
                        transRef: sanitizedTxHash,
                        metadata: {
                            paymentMethod: 'usdt',
                            transactionHash: sanitizedTxHash,
                            usdtAmount: creditUsdtAmount, // What user entered (and was credited)
                            actualUsdtAmount: actualAmount, // What blockchain shows (for audit)
                            network,
                            verificationResult,
                            thbCredits,
                            fromAddress: verificationResult.fromAddress,
                            toAddress: verificationResult.toAddress,
                            verifiedAt: new Date(),
                            // Security audit fields
                            amountValidation: {
                                userInput: usdtAmount,
                                blockchainAmount: actualAmount,
                                creditedAmount: creditUsdtAmount,
                                tolerance: '1%',
                            },
                        },
                    }], { session: usdtSession });

                    transactionId = transaction._id.toString();

                    // Update wallet balance within transaction
                    await this.walletModel.findByIdAndUpdate(
                        wallet._id,
                        { $inc: { balance: thbCredits, totalDeposited: thbCredits } },
                        { session: usdtSession }
                    );
                });

                this.logger.log(`[ATOMIC] USDT deposit completed: userId=${userId}, txHash=${sanitizedTxHash}, credits=${thbCredits}`);

                return {
                    success: true,
                    message: `✅ เติมเงินสำเร็จ! ได้รับ ${thbCredits.toLocaleString()} บาท`,
                    status: 'approved',
                    amount: actualAmount,
                    thbCredits,
                };
            } catch (txError: unknown) {
                const txErrorMsg = txError instanceof Error ? txError.message : 'Unknown transaction error';
                this.logger.error(`[ATOMIC ROLLBACK] USDT deposit transaction failed: ${txErrorMsg}`);
                return {
                    success: false,
                    message: 'เกิดข้อผิดพลาดในการบันทึกธุรกรรม กรุณาลองใหม่',
                };
            } finally {
                await usdtSession.endSession();
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`USDT deposit error for user ${userId}: ${errorMsg}`);
            return {
                success: false,
                message: 'เกิดข้อผิดพลาดในการเติมเงิน',
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
     * CRITICAL FIX: Now passes MongoDB session to subscriptions service
     * to ensure all operations are part of the same transaction.
     *
     * Flow:
     * 1. Check idempotency (prevent duplicate purchases)
     * 2. Begin transaction
     * 3. Check wallet balance (within transaction)
     * 4. Deduct from wallet (within transaction)
     * 5. Create transaction record (within transaction)
     * 6. Grant subscription/credit (within transaction with session!)
     * 7. Commit transaction
     * 8. On any error → automatic rollback, wallet unchanged
     *
     * Safety features:
     * - Idempotency key prevents duplicate operations
     * - Distributed lock prevents concurrent purchases
     * - MongoDB transaction ensures atomicity
     * - Session passed to subscription service for full atomicity
     * - Operation logging for audit trail
     * - Retry-safe: won't deduct money twice for same purchase
     */
    async purchasePackage(
        userId: string,
        packageId: string,
        packageName: string,
        packagePrice: number,
        requestId?: string, // Optional request ID for idempotency
    ): Promise<{ success: boolean; message: string; balance?: number; transactionId?: string }> {
        // Generate idempotency key
        const uniqueId = requestId || `${packageId}-${Date.now()}`;
        const idempotencyKey = this.generateIdempotencyKey(
            WalletOperationType.PURCHASE,
            userId,
            uniqueId,
        );

        // Step 0: Check idempotency - prevent duplicate purchases
        const existingOp = await this.checkIdempotency(idempotencyKey);
        if (existingOp) {
            this.logger.warn(`[IDEMPOTENT] Purchase already processed: ${idempotencyKey}`);
            return {
                success: true,
                message: 'การซื้อแพ็คเกจนี้ถูกดำเนินการแล้ว',
                balance: existingOp.balanceAfter,
                transactionId: existingOp.transactionId?.toString(),
            };
        }

        // Step 1: Acquire distributed lock to prevent concurrent purchases
        // NOTE: Lock is USER-SPECIFIC - different users can purchase simultaneously
        const lockKey = `wallet:purchase:${userId}`;
        this.logger.debug(`[PURCHASE] User ${userId} attempting to acquire lock: ${lockKey}`);
        const lockToken = await this.redisService.acquireLock(lockKey, 60); // Extended to 60s for safety

        if (!lockToken) {
            this.logger.warn(`[PURCHASE] User ${userId} failed to acquire lock - already purchasing`);
            return { success: false, message: 'กำลังดำเนินการซื้อแพ็คเกจอยู่ กรุณารอสักครู่' };
        }
        this.logger.debug(`[PURCHASE] User ${userId} acquired lock successfully`);

        // Start MongoDB session for transaction
        const session = await this.connection.startSession();
        let operationLogId: Types.ObjectId | null = null;

        try {
            let transactionId: string = '';
            let newBalance: number = 0;
            let subscriptionId: string = '';

            // Execute all operations within a transaction
            await session.withTransaction(async () => {
                // Step 2: Get wallet (within transaction for consistency)
                const wallet = await this.walletModel
                    .findOne({ userId: new Types.ObjectId(userId) })
                    .session(session);

                if (!wallet) {
                    throw new BadRequestException('ไม่พบกระเป๋าเงินของผู้ใช้');
                }

                // Step 3: Check balance (within transaction)
                if (wallet.balance < packagePrice) {
                    throw new BadRequestException(
                        `เครดิตไม่เพียงพอ (มี ฿${wallet.balance} ต้องการ ฿${packagePrice}) กรุณาเติมเครดิตเพิ่ม`
                    );
                }

                // Calculate new balance
                newBalance = wallet.balance - packagePrice;

                // Step 4: Create operation log (outside transaction for audit even on failure)
                const operationLog = await this.logOperationStart(
                    idempotencyKey,
                    userId,
                    wallet._id,
                    WalletOperationType.PURCHASE,
                    -packagePrice,
                    wallet.balance,
                    `ซื้อแพ็คเกจ: ${packageName}`,
                    { packageId, packageName, packagePrice },
                );
                operationLogId = operationLog._id;

                await this.logOperationStep(operationLogId, 'Balance verified', 'success', {
                    currentBalance: wallet.balance,
                    requiredAmount: packagePrice,
                });

                // Step 5: Create transaction record (PENDING status until subscription succeeds)
                const [transaction] = await this.transactionModel.create(
                    [{
                        userId: new Types.ObjectId(userId),
                        walletId: wallet._id,
                        type: TransactionType.PURCHASE,
                        amount: -packagePrice,
                        balanceBefore: wallet.balance,
                        balanceAfter: newBalance,
                        packageId: new Types.ObjectId(packageId),
                        description: `ซื้อแพ็คเกจ: ${packageName}`,
                        status: TransactionStatus.PENDING, // Pending until subscription granted
                    }],
                    { session }
                );
                transactionId = transaction._id.toString();

                await this.logOperationStep(operationLogId, 'Transaction record created', 'success', {
                    transactionId,
                });

                // Step 6: Deduct from wallet (within transaction)
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

                await this.logOperationStep(operationLogId, 'Wallet deducted', 'success', {
                    deductedAmount: packagePrice,
                    newBalance,
                });

                // Step 7: Grant subscription/credit (CRITICAL: Pass session for atomicity!)
                // This is the key fix - now the subscription operation is part of the same transaction
                const subscriptionResult = await this.subscriptionsService.addQuotaToExisting(
                    userId,
                    packageId,
                    transactionId, // Use transactionId as paymentId for idempotency
                    session, // CRITICAL: Pass session to ensure atomicity!
                );

                if (!subscriptionResult.success) {
                    throw new Error('Failed to grant subscription quota');
                }

                subscriptionId = subscriptionResult.subscriptionId;

                await this.logOperationStep(operationLogId, 'Subscription quota granted', 'success', {
                    subscriptionId,
                    alreadyProcessed: subscriptionResult.alreadyProcessed,
                });

                // Step 8: Update transaction to COMPLETED
                await this.transactionModel.findByIdAndUpdate(
                    transaction._id,
                    {
                        status: TransactionStatus.COMPLETED,
                        completedAt: new Date(),
                    },
                    { session }
                );

                await this.logOperationStep(operationLogId, 'Transaction marked complete', 'success');

                this.logger.log(
                    `[ATOMIC TX] User ${userId} purchased package ${packageId} for ฿${packagePrice}, new balance: ฿${newBalance}, subscription: ${subscriptionId}`
                );
            });

            // Transaction committed successfully - update operation log
            if (operationLogId) {
                await this.logOperationCommit(
                    operationLogId,
                    newBalance,
                    new Types.ObjectId(transactionId),
                    subscriptionId ? new Types.ObjectId(subscriptionId) : undefined,
                );
            }

            return {
                success: true,
                message: `ซื้อแพ็คเกจ ${packageName} สำเร็จ`,
                balance: newBalance,
                transactionId,
            };

        } catch (error: unknown) {
            // Transaction automatically rolled back on error
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;

            this.logger.error(`[ATOMIC TX ROLLBACK] Purchase failed for user ${userId}: ${errorMessage}`);

            // Update operation log with rollback status
            if (operationLogId) {
                await this.logOperationRollback(operationLogId, errorMessage, errorStack);
            }

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
     * CRITICAL FIX: Now uses MongoDB transaction for atomicity
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

        const session = await this.connection.startSession();

        try {
            let newBalance = 0;

            await session.withTransaction(async () => {
                // Get or create wallet within transaction
                let wallet = await this.walletModel
                    .findOne({ userId: new Types.ObjectId(userId) })
                    .session(session);

                if (!wallet) {
                    [wallet] = await this.walletModel.create([{
                        userId: new Types.ObjectId(userId),
                        balance: 0,
                        totalDeposited: 0,
                        totalSpent: 0,
                    }], { session });
                }

                newBalance = wallet.balance + amount;

                // Create transaction record within DB transaction
                await this.transactionModel.create([{
                    userId: new Types.ObjectId(userId),
                    walletId: wallet._id,
                    type: TransactionType.BONUS,
                    amount,
                    balanceBefore: wallet.balance,
                    balanceAfter: newBalance,
                    description,
                    status: TransactionStatus.COMPLETED,
                    completedAt: new Date(),
                    processedBy: new Types.ObjectId(adminId),
                }], { session });

                // Update wallet within DB transaction
                await this.walletModel.findByIdAndUpdate(
                    wallet._id,
                    { $inc: { balance: amount, totalDeposited: amount } },
                    { session }
                );
            });

            this.logger.log(`[ATOMIC] Admin ${adminId} added ฿${amount} bonus to user ${userId}`);

            return { success: true, balance: newBalance };
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`[ATOMIC ROLLBACK] Add bonus failed: ${errorMsg}`);
            throw new BadRequestException('เกิดข้อผิดพลาดในการเพิ่มโบนัส กรุณาลองใหม่');
        } finally {
            await session.endSession();
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Admin: Deduct credits from user (with balance check)
     * CRITICAL FIX: Now uses MongoDB transaction for atomicity
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

        const session = await this.connection.startSession();

        try {
            let newBalance = 0;

            await session.withTransaction(async () => {
                // Get wallet within transaction
                const wallet = await this.walletModel
                    .findOne({ userId: new Types.ObjectId(userId) })
                    .session(session);

                if (!wallet) {
                    throw new BadRequestException('ไม่พบกระเป๋าเงินของผู้ใช้');
                }

                // Check if user has enough balance (within transaction for consistency)
                if (wallet.balance < amount) {
                    throw new BadRequestException(
                        `ไม่สามารถหักเครดิตได้ (มี ฿${wallet.balance} ต้องการหัก ฿${amount})`
                    );
                }

                newBalance = wallet.balance - amount;

                // Create transaction record within DB transaction
                await this.transactionModel.create([{
                    userId: new Types.ObjectId(userId),
                    walletId: wallet._id,
                    type: TransactionType.ADJUSTMENT,
                    amount: -amount, // Negative for deduction
                    balanceBefore: wallet.balance,
                    balanceAfter: newBalance,
                    description: `หักเครดิต: ${description}`,
                    status: TransactionStatus.COMPLETED,
                    completedAt: new Date(),
                    processedBy: new Types.ObjectId(adminId),
                }], { session });

                // Update wallet within DB transaction
                await this.walletModel.findByIdAndUpdate(
                    wallet._id,
                    { $inc: { balance: -amount } },
                    { session }
                );
            });

            this.logger.log(`[ATOMIC] Admin ${adminId} deducted ฿${amount} from user ${userId}`);

            return { success: true, message: `หักเครดิต ฿${amount} สำเร็จ`, balance: newBalance };
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`[ATOMIC ROLLBACK] Deduct credits failed: ${errorMsg}`);

            // Return user-friendly message for balance errors
            if (errorMsg.includes('ไม่สามารถหักเครดิตได้')) {
                return { success: false, message: errorMsg };
            }

            return { success: false, message: 'เกิดข้อผิดพลาดในการหักเครดิต กรุณาลองใหม่' };
        } finally {
            await session.endSession();
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

    /**
     * Admin: Approve pending transaction
     */
    async approveTransaction(
        transactionId: string,
        adminUserId: string,
        notes?: string,
    ): Promise<{ success: boolean; message: string; transaction?: any }> {
        const transaction = await this.transactionModel.findById(transactionId);
        if (!transaction) {
            return { success: false, message: 'ไม่พบรายการธุรกรรม' };
        }

        if (transaction.status !== TransactionStatus.PENDING) {
            return { success: false, message: 'รายการนี้ไม่อยู่ในสถานะรอดำเนินการ' };
        }

        // Get the amount to credit (from metadata for USDT, or from transaction amount)
        const creditAmount = transaction.metadata?.thbCredits || transaction.amount;
        if (!creditAmount || creditAmount <= 0) {
            return { success: false, message: 'จำนวนเครดิตไม่ถูกต้อง' };
        }

        // Update wallet balance
        const wallet = await this.getOrCreateWallet(transaction.userId.toString());
        const balanceBefore = wallet.balance;
        wallet.balance += creditAmount;
        wallet.totalDeposited += creditAmount;
        await wallet.save();

        // Update transaction status
        transaction.status = TransactionStatus.COMPLETED;
        transaction.processedBy = new Types.ObjectId(adminUserId);
        transaction.completedAt = new Date();
        transaction.balanceBefore = balanceBefore;
        transaction.balanceAfter = wallet.balance;
        transaction.amount = creditAmount; // Ensure amount reflects credited amount
        if (notes) {
            transaction.adminNotes = notes;
        }
        await transaction.save();

        this.logger.log(`Transaction approved: id=${transactionId}, userId=${transaction.userId}, amount=${creditAmount}, by=${adminUserId}`);

        return {
            success: true,
            message: `อนุมัติรายการสำเร็จ เติมเครดิต ${creditAmount.toLocaleString()} บาท`,
            transaction: transaction.toObject(),
        };
    }

    /**
     * Admin: Reject pending transaction
     */
    async rejectTransaction(
        transactionId: string,
        adminUserId: string,
        reason?: string,
    ): Promise<{ success: boolean; message: string; transaction?: any }> {
        const transaction = await this.transactionModel.findById(transactionId);
        if (!transaction) {
            return { success: false, message: 'ไม่พบรายการธุรกรรม' };
        }

        if (transaction.status !== TransactionStatus.PENDING) {
            return { success: false, message: 'รายการนี้ไม่อยู่ในสถานะรอดำเนินการ' };
        }

        // Update transaction status
        transaction.status = TransactionStatus.REJECTED;
        transaction.processedBy = new Types.ObjectId(adminUserId);
        transaction.completedAt = new Date();
        if (reason) {
            transaction.adminNotes = reason;
        }
        await transaction.save();

        this.logger.log(`Transaction rejected: id=${transactionId}, userId=${transaction.userId}, reason=${reason || 'N/A'}, by=${adminUserId}`);

        return {
            success: true,
            message: 'ปฏิเสธรายการสำเร็จ',
            transaction: transaction.toObject(),
        };
    }

    /**
     * Admin: Get transaction by ID
     */
    async getTransactionById(transactionId: string): Promise<any> {
        return this.transactionModel
            .findById(transactionId)
            .populate('userId', 'username email fullName')
            .populate('processedBy', 'username')
            .lean()
            .exec();
    }

    /**
     * Admin: Get user credit statistics
     * Returns current balance, total deposited, spent, bonus, deducted, and recent transactions
     */
    async getUserStatistics(userId: string): Promise<{
        currentBalance: number;
        totalDeposited: number;
        totalSpent: number;
        totalBonusReceived: number;
        totalDeducted: number;
        lastTransactions: any[];
    }> {
        const wallet = await this.getOrCreateWallet(userId);

        // Aggregate transaction statistics by type
        const [statsResult, recentTransactions] = await Promise.all([
            this.transactionModel.aggregate([
                {
                    $match: {
                        userId: new Types.ObjectId(userId),
                        status: TransactionStatus.COMPLETED,
                    },
                },
                {
                    $group: {
                        _id: '$type',
                        total: { $sum: '$amount' },
                    },
                },
            ]),
            this.transactionModel
                .find({ userId: new Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean()
                .exec(),
        ]);

        // Calculate totals by type
        let totalBonusReceived = 0;
        let totalDeducted = 0;

        for (const stat of statsResult) {
            if (stat._id === TransactionType.BONUS) {
                totalBonusReceived = Math.abs(stat.total);
            } else if (stat._id === TransactionType.ADJUSTMENT && stat.total < 0) {
                totalDeducted = Math.abs(stat.total);
            }
        }

        return {
            currentBalance: wallet.balance,
            totalDeposited: wallet.totalDeposited,
            totalSpent: wallet.totalSpent,
            totalBonusReceived,
            totalDeducted,
            lastTransactions: recentTransactions.map((tx: any) => ({
                _id: tx._id,
                type: tx.type,
                amount: tx.amount,
                description: tx.description,
                status: tx.status,
                createdAt: tx.createdAt,
            })),
        };
    }

    // ============================================
    // ADMIN REFUND INTERFACE
    // ============================================

    /**
     * Admin: Get failed operations that may need refund
     * Returns operations that failed after money was deducted but before quota was granted
     */
    async getFailedOperations(
        limit = 50,
        offset = 0,
    ): Promise<{
        operations: any[];
        total: number;
    }> {
        const [operations, total] = await Promise.all([
            this.operationLogModel
                .find({
                    status: { $in: [WalletOperationStatus.FAILED, WalletOperationStatus.ROLLED_BACK] },
                })
                .sort({ createdAt: -1 })
                .skip(offset)
                .limit(limit)
                .populate('userId', 'username email fullName')
                .lean()
                .exec(),
            this.operationLogModel.countDocuments({
                status: { $in: [WalletOperationStatus.FAILED, WalletOperationStatus.ROLLED_BACK] },
            }),
        ]);

        return { operations, total };
    }

    /**
     * Admin: Get operation log by ID for review
     */
    async getOperationLog(operationId: string): Promise<any | null> {
        return this.operationLogModel
            .findById(operationId)
            .populate('userId', 'username email fullName')
            .populate('transactionId')
            .lean()
            .exec();
    }

    /**
     * Admin: Refund a failed purchase operation
     *
     * This method is used when:
     * 1. Money was deducted from user's wallet
     * 2. But quota grant failed
     * 3. Transaction was rolled back but money may still be stuck
     *
     * The refund:
     * 1. Creates a REFUND transaction
     * 2. Adds money back to user's wallet
     * 3. Updates operation log with refund info
     *
     * CRITICAL: This uses MongoDB transaction for atomicity
     */
    async refundFailedOperation(
        operationId: string,
        adminId: string,
        reason: string,
    ): Promise<{ success: boolean; message: string; refundTransactionId?: string }> {
        // Validate operation ID
        if (!Types.ObjectId.isValid(operationId)) {
            return { success: false, message: 'ID การดำเนินการไม่ถูกต้อง' };
        }

        // Get the operation log
        const operation = await this.operationLogModel.findById(operationId);
        if (!operation) {
            return { success: false, message: 'ไม่พบการดำเนินการ' };
        }

        // Only allow refund for failed or rolled back operations
        if (![WalletOperationStatus.FAILED, WalletOperationStatus.ROLLED_BACK].includes(operation.status)) {
            return { success: false, message: 'การดำเนินการนี้ไม่อยู่ในสถานะที่สามารถคืนเงินได้' };
        }

        // Check if already refunded
        if (operation.refundInfo) {
            return { success: false, message: 'การดำเนินการนี้ถูกคืนเงินแล้ว' };
        }

        // Only refund purchase operations (negative amounts)
        if (operation.amount >= 0) {
            return { success: false, message: 'ไม่สามารถคืนเงินสำหรับการดำเนินการนี้ (ไม่ใช่การหักเงิน)' };
        }

        const refundAmount = Math.abs(operation.amount);
        const userId = operation.userId.toString();

        // Use distributed lock
        const lockKey = `wallet:refund:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 30);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการอยู่ กรุณารอสักครู่' };
        }

        const session = await this.connection.startSession();

        try {
            let refundTransactionId = '';
            let newBalance = 0;

            await session.withTransaction(async () => {
                // Get wallet within transaction
                const wallet = await this.walletModel
                    .findOne({ userId: new Types.ObjectId(userId) })
                    .session(session);

                if (!wallet) {
                    throw new BadRequestException('ไม่พบกระเป๋าเงินของผู้ใช้');
                }

                newBalance = wallet.balance + refundAmount;

                // Create refund transaction
                const [refundTransaction] = await this.transactionModel.create([{
                    userId: new Types.ObjectId(userId),
                    walletId: wallet._id,
                    type: TransactionType.REFUND,
                    amount: refundAmount,
                    balanceBefore: wallet.balance,
                    balanceAfter: newBalance,
                    description: `คืนเงิน: ${reason}`,
                    status: TransactionStatus.COMPLETED,
                    completedAt: new Date(),
                    processedBy: new Types.ObjectId(adminId),
                    metadata: {
                        refundedOperationId: operationId,
                        originalAmount: operation.amount,
                        originalOperation: operation.operationType,
                        refundReason: reason,
                    },
                }], { session });

                refundTransactionId = refundTransaction._id.toString();

                // Update wallet balance
                await this.walletModel.findByIdAndUpdate(
                    wallet._id,
                    { $inc: { balance: refundAmount } },
                    { session }
                );
            });

            // Update operation log with refund info (outside transaction is OK since it's just logging)
            await this.operationLogModel.findByIdAndUpdate(operationId, {
                status: WalletOperationStatus.REFUNDED,
                refundInfo: {
                    refundedBy: new Types.ObjectId(adminId),
                    refundedAt: new Date(),
                    refundTransactionId: new Types.ObjectId(refundTransactionId),
                    reason,
                },
                $push: {
                    steps: {
                        step: 'Refunded by admin',
                        status: 'success',
                        timestamp: new Date(),
                        data: {
                            refundAmount,
                            newBalance,
                            adminId,
                            reason,
                        },
                    },
                },
            });

            this.logger.log(
                `[REFUND] Admin ${adminId} refunded ฿${refundAmount} to user ${userId} for operation ${operationId}`
            );

            return {
                success: true,
                message: `คืนเงิน ฿${refundAmount.toLocaleString()} สำเร็จ`,
                refundTransactionId,
            };
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`[REFUND FAILED] Refund failed for operation ${operationId}: ${errorMsg}`);
            return { success: false, message: 'เกิดข้อผิดพลาดในการคืนเงิน กรุณาลองใหม่' };
        } finally {
            await session.endSession();
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Admin: Manual refund for any completed purchase transaction
     *
     * Use this when:
     * 1. User purchased but package/quota has issues
     * 2. User requests refund for valid reason
     *
     * This does NOT revoke the granted quota - admin should do that separately if needed
     */
    async refundTransaction(
        transactionId: string,
        adminId: string,
        reason: string,
    ): Promise<{ success: boolean; message: string; refundTransactionId?: string }> {
        // Validate transaction ID
        if (!Types.ObjectId.isValid(transactionId)) {
            return { success: false, message: 'ID ธุรกรรมไม่ถูกต้อง' };
        }

        // Get the original transaction
        const originalTx = await this.transactionModel.findById(transactionId);
        if (!originalTx) {
            return { success: false, message: 'ไม่พบธุรกรรม' };
        }

        // Only allow refund for completed purchase transactions
        if (originalTx.status !== TransactionStatus.COMPLETED) {
            return { success: false, message: 'ธุรกรรมนี้ไม่อยู่ในสถานะที่สามารถคืนเงินได้' };
        }

        if (originalTx.type !== TransactionType.PURCHASE) {
            return { success: false, message: 'สามารถคืนเงินได้เฉพาะธุรกรรมการซื้อเท่านั้น' };
        }

        // Check if amount is negative (purchase)
        if (originalTx.amount >= 0) {
            return { success: false, message: 'ไม่สามารถคืนเงินสำหรับธุรกรรมนี้ได้' };
        }

        // Check if already refunded
        const existingRefund = await this.transactionModel.findOne({
            'metadata.refundedTransactionId': transactionId,
            type: TransactionType.REFUND,
        });

        if (existingRefund) {
            return { success: false, message: 'ธุรกรรมนี้ถูกคืนเงินแล้ว' };
        }

        const refundAmount = Math.abs(originalTx.amount);
        const userId = originalTx.userId.toString();

        // Use distributed lock
        const lockKey = `wallet:refund:${userId}`;
        const lockToken = await this.redisService.acquireLock(lockKey, 30);

        if (!lockToken) {
            return { success: false, message: 'กำลังดำเนินการอยู่ กรุณารอสักครู่' };
        }

        const session = await this.connection.startSession();

        try {
            let refundTransactionId = '';

            await session.withTransaction(async () => {
                // Get wallet within transaction
                const wallet = await this.walletModel
                    .findOne({ userId: new Types.ObjectId(userId) })
                    .session(session);

                if (!wallet) {
                    throw new BadRequestException('ไม่พบกระเป๋าเงินของผู้ใช้');
                }

                const newBalance = wallet.balance + refundAmount;

                // Create refund transaction
                const [refundTransaction] = await this.transactionModel.create([{
                    userId: new Types.ObjectId(userId),
                    walletId: wallet._id,
                    type: TransactionType.REFUND,
                    amount: refundAmount,
                    balanceBefore: wallet.balance,
                    balanceAfter: newBalance,
                    description: `คืนเงิน: ${reason}`,
                    status: TransactionStatus.COMPLETED,
                    completedAt: new Date(),
                    processedBy: new Types.ObjectId(adminId),
                    metadata: {
                        refundedTransactionId: transactionId,
                        originalAmount: originalTx.amount,
                        originalDescription: originalTx.description,
                        refundReason: reason,
                    },
                }], { session });

                refundTransactionId = refundTransaction._id.toString();

                // Update wallet balance
                await this.walletModel.findByIdAndUpdate(
                    wallet._id,
                    { $inc: { balance: refundAmount } },
                    { session }
                );

                // Update original transaction to mark as refunded
                await this.transactionModel.findByIdAndUpdate(
                    transactionId,
                    {
                        $set: {
                            'metadata.refundedAt': new Date(),
                            'metadata.refundedBy': adminId,
                            'metadata.refundTransactionId': refundTransactionId,
                            adminNotes: `คืนเงินแล้ว: ${reason}`,
                        },
                    },
                    { session }
                );
            });

            this.logger.log(
                `[REFUND] Admin ${adminId} refunded transaction ${transactionId} - ฿${refundAmount} to user ${userId}`
            );

            return {
                success: true,
                message: `คืนเงิน ฿${refundAmount.toLocaleString()} สำเร็จ`,
                refundTransactionId,
            };
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`[REFUND FAILED] Transaction refund failed: ${errorMsg}`);
            return { success: false, message: 'เกิดข้อผิดพลาดในการคืนเงิน กรุณาลองใหม่' };
        } finally {
            await session.endSession();
            await this.redisService.releaseLock(lockKey, lockToken);
        }
    }

    /**
     * Admin: Get refund history
     */
    async getRefundHistory(
        limit = 50,
        offset = 0,
    ): Promise<{
        transactions: any[];
        total: number;
    }> {
        const [transactions, total] = await Promise.all([
            this.transactionModel
                .find({ type: TransactionType.REFUND })
                .sort({ createdAt: -1 })
                .skip(offset)
                .limit(limit)
                .populate('userId', 'username email fullName')
                .populate('processedBy', 'username')
                .lean()
                .exec(),
            this.transactionModel.countDocuments({ type: TransactionType.REFUND }),
        ]);

        return { transactions, total };
    }
}
