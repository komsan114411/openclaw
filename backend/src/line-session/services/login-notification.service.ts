import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { EnhancedLoginStatus } from './enhanced-automation.service';
import { RequestStatus } from './login-coordinator.service';
import { WorkerState } from './worker-pool.service';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';

/**
 * Login Notification Service
 *
 * Listens to login events and broadcasts them to clients via WebSocket.
 * This enables real-time status updates in the frontend.
 *
 * Events handled:
 * - enhanced-login.status: Detailed login status updates
 * - login.requested/started/completed/failed/cancelled: Coordinator events
 * - worker.stateChanged: Worker pool state changes
 */
@Injectable()
export class LoginNotificationService {
  private readonly logger = new Logger(LoginNotificationService.name);

  constructor(
    private readonly websocketGateway: WebsocketGateway,
    @InjectModel(LineSession.name)
    private readonly lineSessionModel: Model<LineSessionDocument>,
  ) {}

  /**
   * Handle enhanced login status updates
   */
  @OnEvent('enhanced-login.status')
  handleEnhancedLoginStatus(payload: {
    lineAccountId: string;
    status: EnhancedLoginStatus;
    timestamp: Date;
    requestId?: string;
    pinCode?: string;
    error?: string;
    keys?: { xLineAccess: string; xHmac: string };
    chatMid?: string;
    cUrlBash?: string;
  }) {
    this.logger.log(`[LoginNotification] Received status: ${payload.status} for ${payload.lineAccountId}${payload.pinCode ? ` with PIN ${payload.pinCode}` : ''}${payload.keys ? ' with keys' : ''}`);

    // Build user-friendly message
    const message = this.getStatusMessage(payload.status, payload.pinCode, payload.error);

    const eventData: Record<string, any> = {
      type: 'login_status',
      lineAccountId: payload.lineAccountId,
      status: payload.status,
      message,
      pinCode: payload.pinCode,
      error: payload.error,
      requestId: payload.requestId,
      timestamp: payload.timestamp,
    };

    // Include keys in success event so frontend can display them
    if (payload.status === EnhancedLoginStatus.SUCCESS && payload.keys) {
      eventData.keys = payload.keys;
      eventData.chatMid = payload.chatMid;
      this.logger.log(`[LoginNotification] Including keys in success event for ${payload.lineAccountId}`);
    }

    // Log PIN specifically for debugging
    if (payload.pinCode) {
      this.logger.log(`Broadcasting PIN ${payload.pinCode} for account ${payload.lineAccountId}`);
    }

    // CRITICAL: Only broadcast to specific account channel to prevent PIN mixing
    // DO NOT use broadcastToAll() as it causes PIN to show on wrong accounts
    this.websocketGateway.broadcastToRoom(
      `line-account:${payload.lineAccountId}`,
      'line-session:login-status',
      eventData,
    );

    // Also send to admins room (they should filter by lineAccountId on client)
    this.websocketGateway.broadcastToAdmins('line-session:login-status', eventData);

    // [FIX] For critical events, also broadcast to user's personal room
    // This ensures the event is received even when account room subscription fails
    // But NOT to ALL clients - that causes PIN mixing between accounts
    const criticalStatuses = [EnhancedLoginStatus.SUCCESS, EnhancedLoginStatus.PIN_DISPLAYED, EnhancedLoginStatus.FAILED];
    if (criticalStatuses.includes(payload.status)) {
      // Get owner ID from session and broadcast to their personal room
      this.getSessionOwner(payload.lineAccountId).then(ownerId => {
        if (ownerId) {
          this.logger.log(`[LoginNotification] Broadcasting critical event to user room: user:${ownerId}`);
          this.websocketGateway.broadcastToRoom(
            `user:${ownerId}`,
            'line-session:login-status',
            eventData,
          );
        }
      }).catch(err => {
        this.logger.warn(`[LoginNotification] Failed to get session owner: ${err.message}`);
      });
    }
  }

