import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillSdk } from "../../src/SkillSdk";
import type { SessionStatusResult } from "../../src/types";
import {
  MockRealtimeConnection,
  asSdkError,
  createLayer1SuccessResponse
} from "../helpers/testUtils";

function createSessionPayload(updatedAt = "2026-03-08T00:15:00") {
  return {
    welinkSessionId: updatedAt === "2026-03-08T00:15:00" ? "42" : "43",
    userId: "10001",
    ak: "ak_demo",
    title: "React项目",
    imGroupId: "group_1",
    status: "ACTIVE",
    toolSessionId: null,
    createdAt: "2026-03-08T00:15:00",
    updatedAt
  };
}

describe("SkillSdk public api", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("reuses the latest active session and establishes realtime connection", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [
          createSessionPayload("2026-03-08T00:15:00"),
          createSessionPayload("2026-03-08T00:16:00")
        ],
        page: 0,
        size: 20,
        total: 2,
        totalPages: 1
      })
    );

    const session = await sdk.createSession({
      title: "React项目",
      imGroupId: "group_1"
    });

    expect(connection.connectCalls).toBe(1);
    expect(session.welinkSessionId).toBe("43");
  });

  it("creates a new session when no active session exists", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [],
        page: 0,
        size: 20,
        total: 0,
        totalPages: 0
      })
    );
    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse(createSessionPayload()));

    const session = await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    expect(session.welinkSessionId).toBe("42");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("closes the realtime connection and returns a success result", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );

    await sdk.createSession({
      imGroupId: "group_1"
    });

    const result = await sdk.closeSkill();

    expect(result).toEqual({ status: "success" });
    expect(connection.closeCalls).toBe(1);
  });

  it("clears listeners, status callbacks, and cached final text after closeSkill", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const listenerMessages: string[] = [];
    const statusEvents: string[] = [];

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );

    sdk.registerSessionListener({
      welinkSessionId: "42",
      onMessage: (message) => listenerMessages.push(message.type)
    });
    await sdk.createSession({ imGroupId: "group_1" });
    sdk.onSessionStatusChange({
      welinkSessionId: "42",
      callback: (result) => statusEvents.push(result.status)
    });

    connection.emitMessage({
      type: "text.done",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "final"
    });

    await sdk.closeSkill();

    connection.emitMessage({
      type: "session.status",
      seq: 2,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:02.000Z",
      sessionStatus: "busy"
    });

    await expect(
      sdk.sendMessageToIM({
        welinkSessionId: "42",
        messageId: "m_1"
      })
    ).rejects.toMatchObject({
      errorCode: 4003
    });
    expect(listenerMessages).toEqual(["text.done"]);
    expect(statusEvents).toEqual([]);
  });

  it("maps session status changes from websocket events and stopSkill", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const statuses: SessionStatusResult[] = [];

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    sdk.onSessionStatusChange({
      welinkSessionId: "42",
      callback: (result) => statuses.push(result)
    });

    connection.emitMessage({
      type: "session.status",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      sessionStatus: "busy"
    });
    connection.emitMessage({
      type: "session.status",
      seq: 2,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:05.000Z",
      sessionStatus: "idle"
    });

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        welinkSessionId: "42",
        status: "aborted"
      })
    );

    await sdk.stopSkill({ welinkSessionId: "42" });

    expect(statuses).toEqual([
      { status: "executing" },
      { status: "completed" },
      { status: "stopped" }
    ]);
  });

  it("requires an active connection before registering session status callbacks", () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });

    expect(() =>
      sdk.onSessionStatusChange({
        welinkSessionId: "42",
        callback: () => undefined
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 3000,
        errorMessage: "未建立连接"
      })
    );
  });

  it("registers and unregisters session listeners with normalized stream payloads", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const messages: string[] = [];

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );

    sdk.registerSessionListener({
      welinkSessionId: "42",
      onMessage: (message) => messages.push(`${message.welinkSessionId}:${message.type}`)
    });

    await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.delta",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_1",
      sourceMessageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "hello"
    });

    expect(messages).toEqual(["42:text.delta"]);
    expect(sdk.unregisterSessionListener({ welinkSessionId: "42" })).toEqual({
      status: "success"
    });
  });

  it("keeps the first registered listener and forwards error/close callbacks", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const events: string[] = [];

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );

    sdk.registerSessionListener({
      welinkSessionId: "42",
      onMessage: (message) => events.push(`first:${message.type}`),
      onError: (error) => events.push(`error:${error.code}`),
      onClose: (reason) => events.push(`close:${reason}`)
    });
    sdk.registerSessionListener({
      welinkSessionId: "42",
      onMessage: (message) => events.push(`second:${message.type}`)
    });

    await sdk.createSession({
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.delta",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "hello"
    });
    connection.emitError("socket-broken");
    connection.emitClose("server_shutdown");

    expect(events).toEqual(["first:text.delta", "error:STREAM_ERROR", "close:server_shutdown"]);
  });

  it("keeps listeners alive across abnormal reconnect and sends resume", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const messages: string[] = [];

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );

    sdk.registerSessionListener({
      welinkSessionId: "42",
      onMessage: (message) => messages.push(message.type)
    });

    await sdk.createSession({ imGroupId: "group_1" });

    connection.emitClose("network_lost", true);
    connection.emitReconnect();
    connection.emitMessage({
      type: "snapshot",
      seq: 10,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:17:00.000Z",
      messages: []
    });

    expect(connection.sendCalls).toEqual(['{"action":"resume"}']);
    expect(messages).toEqual(["snapshot"]);
  });

  it("sends messages after ensuring connection and returns protocol-aligned results", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        id: "m_1",
        seq: null,
        welinkSessionId: "42",
        role: "user",
        content: "hello",
        contentType: "plain",
        meta: null,
        messageSeq: 1,
        parts: [],
        createdAt: "2026-03-08T00:16:00"
      })
    );

    const result = await sdk.sendMessage({
      welinkSessionId: "42",
      content: "hello",
      toolCallId: "tool_1"
    });

    expect(connection.connectCalls).toBe(1);
    expect(result).toEqual({
      id: "m_1",
      seq: null,
      welinkSessionId: "42",
      role: "user",
      content: "hello",
      contentType: "plain",
      meta: null,
      messageSeq: 1,
      parts: [],
      createdAt: "2026-03-08T00:16:00"
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "hello",
      toolCallId: "tool_1"
    });
  });

  it("regenerates answers using the last user message from history when cache is empty", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [
          {
            id: "100",
            seq: 1,
            welinkSessionId: "42",
            role: "user",
            content: "请重新生成",
            contentType: "plain",
            meta: null,
            messageSeq: 1,
            parts: [],
            createdAt: "2026-03-08T00:15:00"
          }
        ],
        page: 0,
        size: 50,
        total: 1,
        totalPages: 1
      })
    );
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        id: "101",
        seq: null,
        welinkSessionId: "42",
        role: "user",
        content: "请重新生成",
        contentType: "plain",
        meta: null,
        messageSeq: 2,
        parts: [],
        createdAt: "2026-03-08T00:16:00"
      })
    );

    const result = await sdk.regenerateAnswer({ welinkSessionId: "42" });

    expect(result.content).toBe("请重新生成");
    expect(result.id).toBe("101");
  });

  it("returns the last completed message when sendMessageToIM omits messageId", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.done",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "第一条"
    });
    connection.emitMessage({
      type: "text.done",
      seq: 2,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:02.000Z",
      messageId: "m_2",
      messageSeq: 2,
      role: "assistant",
      partId: "p_2",
      partSeq: 1,
      content: "最后一条"
    });

    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse({ success: true }));

    const result = await sdk.sendMessageToIM({
      welinkSessionId: "42"
    });

    expect(result).toEqual({ success: true });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      content: "最后一条"
    });
  });

  it("sends aggregated final content for mixed part types without filtering", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({ imGroupId: "group_1" });

    connection.emitMessage({
      type: "text.done",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_mix",
      messageSeq: 1,
      role: "assistant",
      partId: "text_1",
      partSeq: 1,
      content: "text"
    });
    connection.emitMessage({
      type: "tool.update",
      seq: 2,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_mix",
      messageSeq: 1,
      role: "assistant",
      partId: "tool_1",
      partSeq: 2,
      toolName: "bash",
      status: "completed",
      output: "tool-output"
    });
    connection.emitMessage({
      type: "question",
      seq: 3,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:02.000Z",
      messageId: "m_mix",
      messageSeq: 1,
      role: "assistant",
      partId: "question_1",
      partSeq: 3,
      question: "pick one"
    });
    connection.emitMessage({
      type: "permission.ask",
      seq: 4,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:03.000Z",
      messageId: "m_mix",
      messageSeq: 1,
      role: "assistant",
      partId: "perm_1",
      partSeq: 4,
      permissionId: "perm_1",
      title: "edit /src/app.ts"
    });
    connection.emitMessage({
      type: "file",
      seq: 5,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:04.000Z",
      messageId: "m_mix",
      messageSeq: 1,
      role: "assistant",
      partId: "file_1",
      partSeq: 5,
      fileName: "report.txt",
      fileUrl: "https://example.com/report.txt"
    });
    connection.emitMessage({
      type: "step.done",
      seq: 6,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:05.000Z",
      messageId: "m_mix",
      messageSeq: 1,
      role: "assistant"
    });

    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse({ success: true }));

    const result = await sdk.sendMessageToIM({
      welinkSessionId: "42",
      messageId: "m_mix"
    });

    expect(result).toEqual({ success: true });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      content: "texttool-outputpick oneedit /src/app.tsreport.txt https://example.com/report.txt"
    });
  });

  it("sends completed assistant text to IM with explicit messageId and chatId", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.done",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_2",
      sourceMessageId: "m_2",
      messageSeq: 2,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "最终AI回复"
    });

    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse({ success: true }));

    const result = await sdk.sendMessageToIM({
      welinkSessionId: "42",
      messageId: "m_2",
      chatId: "chat_123"
    });

    expect(result).toEqual({ success: true });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      content: "最终AI回复",
      chatId: "chat_123"
    });
  });

  it("returns the service page untouched when getSessionMessage is not first fetch", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.done",
      seq: 3,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:03.000Z",
      messageId: "m_stream",
      messageSeq: 3,
      role: "assistant",
      partId: "p_3",
      partSeq: 1,
      content: "流式缓存"
    });

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [
          {
            id: "m_hist",
            seq: 1,
            welinkSessionId: "42",
            role: "assistant",
            content: "历史消息",
            contentType: "plain",
            meta: { tokens: 1 },
            messageSeq: 1,
            parts: [],
            createdAt: "2026-03-08T00:15:00"
          }
        ],
        page: 0,
        size: 10,
        total: 1,
        totalPages: 1
      })
    );

    const result = await sdk.getSessionMessage({
      welinkSessionId: "42",
      page: 0,
      size: 10
    });

    expect(result.page).toBe(0);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.content.map((message) => message.id)).toEqual(["m_hist"]);
  });

  it("inserts the latest local aggregated message at content[0] on first fetch", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.done",
      seq: 3,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:03.000Z",
      messageId: "m_stream",
      messageSeq: 3,
      role: "assistant",
      partId: "p_3",
      partSeq: 1,
      content: "流式缓存"
    });

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [
          {
            id: "m_hist_1",
            seq: 1,
            welinkSessionId: "42",
            role: "assistant",
            content: "历史消息1",
            contentType: "plain",
            meta: { tokens: 1 },
            messageSeq: 1,
            parts: [],
            createdAt: "2026-03-08T00:15:00"
          },
          {
            id: "m_hist_2",
            seq: 2,
            welinkSessionId: "42",
            role: "assistant",
            content: "历史消息2",
            contentType: "plain",
            meta: { tokens: 2 },
            messageSeq: 2,
            parts: [],
            createdAt: "2026-03-08T00:14:00"
          }
        ],
        page: 0,
        size: 10,
        total: 2,
        totalPages: 1
      })
    );

    const result = await sdk.getSessionMessage({
      welinkSessionId: "42",
      page: 0,
      size: 10,
      isFirst: true
    });

    expect(result.page).toBe(0);
    expect(result.size).toBe(10);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(result.content.map((message) => message.id)).toEqual([
      "m_stream",
      "m_hist_1",
      "m_hist_2"
    ]);
  });

  it("restores completed and streaming messages after resume events", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({ imGroupId: "group_1" });

    connection.emitClose("network_lost", true);
    connection.emitReconnect();
    connection.emitMessage({
      type: "snapshot",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:18:00.000Z",
      messages: [
        {
          id: "m_done",
          seq: 1,
          welinkSessionId: "42",
          role: "assistant",
          content: "done text",
          contentType: "plain",
          meta: null,
          messageSeq: 1,
          parts: [],
          createdAt: "2026-03-08T00:15:00"
        }
      ]
    });
    connection.emitMessage({
      type: "streaming",
      seq: 2,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:18:01.000Z",
      sessionStatus: "busy",
      messageId: "m_live",
      messageSeq: 2,
      role: "assistant",
      parts: [
        {
          partId: "p_live",
          partSeq: 1,
          type: "text",
          content: "partial"
        }
      ]
    });
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [],
        page: 0,
        size: 10,
        total: 0,
        totalPages: 0
      })
    );
    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse({ success: true }));

    const messages = await sdk.getSessionMessage({
      welinkSessionId: "42",
      page: 0,
      size: 10,
      isFirst: true
    });
    const sendResult = await sdk.sendMessageToIM({
      welinkSessionId: "42"
    });

    expect(messages.content.map((message) => message.id)).toEqual(["m_live"]);
    expect(sendResult).toEqual({ success: true });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      content: "done text"
    });
  });

  it("returns replyPermission results with string session ids", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        welinkSessionId: "42",
        permissionId: "perm_1",
        response: "once"
      })
    );

    const result = await sdk.replyPermission({
      welinkSessionId: "42",
      permId: "perm_1",
      response: "once"
    });

    expect(result).toEqual({
      welinkSessionId: "42",
      permissionId: "perm_1",
      response: "once"
    });
  });

  it("forwards miniapp status updates through controlSkillWeCode", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const statuses: string[] = [];

    sdk.onSkillWecodeStatusChange({
      callback: (result) => statuses.push(result.status)
    });

    expect(await sdk.controlSkillWeCode({ action: "close" })).toEqual({ status: "success" });
    expect(await sdk.controlSkillWeCode({ action: "minimize" })).toEqual({ status: "success" });
    expect(statuses).toEqual(["closed", "minimized"]);
  });

  it("surfaces sdk validation errors for malformed string session ids", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });

    try {
      await sdk.regenerateAnswer({ welinkSessionId: "" });
    } catch (error) {
      expect(asSdkError(error)).toEqual({
        errorCode: 1000,
        errorMessage: "无效的参数: welinkSessionId"
      });
    }
  });

  it("surfaces sdk validation errors for malformed listener and permission params", () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });

    expect(() =>
      sdk.registerSessionListener({
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
      sdk.registerSessionListener({
        welinkSessionId: "42",
        onMessage: undefined as unknown as (message: { type: string }) => void
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: onMessage"
      })
    );

    expect(() =>
      sdk.unregisterSessionListener({
        welinkSessionId: "42"
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 4006,
        errorMessage: "监听器不存在"
      })
    );
  });

  it("returns precise sendMessageToIM errors for missing, unfinished, and absent completed messages", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({ imGroupId: "group_1" });

    connection.emitMessage({
      type: "streaming",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      sessionStatus: "busy",
      messageId: "m_partial",
      messageSeq: 1,
      role: "assistant",
      parts: [
        {
          partId: "p_1",
          partSeq: 1,
          type: "text",
          content: "partial"
        }
      ]
    });

    await expect(
      sdk.sendMessageToIM({
        welinkSessionId: "42",
        messageId: "missing"
      })
    ).rejects.toMatchObject({
      errorCode: 4003,
      errorMessage: "消息不存在"
    });

    await expect(
      sdk.sendMessageToIM({
        welinkSessionId: "42",
        messageId: "m_partial"
      })
    ).rejects.toMatchObject({
      errorCode: 4004,
      errorMessage: "消息未完成"
    });

    await expect(
      sdk.sendMessageToIM({
        welinkSessionId: "42"
      })
    ).rejects.toMatchObject({
      errorCode: 4005,
      errorMessage: "会话中没有已完成消息"
    });
  });

  it("validates onSkillWecodeStatusChange callback input", () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });

    expect(() =>
      sdk.onSkillWecodeStatusChange({
        callback: undefined as unknown as (result: { status: string }) => void
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: callback"
      })
    );
  });

  it("does not resume or retain cache after a manual closeSkill", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1,
        totalPages: 1
      })
    );
    await sdk.createSession({ imGroupId: "group_1" });

    connection.emitMessage({
      type: "text.done",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "final"
    });

    await sdk.closeSkill();
    connection.emitReconnect();

    expect(connection.sendCalls).toEqual([]);
    await expect(
      sdk.sendMessageToIM({
        welinkSessionId: "42"
      })
    ).rejects.toMatchObject({
      errorCode: 4005
    });
  });
});
