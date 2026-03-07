import { SkillSdkError } from '../errors.js';
import type { Logger, SessionStatus, SkillSDKConfig, StreamMessage, StreamMessageType } from '../types.js';

export type StreamConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export type SessionStreamRuntime = {
  sessionId: string;
  ws?: WebSocket;
  state: StreamConnectionState;
  lastSeq: number;
  reconnectCount: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  subscribers: Set<(message: StreamMessage) => void>;
  isStoppedByUser: boolean;
  isClosedByUser: boolean;
};

export class SkillStreamClient {
  private readonly baseWsUrl: string;
  private readonly wsReconnectMaxTimes: number;
  private readonly wsReconnectBaseDelayMs: number;
  private readonly webSocketFactory: (url: string) => WebSocket;
  private readonly logger?: Logger;
  private readonly runtimes = new Map<string, SessionStreamRuntime>();
  private readonly statusHandler: (sessionId: string, status: SessionStatus) => void;
  private readonly messageHandler: (sessionId: string, message: StreamMessage) => void;

  constructor(
    config: SkillSDKConfig,
    statusHandler: (sessionId: string, status: SessionStatus) => void,
    messageHandler: (sessionId: string, message: StreamMessage) => void
  ) {
    this.baseWsUrl = config.baseWsUrl.replace(/\/$/, '');
    this.wsReconnectMaxTimes = config.wsReconnectMaxTimes ?? 3;
    this.wsReconnectBaseDelayMs = config.wsReconnectBaseDelayMs ?? 1_000;
    this.webSocketFactory = config.webSocketFactory ?? ((url) => new WebSocket(url));
    this.logger = config.logger;
    this.statusHandler = statusHandler;
    this.messageHandler = messageHandler;
  }

  subscribe(sessionId: string, listener: (message: StreamMessage) => void): () => void {
    const runtime = this.ensureRuntime(sessionId);
    runtime.subscribers.add(listener);

    return () => {
      runtime.subscribers.delete(listener);
      if (runtime.subscribers.size === 0 && runtime.state === 'closed') {
        this.runtimes.delete(sessionId);
      }
    };
  }

  async ensureConnection(sessionId: string): Promise<void> {
    const runtime = this.ensureRuntime(sessionId);
    runtime.isStoppedByUser = false;
    runtime.isClosedByUser = false;

    if (runtime.state === 'open' || runtime.state === 'connecting') {
      return;
    }

    runtime.state = 'connecting';

    try {
      await this.openSocket(runtime);
    } catch (error) {
      runtime.state = 'error';
      throw new SkillSdkError('STREAM_CONNECT_FAILED', `Failed to connect stream for session ${sessionId}`, {
        cause: error
      });
    }
  }

  disconnect(sessionId: string, options?: { stoppedByUser?: boolean; closedByUser?: boolean }): void {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      return;
    }

    runtime.isStoppedByUser = Boolean(options?.stoppedByUser);
    runtime.isClosedByUser = Boolean(options?.closedByUser);

    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      delete runtime.reconnectTimer;
    }

    if (runtime.ws && runtime.state !== 'closed') {
      runtime.ws.close();
    }

    runtime.state = 'closed';
  }

  disconnectAll(): void {
    for (const sessionId of this.runtimes.keys()) {
      this.disconnect(sessionId, { closedByUser: true });
    }
  }

  private async openSocket(runtime: SessionStreamRuntime): Promise<void> {
    const wsUrl = `${this.baseWsUrl}/ws/skill/stream/${runtime.sessionId}`;
    const ws = this.webSocketFactory(wsUrl);
    runtime.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        runtime.state = 'open';
        runtime.reconnectCount = 0;
        this.logger?.info?.('stream_open', { sessionId: runtime.sessionId });
        resolve();
      };

      ws.onerror = (evt) => {
        this.logger?.error?.('stream_error', { sessionId: runtime.sessionId, evt });
        reject(evt);
      };

      ws.onmessage = (evt) => {
        this.handleMessage(runtime, evt.data);
      };

      ws.onclose = () => {
        this.logger?.warn?.('stream_close', { sessionId: runtime.sessionId, state: runtime.state });

        if (!runtime.isStoppedByUser && !runtime.isClosedByUser) {
          this.tryReconnect(runtime);
          return;
        }

        runtime.state = 'closed';
      };
    });
  }

  private tryReconnect(runtime: SessionStreamRuntime): void {
    if (runtime.reconnectCount >= this.wsReconnectMaxTimes) {
      runtime.state = 'error';
      this.statusHandler(runtime.sessionId, 'stopped');
      return;
    }

    runtime.reconnectCount += 1;
    runtime.state = 'reconnecting';

    const delay = this.wsReconnectBaseDelayMs * 2 ** (runtime.reconnectCount - 1);
    runtime.reconnectTimer = setTimeout(() => {
      this.openSocket(runtime).catch(() => {
        this.tryReconnect(runtime);
      });
    }, delay);
  }

  private ensureRuntime(sessionId: string): SessionStreamRuntime {
    const existing = this.runtimes.get(sessionId);
    if (existing) {
      return existing;
    }

    const runtime: SessionStreamRuntime = {
      sessionId,
      state: 'idle',
      lastSeq: 0,
      reconnectCount: 0,
      subscribers: new Set(),
      isStoppedByUser: false,
      isClosedByUser: false
    };

    this.runtimes.set(sessionId, runtime);
    return runtime;
  }

  private handleMessage(runtime: SessionStreamRuntime, rawData: unknown): void {
    let parsed: StreamMessage;

    try {
      parsed = JSON.parse(String(rawData)) as StreamMessage;
    } catch {
      this.logger?.warn?.('stream_invalid_json', { sessionId: runtime.sessionId });
      return;
    }

    if (!this.validateMessage(parsed)) {
      this.logger?.warn?.('stream_invalid_message', { sessionId: runtime.sessionId, rawData });
      return;
    }

    if (parsed.seq <= runtime.lastSeq) {
      return;
    }

    runtime.lastSeq = parsed.seq;

    const status = this.mapStatus(parsed.type);
    if (status) {
      this.statusHandler(runtime.sessionId, status);
    }

    this.messageHandler(runtime.sessionId, parsed);

    for (const subscriber of runtime.subscribers) {
      subscriber(parsed);
    }
  }

  private validateMessage(message: StreamMessage): boolean {
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (typeof message.seq !== 'number') {
      return false;
    }

    return ['delta', 'done', 'error', 'agent_offline', 'agent_online'].includes(message.type);
  }

  private mapStatus(type: StreamMessageType): SessionStatus | undefined {
    switch (type) {
      case 'delta':
      case 'agent_online':
        return 'executing';
      case 'done':
        return 'completed';
      case 'error':
      case 'agent_offline':
        return 'stopped';
      default:
        return undefined;
    }
  }
}
