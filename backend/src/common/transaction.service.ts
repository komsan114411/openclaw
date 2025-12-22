import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ErrorHandlerService, ErrorCode, OperationResult } from './error-handler.service';

export interface TransactionStep<T = any> {
  name: string;
  execute: () => Promise<T>;
  rollback?: (result: T) => Promise<void>;
  skipOnError?: boolean;
}

export interface TransactionResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    step: string;
    message: string;
    code?: ErrorCode;
  };
  completedSteps: string[];
  rolledBackSteps: string[];
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private redisService: RedisService,
    private errorHandler: ErrorHandlerService,
  ) {}

  /**
   * Execute a series of steps with automatic rollback on failure
   * Similar to a database transaction but works across services
   */
  async executeTransaction<T = any>(
    transactionId: string,
    steps: TransactionStep[],
    options: {
      lockKey?: string;
      lockTtlSeconds?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<TransactionResult<T>> {
    const {
      lockKey,
      lockTtlSeconds = 30,
      timeoutMs = 60000,
    } = options;

    const completedSteps: Array<{ name: string; result: any; rollback?: () => Promise<void> }> = [];
    const rolledBackSteps: string[] = [];
    let lockToken: string | null = null;

    try {
      // Acquire distributed lock if specified
      if (lockKey) {
        lockToken = await this.redisService.acquireLock(lockKey, lockTtlSeconds);
        if (!lockToken) {
          return {
            success: false,
            error: {
              step: 'lock',
              message: 'Could not acquire lock - operation in progress',
              code: ErrorCode.CONCURRENT_OPERATION,
            },
            completedSteps: [],
            rolledBackSteps: [],
          };
        }
      }

      // Execute each step with timeout
      const startTime = Date.now();
      let lastResult: any;

      for (const step of steps) {
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Transaction timeout after ${timeoutMs}ms`);
        }

        this.logger.debug(`Executing step: ${step.name}`);

        try {
          const result = await step.execute();
          lastResult = result;

          completedSteps.push({
            name: step.name,
            result,
            rollback: step.rollback ? () => step.rollback!(result) : undefined,
          });

          this.logger.debug(`Step completed: ${step.name}`);
        } catch (error) {
          if (step.skipOnError) {
            this.logger.warn(`Step ${step.name} failed but skipped: ${(error as Error).message}`);
            continue;
          }
          throw error;
        }
      }

      this.logger.log(`Transaction ${transactionId} completed successfully`);

      return {
        success: true,
        data: lastResult,
        completedSteps: completedSteps.map(s => s.name),
        rolledBackSteps: [],
      };

    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(`Transaction ${transactionId} failed: ${errorMessage}`);

      // Rollback completed steps in reverse order
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const step = completedSteps[i];
        if (step.rollback) {
          try {
            this.logger.debug(`Rolling back step: ${step.name}`);
            await step.rollback();
            rolledBackSteps.push(step.name);
            this.logger.debug(`Rolled back step: ${step.name}`);
          } catch (rollbackError) {
            this.logger.error(
              `Failed to rollback step ${step.name}: ${(rollbackError as Error).message}`,
            );
            // Continue rolling back other steps
          }
        }
      }

      return {
        success: false,
        error: {
          step: completedSteps.length > 0 
            ? completedSteps[completedSteps.length - 1].name 
            : 'unknown',
          message: errorMessage,
        },
        completedSteps: completedSteps.map(s => s.name),
        rolledBackSteps,
      };

    } finally {
      // Release lock if acquired
      if (lockToken && lockKey) {
        await this.redisService.releaseLock(lockKey, lockToken);
      }
    }
  }

  /**
   * Execute a payment transaction with proper rollback
   */
  async executePaymentTransaction(params: {
    paymentId: string;
    userId: string;
    packageId: string;
    verifyPayment: () => Promise<{ success: boolean; transRef?: string }>;
    createSubscription: () => Promise<{ subscriptionId: string }>;
    updatePaymentStatus: (status: 'verified' | 'failed', transRef?: string) => Promise<void>;
    onSuccess?: () => Promise<void>;
    onFailure?: (error: string) => Promise<void>;
  }): Promise<TransactionResult> {
    const steps: TransactionStep[] = [
      {
        name: 'verify_payment',
        execute: params.verifyPayment,
      },
      {
        name: 'create_subscription',
        execute: params.createSubscription,
        rollback: async () => {
          // Subscription rollback would be handled by the service
          this.logger.warn(`Subscription for user ${params.userId} may need manual cleanup`);
        },
      },
      {
        name: 'update_payment_status',
        execute: () => params.updatePaymentStatus('verified'),
      },
      {
        name: 'on_success_callback',
        execute: async () => params.onSuccess?.(),
        skipOnError: true,
      },
    ];

    const result = await this.executeTransaction(
      `payment:${params.paymentId}`,
      steps,
      {
        lockKey: `payment:${params.paymentId}`,
        lockTtlSeconds: 60,
      },
    );

    if (!result.success && params.onFailure) {
      await params.onFailure(result.error?.message || 'Unknown error');
    }

    return result;
  }

  /**
   * Execute a slip verification transaction with quota management
   */
  async executeSlipVerificationTransaction(params: {
    messageId: string;
    ownerId: string;
    lineAccountId: string;
    lineUserId: string;
    reserveQuota: () => Promise<{ subscriptionId: string | null }>;
    createReservation: (subscriptionId: string) => Promise<{ reservationId: string }>;
    verifySlip: () => Promise<{ status: string; data?: any; message?: string }>;
    confirmQuota: (subscriptionId: string) => Promise<boolean>;
    rollbackQuota: (subscriptionId: string) => Promise<boolean>;
    confirmReservation: (reservationId: string) => Promise<void>;
    rollbackReservation: (reservationId: string, reason: string) => Promise<void>;
  }): Promise<TransactionResult<{ status: string; data?: any; message?: string }>> {
    let subscriptionId: string | null = null;
    let reservationId: string | null = null;

    const steps: TransactionStep[] = [
      {
        name: 'reserve_quota',
        execute: async () => {
          const result = await params.reserveQuota();
          subscriptionId = result.subscriptionId;
          if (!subscriptionId) {
            throw new Error('Quota reservation failed - no active subscription');
          }
          return { subscriptionId };
        },
        rollback: async () => {
          if (subscriptionId) {
            await params.rollbackQuota(subscriptionId);
          }
        },
      },
      {
        name: 'create_reservation',
        execute: async () => {
          if (!subscriptionId) throw new Error('No subscription ID');
          const result = await params.createReservation(subscriptionId);
          reservationId = result.reservationId;
          return { reservationId };
        },
        rollback: async () => {
          if (reservationId) {
            await params.rollbackReservation(reservationId, 'transaction_rollback');
          }
        },
      },
      {
        name: 'verify_slip',
        execute: params.verifySlip,
      },
      {
        name: 'finalize_quota',
        execute: async () => {
          if (!subscriptionId) throw new Error('No subscription ID');
          if (!reservationId) throw new Error('No reservation ID');
          await params.confirmQuota(subscriptionId);
          await params.confirmReservation(reservationId);
          return { finalized: true };
        },
      },
    ];

    return this.executeTransaction(
      `slip:${params.messageId}`,
      steps,
      {
        lockKey: `slip:${params.lineAccountId}:${params.messageId}`,
        lockTtlSeconds: 300, // 5 minutes for slip verification
        timeoutMs: 120000, // 2 minute timeout
      },
    );
  }

  /**
   * Safely execute an operation with idempotency check
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    operation: () => Promise<T>,
    options: {
      ttlSeconds?: number;
      forceExecute?: boolean;
    } = {},
  ): Promise<OperationResult<T>> {
    const { ttlSeconds = 86400, forceExecute = false } = options;
    const cacheKey = `idempotent:${idempotencyKey}`;

    // Check if operation was already executed
    if (!forceExecute) {
      const existing = await this.redisService.getJson<{ result: T; timestamp: number }>(cacheKey);
      if (existing) {
        this.logger.debug(`Returning cached result for idempotent key: ${idempotencyKey}`);
        return this.errorHandler.success(existing.result);
      }
    }

    try {
      const result = await operation();
      
      // Cache the result
      await this.redisService.setJson(cacheKey, {
        result,
        timestamp: Date.now(),
      }, ttlSeconds);

      return this.errorHandler.success(result);
    } catch (error) {
      this.errorHandler.logError('IdempotentOperation', error as Error, { idempotencyKey });
      return this.errorHandler.error(ErrorCode.INTERNAL_ERROR, {
        message: (error as Error).message,
      });
    }
  }

  /**
   * Execute operation with circuit breaker pattern
   */
  async executeWithCircuitBreaker<T>(
    serviceKey: string,
    operation: () => Promise<T>,
    options: {
      failureThreshold?: number;
      resetTimeMs?: number;
      fallback?: () => T | Promise<T>;
    } = {},
  ): Promise<OperationResult<T>> {
    const { failureThreshold = 5, resetTimeMs = 30000, fallback } = options;
    const stateKey = `circuit:${serviceKey}`;

    // Check circuit state
    const state = await this.redisService.getJson<{
      failures: number;
      lastFailure: number;
      open: boolean;
    }>(stateKey);

    if (state?.open) {
      // Check if reset time has passed
      if (Date.now() - state.lastFailure < resetTimeMs) {
        this.logger.warn(`Circuit breaker open for ${serviceKey}`);
        if (fallback) {
          const fallbackResult = await fallback();
          return this.errorHandler.success(fallbackResult);
        }
        return this.errorHandler.error(ErrorCode.INTERNAL_ERROR, {
          message: 'Service temporarily unavailable',
        });
      }
      
      // Reset circuit to half-open state
      await this.redisService.setJson(stateKey, {
        failures: 0,
        lastFailure: 0,
        open: false,
      }, 3600);
    }

    try {
      const result = await operation();
      
      // Success - reset failure count
      if (state && state.failures > 0) {
        await this.redisService.setJson(stateKey, {
          failures: 0,
          lastFailure: 0,
          open: false,
        }, 3600);
      }

      return this.errorHandler.success(result);
    } catch (error) {
      const currentFailures = (state?.failures || 0) + 1;
      const shouldOpen = currentFailures >= failureThreshold;

      await this.redisService.setJson(stateKey, {
        failures: currentFailures,
        lastFailure: Date.now(),
        open: shouldOpen,
      }, 3600);

      this.logger.warn(
        `Circuit breaker failure ${currentFailures}/${failureThreshold} for ${serviceKey}`,
      );

      if (shouldOpen) {
        this.logger.error(`Circuit breaker opened for ${serviceKey}`);
      }

      if (fallback) {
        const fallbackResult = await fallback();
        return this.errorHandler.success(fallbackResult);
      }

      return this.errorHandler.error(ErrorCode.INTERNAL_ERROR, {
        message: (error as Error).message,
      });
    }
  }
}
