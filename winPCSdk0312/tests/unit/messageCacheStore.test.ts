import { describe, expect, it } from "vitest";

import { MessageCacheStore } from "../../src/core/messageCacheStore";
import type { SessionMessage, SessionMessagePart, StreamMessage } from "../../src/types";

function createHistoryMessage(
  id: number | string,
  messageSeq: number,
  content: string,
  overrides: Partial<SessionMessage> = {}
): SessionMessage {
  return {
    id,
    welinkSessionId: 42,
    userId: messageSeq === 1 ? "10001" : null,
    role: messageSeq === 1 ? "user" : "assistant",
    content,
    messageSeq,
    parts: [],
    createdAt: `2026-03-08T00:15:0${messageSeq}`,
    ...overrides
  };
}

function createStreamMessage(overrides: Partial<StreamMessage>): StreamMessage {
  return {
    type: "text.done",
    seq: 1,
    welinkSessionId: 42,
    emittedAt: "2026-03-08T00:16:00.000Z",
    messageId: "m_1",
    messageSeq: 1,
    role: "assistant",
    partId: "p_1",
    partSeq: 1,
    content: "assistant",
    ...overrides
  };
}

function createPart(
  partId: string,
  partSeq: number,
  type: SessionMessagePart["type"],
  overrides: Partial<SessionMessagePart> = {}
): SessionMessagePart {
  return {
    partId,
    partSeq,
    type,
    ...overrides
  };
}

function callUpsert(store: MessageCacheStore, sessionId: number, message: SessionMessage): void {
  (
    store as unknown as {
      upsertSessionMessage(targetSessionId: number, targetMessage: SessionMessage): void;
    }
  ).upsertSessionMessage(sessionId, message);
}

