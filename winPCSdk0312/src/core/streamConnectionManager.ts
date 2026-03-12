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
  setHandlers(handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string) => void;
  }): void;
}

type Listener = RegisterSessionListenerParams;

export class StreamConnectionManager {
  private readonly listeners = new Map<number, Listener>();
  private readonly statusCallbacks = new Map<number, Set<(result: SessionStatusResult) => void>>();
  private connection: RealtimeConnection | null = null;

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
      onClose: (reason) => this.handleClose(reason)
    });
    await this.connection.connect();
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

  registerStatusCallback(sessionId: number, callback: (result: SessionStatusResult) => void): void {
    validateSessionId(sessionId);

    if (typeof callback !== "function") {
      throw createSdkError(1000, "无效的参数: callback");
    }

    if (!this.isConnected()) {
      throw createSdkError(3000, "未建立连接");
    }

    const current = this.statusCallbacks.get(sessionId) ?? new Set<(result: SessionStatusResult) => void>();
    current.add(callback);
    this.statusCallbacks.set(sessionId, current);
  }

  emitStatus(sessionId: number, result: SessionStatusResult): void {
    for (const callback of this.statusCallbacks.get(sessionId) ?? []) {
      callback(result);
    }
  }

  close(): void {
    this.connection?.close();
    this.connection = null;
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

  private handleClose(reason: string): void {
    for (const listener of this.listeners.values()) {
      listener.onClose?.(reason);
    }

    this.connection = null;
  }
}

function validateSessionId(sessionId: number): void {
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    throw createSdkError(1000, "无效的参数: welinkSessionId");
  }
}
