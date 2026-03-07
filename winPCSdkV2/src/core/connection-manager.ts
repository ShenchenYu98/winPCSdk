import { createSkillSdkError, ERROR_CODE } from '../errors';
import type {
  ConnectionPolicy,
  SessionContext,
  SocketFactory,
  SocketLike,
  StreamMessage,
} from '../types';

interface SessionConnection {
  sessionId: string;
  socket: SocketLike;
  retryCount: number;
  intentionalClose: boolean;
  heartbeatTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  connectedAt?: number;
}

export interface ConnectionManagerCallbacks {
  onConnecting(sessionId: string): void;
  onOpen(sessionId: string): void;
  onMessage(sessionId: string, message: StreamMessage): void;
  onError(sessionId: string, error: ReturnType<typeof createSkillSdkError>): void;
  onClose(sessionId: string, reason: string): void;
  onReconnect(sessionId: string): void;
}

export class ConnectionManager {
  private readonly connections = new Map<string, SessionConnection>();

  constructor(
    private readonly wsBaseUrl: string,
    private readonly policy: ConnectionPolicy,
    private readonly socketFactory: SocketFactory,
    private readonly callbacks: ConnectionManagerCallbacks,
  ) {}

  ensureConnection(session: SessionContext): void {
    const existing = this.connections.get(session.id);
    if (
      existing &&
      (existing.socket.readyState === 0 || existing.socket.readyState === 1)
    ) {
      return;
    }

    this.connect(session.id, existing?.retryCount ?? 0);
  }

  closeSession(sessionId: string, reason = 'closed by SDK'): void {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      return;
    }

    connection.intentionalClose = true;
    this.clearTimers(connection);
    try {
      connection.socket.close(1000, reason);
    } catch {
      // No-op.
    }
    this.connections.delete(sessionId);
    this.callbacks.onClose(sessionId, reason);
  }

  closeAll(reason = 'closeSkill'): void {
    for (const sessionId of this.connections.keys()) {
      this.closeSession(sessionId, reason);
    }
  }

  connectionCount(): number {
    return this.connections.size;
  }

  private connect(sessionId: string, retryCount: number): void {
    const socketUrl = `${this.wsBaseUrl.replace(/\/+$/, '')}/ws/skill/stream?sessionId=${encodeURIComponent(sessionId)}`;
    const socket = this.socketFactory(socketUrl);

    const connection: SessionConnection = {
      sessionId,
      socket,
      retryCount,
      intentionalClose: false,
      heartbeatTimer: null,
      reconnectTimer: null,
      connectedAt: undefined,
    };

    this.connections.set(sessionId, connection);
    this.callbacks.onConnecting(sessionId);

    socket.onopen = () => {
      connection.retryCount = 0;
      connection.connectedAt = Date.now();
      this.callbacks.onOpen(sessionId);
      this.startHeartbeat(connection);
    };

    socket.onmessage = (event) => {
      const parsed = this.parseMessage(event.data, sessionId);
      if (!parsed) {
        return;
      }
      this.callbacks.onMessage(sessionId, parsed);
    };

    socket.onerror = (event) => {
      this.callbacks.onError(
        sessionId,
        createSkillSdkError({
          code: ERROR_CODE.WS_ERROR,
          message: event?.message ?? 'WebSocket error',
          source: 'WS',
          sessionId,
          retriable: true,
        }),
      );
    };

    socket.onclose = (event) => {
      this.clearTimers(connection);
      if (connection.intentionalClose) {
        this.connections.delete(sessionId);
        return;
      }

      this.callbacks.onClose(sessionId, event.reason ?? 'WebSocket closed');
      if (connection.retryCount >= this.policy.maxRetryCount) {
        this.connections.delete(sessionId);
        this.callbacks.onError(
          sessionId,
          createSkillSdkError({
            code: ERROR_CODE.CONNECTION_UNAVAILABLE,
            message: 'Reconnect attempts exceeded',
            source: 'WS',
            sessionId,
            retriable: false,
          }),
        );
        return;
      }

      const nextRetryCount = connection.retryCount + 1;
      const backoff = Math.min(
        this.policy.backoffInitialMs * 2 ** connection.retryCount,
        this.policy.backoffMaxMs,
      );

      connection.retryCount = nextRetryCount;
      connection.reconnectTimer = setTimeout(() => {
        this.callbacks.onReconnect(sessionId);
        this.connect(sessionId, nextRetryCount);
      }, backoff);
    };
  }

  private startHeartbeat(connection: SessionConnection): void {
    this.clearHeartbeat(connection);
    connection.heartbeatTimer = setInterval(() => {
      if (connection.socket.readyState !== 1) {
        return;
      }
      try {
        connection.socket.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
      } catch {
        // No-op.
      }
    }, this.policy.heartbeatIntervalMs);
  }

  private clearHeartbeat(connection: SessionConnection): void {
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
      connection.heartbeatTimer = null;
    }
  }

  private clearTimers(connection: SessionConnection): void {
    this.clearHeartbeat(connection);
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = null;
    }
  }

  private parseMessage(rawData: unknown, fallbackSessionId: string): StreamMessage | null {
    if (typeof rawData !== 'string') {
      return null;
    }

    try {
      const parsed = JSON.parse(rawData) as Partial<StreamMessage>;
      if (!parsed.type || typeof parsed.type !== 'string') {
        return null;
      }

      return {
        sessionId: parsed.sessionId ?? fallbackSessionId,
        type: parsed.type as StreamMessage['type'],
        seq: typeof parsed.seq === 'number' ? parsed.seq : 0,
        content: typeof parsed.content === 'string' ? parsed.content : '',
        usage: parsed.usage,
      };
    } catch {
      return null;
    }
  }
}
