import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillSdk } from "../../src/sdk/SkillSdk";
import type { RealtimeConnection } from "../../src/sdk/core/streamConnectionManager";

class FakeConnection implements RealtimeConnection {
  private handlers:
    | {
        onMessage: (payload: unknown) => void;
        onError: (error: Error) => void;
        onClose: (reason: string) => void;
      }
    | null = null;

  connect = vi.fn(async () => undefined);
  close = vi.fn(() => undefined);

  setHandlers(handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string) => void;
  }): void {
    this.handlers = handlers;
  }

  emit(payload: unknown): void {
    this.handlers?.onMessage(payload);
  }
}

describe("SkillSdk", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a session, reuses the first active session, and does not send the first message implicitly", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/skill/sessions?")) {
        return jsonResponse([
          {
            welinkSessionId: 42,
            userId: "10001",
            ak: "ak",
            title: "first",
            imGroupId: "group",
            status: "ACTIVE",
            toolSessionId: null,
            createdAt: "2026-03-08T00:00:00Z",
            updatedAt: "2026-03-08T00:00:00Z"
          },
          {
            welinkSessionId: 99,
            userId: "10001",
            ak: "ak",
            title: "second",
            imGroupId: "group",
            status: "ACTIVE",
            toolSessionId: null,
            createdAt: "2026-03-08T00:00:01Z",
            updatedAt: "2026-03-08T00:00:01Z"
          }
        ]);
      }

      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const connection = new FakeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://localhost:9999",
      connectionFactory: () => connection
    });

    const session = await sdk.createSession({
      ak: "ak",
      imGroupId: "group"
    });

    expect(session.welinkSessionId).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(connection.connect).toHaveBeenCalledTimes(1);
  });

  it("routes stream messages to registered listeners and status callbacks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));

    const connection = new FakeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://localhost:9999",
      connectionFactory: () => connection
    });
    const onMessage = vi.fn();
    const onStatus = vi.fn();

    sdk.registerSessionListener({
      welinkSessionId: 42,
      onMessage
    });
    sdk.onSessionStatusChange({
      welinkSessionId: 42,
      callback: onStatus
    });

    await sdk.createSession({
      ak: "ak",
      imGroupId: "group"
    });

    connection.emit({
      type: "text.delta",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:00:00Z",
      messageId: "1",
      messageSeq: 1,
      role: "assistant",
      partId: "1:text",
      partSeq: 0,
      content: "hello"
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({ status: "executing" });
  });

  it("keeps listeners registered across closeSkill and supports idempotent close", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));

    const connections: FakeConnection[] = [];
    const sdk = new SkillSdk({
      baseUrl: "http://localhost:9999",
      connectionFactory: () => {
        const connection = new FakeConnection();
        connections.push(connection);
        return connection;
      }
    });
    const onMessage = vi.fn();

    sdk.registerSessionListener({
      welinkSessionId: 42,
      onMessage
    });

    await sdk.createSession({
      ak: "ak",
      imGroupId: "group"
    });

    await sdk.closeSkill();
    await sdk.closeSkill();

    await sdk.createSession({
      ak: "ak",
      imGroupId: "group"
    });

    connections[1]?.emit({
      type: "text.delta",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:00:00Z",
      messageId: "1",
      messageSeq: 1,
      role: "assistant",
      partId: "1:text",
      partSeq: 0,
      content: "hello again"
    });

    expect(connections[0]?.close).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps cache after closeSkill so sendMessageToIM still works", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/skill/sessions?")) {
        return jsonResponse([]);
      }

      if (url.endsWith("/api/skill/sessions") && init?.method === "POST") {
        return jsonResponse({
          welinkSessionId: 42,
          userId: "10001",
          ak: "ak",
          title: "demo",
          imGroupId: "group",
          status: "ACTIVE",
          toolSessionId: null,
          createdAt: "2026-03-08T00:00:00Z",
          updatedAt: "2026-03-08T00:00:00Z"
        });
      }

      if (url.endsWith("/api/skill/sessions/42/send-to-im") && init?.method === "POST") {
        return jsonResponse({
          status: "success",
          chatId: "chat_1",
          contentLength: 12
        });
      }

      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const connection = new FakeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://localhost:9999",
      connectionFactory: () => connection
    });

    await sdk.createSession({
      ak: "ak",
      imGroupId: "group"
    });

    connection.emit({
      type: "text.done",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:00:00Z",
      messageId: "7",
      messageSeq: 2,
      role: "assistant",
      partId: "7:text",
      partSeq: 0,
      content: "final answer"
    });

    await sdk.closeSkill();
    const result = await sdk.sendMessageToIM({ welinkSessionId: 42, messageId: 7 });

    expect(result.status).toBe("success");
  });

  it("allows unregisterSessionListener to be called repeatedly", () => {
    const sdk = new SkillSdk({
      baseUrl: "http://localhost:9999",
      connectionFactory: () => new FakeConnection()
    });
    const onMessage = vi.fn();

    sdk.registerSessionListener({
      welinkSessionId: 42,
      onMessage
    });

    sdk.unregisterSessionListener({
      welinkSessionId: 42,
      onMessage
    });
    sdk.unregisterSessionListener({
      welinkSessionId: 42,
      onMessage
    });
  });

  it("returns SDKError for invalid parameters and cache-miss regenerate/send-to-im flows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url.includes("/messages?")) {
          return jsonResponse({
            content: [],
            page: 0,
            size: 50,
            total: 0
          });
        }

        return jsonResponse([]);
      })
    );

    const sdk = new SkillSdk({
      baseUrl: "http://localhost:9999",
      connectionFactory: () => new FakeConnection()
    });

    await expect(
      sdk.sendMessage({
        welinkSessionId: 0,
        content: ""
      })
    ).rejects.toMatchObject({
      errorCode: 1000
    });

    await expect(
      sdk.regenerateAnswer({
        welinkSessionId: 42
      })
    ).rejects.toMatchObject({
      errorCode: 4000
    });

    await expect(
      sdk.sendMessageToIM({
        welinkSessionId: 42
      })
    ).rejects.toMatchObject({
      errorCode: 4000
    });
  });

  it("emits miniapp lifecycle events", async () => {
    const sdk = new SkillSdk({
      baseUrl: "http://localhost:9999",
      connectionFactory: () => new FakeConnection()
    });
    const callback = vi.fn();
    sdk.onSkillWecodeStatusChange({ callback });

    await sdk.controlSkillWeCode({ action: "close" });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "closed"
      })
    );
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload
  } as Response;
}