  /**
   * Get session owner ID
   * Tries finding by lineAccountId field first, then falls back to _id lookup
   * (user-created sessions may store lineAccountId as _id)
   */
  private async getSessionOwner(lineAccountId: string): Promise<string | null> {
    try {
      let session = await this.lineSessionModel.findOne({ lineAccountId }).select('ownerId').lean();
      if (!session) {
        // Fallback: try finding by _id (user-created sessions)
        try {
          session = await this.lineSessionModel.findById(lineAccountId).select('ownerId').lean();
        } catch {
          // Invalid ObjectId format, ignore
        }
      }
      return session?.ownerId?.toString() || null;
    } catch {
      return null;
    }
  }

  /**
   * Handle login requested
   */
  @OnEvent('login.requested')
  handleLoginRequested(payload: {
    requestId: string;
    lineAccountId: string;
    source: string;
  }) {
    this.logger.log(`Login requested: ${payload.lineAccountId} (${payload.source})`);

    const eventData = {
      type: 'login_requested',
      lineAccountId: payload.lineAccountId,
      source: payload.source,
      requestId: payload.requestId,
      message: 'Login request received',
      timestamp: new Date(),
    };
    // Send to specific account channel only
    this.websocketGateway.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:login-event', eventData);
    this.websocketGateway.broadcastToAdmins('line-session:login-event', eventData);
  }

  /**
   * Handle login started
   */
  @OnEvent('login.started')
  handleLoginStarted(payload: {
    requestId: string;
    lineAccountId: string;
  }) {
    this.logger.log(`Login started: ${payload.lineAccountId}`);

    const eventData = {
      type: 'login_started',
      lineAccountId: payload.lineAccountId,
      requestId: payload.requestId,
      message: 'Login process started',
      timestamp: new Date(),
    };
    this.websocketGateway.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:login-event', eventData);
    this.websocketGateway.broadcastToAdmins('line-session:login-event', eventData);
  }

  /**
   * Handle login completed - fetch keys and curl command
   */
  @OnEvent('login.completed')
  async handleLoginCompleted(payload: {
    requestId: string;
    lineAccountId: string;
  }) {
    this.logger.log(`Login completed: ${payload.lineAccountId}`);

    // Fetch session with keys and curl command
    const session = await this.lineSessionModel.findOne({
      lineAccountId: payload.lineAccountId,
      isActive: true,
    });

    const eventData = {
      type: 'login_completed',
      lineAccountId: payload.lineAccountId,
      requestId: payload.requestId,
      message: 'Login successful! Keys captured.',
      success: true,
      timestamp: new Date(),
      // Include keys info for real-time update
      keysInfo: session ? {
        hasKeys: !!(session.xLineAccess && session.xHmac),
        chatMid: session.chatMid,
        extractedAt: session.extractedAt,
        hasCurl: !!session.cUrlBash,
        status: session.status,
      } : null,
    };

    this.websocketGateway.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:login-event', eventData);
    this.websocketGateway.broadcastToAdmins('line-session:login-event', eventData);

    // Send detailed keys notification
    if (session && session.xLineAccess) {
      const keysEventData = {
        type: 'keys_captured',
        lineAccountId: payload.lineAccountId,
        message: 'Keys captured successfully! You can now use cURL command.',
        keys: {
          xLineAccess: session.xLineAccess.substring(0, 20) + '...', // Masked for security
          xHmac: session.xHmac?.substring(0, 20) + '...',
          chatMid: session.chatMid,
          extractedAt: session.extractedAt,
        },
        hasCurl: !!session.cUrlBash,
        timestamp: new Date(),
      };

      this.logger.log(`Keys captured notification sent for ${payload.lineAccountId}`);
      this.websocketGateway.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:keys-captured', keysEventData);
      this.websocketGateway.broadcastToAdmins('line-session:keys-captured', keysEventData);
    }
  }

  /**
   * Handle login failed
   */
  @OnEvent('login.failed')
  handleLoginFailed(payload: {
    requestId: string;
    lineAccountId: string;
    error: string;
    nextCooldownMs?: number;
  }) {
    this.logger.warn(`Login failed: ${payload.lineAccountId} - ${payload.error}`);

    const nextRetryIn = payload.nextCooldownMs
      ? Math.ceil(payload.nextCooldownMs / 1000)
      : null;

    const eventData = {
      type: 'login_failed',
      lineAccountId: payload.lineAccountId,
      requestId: payload.requestId,
      error: payload.error,
      message: `Login failed: ${payload.error}`,
      success: false,
      nextRetryIn,
      timestamp: new Date(),
    };
    this.websocketGateway.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:login-event', eventData);
    this.websocketGateway.broadcastToAdmins('line-session:login-event', eventData);
  }

