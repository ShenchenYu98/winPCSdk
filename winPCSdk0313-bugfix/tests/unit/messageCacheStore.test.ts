import { describe, expect, it } from "vitest";

import { MessageCacheStore } from "../../src/core/messageCacheStore";
import type { SessionMessage, SessionMessagePart, StreamMessage } from "../../src/types";

function createHistoryMessage(
  id: string,
  messageSeq: number,
  content: string,
  overrides: Partial<SessionMessage> = {}
): SessionMessage {
  return {
    id,
    seq: messageSeq,
    welinkSessionId: "42",
    role: messageSeq === 1 ? "user" : "assistant",
    content,
    contentType: "plain",
    meta: null,
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
    welinkSessionId: "42",
    emittedAt: "2026-03-08T00:16:00.000Z",
    messageId: "m_1",
    sourceMessageId: "m_1",
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

describe("MessageCacheStore", () => {
  it("materializes service-aligned history message structures", () => {
    const store = new MessageCacheStore();

    store.applyHistory("42", [
      createHistoryMessage("assistant_1", 2, "thinkingtoolpickgrantreport.txt", {
        role: "assistant",
        parts: [
          createPart("thinking", 1, "thinking", {
            content: "thinking"
          }),
          createPart("tool", 2, "tool", {
            toolName: "search",
            toolCallId: "tool_1",
            status: "completed",
            input: { q: "sdk" },
            output: "tool"
          }),
          createPart("question", 3, "question", {
            question: "pick",
            options: ["A", "B"],
            content: "pick"
          }),
          createPart("permission", 4, "permission", {
            permissionId: "perm_1",
            title: "grant",
            content: "grant"
          }),
          createPart("file", 5, "file", {
            content: "report.txt",
            fileName: "report.txt",
            fileUrl: "https://example.com/report.txt",
            fileMime: "text/plain"
          })
        ]
      })
    ]);

    expect(store.getMergedMessages("42", [])).toEqual([
      {
        id: "assistant_1",
        seq: 2,
        welinkSessionId: "42",
        role: "assistant",
        content: "thinkingtoolpickgrantreport.txt",
        contentType: "plain",
        meta: null,
        messageSeq: 2,
        parts: [
          createPart("thinking", 1, "thinking", {
            content: "thinking"
          }),
          createPart("tool", 2, "tool", {
            toolName: "search",
            toolCallId: "tool_1",
            status: "completed",
            input: { q: "sdk" },
            output: "tool"
          }),
          createPart("question", 3, "question", {
            question: "pick",
            options: ["A", "B"],
            content: "pick"
          }),
          createPart("permission", 4, "permission", {
            permissionId: "perm_1",
            title: "grant",
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
    expect(store.getFinalText("42", "assistant_1")).toBe("thinkingtoolpickgrantreport.txt");
  });

  it("merges snapshot and streaming cache into V5 page result fields", () => {
    const store = new MessageCacheStore();

    store.applyStream({
      type: "snapshot",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:22:00.000Z",
      messages: [
        createHistoryMessage("m_1", 1, "snapshot message", {
          role: "assistant"
        })
      ]
    });

    store.applyStream({
      type: "streaming",
      seq: 2,
      welinkSessionId: "42",
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

    const page = store.toPageResult("42", {
      content: [],
      page: 0,
      size: 10,
      total: 0,
      totalPages: 0
    });

    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
    expect(page.content[0]?.id).toBe("m_1");
    expect(page.content[1]?.id).toBe("m_2");
    expect(page.content[1]?.content).toBe("streaming cache message");
  });

  it("prepends the latest local aggregated message while preserving service order and metadata", () => {
    const store = new MessageCacheStore();

    store.applyStream({
      type: "text.done",
      seq: 3,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:03.000Z",
      messageId: "m_stream",
      messageSeq: 3,
      role: "assistant",
      partId: "p_stream",
      partSeq: 1,
      content: "streaming cache message"
    });

    store.applyHistory("42", [
      createHistoryMessage("m_hist_1", 1, "history 1"),
      createHistoryMessage("m_hist_2", 2, "history 2")
    ]);

    const page = store.toFirstFetchPageResult("42", {
      content: [
        createHistoryMessage("m_hist_1", 1, "history 1"),
        createHistoryMessage("m_hist_2", 2, "history 2")
      ],
      page: 0,
      size: 10,
      total: 2,
      totalPages: 1
    });

    expect(page.page).toBe(0);
    expect(page.size).toBe(10);
    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
    expect(page.content.map((message) => message.id)).toEqual([
      "m_stream",
      "m_hist_1",
      "m_hist_2"
    ]);
  });

  it("deduplicates the local aggregated message from the service page when ids match", () => {
    const store = new MessageCacheStore();

    store.applyStream({
      type: "text.done",
      seq: 3,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:03.000Z",
      messageId: "m_dup",
      messageSeq: 3,
      role: "assistant",
      partId: "p_dup",
      partSeq: 1,
      content: "local latest"
    });

    const page = store.toFirstFetchPageResult("42", {
      content: [
        createHistoryMessage("m_dup", 3, "history duplicate"),
        createHistoryMessage("m_hist", 1, "history 1")
      ],
      page: 0,
      size: 10,
      total: 2,
      totalPages: 1
    });

    expect(page.content.map((message) => message.id)).toEqual(["m_dup", "m_hist"]);
    expect(page.content[0]?.content).toBe("local latest");
    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
  });

  it("stores final text using stable string message ids", () => {
    const store = new MessageCacheStore();

    store.applyStream(
      createStreamMessage({
        messageId: "m_2",
        messageSeq: 2,
        content: "complete final text"
      })
    );

    expect(store.getFinalText("42", "m_2")).toBe("complete final text");
    expect(store.getFinalText("42")).toBe("complete final text");
  });

  it("aggregates all supported part types into the final text payload", () => {
    const store = new MessageCacheStore();

    store.applyStream({
      type: "text.done",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      messageId: "m_all",
      messageSeq: 1,
      role: "assistant",
      partId: "text_1",
      partSeq: 1,
      content: "text"
    });
    store.applyStream({
      type: "thinking.done",
      seq: 2,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:01.000Z",
      messageId: "m_all",
      messageSeq: 1,
      role: "assistant",
      partId: "thinking_1",
      partSeq: 2,
      content: "thinking"
    });
    store.applyStream({
      type: "tool.update",
      seq: 3,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:02.000Z",
      messageId: "m_all",
      messageSeq: 1,
      role: "assistant",
      partId: "tool_1",
      partSeq: 3,
      toolName: "bash",
      status: "completed",
      output: "tool-output"
    });
    store.applyStream({
      type: "question",
      seq: 4,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:03.000Z",
      messageId: "m_all",
      messageSeq: 1,
      role: "assistant",
      partId: "question_1",
      partSeq: 4,
      question: "pick one",
      options: ["A", "B"]
    });
    store.applyStream({
      type: "permission.ask",
      seq: 5,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:04.000Z",
      messageId: "m_all",
      messageSeq: 1,
      role: "assistant",
      partId: "perm_1",
      partSeq: 5,
      permissionId: "perm_1",
      title: "edit /src/app.ts"
    });
    store.applyStream({
      type: "file",
      seq: 6,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:05.000Z",
      messageId: "m_all",
      messageSeq: 1,
      role: "assistant",
      partId: "file_1",
      partSeq: 6,
      fileName: "report.txt",
      fileUrl: "https://example.com/report.txt"
    });
    store.applyStream({
      type: "step.done",
      seq: 7,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:06.000Z",
      messageId: "m_all",
      messageSeq: 1,
      role: "assistant"
    });

    expect(store.getFinalText("42", "m_all")).toBe(
      "textthinkingtool-outputpick one A / Bedit /src/app.tsreport.txt https://example.com/report.txt"
    );
  });

  it("tracks message existence and completion state separately", () => {
    const store = new MessageCacheStore();

    store.applyStream({
      type: "streaming",
      seq: 1,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:00.000Z",
      sessionStatus: "busy",
      messageId: "m_streaming",
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

    expect(store.hasMessage("42", "m_streaming")).toBe(true);
    expect(store.hasFinalText("42", "m_streaming")).toBe(false);
    expect(store.getFinalText("42", "m_streaming")).toBeUndefined();
  });

  it("lets snapshot override stale local final text while keeping streaming unfinished", () => {
    const store = new MessageCacheStore();

    store.applyStream({
      type: "text.done",
      seq: 3,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:03.000Z",
      messageId: "m_done",
      messageSeq: 3,
      role: "assistant",
      partId: "p_done",
      partSeq: 1,
      content: "local-final"
    });
    store.applyStream({
      type: "streaming",
      seq: 4,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:04.000Z",
      sessionStatus: "busy",
      messageId: "m_live",
      messageSeq: 4,
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

    store.applyStream({
      type: "snapshot",
      seq: 5,
      welinkSessionId: "42",
      emittedAt: "2026-03-08T00:16:05.000Z",
      messages: [
        createHistoryMessage("m_done", 3, "server-final", {
          role: "assistant"
        })
      ]
    });

    expect(store.getFinalText("42", "m_done")).toBe("server-final");
    expect(store.hasMessage("42", "m_live")).toBe(true);
    expect(store.hasFinalText("42", "m_live")).toBe(false);
  });

  it("reads the last user message content from cached history", () => {
    const store = new MessageCacheStore();

    store.applyHistory("42", [
      createHistoryMessage("u_1", 1, "first question"),
      createHistoryMessage("a_1", 2, "first answer", { role: "assistant" }),
      createHistoryMessage("u_2", 3, "retry this", { role: "user" })
    ]);

    expect(store.getLastUserMessageContent("42")).toBe("retry this");
  });

  it("clears session caches when requested", () => {
    const store = new MessageCacheStore();

    store.applyHistory("42", [createHistoryMessage("u_1", 1, "first question")]);
    store.clear();

    expect(store.getMergedMessages("42", [])).toEqual([]);
    expect(store.getFinalText("42")).toBeUndefined();
  });
});
