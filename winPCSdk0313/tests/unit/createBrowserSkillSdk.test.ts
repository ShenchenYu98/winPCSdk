import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BrowserWebSocketConnection,
  DEFAULT_SKILL_SDK_BASE_URL,
  DEFAULT_SKILL_SDK_WS_URL,
  resolveBrowserSkillSdkOptions
} from "../../src/browser/createBrowserSkillSdk";

type Listener = (event?: { data?: string; reason?: string }) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Listener[]>();
  readyState = 0;
  sentMessages: string[] = [];

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  send(payload: string): void {
    this.sentMessages.push(payload);
  }

  close(reason = "manual"): void {
    this.emit("close", { reason });
  }

  emit(type: string, event: { data?: string; reason?: string } = {}): void {
    if (type === "open") {
      this.readyState = FakeWebSocket.OPEN;
    }

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }
}

describe("BrowserWebSocketConnection", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.reset();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  it("resolves browser sdk options with defaults and overrides", () => {
    expect(resolveBrowserSkillSdkOptions()).toEqual({
      baseUrl: DEFAULT_SKILL_SDK_BASE_URL,
      wsUrl: DEFAULT_SKILL_SDK_WS_URL
    });
    expect(
      resolveBrowserSkillSdkOptions({
        baseUrl: "http://skill.test",
        wsUrl: "ws://skill.test/ws"
      })
    ).toEqual({
      baseUrl: "http://skill.test",
      wsUrl: "ws://skill.test/ws"
    });
  });

  it("connects, forwards messages, and sends payloads while open", async () => {
    const connection = new BrowserWebSocketConnection("ws://skill.test/ws");
    const messages: string[] = [];

    connection.setHandlers({
      onMessage: (payload) => messages.push(String(payload)),
      onError: () => undefined,
      onClose: () => undefined,
      onReconnect: () => undefined
    });

    const connecting = connection.connect();
    const socket = FakeWebSocket.instances[0];
    socket?.emit("open");
    await connecting;

    socket?.emit("message", { data: '{"type":"text.delta"}' });
    connection.send('{"action":"resume"}');

    expect(messages).toEqual(['{"type":"text.delta"}']);
    expect(socket?.sentMessages).toEqual(['{"action":"resume"}']);
  });

  it("reconnects after abnormal close and emits onReconnect", async () => {
    const connection = new BrowserWebSocketConnection("ws://skill.test/ws");
    const reconnects: number[] = [];
    const closes: string[] = [];

    connection.setHandlers({
      onMessage: () => undefined,
      onError: () => undefined,
      onClose: (reason) => closes.push(reason),
      onReconnect: () => reconnects.push(1)
    });

    const connecting = connection.connect();
    const socket = FakeWebSocket.instances[0];
    socket?.emit("open");
    await connecting;

    socket?.emit("close", { reason: "network_lost" });
    await vi.advanceTimersByTimeAsync(500);

    const reconnectSocket = FakeWebSocket.instances[1];
    reconnectSocket?.emit("open");

    expect(closes).toEqual(["network_lost"]);
    expect(reconnects).toEqual([1]);
  });

  it("does not reconnect after manual close", async () => {
    const connection = new BrowserWebSocketConnection("ws://skill.test/ws");

    connection.setHandlers({
      onMessage: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
      onReconnect: () => undefined
    });

    const connecting = connection.connect();
    const socket = FakeWebSocket.instances[0];
    socket?.emit("open");
    await connecting;

    connection.close();
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("rejects the initial connect on first connection failure", async () => {
    const connection = new BrowserWebSocketConnection("ws://skill.test/ws");

    connection.setHandlers({
      onMessage: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
      onReconnect: () => undefined
    });

    const connecting = connection.connect();
    const socket = FakeWebSocket.instances[0];
    socket?.emit("error");
    socket?.emit("close", { reason: "connect_failed" });

    await expect(connecting).rejects.toThrow("WebSocket connection failed");
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
