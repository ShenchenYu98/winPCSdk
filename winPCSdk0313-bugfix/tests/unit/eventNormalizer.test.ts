import { describe, expect, it } from "vitest";

import { normalizeStreamMessage } from "../../src/core/eventNormalizer";

describe("normalizeStreamMessage", () => {
  it("normalizes JSON string payloads into protocol-aligned stream messages", () => {
    const result = normalizeStreamMessage(
      JSON.stringify({
        type: "text.delta",
        seq: 1,
        welinkSessionId: "42",
        emittedAt: "2026-03-08T00:16:00.000Z",
        messageId: "m_1",
        sourceMessageId: "src_1",
        partId: "p_1",
        partSeq: 1,
        content: "hello"
      })
    );

    expect(result).toMatchObject({
      type: "text.delta",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_1",
      sourceMessageId: "src_1",
      partId: "p_1",
      partSeq: 1,
      content: "hello"
    });
  });

  it("keeps object payload fields and falls back to null for missing optional protocol fields", () => {
    const result = normalizeStreamMessage({
      welinkSessionId: 42,
      role: "assistant"
    });

    expect(result.type).toBe("unknown");
    expect(result.seq).toBeNull();
    expect(result.welinkSessionId).toBe("42");
    expect(result.emittedAt).toBeNull();
    expect(result.role).toBe("assistant");
    expect(result.raw).toEqual({
      welinkSessionId: 42,
      role: "assistant"
    });
  });

  it("prefers nested raw objects when present", () => {
    const result = normalizeStreamMessage({
      type: "snapshot",
      seq: 1,
      welinkSessionId: "42",
      raw: {
        source: "server"
      }
    });

    expect(result.raw).toEqual({
      source: "server"
    });
  });

  it("throws sdk errors for malformed string and non-object payloads", () => {
    expect(() => normalizeStreamMessage("{bad json")).toThrowError(
      expect.objectContaining({
        errorCode: 5000,
        errorMessage: "内部错误: 非法的流式消息负载"
      })
    );

    expect(() => normalizeStreamMessage(123)).toThrowError(
      expect.objectContaining({
        errorCode: 5000,
        errorMessage: "内部错误: 非法的流式消息负载"
      })
    );
  });
});
