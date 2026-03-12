import type { PageResult, SessionMessage, SessionMessagePart, StreamMessage } from "../types";

interface CachedMessage {
  id: number | string;
  welinkSessionId: number;
  userId: string | null;
  role: SessionMessage["role"];
  content: string;
  messageSeq: number;
  parts?: Map<string, SessionMessagePart>;
  createdAt: string;
}

export class MessageCacheStore {
  private readonly sessions = new Map<number, Map<string, CachedMessage>>();
  private readonly finalTexts = new Map<number, Map<string, string>>();
  private readonly orderedMessageIds = new Map<number, string[]>();

  applyHistory(sessionId: number, messages: SessionMessage[]): void {
    for (const message of messages) {
      this.upsertSessionMessage(sessionId, message);
    }
  }

  applyStream(message: StreamMessage): void {
    if (message.type === "snapshot" && message.messages) {
      this.applyHistory(message.welinkSessionId, message.messages);
      return;
    }

    if (!message.messageId) {
      return;
    }

    const sessionStore = this.getSessionStore(message.welinkSessionId);
    const key = String(message.messageId);
    const cached = sessionStore.get(key) ?? this.createCachedMessage(message);
    cached.messageSeq = message.messageSeq ?? cached.messageSeq;
    cached.role = message.role ?? cached.role;

    if (message.type === "streaming") {
      this.applyStreamingMessage(cached, message);
      cached.content = buildContent(cached.parts ?? new Map<string, SessionMessagePart>());
      sessionStore.set(key, cached);
      this.trackOrder(message.welinkSessionId, key);
      return;
    }

    const parts = cached.parts ?? new Map<string, SessionMessagePart>();
    const partKey = String(message.partId ?? `${message.type}:${message.seq}`);
    const part = parts.get(partKey) ?? {
      partId: partKey,
      partSeq: message.partSeq ?? parts.size,
      type: inferPartType(message.type)
    };

    if (message.type === "text.delta" || message.type === "thinking.delta") {
      part.content = `${part.content ?? ""}${message.content ?? ""}`;
    } else if (message.type === "text.done" || message.type === "thinking.done") {
      part.content = message.content ?? part.content ?? "";
    } else if (message.type === "tool.update") {
      part.toolName = message.toolName;
      part.toolCallId = message.toolCallId;
      part.toolStatus = message.status;
      part.toolInput = message.input;
      part.toolOutput = message.output;
      part.content = message.output ?? part.content;
    } else if (message.type === "question") {
      part.toolName = message.toolName;
      part.toolCallId = message.toolCallId;
      part.question = message.question;
      part.options = message.options;
      part.content = message.question;
    } else if (message.type === "permission.ask") {
      part.permissionId = message.permissionId;
      part.content = message.title ?? part.content;
    } else if (message.type === "file") {
      part.fileName = message.fileName;
      part.fileUrl = message.fileUrl;
      part.fileMime = message.fileMime;
      part.content = message.fileName;
    }

    parts.set(partKey, part);
    cached.parts = parts;
    cached.content = buildContent(parts);
    sessionStore.set(key, cached);
    this.trackOrder(message.welinkSessionId, key);

    if (message.type === "text.done" || message.type === "thinking.done" || message.type === "step.done") {
      this.saveFinalText(message.welinkSessionId, key, cached.content);
    }
  }

  getMergedMessages(sessionId: number, history: SessionMessage[]): SessionMessage[] {
    this.applyHistory(sessionId, history);
    const sessionStore = this.sessions.get(sessionId);

    if (!sessionStore) {
      return [...history];
    }

    return [...sessionStore.entries()]
      .sort((left, right) => compareCachedEntries(left[0], left[1], right[0], right[1]))
      .map(([, message]) => toSessionMessage(message));
  }

  getFinalText(sessionId: number, messageId?: string): string | undefined {
    const sessionTexts = this.finalTexts.get(sessionId);
    const sessionOrder = this.orderedMessageIds.get(sessionId) ?? [];

    if (!sessionTexts) {
      return undefined;
    }

    if (typeof messageId === "string" && messageId) {
      return sessionTexts.get(messageId);
    }

    for (let index = sessionOrder.length - 1; index >= 0; index -= 1) {
      const text = sessionTexts.get(sessionOrder[index]);

      if (text) {
        return text;
      }
    }

    return undefined;
  }

