import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillSdk } from "../../src/SkillSdk";
import type { SessionStatusResult } from "../../src/types";
import {
  MockRealtimeConnection,
  asSdkError,
  createLayer1SuccessResponse
} from "../helpers/testUtils";

function createSessionPayload() {
  return {
    welinkSessionId: 42,
    userId: "10001",
    ak: "ak_demo",
    title: "React项目",
    imGroupId: "group_1",
    status: "ACTIVE",
    toolSessionId: null,
    createdAt: "2026-03-08T00:15:00",
    updatedAt: "2026-03-08T00:15:00"
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

  it("reuses an active session and establishes realtime connection", async () => {
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
        total: 1
      })
    );

    const session = await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    expect(connection.connectCalls).toBe(1);
    expect(session.welinkSessionId).toBe(42);
    expect(session.status).toBe("ACTIVE");
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
        total: 0
      })
    );
    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse(createSessionPayload()));

    const session = await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    expect(session.welinkSessionId).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("closes the realtime connection and returns close result", async () => {
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
        total: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    const result = await sdk.closeSkill();

    expect(result).toEqual({ status: "success" });
    expect(connection.closeCalls).toBe(1);
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
        total: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    sdk.onSessionStatusChange({
      welinkSessionId: 42,
      callback: (result) => statuses.push(result)
    });

    connection.emitMessage({
      type: "session.status",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:00.000Z",
      sessionStatus: "busy"
    });
    connection.emitMessage({
      type: "session.status",
      seq: 2,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:03.000Z",
      sessionStatus: "retry"
    });
    connection.emitMessage({
      type: "session.status",
      seq: 3,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:05.000Z",
      sessionStatus: "idle"
    });

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        welinkSessionId: 42,
        status: "aborted"
      })
    );

    await sdk.stopSkill({ welinkSessionId: 42 });

    expect(statuses).toEqual([
      { status: "executing" },
      { status: "executing" },
      { status: "completed" },
      { status: "stopped" }
    ]);
  });

  it("ignores non-session-status stream events for session status callbacks", async () => {
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
        total: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React椤圭洰",
      imGroupId: "group_1"
    });

    sdk.onSessionStatusChange({
      welinkSessionId: 42,
      callback: (result) => statuses.push(result)
    });

    connection.emitMessage({
      type: "text.delta",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "hello"
    });
    connection.emitMessage({
      type: "tool.update",
      seq: 2,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:01.000Z",
      toolName: "search",
      status: "running"
    });
    connection.emitMessage({
      type: "step.done",
      seq: 3,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:02.000Z"
    });
    connection.emitMessage({
      type: "session.error",
      seq: 4,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:03.000Z",
      reason: "failed"
    });

    expect(statuses).toEqual([]);
  });

  it("registers and unregisters session listeners with normalized stream payloads", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const messages: string[] = [];

    const listener = {
      welinkSessionId: 42,
      onMessage: (message: { type: string }) => messages.push(message.type)
    };

    expect(sdk.registerSessionListener(listener)).toEqual({ status: "success" });
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.delta",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "hello"
    });

    expect(sdk.unregisterSessionListener({ welinkSessionId: 42 })).toEqual({
      status: "success"
    });

    connection.emitMessage({
      type: "text.done",
      seq: 2,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "hello world"
    });

    expect(messages).toEqual(["text.delta"]);
  });

  it("keeps the first registered listener for a session when register is called repeatedly", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const messages: string[] = [];

    const firstListener = {
      welinkSessionId: 42,
      onMessage: (message: { type: string }) => messages.push(`first:${message.type}`)
    };
    const secondListener = {
      welinkSessionId: 42,
      onMessage: (message: { type: string }) => messages.push(`second:${message.type}`)
    };

    expect(sdk.registerSessionListener(firstListener)).toEqual({ status: "success" });
    expect(sdk.registerSessionListener(secondListener)).toEqual({ status: "success" });
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React椤圭洰",
      imGroupId: "group_1"
    });

    connection.emitMessage({
      type: "text.delta",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_1",
      messageSeq: 1,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "hello"
    });

    expect(messages).toEqual(["first:text.delta"]);
  });

  it("emits connection errors and close reasons to the first listener for a session", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const errorCalls: string[] = [];
    const closeCalls: string[] = [];

    expect(
      sdk.registerSessionListener({
        welinkSessionId: 42,
        onMessage: () => undefined,
        onError: (error) => errorCalls.push(`first:${error.code}:${error.message}`),
        onClose: (reason) => closeCalls.push(`first:${reason}`)
      })
    ).toEqual({ status: "success" });

    expect(
      sdk.registerSessionListener({
        welinkSessionId: 42,
        onMessage: () => undefined,
        onError: (error) => errorCalls.push(`second:${error.code}:${error.message}`),
        onClose: (reason) => closeCalls.push(`second:${reason}`)
      })
    ).toEqual({ status: "success" });

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React椤圭洰",
      imGroupId: "group_1"
    });

    connection.emitError("stream disconnected");
    connection.emitClose("server_shutdown");

    expect(errorCalls).toEqual(["first:STREAM_ERROR:stream disconnected"]);
    expect(closeCalls).toEqual(["first:server_shutdown"]);
  });

  it("emits miniapp status updates through controlSkillWeCode", async () => {
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
            id: 100,
            welinkSessionId: 42,
            userId: "10001",
            role: "user",
            content: "请重新生成",
            messageSeq: 1,
            parts: [],
            createdAt: "2026-03-08T00:15:00"
          }
        ],
        page: 0,
        size: 50,
        total: 1
      })
    );
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        id: 101,
        welinkSessionId: 42,
        userId: "10001",
        role: "user",
        content: "请重新生成",
        messageSeq: 2,
        createdAt: "2026-03-08T00:16:00"
      })
    );

    const result = await sdk.regenerateAnswer({ welinkSessionId: 42 });

    expect(result.content).toBe("请重新生成");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
        total: 1
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
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_2",
      messageSeq: 2,
      role: "assistant",
      partId: "p_1",
      partSeq: 1,
      content: "最终AI回复"
    });

    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse({ success: true }));

    const result = await sdk.sendMessageToIM({
      welinkSessionId: 42,
      messageId: "m_2",
      chatId: "chat_123"
    });

    expect(result).toEqual({ status: "success" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      content: "最终AI回复",
      chatId: "chat_123"
    });
  });

  it("rejects sendMessageToIM when no final text is cached", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });

    await expect(sdk.sendMessageToIM({ welinkSessionId: 42 })).rejects.toMatchObject({
      errorCode: 4000,
      errorMessage: "未找到可发送的最终消息内容"
    });
  });

  it("returns replyPermission results with expected shape", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        welinkSessionId: 42,
        permissionId: "perm_1",
        response: "once"
      })
    );

    const result = await sdk.replyPermission({
      welinkSessionId: 42,
      permId: "perm_1",
      response: "once"
    });

    expect(result).toEqual({
      welinkSessionId: 42,
      permissionId: "perm_1",
      response: "once"
    });
  });

  it("surfaces sdk validation errors for malformed input structures", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });

    try {
      await sdk.regenerateAnswer({ welinkSessionId: 0 });
    } catch (error) {
      expect(asSdkError(error)).toEqual({
        errorCode: 1000,
        errorMessage: "无效的参数: welinkSessionId"
      });
    }
  });

  it("validates listener registration and unregister error paths", () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });

    expect(() =>
      sdk.registerSessionListener({
        welinkSessionId: 0,
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
        welinkSessionId: 42,
        onMessage: undefined as unknown as (message: { type: string }) => void
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: onMessage"
      })
    );

    expect(() => sdk.unregisterSessionListener({ welinkSessionId: 42 })).toThrowError(
      expect.objectContaining({
        errorCode: 4006,
        errorMessage: "监听器不存在"
      })
    );

    expect(() => sdk.unregisterSessionListener({ welinkSessionId: 0 })).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: welinkSessionId"
      })
    );
  });
  it("validates onSessionStatusChange input and connection requirements", async () => {
    const connection = new MockRealtimeConnection();
    const sdk = new SkillSdk({
      baseUrl: "http://skill.test",
      connectionFactory: () => connection
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    expect(() =>
      sdk.onSessionStatusChange({
        welinkSessionId: 42,
        callback: () => undefined
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 3000,
        errorMessage: "未建立连接"
      })
    );

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [createSessionPayload()],
        page: 0,
        size: 20,
        total: 1
      })
    );

    await sdk.createSession({
      ak: "ak_demo",
      title: "React椤圭洰",
      imGroupId: "group_1"
    });

    expect(() =>
      sdk.onSessionStatusChange({
        welinkSessionId: 0,
        callback: () => undefined
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: welinkSessionId"
      })
    );

    expect(() =>
      sdk.onSessionStatusChange({
        welinkSessionId: 42,
        callback: undefined as unknown as (result: SessionStatusResult) => void
      })
    ).toThrowError(
      expect.objectContaining({
        errorCode: 1000,
        errorMessage: "无效的参数: callback"
      })
    );
  });
});
