import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';

/**
 * Event Bus Module
 *
 * This is a global module that provides the EventBusService to all modules.
 * Being global means you don't need to import it in every module that wants
 * to use the event bus.
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                        APP MODULE                           │
 * │                            │                                │
 * │              ┌─────────────┼─────────────┐                  │
 * │              │             │             │                  │
 * │         ┌────▼────┐   ┌────▼────┐   ┌────▼────┐            │
 * │         │ Payment │   │ Wallet  │   │ Member  │            │
 * │         │ Module  │   │ Module  │   │ Module  │            │
 * │         └────┬────┘   └────┬────┘   └────┬────┘            │
 * │              │             │             │                  │
 * │              │    publish  │  subscribe  │                  │
 * │              │      ▼      │      ▼      │                  │
 * │         ┌────┴─────────────┴─────────────┴────┐            │
 * │         │           EVENT BUS (Global)         │            │
 * │         │  ┌─────────────────────────────┐    │            │
 * │         │  │ payment.completed           │    │            │
 * │         │  │ wallet.credited             │    │            │
 * │         │  │ subscription.activated      │    │            │
 * │         │  └─────────────────────────────┘    │            │
 * │         └─────────────────────────────────────┘            │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * Usage in other modules:
 * ```typescript
 * @Injectable()
 * export class PaymentService {
 *   constructor(private eventBus: EventBusService) {}
 *
 *   async processPayment() {
 *     // ... process payment ...
 *
 *     // Publish event instead of calling other services directly
 *     await this.eventBus.publish({
 *       eventName: 'payment.completed',
 *       occurredAt: new Date(),
 *       paymentId: payment.id,
 *       userId: payment.userId,
 *       amount: payment.amount,
 *       packageId: payment.packageId,
 *       paymentMethod: 'bank_transfer',
 *     });
 *   }
 * }
 * ```
 */
@Global()
@Module({
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