describe("MessageCacheStore", () => {
  it("upserts rich history message structures and materializes sorted parts through merged messages", () => {
    const store = new MessageCacheStore();

    callUpsert(
      store,
      42,
      createHistoryMessage("assistant_1", 2, "thinkingtoolpickgrantreport.txt", {
        userId: null,
        role: "assistant",
        parts: [
          createPart("file", 5, "file", {
            content: "report.txt",
            fileName: "report.txt",
            fileUrl: "https://example.com/report.txt",
            fileMime: "text/plain"
          }),
          createPart("tool", 2, "tool", {
            toolName: "search",
            toolCallId: "tool_1",
            toolStatus: "completed",
            toolInput: { q: "sdk" },
            toolOutput: "tool"
          }),
          createPart("thinking", 1, "thinking", {
            content: "thinking"
          }),
          createPart("question", 3, "question", {
            question: "pick",
            options: ["A", "B"],
            content: "pick"
          }),
          createPart("permission", 4, "permission", {
            permissionId: "perm_1",
            content: "grant"
          })
        ]
      })
    );

    const merged = store.getMergedMessages(42, []);

    expect(merged).toEqual([
      {
        id: "assistant_1",
        welinkSessionId: 42,
        userId: null,
        role: "assistant",
        content: "thinkingtoolpickgrantreport.txt",
        messageSeq: 2,
        parts: [
          createPart("thinking", 1, "thinking", {
            content: "thinking"
          }),
          createPart("tool", 2, "tool", {
            toolName: "search",
            toolCallId: "tool_1",
            toolStatus: "completed",
            toolInput: { q: "sdk" },
            toolOutput: "tool"
          }),
          createPart("question", 3, "question", {
            question: "pick",
            options: ["A", "B"],
            content: "pick"
          }),
          createPart("permission", 4, "permission", {
            permissionId: "perm_1",
            content: "grant"
          }),
          createPart("file", 5, "file", {
            content: "report.txt",
            fileName: "report.txt",
            fileUrl: "https://example.com/report.txt",
            fileMime: "text/plain"
          })
        ],
        createdAt: "2026-03-08T00:15:02"
      }
    ]);
    expect(store.getFinalText(42, "assistant_1")).toBe("thinkingtoolpickgrantreport.txt");
  });

  it("upserts different id and role shapes without changing stored fields", () => {
    const store = new MessageCacheStore();

    callUpsert(
      store,
      42,
      createHistoryMessage(101, 1, "user question", {
        userId: "10001",
        role: "user"
      })
    );
    callUpsert(
      store,
      42,
      createHistoryMessage("system_1", 2, "system notice", {
        userId: null,
        role: "system"
      })
    );
    callUpsert(
      store,
      42,
      createHistoryMessage("tool_1", 3, "tool result", {
        userId: null,
        role: "tool"
      })
    );

    expect(store.getMergedMessages(42, [])).toEqual([
      createHistoryMessage(101, 1, "user question", {
        userId: "10001",
        role: "user"
      }),
      createHistoryMessage("system_1", 2, "system notice", {
        userId: null,
        role: "system"
      }),
      createHistoryMessage("tool_1", 3, "tool result", {
        userId: null,
        role: "tool"
      })
    ]);
  });

  it("overwrites an existing upserted message and keeps the last non-empty final text", () => {
    const store = new MessageCacheStore();

    callUpsert(
      store,
      42,
      createHistoryMessage("m_1", 1, "first final", {
        parts: [createPart("p_1", 1, "text", { content: "first final" })]
      })
    );
    callUpsert(
      store,
      42,
      createHistoryMessage("m_1", 4, "", {
        parts: [createPart("p_1", 1, "text", { content: "" })],
        createdAt: "2026-03-08T00:15:09"
      })
    );

    const merged = store.getMergedMessages(42, []);

    expect(merged).toEqual([
      {
        id: "m_1",
        welinkSessionId: 42,
        userId: null,
        role: "assistant",
        content: "",
        messageSeq: 4,
        parts: [createPart("p_1", 1, "text", { content: "" })],
        createdAt: "2026-03-08T00:15:09"
      }
    ]);
    expect(store.getFinalText(42, "m_1")).toBe("first final");
  });

  it("sorts materialized messages by messageSeq and stable id when toSessionMessage runs", () => {
    const store = new MessageCacheStore();

    callUpsert(store, 42, createHistoryMessage("b_message", 2, "B"));
    callUpsert(store, 42, createHistoryMessage("a_message", 2, "A"));
    callUpsert(store, 42, createHistoryMessage(100, 1, "first"));

    const merged = store.getMergedMessages(42, []);

    expect(merged.map((message) => message.id)).toEqual([100, "a_message", "b_message"]);
  });

  it("keeps numeric history ids and string stable ids together in merged messages", () => {
    const store = new MessageCacheStore();

    store.applyHistory(42, [createHistoryMessage(101, 1, "history user message")]);
    store.applyStream(
      createStreamMessage({
        messageId: "m_2",
        messageSeq: 2,
        content: "streamed final message"
      })
    );

    const merged = store.getMergedMessages(42, []);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe(101);
    expect(merged[1]?.id).toBe("m_2");
  });

  it("uses stable string ids to fetch final text", () => {
    const store = new MessageCacheStore();

    store.applyStream(
      createStreamMessage({
        messageId: "m_2",
        messageSeq: 2,
        content: "complete final text"
      })
    );

    expect(store.getFinalText(42, "m_2")).toBe("complete final text");
  });

  it("merges snapshot and streaming cache for paged session messages", () => {
    const store = new MessageCacheStore();

    store.applyStream({
      type: "snapshot",
      seq: 1,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:22:00.000Z",
      messages: [
        {
          id: "m_1",
          welinkSessionId: 42,
          userId: null,
          role: "assistant",
          content: "snapshot message",
          messageSeq: 1,
          parts: [],
          createdAt: "2026-03-08T00:15:00"
        }
      ]
    });

    store.applyStream({
      type: "streaming",
      seq: 2,
      welinkSessionId: 42,
      emittedAt: "2026-03-08T00:22:00.100Z",
      sessionStatus: "busy",
      messageId: "m_2",
      messageSeq: 2,
      role: "assistant",
      parts: [
        {
          partId: "p_1",
          partSeq: 1,
          type: "text",
          content: "streaming cache message"
        }
      ]
    });

    const page = store.toPageResult(42, {
      content: [],
      page: 0,
      size: 10,
      total: 0
    });

    expect(page.total).toBe(2);
    expect(page.content[0]?.id).toBe("m_1");
    expect(page.content[1]?.id).toBe("m_2");
    expect(page.content[1]?.content).toBe("streaming cache message");
  });

  it("returns the latest final text when messageId is omitted", () => {
    const store = new MessageCacheStore();

    store.applyStream(
      createStreamMessage({
        messageId: "m_1",
        messageSeq: 1,
        content: "first"
      })
    );
    store.applyStream(
      createStreamMessage({
        messageId: "m_2",
        messageSeq: 2,
        content: "second"
      })
    );

    expect(store.getFinalText(42)).toBe("second");
  });

  it("treats missing parts as an empty array for upsertSessionMessage and toSessionMessage", () => {
    const store = new MessageCacheStore();

    callUpsert(
      store,
      42,
      {
        ...createHistoryMessage("missing_parts", 1, "bad"),
        parts: undefined
      } as unknown as SessionMessage
    );

    expect(store.getMergedMessages(42, [])).toEqual([
      {
        id: "missing_parts",
        welinkSessionId: 42,
        userId: "10001",
        role: "user",
        content: "bad",
        messageSeq: 1,
        parts: [],
        createdAt: "2026-03-08T00:15:01"
      }
    ]);
  });

  it("returns an empty array when toSessionMessage reaches a cached message without parts", () => {
    const store = new MessageCacheStore();
    const sessions = (
      store as unknown as {
        sessions: Map<number, Map<string, unknown>>;
      }
    ).sessions;

    sessions.set(
      42,
      new Map([
        [
          "broken",
          {
            id: "broken",
            welinkSessionId: 42,
            userId: null,
            role: "assistant",
            content: "broken",
            messageSeq: 1,
            parts: null,
            createdAt: "2026-03-08T00:15:00"
          }
        ]
      ])
    );

    expect(store.getMergedMessages(42, [])).toEqual([
      {
        id: "broken",
        welinkSessionId: 42,
        userId: null,
        role: "assistant",
        content: "broken",
        messageSeq: 1,
        parts: [],
        createdAt: "2026-03-08T00:15:00"
      }
    ]);
  });
});
