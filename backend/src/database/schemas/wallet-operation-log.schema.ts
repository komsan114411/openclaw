import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletOperationLogDocument = WalletOperationLog & Document;

/**
 * Operation types for wallet operations
 */
export enum WalletOperationType {
    DEPOSIT = 'deposit',
    DEPOSIT_USDT = 'deposit_usdt',
    PURCHASE = 'purchase',
    REFUND = 'refund',
    BONUS = 'bonus',
    DEDUCTION = 'deduction',
    ADJUSTMENT = 'adjustment',
}

/**
 * Operation status
 */
export enum WalletOperationStatus {
    STARTED = 'started',       // Operation started
    COMMITTED = 'committed',   // Successfully committed
    ROLLED_BACK = 'rolled_back', // Rolled back due to error
    FAILED = 'failed',         // Failed without rollback (needs manual intervention)
    REFUNDED = 'refunded',     // Manually refunded by admin
}

/**
 * Wallet Operation Log Schema
 *
 * This schema tracks ALL wallet operations with full audit trail.
 * Used for:
 * - Debugging failed transactions
 * - Idempotency checks (prevent duplicate operations)
 * - Admin refund decisions
 * - Audit compliance
 */
@Schema({ timestamps: true })
export class WalletOperationLog {
    /**
     * Unique idempotency key to prevent duplicate operations
     * Format: {operationType}:{userId}:{uniqueIdentifier}
     * Examples:
     * - deposit:user123:slip-abc123
     * - purchase:user123:txn-def456
     * - deposit_usdt:user123:0xabc...
     */
    @Prop({ type: String, required: true, unique: true, index: true })
    idempotencyKey: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
    walletId: Types.ObjectId;

    @Prop({ type: String, enum: WalletOperationType, required: true, index: true })
    operationType: WalletOperationType;

    @Prop({ type: String, enum: WalletOperationStatus, required: true, index: true })
    status: WalletOperationStatus;

    /**
     * Amount involved in the operation (can be negative for deductions)
     */
    @Prop({ type: Number, required: true })
    amount: number;

    /**
     * Wallet balance BEFORE the operation started
     */
    @Prop({ type: Number, required: true })
    balanceBefore: number;

    /**
     * Wallet balance AFTER the operation (if committed)
     */
    @Prop({ type: Number })
    balanceAfter?: number;

    /**
     * Related transaction ID (CreditTransaction)
     */
    @Prop({ type: Types.ObjectId, ref: 'CreditTransaction' })
    transactionId?: Types.ObjectId;

    /**
     * Related subscription ID (if quota was granted)
     */
    @Prop({ type: Types.ObjectId, ref: 'Subscription' })
    subscriptionId?: Types.ObjectId;

    /**
     * Related package ID (for purchases)
     */
    @Prop({ type: Types.ObjectId, ref: 'Package' })
    packageId?: Types.ObjectId;

    /**
     * Description of the operation
     */
    @Prop({ type: String, required: true })
    description: string;

    /**
     * Detailed operation steps for debugging
     */
    @Prop({ type: [Object], default: [] })
    steps: Array<{
        step: string;
        status: 'pending' | 'success' | 'failed';
        timestamp: Date;
        data?: Record<string, unknown>;
        error?: string;
    }>;

    /**
     * Error message if operation failed
     */
    @Prop({ type: String })
    errorMessage?: string;

    /**
     * Stack trace for debugging (only stored in dev/staging)
     */
    @Prop({ type: String })
    errorStack?: string;

    /**
     * Additional metadata
     */
    @Prop({ type: Object })
    metadata?: Record<string, unknown>;

    /**
     * Timestamps for each status transition
     */
    @Prop({ type: Date })
    startedAt: Date;

    @Prop({ type: Date })
    committedAt?: Date;

    @Prop({ type: Date })
    rolledBackAt?: Date;

    @Prop({ type: Date })
    failedAt?: Date;

    /**
     * Refund information (if refunded by admin)
     */
    @Prop({ type: Object })
    refundInfo?: {
        refundedBy: Types.ObjectId;
        refundedAt: Date;
        refundTransactionId: Types.ObjectId;
        reason: string;
    };

    /**
     * Number of retry attempts
     */
    @Prop({ type: Number, default: 0 })
    retryCount: number;

    /**
     * IP address of the requester (for security audit)
     */
    @Prop({ type: String })
    ipAddress?: string;

    /**
     * User agent of the requester
     */
    @Prop({ type: String })
    userAgent?: string;
}

export const WalletOperationLogSchema = SchemaFactory.createForClass(WalletOperationLog);

// Indexes for common queries
WalletOperationLogSchema.index({ userId: 1, createdAt: -1 });
WalletOperationLogSchema.index({ status: 1, operationType: 1 });
WalletOperationLogSchema.index({ status: 1, createdAt: -1 }); // For finding failed operations
WalletOperationLogSchema.index({ 'refundInfo.refundedBy': 1 }, { sparse: true });

// TTL index to auto-delete old successful logs after 90 days (keep failed ones indefinitely)
// Comment out if you want to keep all logs
// WalletOperationLogSchema.index(
//     { committedAt: 1 },
//     { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { status: 'committed' } }
// );
