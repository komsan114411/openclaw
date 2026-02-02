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

  constructor(
    private websocketService: WebsocketService,
    private authService: AuthService,
  ) { }

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
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.websocketService.removeClient(client.id);
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; role: string; sessionId?: string },
  ) {
    // SECURITY: Verify session before allowing admin room access
    if (data.sessionId) {
      try {
        const session = await this.authService.validateSession(data.sessionId);
        if (session) {
          // Use verified session data
          this.websocketService.setClientUser(client.id, session.userId, session.role);
          client.join(`user:${session.userId}`);
          if (session.role === 'admin') {
            client.join('admins');
          }
          return { success: true, verified: true };
        }
      } catch (error) {
        this.logger.warn(`Session validation failed for client ${client.id}`);
      }
    }

    // For unauthenticated: allow basic join but NOT admin room
    this.websocketService.setClientUser(client.id, data.userId, 'user');
    client.join(`user:${data.userId}`);
    // Do NOT allow joining 'admins' room without verified session

    return { success: true, verified: false };
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string },
  ) {
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
    const channel = `chat:${data.lineAccountId}`;
    client.join(channel);
    this.logger.log(`Client ${client.id} subscribed to chat: ${data.lineAccountId}`);
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
}