  /**
   * Handle login cancelled
   */
  @OnEvent('login.cancelled')
  handleLoginCancelled(payload: { lineAccountId: string }) {
    this.logger.log(`Login cancelled: ${payload.lineAccountId}`);

    const eventData = {
      type: 'login_cancelled',
      lineAccountId: payload.lineAccountId,
      message: 'Login was cancelled',
      timestamp: new Date(),
    };
    this.websocketGateway.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:login-event', eventData);
    this.websocketGateway.broadcastToAdmins('line-session:login-event', eventData);
  }

  /**
   * Handle worker state changes
   */
  @OnEvent('worker.stateChanged')
  handleWorkerStateChanged(payload: {
    lineAccountId: string;
    state: WorkerState;
    pinCode?: string;
    hasKeys?: boolean;
    hasChatMid?: boolean;
    error?: string;
  }) {
    // Only broadcast significant state changes
    const significantStates = [
      WorkerState.WAITING_PIN,
      WorkerState.READY,
      WorkerState.ERROR,
      WorkerState.RECOVERING,
    ];

    if (!significantStates.includes(payload.state)) {
      return;
    }

    this.logger.log(`Worker state: ${payload.lineAccountId} -> ${payload.state}`);

    const eventData = {
      type: 'worker_state',
      lineAccountId: payload.lineAccountId,
      state: payload.state,
      pinCode: payload.pinCode,
      hasKeys: payload.hasKeys,
      hasChatMid: payload.hasChatMid,
      error: payload.error,
      timestamp: new Date(),
    };
    // CRITICAL: Only send to specific account channel to prevent PIN mixing
    this.websocketGateway.broadcastToRoom(`line-account:${payload.lineAccountId}`, 'line-session:worker-state', eventData);
    this.websocketGateway.broadcastToAdmins('line-session:worker-state', eventData);
  }

  /**
   * Get user-friendly status message (Thai)
   */
  private getStatusMessage(
    status: EnhancedLoginStatus,
    pinCode?: string,
    error?: string,
  ): string {
    switch (status) {
      case EnhancedLoginStatus.IDLE:
        return 'พร้อมใช้งาน';
      case EnhancedLoginStatus.REQUESTING:
        return 'กำลังส่งคำขอ...';
      case EnhancedLoginStatus.INITIALIZING:
        return 'กำลังเริ่มต้น...';
      case EnhancedLoginStatus.LAUNCHING_BROWSER:
        return 'กำลังเปิด Browser...';
      case EnhancedLoginStatus.LOADING_EXTENSION:
        return 'กำลังโหลด LINE Extension...';
      case EnhancedLoginStatus.CHECKING_SESSION:
        return 'กำลังตรวจสอบ Session...';
      case EnhancedLoginStatus.ENTERING_CREDENTIALS:
        return 'กำลังกรอกข้อมูลเข้าสู่ระบบ...';
      case EnhancedLoginStatus.WAITING_PIN:
        return 'รอการยืนยัน PIN...';
      case EnhancedLoginStatus.PIN_DISPLAYED:
        return pinCode
          ? `PIN: ${pinCode} - กรุณากรอกบน LINE App`
          : 'รอกรอก PIN บน LINE App';
      case EnhancedLoginStatus.VERIFYING:
        return 'กำลังตรวจสอบการเข้าสู่ระบบ...';
      case EnhancedLoginStatus.EXTRACTING_KEYS:
        return 'กำลังดึง Keys...';
      case EnhancedLoginStatus.TRIGGERING_MESSAGES:
        return 'กำลังดึงข้อมูล Chat...';
      case EnhancedLoginStatus.SUCCESS:
        return 'เข้าสู่ระบบสำเร็จ! Keys ถูกบันทึกแล้ว';
      case EnhancedLoginStatus.FAILED:
        return error ? `ล้มเหลว: ${error}` : 'เข้าสู่ระบบล้มเหลว';
      case EnhancedLoginStatus.COOLDOWN:
        return 'อยู่ในช่วง Cooldown กรุณารอสักครู่';
      default:
        return 'ไม่ทราบสถานะ';
    }
  }
}
