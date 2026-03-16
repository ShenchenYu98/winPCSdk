import { createSdkError } from "../errors";
import { normalizeStreamMessage } from "./eventNormalizer";
import { mapSessionStatus } from "./statusMapper";
import type {
  RegisterSessionListenerParams,
  SessionError,
  SessionStatusResult,
  StreamMessage,
  UnregisterSessionListenerParams
} from "../types";

export interface RealtimeConnection {
  connect(): Promise<void>;
  close(): void;
  send?(payload: string): void;
  setHandlers(handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string, details?: { reconnecting: boolean }) => void;
    onReconnect: () => void;
  }): void;
}

type Listener = RegisterSessionListenerParams;

export class StreamConnectionManager {
  private readonly listeners = new Map<string, Listener>();
  private readonly statusCallbacks = new Map<string, (result: SessionStatusResult) => void>();
  private connection: RealtimeConnection | null = null;
  private hasEverConnected = false;

  constructor(
    private readonly connectionFactory: () => RealtimeConnection,
    private readonly onStreamMessage: (message: StreamMessage) => void
  ) {}

  async ensureConnected(): Promise<void> {
    if (this.connection) {
      return;
    }

    this.connection = this.connectionFactory();
    this.connection.setHandlers({
      onMessage: (payload) => this.handleMessage(payload),
      onError: (error) => this.handleError(error),
      onClose: (reason, details) => this.handleClose(reason, details),
      onReconnect: () => this.handleReconnect()
    });
    await this.connection.connect();
    this.hasEverConnected = true;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  registerListener(listener: Listener): void {
    validateSessionId(listener.welinkSessionId);

    if (typeof listener.onMessage !== "function") {
      throw createSdkError(1000, "无效的参数: onMessage");
    }

    if (this.listeners.has(listener.welinkSessionId)) {
      return;
    }

    this.listeners.set(listener.welinkSessionId, listener);
  }

  unregisterListener(listener: UnregisterSessionListenerParams): void {
    validateSessionId(listener.welinkSessionId);

    if (!this.listeners.has(listener.welinkSessionId)) {
      throw createSdkError(4006, "监听器不存在");
    }

    this.listeners.delete(listener.welinkSessionId);
  }

  registerStatusCallback(sessionId: string, callback: (result: SessionStatusResult) => void): void {
    validateSessionId(sessionId);

    if (typeof callback !== "function") {
      throw createSdkError(1000, "无效的参数: callback");
    }

    if (!this.isConnected()) {
      throw createSdkError(3000, "未建立连接");
    }

    this.statusCallbacks.set(sessionId, callback);
  }

  emitStatus(sessionId: string, result: SessionStatusResult): void {
    this.statusCallbacks.get(sessionId)?.(result);
  }

  close(): void {
    this.connection?.close();
    this.connection = null;
  }

  reset(): void {
    this.close();
    this.listeners.clear();
    this.statusCallbacks.clear();
    this.hasEverConnected = false;
  }

  private handleMessage(payload: unknown): void {
    const message = normalizeStreamMessage(payload);
    this.onStreamMessage(message);

    const listener = this.listeners.get(message.welinkSessionId);

    if (listener) {
      listener.onMessage(message);
    }

    const status = mapSessionStatus(message);

    if (status) {
      this.emitStatus(message.welinkSessionId, { status });
    }
  }

  private handleError(error: Error): void {
    const sessionError: SessionError = {
      code: "STREAM_ERROR",
      message: error.message,
      timestamp: Date.now()
    };

    for (const listener of this.listeners.values()) {
      listener.onError?.(sessionError);
    }
  }

  private handleClose(reason: string, details?: { reconnecting: boolean }): void {
    for (const listener of this.listeners.values()) {
      listener.onClose?.(reason);
    }

    if (!details?.reconnecting) {
      this.connection = null;
    }
  }

  private handleReconnect(): void {
    this.sendResumeIfSupported();
  }

  private sendResumeIfSupported(): void {
    if (!this.hasEverConnected) {
      return;
    }

    try {
      this.connection?.send?.('{"action":"resume"}');
    } catch {
      // Ignore unsupported or temporarily unavailable send paths during recovery.
    }
  }
}

function validateSessionId(sessionId: string): void {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw createSdkError(1000, "无效的参数: welinkSessionId");
  }
}
