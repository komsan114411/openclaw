/**
 * Domain Events
 *
 * These are the core domain events that can be published and subscribed to
 * across the system. Each event is immutable and represents something that
 * has happened in the domain.
 *
 * Benefits:
 * - Decouples modules (no direct imports)
 * - Clear contracts between services
 * - Easy to test (mock events)
 * - Audit trail friendly
 */

// Base Event Interface
export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
}

// ============================================
// User Events
// ============================================

export interface UserRegisteredEvent extends DomainEvent {
  readonly eventName: 'user.registered';
  readonly userId: string;
  readonly username: string;
  readonly email?: string;
  readonly role: string;
}

export interface UserLoginEvent extends DomainEvent {
  readonly eventName: 'user.login';
  readonly userId: string;
  readonly ipAddress?: string;
}

// ============================================
// Payment Events
// ============================================

export interface PaymentCompletedEvent extends DomainEvent {
  readonly eventName: 'payment.completed';
  readonly paymentId: string;
  readonly userId: string;
  readonly amount: number;
  readonly packageId: string;
  readonly paymentMethod: 'bank_transfer' | 'usdt' | 'credit';
  readonly transactionRef?: string;
}

export interface PaymentFailedEvent extends DomainEvent {
  readonly eventName: 'payment.failed';
  readonly paymentId: string;
  readonly userId: string;
  readonly reason: string;
}

// ============================================
// Wallet Events
// ============================================

export interface WalletDebitedEvent extends DomainEvent {
  readonly eventName: 'wallet.debited';
  readonly userId: string;
  readonly amount: number;
  readonly newBalance: number;
  readonly reason: string;
  readonly referenceId?: string;
}

export interface WalletCreditedEvent extends DomainEvent {
  readonly eventName: 'wallet.credited';
  readonly userId: string;
  readonly amount: number;
  readonly newBalance: number;
  readonly source: 'deposit' | 'refund' | 'bonus';
  readonly referenceId?: string;
}

export interface DepositApprovedEvent extends DomainEvent {
  readonly eventName: 'wallet.deposit.approved';
  readonly depositId: string;
  readonly userId: string;
  readonly amount: number;
  readonly approvedBy: string;
}

// ============================================
// Subscription Events
// ============================================

export interface SubscriptionActivatedEvent extends DomainEvent {
  readonly eventName: 'subscription.activated';
  readonly subscriptionId: string;
  readonly userId: string;
  readonly lineAccountId: string;
  readonly packageId: string;
  readonly quota: number;
  readonly expiresAt: Date;
}

export interface SubscriptionExpiredEvent extends DomainEvent {
  readonly eventName: 'subscription.expired';
  readonly subscriptionId: string;
  readonly userId: string;
  readonly lineAccountId: string;
}

export interface QuotaExhaustedEvent extends DomainEvent {
  readonly eventName: 'subscription.quota.exhausted';
  readonly subscriptionId: string;
  readonly userId: string;
  readonly lineAccountId: string;
}

export interface QuotaUsedEvent extends DomainEvent {
  readonly eventName: 'subscription.quota.used';
  readonly subscriptionId: string;
  readonly lineAccountId: string;
  readonly remainingQuota: number;
}

// ============================================
// LINE Account Events
// ============================================

export interface LineAccountCreatedEvent extends DomainEvent {
  readonly eventName: 'line.account.created';
  readonly lineAccountId: string;
  readonly userId: string;
  readonly channelName: string;
}

export interface WebhookReceivedEvent extends DomainEvent {
  readonly eventName: 'line.webhook.received';
  readonly lineAccountId: string;
  readonly eventType: string;
  readonly messageType?: string;
}

// ============================================
// Slip Verification Events
// ============================================

export interface SlipVerifiedEvent extends DomainEvent {
  readonly eventName: 'slip.verified';
  readonly lineAccountId: string;
  readonly amount: number;
  readonly transactionRef: string;
  readonly status: 'success' | 'duplicate' | 'invalid';
}

// ============================================
// Event Name Constants
// ============================================

export const EventNames = {
  // User
  USER_REGISTERED: 'user.registered' as const,
  USER_LOGIN: 'user.login' as const,

  // Payment
  PAYMENT_COMPLETED: 'payment.completed' as const,
  PAYMENT_FAILED: 'payment.failed' as const,

  // Wallet
  WALLET_DEBITED: 'wallet.debited' as const,
  WALLET_CREDITED: 'wallet.credited' as const,
  DEPOSIT_APPROVED: 'wallet.deposit.approved' as const,

  // Subscription
  SUBSCRIPTION_ACTIVATED: 'subscription.activated' as const,
  SUBSCRIPTION_EXPIRED: 'subscription.expired' as const,
  QUOTA_EXHAUSTED: 'subscription.quota.exhausted' as const,
  QUOTA_USED: 'subscription.quota.used' as const,

  // LINE
  LINE_ACCOUNT_CREATED: 'line.account.created' as const,
  WEBHOOK_RECEIVED: 'line.webhook.received' as const,

  // Slip
  SLIP_VERIFIED: 'slip.verified' as const,
} as const;

// Type for all event names
export type EventName = (typeof EventNames)[keyof typeof EventNames];

// Union type of all domain events
export type AnyDomainEvent =
  | UserRegisteredEvent
  | UserLoginEvent
  | PaymentCompletedEvent
  | PaymentFailedEvent
  | WalletDebitedEvent
  | WalletCreditedEvent
  | DepositApprovedEvent
  | SubscriptionActivatedEvent
  | SubscriptionExpiredEvent
  | QuotaExhaustedEvent
  | QuotaUsedEvent
  | LineAccountCreatedEvent
  | WebhookReceivedEvent
  | SlipVerifiedEvent;
