/**
 * Event Handlers Example
 *
 * This file demonstrates how to create event handlers that subscribe
 * to domain events. In a real application, these handlers would be
 * in their respective module folders.
 *
 * BEFORE (Circular Dependency):
 * ```typescript
 * // payment.service.ts
 * import { MemberService } from '../member/member.service';  // Direct import!
 * import { NotificationService } from '../notification/notification.service';  // Direct import!
 *
 * @Injectable()
 * export class PaymentService {
 *   constructor(
 *     private memberService: MemberService,  // Circular!
 *     private notificationService: NotificationService,  // Circular!
 *   ) {}
 *
 *   async processPayment(paymentData) {
 *     // Process payment...
 *     await this.memberService.activateSubscription(paymentData);  // Direct call
 *     await this.notificationService.sendConfirmation(paymentData);  // Direct call
 *   }
 * }
 * ```
 *
 * AFTER (Event-Driven):
 * ```typescript
 * // payment.service.ts - NO imports from other modules!
 * import { EventBusService, EventNames, PaymentCompletedEvent } from '../core/events';
 *
 * @Injectable()
 * export class PaymentService {
 *   constructor(private eventBus: EventBusService) {}
 *
 *   async processPayment(paymentData) {
 *     // Process payment...
 *
 *     // Publish event - doesn't know who listens!
 *     await this.eventBus.publish<PaymentCompletedEvent>({
 *       eventName: EventNames.PAYMENT_COMPLETED,
 *       occurredAt: new Date(),
 *       paymentId: paymentData.id,
 *       userId: paymentData.userId,
 *       amount: paymentData.amount,
 *       packageId: paymentData.packageId,
 *       paymentMethod: 'bank_transfer',
 *     });
 *   }
 * }
 *
 * // member.handler.ts - Subscribes to payment events
 * @Injectable()
 * export class MemberEventHandler implements OnModuleInit {
 *   constructor(
 *     private eventBus: EventBusService,
 *     private subscriptionService: SubscriptionService,
 *   ) {}
 *
 *   onModuleInit() {
 *     this.eventBus.subscribe<PaymentCompletedEvent>(
 *       EventNames.PAYMENT_COMPLETED,
 *       async (event) => {
 *         await this.subscriptionService.activate(event.userId, event.packageId);
 *       },
 *     );
 *   }
 * }
 *
 * // notification.handler.ts - Also subscribes to payment events
 * @Injectable()
 * export class NotificationEventHandler implements OnModuleInit {
 *   constructor(private eventBus: EventBusService) {}
 *
 *   onModuleInit() {
 *     this.eventBus.subscribe<PaymentCompletedEvent>(
 *       EventNames.PAYMENT_COMPLETED,
 *       async (event) => {
 *         await this.sendPaymentConfirmation(event);
 *       },
 *     );
 *   }
 * }
 * ```
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import {
  EventNames,
  PaymentCompletedEvent,
  SubscriptionActivatedEvent,
  WalletCreditedEvent,
  QuotaExhaustedEvent,
} from './domain-events';

/**
 * Example: Subscription Handler
 *
 * This handler listens for payment events and activates subscriptions.
 * In a real app, this would be in: subscriptions/handlers/subscription.handler.ts
 */
@Injectable()
export class SubscriptionEventHandler implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionEventHandler.name);

  constructor(private eventBus: EventBusService) {}

  onModuleInit(): void {
    // Subscribe to PaymentCompleted events
    this.eventBus.subscribe<PaymentCompletedEvent>(
      EventNames.PAYMENT_COMPLETED,
      async (event) => {
        this.logger.log(
          `[HANDLER] PaymentCompleted received - activating subscription for user ${event.userId}`,
        );
        // In real implementation:
        // await this.subscriptionService.activate(event.userId, event.packageId);
      },
    );

    this.logger.log('SubscriptionEventHandler initialized');
  }
}

/**
 * Example: Notification Handler
 *
 * This handler listens for various events and sends notifications.
 * In a real app, this would be in: notifications/handlers/notification.handler.ts
 */
@Injectable()
export class NotificationEventHandler implements OnModuleInit {
  private readonly logger = new Logger(NotificationEventHandler.name);

  constructor(private eventBus: EventBusService) {}

  onModuleInit(): void {
    // Subscribe to PaymentCompleted events
    this.eventBus.subscribe<PaymentCompletedEvent>(
      EventNames.PAYMENT_COMPLETED,
      async (event) => {
        this.logger.log(
          `[HANDLER] Sending payment confirmation to user ${event.userId}`,
        );
        // In real implementation:
        // await this.sendPaymentConfirmation(event);
      },
    );

    // Subscribe to SubscriptionActivated events
    this.eventBus.subscribe<SubscriptionActivatedEvent>(
      EventNames.SUBSCRIPTION_ACTIVATED,
      async (event) => {
        this.logger.log(
          `[HANDLER] Sending activation confirmation to user ${event.userId}`,
        );
        // In real implementation:
        // await this.sendActivationConfirmation(event);
      },
    );

    // Subscribe to QuotaExhausted events
    this.eventBus.subscribe<QuotaExhaustedEvent>(
      EventNames.QUOTA_EXHAUSTED,
      async (event) => {
        this.logger.log(
          `[HANDLER] Sending quota warning to user ${event.userId}`,
        );
        // In real implementation:
        // await this.sendQuotaWarning(event);
      },
    );

    this.logger.log('NotificationEventHandler initialized');
  }
}

/**
 * Example: Activity Log Handler
 *
 * This handler listens to ALL events for audit logging.
 * Uses the wildcard '*' to receive all events.
 */
@Injectable()
export class ActivityLogEventHandler implements OnModuleInit {
  private readonly logger = new Logger(ActivityLogEventHandler.name);

  constructor(private eventBus: EventBusService) {}

  onModuleInit(): void {
    // Subscribe to ALL events using wildcard
    this.eventBus.subscribe('*', async (event) => {
      this.logger.debug(
        `[AUDIT] Event: ${event.eventName} at ${event.occurredAt.toISOString()}`,
      );
      // In real implementation:
      // await this.activityLogService.log(event);
    });

    this.logger.log('ActivityLogEventHandler initialized (listening to all events)');
  }
}

/**
 * Example: Wallet Handler
 *
 * This handler manages wallet operations based on events.
 */
@Injectable()
export class WalletEventHandler implements OnModuleInit {
  private readonly logger = new Logger(WalletEventHandler.name);

  constructor(private eventBus: EventBusService) {}

  onModuleInit(): void {
    // Listen for wallet credited events to update user notifications
    this.eventBus.subscribe<WalletCreditedEvent>(
      EventNames.WALLET_CREDITED,
      async (event) => {
        this.logger.log(
          `[HANDLER] Wallet credited: ${event.amount} for user ${event.userId}`,
        );
      },
    );

    this.logger.log('WalletEventHandler initialized');
  }
}
