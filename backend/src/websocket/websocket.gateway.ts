import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebsocketService } from './websocket.service';
import { AuthService } from '../auth/auth.service';

@WebSocketGateway({
  cors: {
    origin: (requestOrigin, callback) => {
      // SECURITY: Validate origin against allowed domains
      // Allow requests without Origin header (server-to-server, health checks)
      if (!requestOrigin) {
        return callback(null, true);
      }

      // Validate origin format to prevent header injection
      try {
        const url = new URL(requestOrigin);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return callback(new Error('Invalid origin protocol'), false);
        }
      } catch {
        return callback(new Error('Invalid origin format'), false);
      }

      // Allow Railway domains (production)
      if (requestOrigin.endsWith('.railway.app') || requestOrigin === 'https://railway.app') {
        return callback(null, true);
      }

      // Allow production domains
      if (requestOrigin === 'https://dooslip.com' || requestOrigin.endsWith('.dooslip.com')) {
        return callback(null, true);
      }

      // Allow localhost for development
      if (requestOrigin.startsWith('http://localhost:') || requestOrigin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }

      // Check custom CORS_ORIGINS env var (exact match only, no wildcards)
      const allowed = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
      if (allowed.includes(requestOrigin)) {
        return callback(null, true);
      }

      // Reject unknown origins
      console.warn(`WebSocket CORS rejected origin: ${requestOrigin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  },
  namespace: '/ws',
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  // Throttle "adapter not ready" warnings - only log once per 60 seconds
  private lastAdapterWarningTime = 0;
  private readonly ADAPTER_WARNING_THROTTLE_MS = 60000;

  // Track connected clients by bankAccountId for direct messaging
  private bankAccountClients: Map<string, Set<string>> = new Map();

  constructor(
    private websocketService: WebsocketService,
    private authService: AuthService,
  ) { }

  /**
   * Get all connected socket IDs
   */
  private getAllConnectedSockets(): string[] {
    if (!this.server?.sockets?.sockets) return [];
    return Array.from(this.server.sockets.sockets.keys());
  }

  /**
   * Broadcast critical auto-slip events with fallback to all clients
   * Use this for important events that MUST reach the frontend
   */
  private broadcastCriticalAutoSlipEvent(
    bankAccountId: string,
    userId: string,
    event: string,
    data: any,
  ): void {
    // Strategy 1: Broadcast to user room
    this.broadcastToUser(userId, event, data);

    // Strategy 2: Broadcast to bank account room
    this.broadcastToRoom(`bank-account:${bankAccountId}`, event, data);

    // Strategy 3: Broadcast to admins
    this.broadcastToAdmins(event, data);

    // Strategy 4: If no clients in rooms, broadcast to ALL connected clients
    // This is a fallback for when Redis is down or rooms aren't working
    const userRoomSize = this.server?.sockets?.adapter?.rooms?.get(`user:${userId}`)?.size || 0;
    const bankRoomSize = this.server?.sockets?.adapter?.rooms?.get(`bank-account:${bankAccountId}`)?.size || 0;

    if (userRoomSize === 0 && bankRoomSize === 0) {
      this.logger.warn(`[CriticalBroadcast] No clients in rooms for ${bankAccountId}, broadcasting to ALL clients`);
      this.server?.emit(event, data);
    }

    this.logger.log(`[CriticalBroadcast] Event: ${event}, BankAccount: ${bankAccountId}, UserRoom: ${userRoomSize}, BankRoom: ${bankRoomSize}`);
  }

  /**
   * Check if there are any connected clients
   */
  hasConnectedClients(): boolean {
    return this.websocketService.getConnectedClients() > 0;
  }

  /**
   * Get count of connected clients
   */
  getConnectedClientCount(): number {
    return this.websocketService.getConnectedClients();
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.websocketService.addClient(client);

    // Auto-authenticate from session_id cookie (httpOnly)
    // This allows clients to join rooms automatically without explicit 'join' message
    const sessionId = this.getSessionIdFromCookie(client);
    if (sessionId) {
      try {
        const session = await this.authService.validateSession(sessionId);
        if (session) {
          this.websocketService.setClientUser(client.id, session.userId, session.role);
          client.join(`user:${session.userId}`);
          if (session.role === 'admin') {
            client.join('admins');
            this.logger.log(`Client ${client.id} auto-joined admins room via cookie (user: ${session.userId})`);
          }
        }
      } catch {
        // Cookie invalid — client can still join via 'join' event later
      }
    }
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.websocketService.removeClient(client.id);
  }

  /**
   * Extract session_id from handshake cookies (httpOnly cookie)
   */
  private getSessionIdFromCookie(client: Socket): string | null {
    const cookieHeader = client.handshake?.headers?.cookie;
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)session_id=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; role: string; sessionId?: string },
  ) {
    // SECURITY: Authenticate via sessionId (message body) OR session_id cookie (httpOnly)
    // Priority: explicit sessionId > cookie
    const sessionId = data.sessionId || this.getSessionIdFromCookie(client);

    if (sessionId) {
      try {
        const session = await this.authService.validateSession(sessionId);
        if (session) {
          // Use verified session data — never trust client-supplied userId/role
          this.websocketService.setClientUser(client.id, session.userId, session.role);
          client.join(`user:${session.userId}`);
          if (session.role === 'admin') {
            client.join('admins');
            this.logger.log(`Client ${client.id} joined admins room (user: ${session.userId})`);
          }
          return { success: true, verified: true };
        }
      } catch (error) {
        this.logger.warn(`Session validation failed for client ${client.id}`);
      }
    }

    // No valid session — do NOT join any rooms
    this.logger.warn(`Client ${client.id} attempted join without valid session (no sessionId or cookie)`);
    return { success: false, verified: false, message: 'Valid session required' };
  }

  /**
   * Helper: check if a client has been verified via the join handler
   */
  private isClientVerified(clientId: string): boolean {
    return this.websocketService.isClientVerified(clientId);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string },
  ) {
    // SECURITY: Require verified session before subscribing to channels
    if (!this.isClientVerified(client.id)) {
      this.logger.warn(`[Subscribe] Rejected unverified client ${client.id} from "${data.channel}"`);
      return { success: false, message: 'Authentication required. Call join with sessionId first.' };
    }

    client.join(data.channel);

    // Get current room member count
    const roomSockets = this.server?.sockets?.adapter?.rooms?.get(data.channel);
    const memberCount = roomSockets ? roomSockets.size : 0;

    this.logger.log(`[Subscribe] Client ${client.id} joined "${data.channel}" (total members: ${memberCount})`);
    return { success: true, channel: data.channel, memberCount };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string },
  ) {
    client.leave(data.channel);
    this.logger.log(`Client ${client.id} unsubscribed from ${data.channel}`);
    return { success: true, channel: data.channel };
  }

  /**
   * Subscribe to a specific LINE account's chat for real-time updates
   */
  @SubscribeMessage('subscribe_chat')
  handleSubscribeChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lineAccountId: string },
  ) {
    // SECURITY: Require verified session
    if (!this.isClientVerified(client.id)) {
      this.logger.warn(`[SubscribeChat] Rejected unverified client ${client.id}`);
      return { success: false, message: 'Authentication required' };
    }

    const channel = `chat:${data.lineAccountId}`;
    client.join(channel);
    this.logger.log(`Client ${client.id} subscribed to chat: ${data.lineAccountId}`);
    return { success: true, channel };
  }

  /**
   * Subscribe to a bank account for auto-slip events (PIN, keys, status)
   */
  @SubscribeMessage('subscribe_bank_account')
  handleSubscribeBankAccount(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { bankAccountId: string },
  ) {
    // SECURITY: Require verified session
    if (!this.isClientVerified(client.id)) {
      this.logger.warn(`[SubscribeBankAccount] Rejected unverified client ${client.id}`);
      return { success: false, message: 'Authentication required' };
    }

    const channel = `bank-account:${data.bankAccountId}`;
    client.join(channel);
    this.logger.log(`Client ${client.id} subscribed to bank account: ${data.bankAccountId}`);
    return { success: true, channel };
  }

  /**
   * Unsubscribe from a bank account
   */
  @SubscribeMessage('unsubscribe_bank_account')
  handleUnsubscribeBankAccount(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { bankAccountId: string },
  ) {
    const channel = `bank-account:${data.bankAccountId}`;
    client.leave(channel);
    this.logger.log(`Client ${client.id} unsubscribed from bank account: ${data.bankAccountId}`);
    return { success: true, channel };
  }

  /**
   * Unsubscribe from a specific LINE account's chat
   */
  @SubscribeMessage('unsubscribe_chat')
  handleUnsubscribeChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lineAccountId: string },
  ) {
    const channel = `chat:${data.lineAccountId}`;
    client.leave(channel);
    this.logger.log(`Client ${client.id} unsubscribed from chat: ${data.lineAccountId}`);
    return { success: true, channel };
  }

  /**
   * Ping/pong for connection health check
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { event: 'pong', timestamp: Date.now() };
  }

  // Broadcast methods
  broadcastToAll(event: string, data: any) {
    if (!this.server) {
      this.logger.warn('[Broadcast] Server not initialized, cannot broadcast to all');
      return;
    }
    this.server.emit(event, data);
  }

  broadcastToRoom(room: string, event: string, data: any) {
    // Check if server is initialized
    if (!this.server) {
      this.logger.warn(`[Broadcast] Server not initialized, cannot broadcast to room ${room}`);
      return;
    }

    // Always log PIN broadcasts with full details for debugging
    if (data?.pinCode) {
      this.logger.log(`[Broadcast PIN] Room: ${room}, Event: ${event}, PIN: ${data.pinCode}, Status: ${data?.status}`);
    }

    // Check if sockets adapter is available
    if (!this.server.sockets?.adapter?.rooms) {
      // Throttle adapter warnings to reduce log spam
      const now = Date.now();
      if (now - this.lastAdapterWarningTime > this.ADAPTER_WARNING_THROTTLE_MS) {
        this.logger.warn(`[Broadcast] Sockets adapter not ready (throttled: 60s)`);
        this.lastAdapterWarningTime = now;
      }
      // Still try to broadcast - the room might exist
      this.server.to(room).emit(event, data);
      return;
    }

    // Get room member count for debugging
    const roomSockets = this.server.sockets.adapter.rooms.get(room);
    const memberCount = roomSockets ? roomSockets.size : 0;

    // Log room status for important events
    if (data?.pinCode || data?.status === 'pin_displayed') {
      this.logger.log(`[Broadcast PIN Detail] Room "${room}" has ${memberCount} client(s). Sending PIN event...`);
      // List socket IDs in the room for debugging
      if (roomSockets && memberCount > 0) {
        const socketIds = Array.from(roomSockets).join(', ');
        this.logger.log(`[Broadcast PIN Detail] Socket IDs in room: ${socketIds}`);
      } else {
        this.logger.warn(`[Broadcast PIN Detail] No clients subscribed to room "${room}" - PIN may not be received!`);
      }
    } else if (memberCount > 0) {
      this.logger.log(`[Broadcast] Room "${room}" has ${memberCount} members. Event: ${event}`);
    }

    this.server.to(room).emit(event, data);
  }

  broadcastToUser(userId: string, event: string, data: any) {
    if (!this.server) {
      this.logger.warn(`[Broadcast] Server not initialized, cannot broadcast to user ${userId}`);
      return;
    }
    this.server.to(`user:${userId}`).emit(event, data);
  }

  broadcastToAdmins(event: string, data: any) {
    if (!this.server) {
      this.logger.warn('[Broadcast] Server not initialized, cannot broadcast to admins');
      return;
    }

    // Check if sockets adapter is available
    if (!this.server.sockets?.adapter?.rooms) {
      // Throttle adapter warnings to reduce log spam
      const now = Date.now();
      if (now - this.lastAdapterWarningTime > this.ADAPTER_WARNING_THROTTLE_MS) {
        this.logger.warn(`[Broadcast] Sockets adapter not ready (throttled: 60s)`);
        this.lastAdapterWarningTime = now;
      }
      this.server.to('admins').emit(event, data);
      return;
    }

    const roomSockets = this.server.sockets.adapter.rooms.get('admins');
    const memberCount = roomSockets ? roomSockets.size : 0;

    // Only log when there are admins connected (reduce spam)
    if (memberCount > 0) {
      this.logger.log(`[Broadcast] Admins: ${memberCount} connected. Event: ${event}`);
    }
    this.server.to('admins').emit(event, data);
  }

  // ============================================
  // Orchestrator Events (Auto-Relogin Loop)
  // ============================================

  /**
   * Broadcast orchestrator status to all admins (every 5 seconds)
   */
  @OnEvent('orchestrator.status_broadcast')
  handleOrchestratorStatusBroadcast(payload: {
    timestamp: Date;
    sessions: Array<{
      lineAccountId: string;
      name: string;
      keysStatus: string;
      loginStatus: string;
      pinCode?: string;
      needsRelogin: boolean;
    }>;
    stats: Record<string, unknown>;
  }) {
    this.broadcastToAdmins('orchestrator:status', payload);
  }

  /**
   * Broadcast when a session's keys are expiring soon
   */
  @OnEvent('session.expiring_soon')
  handleSessionExpiringSoon(payload: {
    lineAccountId: string;
    sessionId: string;
    name: string;
    expiresIn: number;
  }) {
    this.logger.warn(`[Orchestrator] Session ${payload.name} expiring in ${payload.expiresIn}s`);
    this.broadcastToAdmins('orchestrator:session_expiring', payload);
  }

  /**
   * Broadcast when a session's keys have expired
   */
  @OnEvent('session.expired')
  handleSessionExpired(payload: {
    lineAccountId: string;
    sessionId: string;
    name: string;
  }) {
    this.logger.warn(`[Orchestrator] Session ${payload.name} expired`);
    this.broadcastToAdmins('orchestrator:session_expired', payload);
  }

  /**
   * Broadcast when auto-relogin starts for a session
   */
  @OnEvent('session.relogin_started')
  handleSessionReloginStarted(payload: {
    lineAccountId: string;
    sessionId: string;
    name: string;
    pinCode?: string;
  }) {
    this.logger.log(`[Orchestrator] Relogin started for ${payload.name}, PIN: ${payload.pinCode || 'N/A'}`);
    this.broadcastToAdmins('orchestrator:relogin_started', payload);
  }

  /**
   * Broadcast PIN update for a session
   */
  @OnEvent('session.pin_update')
  handleSessionPinUpdate(payload: {
    lineAccountId: string;
    sessionId: string;
    pinCode: string;
    pinStatus: string;
  }) {
    this.logger.log(`[Orchestrator] PIN update: ${payload.pinCode} (${payload.pinStatus})`);
    this.broadcastToAdmins('orchestrator:pin_update', payload);
  }

  /**
   * Broadcast when keys are successfully extracted
   */
  @OnEvent('session.keys_extracted')
  handleSessionKeysExtracted(payload: {
    lineAccountId: string;
    sessionId: string;
    name: string;
  }) {
    this.logger.log(`[Orchestrator] Keys extracted for ${payload.name}`);
    this.broadcastToAdmins('orchestrator:keys_extracted', payload);
  }

  /**
   * Broadcast PIN countdown update to specific account room
   * This keeps frontend countdown synchronized with server time
   */
  @OnEvent('session.pin_countdown')
  handleSessionPinCountdown(payload: {
    lineAccountId: string;
    pinCode: string;
    expiresIn: number;
    status: string;
    ageSeconds: number;
    isUsable: boolean;
    timestamp: Date;
  }) {
    // Broadcast to the specific account room for real-time countdown sync
    this.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:pin-countdown', payload);
  }

  /**
   * Broadcast when a PIN has expired
   * Frontend should clear the PIN and show notification
   */
  @OnEvent('session.pin_expired')
  handleSessionPinExpired(payload: {
    lineAccountId: string;
    reason: string;
    timestamp: Date;
  }) {
    this.logger.warn(`[Orchestrator] PIN expired for ${payload.lineAccountId}: ${payload.reason}`);
    // Broadcast to the specific account room
    this.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:pin-expired', payload);
    // Also broadcast to admins
    this.broadcastToAdmins('orchestrator:pin_expired', payload);
  }

  // ============================================
  // Account Alert Events
  // ============================================

  /**
   * Broadcast when a new account alert is created (non-deposit/withdraw transaction)
   */
  @OnEvent('account.new-alert')
  handleNewAlert(payload: {
    lineAccountId: string;
    ownerId?: string;
    transactionType: string;
    amount?: number;
    text?: string;
  }) {
    this.logger.log(`[AccountAlert] New alert for ${payload.lineAccountId}: ${payload.transactionType}`);
    this.broadcastToAdmins('account:new-alert', payload);
    // Also broadcast to the specific user who owns this session
    if (payload.ownerId) {
      this.broadcastToUser(payload.ownerId, 'account:new-alert', payload);
    }
  }

  // ============================================
  // Auto-Slip Extraction Events
  // ============================================

  /**
   * Broadcast when bank account status changes
   */
  @OnEvent('bank.status_changed')
  handleBankStatusChanged(payload: {
    bankAccountId: string;
    userId: string;
    previousStatus: string;
    newStatus: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
  }) {
    this.logger.log(`[AutoSlip] Bank ${payload.bankAccountId}: ${payload.previousStatus} → ${payload.newStatus}`);
    // Broadcast to the specific user
    this.broadcastToUser(payload.userId, 'auto-slip:status_changed', payload);
    // Broadcast to admins
    this.broadcastToAdmins('auto-slip:status_changed', payload);
    // Also broadcast to the bank account room for direct listeners
    this.broadcastToRoom(`bank-account:${payload.bankAccountId}`, 'auto-slip:status_changed', payload);
  }

  /**
   * Broadcast when PIN is required for bank login
   * CRITICAL EVENT - uses fallback broadcast to ensure delivery
   */
  @OnEvent('bank.pin_required')
  handleBankPinRequired(payload: {
    bankAccountId: string;
    userId: string;
    pinCode: string;
    displayedAt: Date;
    expiresAt: Date;
    status: string;
  }) {
    this.logger.log(`[AutoSlip] ⚡ PIN REQUIRED for bank ${payload.bankAccountId}: ${payload.pinCode}`);

    // Use critical broadcast with fallback
    this.broadcastCriticalAutoSlipEvent(
      payload.bankAccountId,
      payload.userId,
      'auto-slip:pin_required',
      payload,
    );
  }

  /**
   * Broadcast when PIN is cleared (login success or timeout)
   * CRITICAL EVENT - tells frontend to stop countdown
   */
  @OnEvent('bank.pin_cleared')
  handleBankPinCleared(payload: {
    bankAccountId: string;
    userId: string;
    reason: 'success' | 'timeout' | 'cancelled';
    timestamp: Date;
  }) {
    this.logger.log(`[AutoSlip] ⚡ PIN CLEARED for bank ${payload.bankAccountId}: ${payload.reason}`);

    // Use critical broadcast with fallback
    this.broadcastCriticalAutoSlipEvent(
      payload.bankAccountId,
      payload.userId,
      'auto-slip:pin_cleared',
      payload,
    );
  }

  /**
   * Broadcast when keys are successfully extracted
   * CRITICAL EVENT - tells frontend login is complete
   */
  @OnEvent('bank.keys_extracted')
  handleBankKeysExtracted(payload: {
    bankAccountId: string;
    userId: string;
    extractedAt: Date;
    source: string;
  }) {
    this.logger.log(`[AutoSlip] ✅ KEYS EXTRACTED for bank ${payload.bankAccountId}`);

    // Use critical broadcast for keys_extracted
    this.broadcastCriticalAutoSlipEvent(
      payload.bankAccountId,
      payload.userId,
      'auto-slip:keys_extracted',
      payload,
    );

    // IMPORTANT: Also emit login_complete to explicitly close PIN modal on frontend
    const loginCompletePayload = {
      ...payload,
      success: true,
      message: 'Login successful, keys extracted',
    };

    // Use critical broadcast for login_complete
    this.broadcastCriticalAutoSlipEvent(
      payload.bankAccountId,
      payload.userId,
      'auto-slip:login_complete',
      loginCompletePayload,
    );
  }

  /**
   * Broadcast when new transaction message is received
   * [FIX] Also forward to line-session:new-transaction for multi-account support
   */
  @OnEvent('bank.message_received')
  handleBankMessageReceived(payload: {
    bankAccountId: string;
    userId: string;
    type: 'deposit' | 'withdraw' | 'transfer';
    amount: number;
    balance?: number;
    messageId: string;
    transactionDate: Date;
    sessionId?: string;
    lineAccountId?: string;
  }) {
    this.logger.log(`[AutoSlip] Transaction ${payload.type}: ${payload.amount} for bank ${payload.bankAccountId}`);
    // Broadcast to the specific user
    this.broadcastToUser(payload.userId, 'auto-slip:message_received', payload);
    // Broadcast to admins
    this.broadcastToAdmins('auto-slip:message_received', payload);
    // Broadcast to bank account room
    this.broadcastToRoom(`bank-account:${payload.bankAccountId}`, 'auto-slip:message_received', payload);

    // [NEW] Forward to line-session:new-transaction for LINE Session page
    // This allows the frontend to receive real-time transaction updates per account
    const lineSessionPayload = {
      ...payload,
      event: 'new-transaction',
      timestamp: new Date(),
    };
    this.broadcastToUser(payload.userId, 'line-session:new-transaction', lineSessionPayload);
    this.broadcastToRoom(`bank-account:${payload.bankAccountId}`, 'line-session:new-transaction', lineSessionPayload);

    // If sessionId or lineAccountId is provided, also broadcast to those rooms
    if (payload.sessionId) {
      this.broadcastToRoom(`line-account:${payload.sessionId}`, 'line-session:new-transaction', lineSessionPayload);
    }
    if (payload.lineAccountId) {
      this.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:new-transaction', lineSessionPayload);
    }
  }

  /**
   * Broadcast when balance is updated
   */
  @OnEvent('bank.balance_updated')
  handleBankBalanceUpdated(payload: {
    bankAccountId: string;
    userId: string;
    previousBalance: number;
    newBalance: number;
    timestamp: Date;
  }) {
    this.logger.log(`[AutoSlip] Balance updated for bank ${payload.bankAccountId}: ${payload.newBalance}`);
    // Broadcast to the specific user
    this.broadcastToUser(payload.userId, 'auto-slip:balance_updated', payload);
  }

  // ============================================
  // LINE Session Message Fetch Events
  // ============================================

  /**
   * Broadcast when messages are fetched from LINE API
   * This is emitted by MessageFetchService after fetching messages
   */
  @OnEvent('line-session.messages-fetched')
  handleLineSessionMessagesFetched(payload: {
    lineAccountId: string;
    messageCount: number;
    newMessages: number;
    occurredAt?: Date;
  }) {
    // Always log for debugging
    this.logger.log(`[LineSession] Messages fetched: ${payload.newMessages} new, ${payload.messageCount} total for ${payload.lineAccountId}`);

    // Only broadcast if there are new messages
    if (payload.newMessages > 0) {
      const eventData = {
        type: 'new_transaction',
        lineSessionId: payload.lineAccountId,
        newCount: payload.newMessages,
        total: payload.messageCount,
        timestamp: payload.occurredAt || new Date(),
      };

      // Broadcast to the specific LINE account room
      this.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:new-transaction', eventData);

      // Also broadcast to user room (fallback)
      this.broadcastToAll('line-session:new-transaction', eventData);

      this.logger.log(`[LineSession] Broadcasted new-transaction event to line-account:${payload.lineAccountId}`);
    }
  }

  /**
   * Broadcast when auto-fetch batch completes
   * This is emitted by MessageFetchService after fetching all accounts
   */
  @OnEvent('line-session.auto-fetch-batch-completed')
  handleAutoFetchBatchCompleted(payload: {
    sessionsCount: number;
    successCount: number;
    newMessagesTotal: number;
    occurredAt?: Date;
  }) {
    if (payload.newMessagesTotal > 0) {
      this.logger.log(`[LineSession] Auto-fetch batch: ${payload.successCount}/${payload.sessionsCount} success, ${payload.newMessagesTotal} new messages`);

      const eventData = {
        type: 'batch_completed',
        sessionsCount: payload.sessionsCount,
        successCount: payload.successCount,
        newMessagesTotal: payload.newMessagesTotal,
        timestamp: payload.occurredAt || new Date(),
      };

      // Broadcast to admins
      this.broadcastToAdmins('line-session:auto-fetch-completed', eventData);
    }
  }

  /**
   * Broadcast when a single transaction is detected
   * This is emitted by MessageFetchService when processing a new transaction
   */
  @OnEvent('line-session.new-transaction')
  handleLineSessionNewTransaction(payload: {
    lineAccountId: string;
    transactionType: string;
    amount?: number;
    balance?: number;
    occurredAt?: Date;
  }) {
    this.logger.log(`[LineSession] New transaction: ${payload.transactionType} ${payload.amount || ''} for ${payload.lineAccountId}`);

    const eventData = {
      type: 'transaction',
      lineSessionId: payload.lineAccountId,
      transactionType: payload.transactionType,
      amount: payload.amount,
      balance: payload.balance,
      timestamp: payload.occurredAt || new Date(),
    };

    // Broadcast to the specific LINE account room
    this.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:new-transaction', eventData);
  }

  /**
   * Broadcast when error occurs on bank account
   * CRITICAL EVENT - tells frontend login failed
   */
  @OnEvent('bank.error')
  handleBankError(payload: {
    bankAccountId: string;
    userId: string;
    error: string;
    errorCode?: string;
    timestamp: Date;
  }) {
    this.logger.warn(`[AutoSlip] ❌ ERROR for bank ${payload.bankAccountId}: ${payload.error}`);

    // Use critical broadcast for error
    this.broadcastCriticalAutoSlipEvent(
      payload.bankAccountId,
      payload.userId,
      'auto-slip:error',
      payload,
    );
  }
}
