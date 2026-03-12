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

  it("unwraps paged session list responses", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      createLayer1SuccessResponse({
        content: [
          {
            welinkSessionId: 42,
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
        page: 0,
        size: 20,
        total: 1
      })
    );

    const result = await client.listActiveSessions("group_1", "ak_demo");

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.welinkSessionId).toBe(42);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/skill/sessions?");
  });

  it("maps send-to-im responses and forwards chatId", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(createLayer1SuccessResponse({ success: true }));

    const result = await client.sendMessageToIM(42, "发送到IM的文本", "chat_123");

    expect(result).toEqual({ status: "success" });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      content: "发送到IM的文本",
      chatId: "chat_123"
    });
  });

  it("throws sdk errors when layer1 business code is non-zero", async () => {
    const client = new SkillServerClient("http://skill.test");
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(createLayer1ErrorResponse(4001, "会话已关闭"));

    await expect(
      client.sendMessage({
        welinkSessionId: 42,
        content: "hello"
      })
    ).rejects.toMatchObject({
      errorCode: 4001,
      errorMessage: "会话已关闭"
    });
  });

  it("validates required request parameters before issuing network calls", async () => {
    const client = new SkillServerClient("http://skill.test");

    await expect(client.sendMessageToIM(0, "text")).rejects.toMatchObject({
      errorCode: 1000,
      errorMessage: "无效的参数: welinkSessionId"
    });

    await expect(client.sendMessageToIM(42, "   ")).rejects.toMatchObject({
      errorCode: 1000,
      errorMessage: "无效的参数: content"
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
