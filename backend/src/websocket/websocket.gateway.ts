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

  constructor(
    private websocketService: WebsocketService,
    private authService: AuthService,
  ) { }

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
    this.logger.log(`Client ${client.id} subscribed to ${data.channel}`);
    return { success: true, channel: data.channel };
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
    this.server.emit(event, data);
  }

  broadcastToRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }

  broadcastToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  broadcastToAdmins(event: string, data: any) {
    this.server.to('admins').emit(event, data);
  }
}
