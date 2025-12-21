import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

interface ClientInfo {
  socket: Socket;
  userId?: string;
  role?: string;
}

@Injectable()
export class WebsocketService {
  private readonly logger = new Logger(WebsocketService.name);
  private clients: Map<string, ClientInfo> = new Map();

  addClient(socket: Socket) {
    this.clients.set(socket.id, { socket });
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  setClientUser(clientId: string, userId: string, role: string) {
    const client = this.clients.get(clientId);
    if (client) {
      client.userId = userId;
      client.role = role;
    }
  }

  getClientByUserId(userId: string): ClientInfo | undefined {
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        return client;
      }
    }
    return undefined;
  }

  getConnectedClients(): number {
    return this.clients.size;
  }

  getAdminClients(): ClientInfo[] {
    return Array.from(this.clients.values()).filter(
      (client) => client.role === 'admin',
    );
  }

  sendToUser(userId: string, event: string, data: any) {
    const client = this.getClientByUserId(userId);
    if (client) {
      client.socket.emit(event, data);
    }
  }

  sendToAllAdmins(event: string, data: any) {
    for (const client of this.clients.values()) {
      if (client.role === 'admin') {
        client.socket.emit(event, data);
      }
    }
  }
}
