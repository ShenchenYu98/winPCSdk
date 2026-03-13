import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillServerClient } from "../../src/client/skillServerClient";
import {
  asSdkError,
  createLayer1ErrorResponse,
  createLayer1SuccessResponse
} from "../helpers/testUtils";

describe("SkillServerClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("unwraps paged session list responses with V5 page fields", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [
          {
            welinkSessionId: "42",
            userId: "10001",
            ak: "ak_demo",
            title: "React项目",
            imGroupId: "group_1",
            status: "ACTIVE",
            toolSessionId: "ses_1",
            createdAt: "2026-03-08T00:15:00",
            updatedAt: "2026-03-08T00:16:00"
          }
        ],
        number: 0,
        size: 20,
        totalElements: 1
      })
    );

    const result = await client.listActiveSessions("group_1", "ak_demo");

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.welinkSessionId).toBe("42");
    expect(result.totalElements).toBe(1);
  });

  it("allows session reuse queries without ak", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [],
        number: 0,
        size: 20,
        totalElements: 0
      })
    );

    await client.listActiveSessions("group_1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("imGroupId=group_1");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("ak=");
  });

  it("ignores blank ak values in active session queries", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [],
        number: 0,
        size: 20,
        totalElements: 0
      })
    );

    await client.listActiveSessions("group_1", "   ");

    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("ak=");
  });

  it("reuses the latest session by updatedAt when createOrReuseSession finds multiple matches", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [
          {
            welinkSessionId: "42",
            userId: "10001",
            ak: "ak_demo",
            title: "old",
            imGroupId: "group_1",
            status: "ACTIVE",
            toolSessionId: null,
            createdAt: "2026-03-08T00:15:00",
            updatedAt: "2026-03-08T00:16:00"
          },
          {
            welinkSessionId: "43",
            userId: "10001",
            ak: "ak_demo",
            title: "new",
            imGroupId: "group_1",
            status: "ACTIVE",
            toolSessionId: null,
            createdAt: "2026-03-08T00:15:00",
            updatedAt: "2026-03-08T00:17:00"
          }
        ],
        number: 0,
        size: 20,
        totalElements: 2
      })
    );

    const result = await client.createOrReuseSession({
      ak: "ak_demo",
      title: "React项目",
      imGroupId: "group_1"
    });

    expect(result.welinkSessionId).toBe("43");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a new session when createOrReuseSession finds no active session", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [],
        number: 0,
        size: 20,
        totalElements: 0
      })
    );
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        welinkSessionId: "42",
        userId: "10001",
        ak: null,
        title: "React项目",
        imGroupId: "group_1",
        status: "ACTIVE",
        toolSessionId: null,
        createdAt: "2026-03-08T00:15:00",
        updatedAt: "2026-03-08T00:15:00"
      })
    );

    const result = await client.createOrReuseSession({
      title: "React项目",
      imGroupId: "group_1"
    });

    expect(result.welinkSessionId).toBe("42");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      title: "React项目",
      imGroupId: "group_1"
    });
  });

  it("maps send-to-im responses without wrapping success", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse({ success: true }));

    const result = await client.sendMessageToIM("42", "发送到IM的文本", "chat_123");

    expect(result).toEqual({ success: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "发送到IM的文本",
      chatId: "chat_123"
    });
  });

  it("sends messages with and without toolCallId using protocol body fields", async () => {
    const client = new SkillServerClient("http://skill.test");
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
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        id: "m_2",
        seq: null,
        welinkSessionId: "42",
        role: "user",
        content: "reply",
        contentType: "plain",
        meta: null,
        messageSeq: 2,
        parts: [],
        createdAt: "2026-03-08T00:16:01"
      })
    );

    await client.sendMessage({
      welinkSessionId: "42",
      content: "hello"
    });
    await client.sendMessage({
      welinkSessionId: "42",
      content: "reply",
      toolCallId: "tool_1"
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "hello"
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      content: "reply",
      toolCallId: "tool_1"
    });
  });

  it("gets session messages with page and size query params", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [],
        number: 2,
        size: 5,
        totalElements: 11
      })
    );

    const result = await client.getSessionMessages("42", 2, 5);

    expect(result).toEqual({
      content: [],
      number: 2,
      size: 5,
      totalElements: 11
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/skill/sessions/42/messages?page=2&size=5");
  });

  it("posts abort and permission reply requests with string session ids", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        welinkSessionId: "42",
        status: "aborted"
      })
    );
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        welinkSessionId: "42",
        permissionId: "perm_1",
        response: "always"
      })
    );

    const abortResult = await client.abortSession("42");
    const permissionResult = await client.replyPermission({
      welinkSessionId: "42",
      permId: "perm_1",
      response: "always"
    });

    expect(abortResult).toEqual({
      welinkSessionId: "42",
      status: "aborted"
    });
    expect(permissionResult).toEqual({
      welinkSessionId: "42",
      permissionId: "perm_1",
      response: "always"
    });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      response: "always"
    });
  });

  it("throws sdk errors when layer1 business code is non-zero", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(createLayer1ErrorResponse(4001, "会话已关闭"));

    await expect(
      client.sendMessage({
        welinkSessionId: "42",
        content: "hello"
      })
    ).rejects.toMatchObject({
      errorCode: 4001,
      errorMessage: "会话已关闭"
    });
  });

  it("validates required request parameters before issuing network calls", async () => {
    const client = new SkillServerClient("http://skill.test");

    await expect(client.listActiveSessions("")).rejects.toMatchObject({
      errorCode: 1000,
      errorMessage: "无效的参数: imGroupId"
    });

    await expect(client.sendMessageToIM("", "text")).rejects.toMatchObject({
      errorCode: 1000,
      errorMessage: "无效的参数: welinkSessionId"
    });

    await expect(
      client.sendMessage({
        welinkSessionId: "42",
        content: "   "
      })
    ).rejects.toMatchObject({
      errorCode: 1000,
      errorMessage: "无效的参数: content"
    });

    await expect(
      client.replyPermission({
        welinkSessionId: "42",
        permId: "   ",
        response: "once"
      })
    ).rejects.toMatchObject({
      errorCode: 1000,
      errorMessage: "无效的参数: permId"
    });

    await expect(client.sendMessageToIM("42", "   ")).rejects.toMatchObject({
      errorCode: 1000,
      errorMessage: "无效的参数: content"
    });
  });

  it("surfaces non-200 and malformed response bodies as service errors", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 503, statusText: "Service Unavailable" }));
    fetchMock.mockResolvedValueOnce(new Response("\"bad\"", { status: 200, headers: { "Content-Type": "application/json" } }));
    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse<null>(null as unknown as null)
    );

    await expect(client.createSession({ imGroupId: "group_1" })).rejects.toMatchObject({
      errorCode: 7000
    });
    await expect(client.createSession({ imGroupId: "group_1" })).rejects.toMatchObject({
      errorCode: 7000,
      errorMessage: "服务端错误: 响应格式非法"
    });
    await expect(client.createSession({ imGroupId: "group_1" })).rejects.toMatchObject({
      errorCode: 7000,
      errorMessage: "服务端错误: 响应数据为空"
    });
  });

  it("surfaces network failures as sdk errors", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockRejectedValueOnce(new Error("boom"));

    try {
      await client.createSession({
        ak: "ak_demo",
        title: "title",
        imGroupId: "group_1"
      });
    } catch (error) {
      expect(asSdkError(error)).toEqual({
        errorCode: 6000,
        errorMessage: "网络错误"
      });
    }
  });
});
