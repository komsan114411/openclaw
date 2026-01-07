/**
 * Event Bus Module Exports
 *
 * This barrel file exports all event-related types and services.
 *
 * Usage:
 * ```typescript
 * import {
 *   EventBusService,
 *   EventNames,
 *   PaymentCompletedEvent,
 * } from '../core/events';
 * ```
 */

// Service
export { EventBusService, EventHandler } from './event-bus.service';

// Module
export { EventBusModule } from './event-bus.module';

// Domain Events
export {
  // Base
  DomainEvent,
  EventName,
  EventNames,
  AnyDomainEvent,
  // User Events
  UserRegisteredEvent,
  UserLoginEvent,
  // Payment Events
  PaymentCompletedEvent,
  PaymentFailedEvent,
  // Wallet Events
  WalletDebitedEvent,
  WalletCreditedEvent,
  DepositApprovedEvent,
  // Subscription Events
  SubscriptionActivatedEvent,
  SubscriptionExpiredEvent,
  QuotaExhaustedEvent,
  QuotaUsedEvent,
  // LINE Events
  LineAccountCreatedEvent,
  WebhookReceivedEvent,
  // Slip Events
  SlipVerifiedEvent,
} from './domain-events';
