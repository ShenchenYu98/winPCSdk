import { describe, expect, it } from "vitest";
import { MessageCacheStore } from "../../src/sdk/core/messageCacheStore";

describe("MessageCacheStore", () => {
  it("merges history with stream cache", () => {
    const store = new MessageCacheStore();
    store.applyHistory(42, [
      {
        id: 1,
        welinkSessionId: 42,
        userId: "10001",
        role: "user",
        content: "hello",
        messageSeq: 1,
        parts: [{ partId: "1:text", partSeq: 0, type: "text", content: "hello" }],
        createdAt: "2026-03-08T00:00:00Z"
      }
    ]);

    store.applyStream({
      type: "text.delta",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:00:01Z",
      messageId: "2",
      messageSeq: 2,
      role: "assistant",
      partId: "2:text",
      partSeq: 0,
      content: "hi"
    });

    const merged = store.getMergedMessages(42, []);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.content).toBe("hi");
  });

  it("stores final text for send-to-im", () => {
    const store = new MessageCacheStore();
    store.applyStream({
      type: "text.done",
      seq: 1,
      welinkSessionId: 7,
      emittedAt: "2026-03-08T00:00:01Z",
      messageId: "10",
      messageSeq: 1,
      role: "assistant",
      partId: "10:text",
      partSeq: 0,
      content: "final answer"
    });

    expect(store.getFinalText(7)).toBe("final answer");
    expect(store.getFinalText(7, 10)).toBe("final answer");
  });

  it("merges snapshot and streaming without synthetic parts", () => {
    const store = new MessageCacheStore();
    store.applyStream({
      type: "snapshot",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:00:00Z",
      messages: [
        {
          id: 1,
          welinkSessionId: 42,
          userId: "10001",
          role: "user",
          content: "hello",
          messageSeq: 1,
          parts: [{ partId: "1:text", partSeq: 0, type: "text", content: "hello" }],
          createdAt: "2026-03-08T00:00:00Z"
        }
      ]
    });

    store.applyStream({
      type: "streaming",
      seq: 2,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:00:01Z",
      messageId: "2",
      messageSeq: 2,
      role: "assistant",
      parts: [
        {
          partId: "2:text",
          partSeq: 0,
          type: "text",
          content: "streaming answer"
        }
      ]
    });

    const merged = store.getMergedMessages(42, []);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.content).toBe("streaming answer");
    expect(merged[1]?.parts).toHaveLength(1);
    expect(merged[1]?.parts[0]?.partId).toBe("2:text");
  });
});
