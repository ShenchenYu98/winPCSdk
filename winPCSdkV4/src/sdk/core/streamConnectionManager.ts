import { normalizeStreamMessage } from "./eventNormalizer";
import { mapSessionStatus } from "./statusMapper";
import type {
  RegisterSessionListenerParams,
  SessionError,
  SessionStatusResult,
  StreamMessage
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
  private readonly listeners = new Map<number, Set<Listener>>();
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

  registerListener(listener: Listener): void {
    const current = this.listeners.get(listener.welinkSessionId) ?? new Set<Listener>();
    current.add(listener);
    this.listeners.set(listener.welinkSessionId, current);
  }

  unregisterListener(listener: Listener): void {
    const current = this.listeners.get(listener.welinkSessionId);

    if (!current) {
      return;
    }

    current.forEach((candidate) => {
      if (
        candidate.onMessage === listener.onMessage &&
        candidate.onError === listener.onError &&
        candidate.onClose === listener.onClose
      ) {
        current.delete(candidate);
      }
    });

    if (current.size === 0) {
      this.listeners.delete(listener.welinkSessionId);
    }
  }

  registerStatusCallback(sessionId: number, callback: (result: SessionStatusResult) => void): void {
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

    for (const listener of this.listeners.get(message.welinkSessionId) ?? []) {
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

    for (const listenerGroup of this.listeners.values()) {
      for (const listener of listenerGroup) {
        listener.onError?.(sessionError);
      }
    }
  }

  private handleClose(reason: string): void {
    for (const listenerGroup of this.listeners.values()) {
      for (const listener of listenerGroup) {
        listener.onClose?.(reason);
      }
    }

    this.connection = null;
  }
}