  getLastUserMessageContent(sessionId: number): string | undefined {
    const sessionStore = this.sessions.get(sessionId);

    if (!sessionStore) {
      return undefined;
    }

    return [...sessionStore.values()]
      .filter((message) => message.role === "user")
      .sort((left, right) => right.messageSeq - left.messageSeq)[0]?.content;
  }

  toPageResult(sessionId: number, historyPage: PageResult<SessionMessage>): PageResult<SessionMessage> {
    const merged = this.getMergedMessages(sessionId, historyPage.content);
    const start = historyPage.page * historyPage.size;
    const end = start + historyPage.size;

    return {
      content: merged.slice(start, end),
      page: historyPage.page,
      size: historyPage.size,
      total: merged.length
    };
  }

  private upsertSessionMessage(sessionId: number, message: SessionMessage): void {
    const sessionStore = this.getSessionStore(sessionId);
    const key = String(message.id);
    const parts = message.parts ?? [];

    sessionStore.set(key, {
      id: message.id,
      welinkSessionId: message.welinkSessionId,
      userId: message.userId,
      role: message.role,
      content: message.content,
      messageSeq: message.messageSeq,
      parts: new Map(parts.map((part) => [part.partId, part])),
      createdAt: message.createdAt
    });
    this.trackOrder(sessionId, key);

    if (message.content) {
      this.saveFinalText(sessionId, key, message.content);
    }
  }

  private createCachedMessage(message: StreamMessage): CachedMessage {
    return {
      id: message.messageId ?? "",
      welinkSessionId: message.welinkSessionId,
      userId: null,
      role: message.role ?? "assistant",
      content: message.content ?? "",
      messageSeq: message.messageSeq ?? message.seq,
      parts: new Map(),
      createdAt: message.emittedAt
    };
  }

  private applyStreamingMessage(cached: CachedMessage, message: StreamMessage): void {
    if (!message.parts) {
      return;
    }

    cached.parts = new Map(
      message.parts.map((part) => [
        part.partId,
        {
          ...part
        }
      ])
    );
  }

  private getSessionStore(sessionId: number): Map<string, CachedMessage> {
    let sessionStore = this.sessions.get(sessionId);

    if (!sessionStore) {
      sessionStore = new Map<string, CachedMessage>();
      this.sessions.set(sessionId, sessionStore);
    }

    return sessionStore;
  }

  private saveFinalText(sessionId: number, messageId: string, content: string): void {
    let sessionTexts = this.finalTexts.get(sessionId);

    if (!sessionTexts) {
      sessionTexts = new Map<string, string>();
      this.finalTexts.set(sessionId, sessionTexts);
    }

    sessionTexts.set(messageId, content);
  }

  private trackOrder(sessionId: number, _messageId: string): void {
    const sessionStore = this.sessions.get(sessionId);

    if (!sessionStore) {
      return;
    }

    const orderedEntries = [...sessionStore.entries()]
      .sort((left, right) => compareCachedEntries(left[0], left[1], right[0], right[1]))
      .map(([key]) => key);

    this.orderedMessageIds.set(sessionId, orderedEntries);
  }
}

function compareCachedEntries(
  leftKey: string,
  left: CachedMessage,
  rightKey: string,
  right: CachedMessage
): number {
  return left.messageSeq - right.messageSeq || leftKey.localeCompare(rightKey);
}

function inferPartType(type: string): SessionMessagePart["type"] {
  if (type.startsWith("thinking")) {
    return "thinking";
  }

  if (type === "tool.update") {
    return "tool";
  }

  if (type === "question") {
    return "question";
  }

  if (type.startsWith("permission")) {
    return "permission";
  }

  if (type === "file") {
    return "file";
  }

  return "text";
}

function buildContent(parts: Map<string, SessionMessagePart>): string {
  return [...parts.values()]
    .sort((left, right) => left.partSeq - right.partSeq)
    .map((part) => {
      if (part.type === "tool") {
        return part.toolOutput ?? "";
      }

      return part.content ?? part.question ?? "";
    })
    .join("");
}

function toSessionMessage(message: CachedMessage): SessionMessage {
  const parts = [...(message.parts ?? new Map<string, SessionMessagePart>()).values()].sort(
    (left, right) => left.partSeq - right.partSeq
  );

  return {
    id: message.id,
    welinkSessionId: message.welinkSessionId,
    userId: message.userId,
    role: message.role,
    content: message.content,
    messageSeq: message.messageSeq,
    parts,
    createdAt: message.createdAt
  };
}
