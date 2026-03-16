import { describe, expect, it } from "vitest";

import { StreamConnectionManager, type RealtimeConnection } from "../../src/core/streamConnectionManager";
import { MockRealtimeConnection } from "../helpers/testUtils";

describe("StreamConnectionManager", () => {
  it("connects once and dispatches normalized messages to caches, listeners, and status callbacks", async () => {
    const connection = new MockRealtimeConnection();
    const messages: string[] = [];
    const statuses: string[] = [];
    const cachedTypes: string[] = [];
    const manager = new StreamConnectionManager(
      () => connection,
      (message) => cachedTypes.push(`${message.welinkSessionId}:${message.type}`)
    );

    await manager.ensureConnected();
    await manager.ensureConnected();

    manager.registerListener({
      welinkSessionId: "42",
      onMessage: (message) => messages.push(`${message.welinkSessionId}:${message.type}`)
    });
    manager.registerStatusCallback("42", (result) => statuses.push(result.status));

    connection.emitMessage({
      type: "session.status",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      sessionStatus: "busy"
    });

    expect(connection.connectCalls).toBe(1);
    expect(cachedTypes).toEqual(["42:session.status"]);
    expect(messages).toEqual(["42:session.status"]);
    expect(statuses).toEqual(["executing"]);
  });

  it("keeps only the latest status callback for a session", async () => {
    const connection = new MockRealtimeConnection();
    const firstStatuses: string[] = [];
    const secondStatuses: string[] = [];
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    await manager.ensureConnected();

    manager.registerStatusCallback("42", (result) => firstStatuses.push(result.status));
    manager.registerStatusCallback("42", (result) => secondStatuses.push(result.status));

    connection.emitMessage({
      type: "session.status",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      sessionStatus: "busy"
    });

    expect(firstStatuses).toEqual([]);
    expect(secondStatuses).toEqual(["executing"]);
  });

  it("keeps the first listener for a session and surfaces error/close callbacks", async () => {
    const connection = new MockRealtimeConnection();
    const events: string[] = [];
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    await manager.ensureConnected();

    manager.registerListener({
      welinkSessionId: "42",
      onMessage: (message) => events.push(`first:${message.type}`),
      onError: (error) => events.push(`error:${error.code}`),
      onClose: (reason) => events.push(`close:${reason}`)
    });
    manager.registerListener({
      welinkSessionId: "42",
      onMessage: (message) => events.push(`second:${message.type}`)
    });

    connection.emitMessage({
      type: "text.delta",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_1"
    });
    connection.emitError("socket-broken");
    connection.emitClose("server_shutdown");

    expect(events).toEqual(["first:text.delta", "error:STREAM_ERROR", "close:server_shutdown"]);
    expect(manager.isConnected()).toBe(false);
  });

  it("validates malformed listener, unregister, and status callback params", async () => {
    const connection = new MockRealtimeConnection();
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    expect(() =>
      manager.registerListener({
        welinkSessionId: "",
        onMessage: () => undefined
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: welinkSessionId"
      })
    );

    expect(() =>
      manager.registerListener({
        welinkSessionId: "42",
        onMessage: undefined as unknown as (message: unknown) => void
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: onMessage"
      })
    );

    expect(() => manager.unregisterListener({ welinkSessionId: "42" })).toThrowError(
      expect.objectContaining({
        errorCode: 4006,
        errorMessage: "监听器不存在"
      })
    );

    expect(() => manager.registerStatusCallback("42", () => undefined)).toThrowError(
      expect.objectContaining({
        errorCode: 3000,
        errorMessage: "未建立连接"
      })
    );

    await manager.ensureConnected();

    expect(() =>
      manager.registerStatusCallback(
        "42",
        undefined as unknown as (result: { status: string }) => void
      )
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: callback"
      })
    );
  });

  it("closes the current realtime connection", async () => {
    const connection = new MockRealtimeConnection();
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    await manager.ensureConnected();
    manager.close();

    expect(connection.closeCalls).toBe(1);
    expect(manager.isConnected()).toBe(false);
  });

  it("resets connection, listeners, and status callbacks together", async () => {
    const connection = new MockRealtimeConnection();
    const messages: string[] = [];
    const statuses: string[] = [];
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    await manager.ensureConnected();
    manager.registerListener({
      welinkSessionId: "42",
      onMessage: (message) => messages.push(message.type)
    });
    manager.registerStatusCallback("42", (result) => statuses.push(result.status));

    manager.reset();

    connection.emitClose("closed");
    expect(connection.closeCalls).toBe(1);
    expect(manager.isConnected()).toBe(false);

    await manager.ensureConnected();
    connection.emitMessage({
      type: "session.status",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      sessionStatus: "busy"
    });

    expect(messages).toEqual([]);
    expect(statuses).toEqual([]);
  });

  it("sends resume after an abnormal reconnect when the connection supports send", async () => {
    const connection = new MockRealtimeConnection();
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    await manager.ensureConnected();

    connection.emitClose("network_lost", true);
    expect(manager.isConnected()).toBe(true);

    connection.emitReconnect();

    expect(connection.sendCalls).toEqual(['{"action":"resume"}']);
  });

  it("does not send resume after reset clears the previous lifecycle state", async () => {
    const connection = new MockRealtimeConnection();
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    await manager.ensureConnected();
    manager.reset();
    connection.emitReconnect();

    expect(connection.sendCalls).toEqual([]);
  });

  it("degrades gracefully when reconnecting connections do not support send", async () => {
    let handlers:
      | {
          onMessage: (payload: unknown) => void;
          onError: (error: Error) => void;
          onClose: (reason: string, details?: { reconnecting: boolean }) => void;
          onReconnect: () => void;
        }
      | undefined;
    const connection: RealtimeConnection = {
      async connect() {
        return undefined;
      },
      close() {
        return undefined;
      },
      setHandlers(nextHandlers) {
        handlers = nextHandlers;
      }
    };
    const manager = new StreamConnectionManager(() => connection, () => undefined);

    await manager.ensureConnected();
    expect(() => {
      handlers?.onClose("network_lost", { reconnecting: true });
      handlers?.onReconnect();
    }).not.toThrow();
  });
});
