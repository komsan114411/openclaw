import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { DomainEvent, EventName } from './domain-events';

/**
 * Event Handler Type
 * A function that handles a specific domain event
 */
export type EventHandler<T extends DomainEvent> = (event: T) => void | Promise<void>;

/**
 * Event Bus Service
 *
 * Central event bus for publishing and subscribing to domain events.
 * This decouples modules by allowing them to communicate through events
 * instead of direct imports.
 *
 * Features:
 * - Type-safe event publishing and subscribing
 * - Async event handling
 * - Error isolation (one handler error doesn't affect others)
 * - Event logging for debugging
 * - Memory cleanup on module destroy
 *
 * Usage:
 * ```typescript
 * // Publishing an event
 * this.eventBus.publish({
 *   eventName: 'payment.completed',
 *   occurredAt: new Date(),
 *   paymentId: '123',
 *   userId: 'user-1',
 *   amount: 1000,
 *   packageId: 'pkg-1',
 *   paymentMethod: 'bank_transfer',
 * });
 *
 * // Subscribing to an event
 * this.eventBus.subscribe('payment.completed', async (event) => {
 *   await this.activateSubscription(event.userId, event.packageId);
 * });
 * ```
 */
@Injectable()
export class EventBusService implements OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private readonly emitter = new EventEmitter();
  private readonly handlers = new Map<string, Set<EventHandler<DomainEvent>>>();

  constructor() {
    // Increase max listeners to avoid warnings with many subscribers
    this.emitter.setMaxListeners(100);
    this.logger.log('EventBus initialized');
  }

  /**
   * Publish a domain event
   *
   * All registered handlers for this event will be called asynchronously.
   * Errors in handlers are caught and logged, but don't affect other handlers.
   *
   * @param event The domain event to publish
   */
  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const eventName = event.eventName;
    const handlerCount = this.emitter.listenerCount(eventName);

    this.logger.debug(
      `Publishing event: ${eventName} (${handlerCount} handlers)`,
    );

    // Emit the event
    this.emitter.emit(eventName, event);

    // Also emit a wildcard event for global listeners
    this.emitter.emit('*', event);
  }

  /**
   * Subscribe to a domain event
   *
   * The handler will be called whenever an event with the specified name is published.
   * Handlers are called asynchronously and errors are isolated.
   *
   * @param eventName The name of the event to subscribe to
   * @param handler The function to call when the event is published
   * @returns A function to unsubscribe
   */
  subscribe<T extends DomainEvent>(
    eventName: EventName | '*',
    handler: EventHandler<T>,
  ): () => void {
    // Wrap handler to catch errors
    const safeHandler = async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(
          `Error in handler for ${eventName}: ${error instanceof Error ? error.message : error}`,
        );
      }
    };

    // Register the handler
    this.emitter.on(eventName, safeHandler);

    // Track handlers for cleanup
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)?.add(safeHandler as EventHandler<DomainEvent>);

    this.logger.debug(`Subscribed to event: ${eventName}`);

    // Return unsubscribe function
    return () => {
      this.emitter.off(eventName, safeHandler);
      this.handlers.get(eventName)?.delete(safeHandler as EventHandler<DomainEvent>);
      this.logger.debug(`Unsubscribed from event: ${eventName}`);
    };
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first call)
   *
   * @param eventName The name of the event to subscribe to
   * @param handler The function to call when the event is published
   */
  subscribeOnce<T extends DomainEvent>(
    eventName: EventName,
    handler: EventHandler<T>,
  ): void {
    const safeHandler = async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(
          `Error in once handler for ${eventName}: ${error instanceof Error ? error.message : error}`,
        );
      }
    };

    this.emitter.once(eventName, safeHandler);
    this.logger.debug(`Subscribed once to event: ${eventName}`);
  }

  /**
   * Get the number of handlers for an event
   *
   * @param eventName The name of the event
   * @returns The number of registered handlers
   */
  getHandlerCount(eventName: EventName | '*'): number {
    return this.emitter.listenerCount(eventName);
  }

  /**
   * Remove all handlers for an event
   *
   * @param eventName The name of the event
   */
  removeAllHandlers(eventName: EventName): void {
    this.emitter.removeAllListeners(eventName);
    this.handlers.delete(eventName);
    this.logger.debug(`Removed all handlers for event: ${eventName}`);
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
    this.handlers.clear();
    this.logger.log('EventBus destroyed');
  }
}
