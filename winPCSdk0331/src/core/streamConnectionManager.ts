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

const MAX_REPLAY_CACHE_SESSIONS = 50;
const MAX_REPLAY_EVENTS_PER_SESSION = 1000;
const MAX_REPLAY_BYTES_PER_SESSION = 2 * 1024 * 1024;
const REPLAY_CACHE_TTL_MS = 30 * 60 * 1000;

interface ReplayCacheEntry {
  events: StreamMessage[];
  completed: boolean;
  truncated: boolean;
  updatedAt: number;
  approxBytes: number;
}

export class StreamConnectionManager {
  private readonly listeners = new Map<string, Listener>();
  private readonly statusCallbacks = new Map<string, (result: SessionStatusResult) => void>();
  private readonly replayCaches = new Map<string, ReplayCacheEntry>();
  private readonly pendingLiveEvents = new Map<string, StreamMessage[]>();
  private readonly replayingSessions = new Set<string>();
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
    this.cleanupReplayCaches();

    if (typeof listener.onMessage !== "function") {
      throw createSdkError(1000, "无效的参数: onMessage");
    }

    if (this.listeners.has(listener.welinkSessionId)) {
      return;
    }

    this.listeners.set(listener.welinkSessionId, listener);
    this.replayCachedEvents(listener);
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
    this.replayCaches.clear();
    this.pendingLiveEvents.clear();
    this.replayingSessions.clear();
    this.hasEverConnected = false;
  }

  private handleMessage(payload: unknown): void {
    const message = normalizeStreamMessage(payload);
    this.cleanupReplayCaches();
    this.cacheReplayEvent(message);
    this.onStreamMessage(message);
    this.dispatchLiveEvent(message);

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

  private replayCachedEvents(listener: Listener): void {
    const sessionId = listener.welinkSessionId;
    const cache = this.replayCaches.get(sessionId);

    if (!cache || cache.completed || cache.events.length === 0) {
      return;
    }

    this.replayingSessions.add(sessionId);

    const events = [...cache.events];

    for (const [index, event] of events.entries()) {
      if (this.listeners.get(sessionId) !== listener) {
        break;
      }

      listener.onMessage(
        withDeliveryMode(event, "replay", {
          replayDone: index === events.length - 1,
          replayTruncated: index === events.length - 1 && cache.truncated
        })
      );
    }

    this.replayingSessions.delete(sessionId);
    this.flushPendingLiveEvents(sessionId);
  }

  private dispatchLiveEvent(message: StreamMessage): void {
    const sessionId = message.welinkSessionId;

    if (!sessionId) {
      return;
    }

    const listener = this.listeners.get(sessionId);

    if (!listener) {
      return;
    }

    if (this.replayingSessions.has(sessionId)) {
      this.getPendingLiveEvents(sessionId).push(cloneStreamMessage(message));
      return;
    }

    listener.onMessage(withDeliveryMode(message, "live"));
  }

  private flushPendingLiveEvents(sessionId: string): void {
    const pending = this.pendingLiveEvents.get(sessionId);

    if (!pending || pending.length === 0) {
      return;
    }

    this.pendingLiveEvents.delete(sessionId);

    const listener = this.listeners.get(sessionId);

    if (!listener) {
      return;
    }

    for (const event of pending) {
      listener.onMessage(withDeliveryMode(event, "live"));
    }
  }

  private cacheReplayEvent(message: StreamMessage): void {
    const sessionId = message.welinkSessionId;

    if (!sessionId) {
      return;
    }

    const now = Date.now();
    let cache = this.replayCaches.get(sessionId);

    if (!cache || cache.completed) {
      cache = {
        events: [],
        completed: false,
        truncated: false,
        updatedAt: now,
        approxBytes: 0
      };
      this.replayCaches.set(sessionId, cache);
    }

    cache.events.push(cloneReplayEvent(message));
    cache.updatedAt = now;
    cache.approxBytes = estimateEventsSize(cache.events);
    trimReplayCache(cache);

    if (isReplayRoundEnd(message)) {
      cache.completed = true;
      cache.events = [];
      cache.approxBytes = 0;
    }

    this.enforceReplaySessionLimit();
  }

  private cleanupReplayCaches(): void {
    const now = Date.now();

    for (const [sessionId, cache] of this.replayCaches.entries()) {
      if (!cache.completed && now - cache.updatedAt > REPLAY_CACHE_TTL_MS) {
        this.replayCaches.delete(sessionId);
        this.pendingLiveEvents.delete(sessionId);
        this.replayingSessions.delete(sessionId);
      }
    }

    this.enforceReplaySessionLimit();
  }

  private enforceReplaySessionLimit(): void {
    if (this.replayCaches.size <= MAX_REPLAY_CACHE_SESSIONS) {
      return;
    }

    const entries = [...this.replayCaches.entries()].sort(
      (left, right) => left[1].updatedAt - right[1].updatedAt
    );
    const removeCount = this.replayCaches.size - MAX_REPLAY_CACHE_SESSIONS;

    for (const [sessionId] of entries.slice(0, removeCount)) {
      this.replayCaches.delete(sessionId);
      this.pendingLiveEvents.delete(sessionId);
      this.replayingSessions.delete(sessionId);
    }
  }

  private getPendingLiveEvents(sessionId: string): StreamMessage[] {
    let pending = this.pendingLiveEvents.get(sessionId);

    if (!pending) {
      pending = [];
      this.pendingLiveEvents.set(sessionId, pending);
    }

    return pending;
  }
}

function validateSessionId(sessionId: string): void {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw createSdkError(1000, "无效的参数: welinkSessionId");
  }
}

function cloneStreamMessage(message: StreamMessage): StreamMessage {
  return {
    ...message,
    options: message.options ? [...message.options] : message.options,
    input: message.input ? { ...message.input } : message.input,
    metadata: message.metadata ? { ...message.metadata } : message.metadata,
    messages: message.messages ? message.messages.map((item) => ({ ...item })) : message.messages,
    parts: message.parts ? message.parts.map((part) => ({ ...part })) : message.parts
  };
}

function cloneReplayEvent(message: StreamMessage): StreamMessage {
  const cloned = cloneStreamMessage(message);
  delete cloned.deliveryMode;
  delete cloned.replayDone;
  delete cloned.replayTruncated;
  return cloned;
}

function withDeliveryMode(
  message: StreamMessage,
  deliveryMode: NonNullable<StreamMessage["deliveryMode"]>,
  replayState?: { replayDone?: boolean; replayTruncated?: boolean }
): StreamMessage {
  return {
    ...cloneStreamMessage(message),
    deliveryMode,
    replayDone: replayState?.replayDone || undefined,
    replayTruncated: replayState?.replayTruncated || undefined
  };
}

function isReplayRoundEnd(message: StreamMessage): boolean {
  return (
    (message.type === "session.status" && message.sessionStatus === "idle") ||
    message.type === "session.error" ||
    message.type === "error" ||
    message.type === "agent.offline"
  );
}

function trimReplayCache(cache: ReplayCacheEntry): void {
  while (cache.events.length > MAX_REPLAY_EVENTS_PER_SESSION) {
    cache.events.shift();
    cache.truncated = true;
  }

  while (cache.events.length > 1 && cache.approxBytes > MAX_REPLAY_BYTES_PER_SESSION) {
    cache.events.shift();
    cache.truncated = true;
    cache.approxBytes = estimateEventsSize(cache.events);
  }
}

function estimateEventsSize(events: StreamMessage[]): number {
  return events.reduce((total, event) => total + estimateEventSize(event), 0);
}

function estimateEventSize(event: StreamMessage): number {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 0;
  }
}
