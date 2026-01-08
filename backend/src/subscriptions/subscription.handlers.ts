import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    EventBusService,
    EventNames,
    PaymentCompletedEvent,
    DepositApprovedEvent,
} from '../core/events';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../database/schemas/subscription.schema';
import { Package, PackageDocument } from '../database/schemas/package.schema';

/**
 * Subscription Event Handlers
 *
 * Listens to domain events and handles subscription-related side effects.
 * This decouples the SubscriptionsService from PaymentsService and WalletService.
 *
 * Events handled:
 * - payment.completed → Activate subscription for user
 * - wallet.deposit.approved → Could trigger bonus subscription
 */
@Injectable()
export class SubscriptionEventHandlers implements OnModuleInit {
    private readonly logger = new Logger(SubscriptionEventHandlers.name);

    constructor(
        private readonly eventBus: EventBusService,
        @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
        @InjectModel(Package.name) private packageModel: Model<PackageDocument>,
    ) { }

    onModuleInit() {
        this.registerEventHandlers();
        this.logger.log('Subscription event handlers registered');
    }

    private registerEventHandlers() {
        // Handle payment completion → activate subscription
        this.eventBus.subscribe<PaymentCompletedEvent>(
            EventNames.PAYMENT_COMPLETED,
            async (event) => {
                await this.handlePaymentCompleted(event);
            },
        );

        // Handle deposit approval (optional: could trigger welcome bonus)
        this.eventBus.subscribe<DepositApprovedEvent>(
            EventNames.DEPOSIT_APPROVED,
            async (event) => {
                await this.handleDepositApproved(event);
            },
        );
    }

    /**
     * Handle payment.completed event
     * Creates or extends subscription for the user
     */
    private async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
        this.logger.log(
            `Handling payment.completed: userId=${event.userId}, packageId=${event.packageId}`,
        );

        try {
            // Get package details
            const pkg = await this.packageModel.findById(event.packageId);
            if (!pkg) {
                this.logger.error(`Package not found: ${event.packageId}`);
                return;
            }

            // Check if subscription already exists for this payment (idempotency)
            const existing = await this.subscriptionModel.findOne({
                paymentId: event.paymentId,
            });

            if (existing) {
                this.logger.warn(
                    `Subscription already exists for payment ${event.paymentId}, skipping`,
                );
                return;
            }

            // Find or create active subscription
            const userId = new Types.ObjectId(event.userId);
            const now = new Date();

            // Try to add quota to existing active subscription
            const activeSubscription = await this.subscriptionModel.findOneAndUpdate(
                {
                    userId,
                    status: SubscriptionStatus.ACTIVE,
                    expiresAt: { $gt: now },
                },
                {
                    $inc: { quota: pkg.slipQuota, remainingQuota: pkg.slipQuota },
                    $addToSet: { appliedPaymentIds: event.paymentId },
                },
                { new: true },
            );

            if (activeSubscription) {
                this.logger.log(
                    `Added ${pkg.slipQuota} quota to existing subscription ${activeSubscription._id}`,
                );
                return;
            }

            // Create new subscription
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + (pkg.durationDays || 30));

            const newSubscription = await this.subscriptionModel.create({
                userId,
                packageId: new Types.ObjectId(event.packageId),
                paymentId: event.paymentId,
                appliedPaymentIds: [event.paymentId],
                quota: pkg.slipQuota,
                remainingQuota: pkg.slipQuota,
                startDate: now,
                expiresAt,
                status: SubscriptionStatus.ACTIVE,
            });

            this.logger.log(
                `Created new subscription ${newSubscription._id} with ${pkg.slipQuota} quota`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to handle payment.completed: ${error instanceof Error ? error.message : error}`,
            );
        }
    }

    /**
     * Handle wallet.deposit.approved event
     * Could be used to grant welcome bonus or loyalty rewards
     */
    private async handleDepositApproved(event: DepositApprovedEvent): Promise<void> {
        this.logger.debug(
            `Deposit approved for user ${event.userId}: ${event.amount} THB`,
        );
        // Future: Could grant bonus quota for large deposits
    }
}
