import { SkillSdk } from "../SkillSdk";
import type { RealtimeConnection } from "../core/streamConnectionManager";
import type { SkillSdkApi } from "../types";

export const DEFAULT_SKILL_SDK_BASE_URL = "http://api.openplatform.hisuat.huawei.com/skill/api";
export const DEFAULT_SKILL_SDK_WS_URL = "ws://api.openplatform.hisuat.huawei.com/skill/api/ws/skill/stream";
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_PAYLOAD = '{"action":"ping"}';

export interface BrowserSkillSdkOptions {
  baseUrl?: string;
  wsUrl?: string;
}

export interface ResolvedBrowserSkillSdkOptions {
  baseUrl: string;
  wsUrl: string;
}

type ConnectionState = "idle" | "connecting" | "open" | "closing";

export class BrowserWebSocketConnection implements RealtimeConnection {
  private socket: WebSocket | null = null;
  private handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string, details?: { reconnecting: boolean }) => void;
    onReconnect: () => void;
  } | null = null;
  private state: ConnectionState = "idle";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private initialConnectPromise: Promise<void> | null = null;
  private initialResolve: (() => void) | null = null;
  private initialReject: ((reason?: unknown) => void) | null = null;
  private hasOpened = false;

  constructor(private readonly wsUrl: string) {}

  setHandlers(handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string, details?: { reconnecting: boolean }) => void;
    onReconnect: () => void;
  }): void {
    this.handlers = handlers;
  }

  connect(): Promise<void> {
    if (this.initialConnectPromise) {
      return this.initialConnectPromise;
    }

    this.manualClose = false;
    this.initialConnectPromise = new Promise((resolve, reject) => {
      this.initialResolve = resolve;
      this.initialReject = reject;
      this.openSocket(false);
    });

    return this.initialConnectPromise;
  }

  send(payload: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    }
  }

  close(): void {
    this.manualClose = true;
    this.state = "closing";
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.resetInitialConnectPromise();
  }

  private openSocket(isReconnect: boolean): void {
    this.state = "connecting";
    const socket = new WebSocket(this.wsUrl);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.state = "open";
      this.clearReconnectTimer();
      this.reconnectAttempt = 0;
      this.scheduleHeartbeat();

      if (!this.hasOpened) {
        this.hasOpened = true;
        this.initialResolve?.();
        this.resetInitialConnectPromise();
        return;
      }

      if (isReconnect) {
        this.handlers?.onReconnect();
      }
    });

    socket.addEventListener("message", (event) => {
      this.handlers?.onMessage(event.data);
      this.resetHeartbeat();
    });

    socket.addEventListener("error", () => {
      const error = new Error("WebSocket connection failed");

      if (!this.hasOpened && this.state === "connecting") {
        this.initialReject?.(error);
        this.resetInitialConnectPromise();
        return;
      }

      this.handlers?.onError(error);
    });

    socket.addEventListener("close", (event) => {
      const reason = event.reason || "connection closed";
      const reconnecting = !this.manualClose && this.hasOpened;

      this.stopHeartbeat();
      this.handlers?.onClose(reason, { reconnecting });

      if (this.manualClose || !this.hasOpened) {
        this.state = "idle";
        this.socket = null;
        this.manualClose = false;
        return;
      }

      this.state = "idle";
      this.socket = null;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(500 * 2 ** this.reconnectAttempt, 30000);
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      if (this.manualClose || this.state === "closing") {
        return;
      }

      this.openSocket(true);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleHeartbeat(): void {
    this.stopHeartbeat();

    if (this.state !== "open") {
      return;
    }

    this.heartbeatTimer = setTimeout(() => {
      if (this.state !== "open") {
        return;
      }

      this.send(HEARTBEAT_PAYLOAD);
      this.scheduleHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private resetHeartbeat(): void {
    this.scheduleHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetInitialConnectPromise(): void {
    this.initialConnectPromise = null;
    this.initialResolve = null;
    this.initialReject = null;
  }
}

export function resolveBrowserSkillSdkOptions(
  options: BrowserSkillSdkOptions = {}
): ResolvedBrowserSkillSdkOptions {
  return {
    baseUrl: options.baseUrl ?? DEFAULT_SKILL_SDK_BASE_URL,
    wsUrl: options.wsUrl ?? DEFAULT_SKILL_SDK_WS_URL
  };
}

export function createBrowserSkillSdk(options: BrowserSkillSdkOptions = {}): SkillSdkApi {
  const resolvedOptions = resolveBrowserSkillSdkOptions(options);

  return new SkillSdk({
    baseUrl: resolvedOptions.baseUrl,
    connectionFactory: () => new BrowserWebSocketConnection(resolvedOptions.wsUrl)
  });
}
