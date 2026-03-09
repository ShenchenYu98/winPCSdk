import { SkillSdk } from "../SkillSdk";
import type { RealtimeConnection } from "../core/streamConnectionManager";
import type { SkillSdkApi } from "../types";

export interface BrowserSkillSdkOptions {
  baseUrl: string;
  wsUrl: string;
}

class BrowserWebSocketConnection implements RealtimeConnection {
  private socket: WebSocket | null = null;
  private handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string) => void;
  } | null = null;

  constructor(private readonly wsUrl: string) {}

  setHandlers(handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string) => void;
  }): void {
    this.handlers = handlers;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.wsUrl);
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("message", (event) => this.handlers?.onMessage(event.data));
      this.socket.addEventListener(
        "error",
        () => reject(new Error("WebSocket connection failed")),
        { once: true }
      );
      this.socket.addEventListener("close", (event) => {
        this.handlers?.onClose(event.reason || "connection closed");
      });
    });
  }

  close(): void {
    this.socket?.close();
  }
}

export function createBrowserSkillSdk(options: BrowserSkillSdkOptions): SkillSdkApi {
  return new SkillSdk({
    baseUrl: options.baseUrl,
    connectionFactory: () => new BrowserWebSocketConnection(options.wsUrl)
  });
}
