import type {
  PageResult,
  SessionMessage,
  SessionMessagePart,
  SessionRole,
  StreamMessage
} from "../types";

interface CachedMessage {
  id: string;
  seq: number | null;
  welinkSessionId: string;
  role: SessionRole;
  content: string | null;
  contentType: string | null;
  meta?: Record<string, unknown> | null;
  messageSeq: number | null;
  parts?: Map<string, SessionMessagePart>;
  createdAt: string;
}

export class MessageCacheStore {
  private readonly sessions = new Map<string, Map<string, CachedMessage>>();
  private readonly finalTexts = new Map<string, Map<string, string>>();
  private readonly orderedMessageIds = new Map<string, string[]>();

  applyHistory(sessionId: string, messages: SessionMessage[]): void {
    for (const message of messages) {
      this.upsertSessionMessage(sessionId, message);
    }
  }

  applyStream(message: StreamMessage): void {
    if (message.type === "snapshot" && message.messages) {
      this.applyHistory(message.welinkSessionId, message.messages);
      return;
    }

    const messageId = message.messageId?.trim();

    if (!messageId) {
      return;
    }

    const sessionStore = this.getSessionStore(message.welinkSessionId);
    const cached = sessionStore.get(messageId) ?? this.createCachedMessage(message);
    cached.seq = message.seq ?? cached.seq;
    cached.messageSeq = message.messageSeq ?? cached.messageSeq;
    cached.role = message.role ?? cached.role;

    if (message.type === "streaming") {
      this.applyStreamingMessage(cached, message);
      cached.content = buildContent(cached.parts ?? new Map<string, SessionMessagePart>());
      sessionStore.set(messageId, cached);
      this.trackOrder(message.welinkSessionId);
      return;
    }

    const parts = cached.parts ?? new Map<string, SessionMessagePart>();
    const partKey = String(message.partId ?? `${message.type}:${message.seq ?? "unknown"}`);
    const part = parts.get(partKey) ?? {
      partId: partKey,
      partSeq: message.partSeq ?? parts.size + 1,
      type: inferPartType(message.type)
    };

    if (message.type === "text.delta" || message.type === "thinking.delta") {
      part.content = `${part.content ?? ""}${message.content ?? ""}`;
    } else if (message.type === "text.done" || message.type === "thinking.done") {
      part.content = message.content ?? part.content ?? "";
    } else if (message.type === "tool.update") {
      part.toolName = message.toolName;
      part.toolCallId = message.toolCallId;
      part.status = message.status;
      part.input = message.input;
      part.output = message.output;
      part.error = message.error;
      part.title = message.title;
      part.content = message.output ?? part.content;
    } else if (message.type === "question") {
      part.toolName = message.toolName;
      part.toolCallId = message.toolCallId;
      part.status = message.status;
      part.input = message.input;
      part.header = message.header;
      part.question = message.question;
      part.options = message.options;
      part.content = message.question ?? part.content;
    } else if (message.type === "permission.ask" || message.type === "permission.reply") {
      part.permissionId = message.permissionId;
      part.permType = message.permType;
      part.metadata = message.metadata;
      part.response = message.response;
      part.status = message.status;
      part.title = message.title;
      part.content = message.title ?? part.content;
    } else if (message.type === "file") {
      part.fileName = message.fileName;
      part.fileUrl = message.fileUrl;
      part.fileMime = message.fileMime;
      part.content =
        buildFileContent(message.fileName ?? undefined, message.fileUrl ?? undefined) ?? part.content;
    }

    parts.set(partKey, part);
    cached.parts = parts;
    cached.content = buildContent(parts);
    sessionStore.set(messageId, cached);
    this.trackOrder(message.welinkSessionId);

    if (shouldPersistFinalText(message.type, message.status)) {
      this.saveFinalText(message.welinkSessionId, messageId, cached.content ?? "");
    }
  }

  getMergedMessages(sessionId: string, history: SessionMessage[]): SessionMessage[] {
    this.applyHistory(sessionId, history);
    const sessionStore = this.sessions.get(sessionId);

    if (!sessionStore) {
      return [...history];
    }

    return [...sessionStore.entries()]
      .sort((left, right) => compareCachedEntries(left[0], left[1], right[0], right[1]))
      .map(([, message]) => toSessionMessage(message));
  }

  getFinalText(sessionId: string, messageId?: string): string | undefined {
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

  hasMessage(sessionId: string, messageId: string): boolean {
    return this.sessions.get(sessionId)?.has(messageId) ?? false;
  }

  hasFinalText(sessionId: string, messageId: string): boolean {
    return this.finalTexts.get(sessionId)?.has(messageId) ?? false;
  }

  getLastUserMessageContent(sessionId: string): string | undefined {
    const sessionStore = this.sessions.get(sessionId);

    if (!sessionStore) {
      return undefined;
    }

    return [...sessionStore.values()]
      .filter((message) => message.role === "user")
      .sort(compareCachedMessagesDescending)[0]?.content ?? undefined;
  }

  toPageResult(sessionId: string, historyPage: PageResult<SessionMessage>): PageResult<SessionMessage> {
    const merged = this.getMergedMessages(sessionId, historyPage.content);
    const start = historyPage.page * historyPage.size;
    const end = start + historyPage.size;
    const total = merged.length;

    return {
      content: merged.slice(start, end),
      page: historyPage.page,
      size: historyPage.size,
      total,
      totalPages: historyPage.size > 0 ? Math.ceil(total / historyPage.size) : 0
    };
  }

  clear(): void {
    this.sessions.clear();
    this.finalTexts.clear();
    this.orderedMessageIds.clear();
  }

  private upsertSessionMessage(sessionId: string, message: SessionMessage): void {
    const sessionStore = this.getSessionStore(sessionId);
    const key = message.id;
    const parts = message.parts ?? [];

    sessionStore.set(key, {
      id: message.id,
      seq: message.seq,
      welinkSessionId: message.welinkSessionId,
      role: message.role,
      content: message.content,
      contentType: message.contentType,
      meta: message.meta,
      messageSeq: message.messageSeq,
      parts: new Map(parts.map((part) => [part.partId, part])),
      createdAt: message.createdAt
    });
    this.trackOrder(sessionId);

    if (message.content !== null && message.content !== undefined) {
      this.saveFinalText(sessionId, key, message.content);
    }
  }

  private createCachedMessage(message: StreamMessage): CachedMessage {
    return {
      id: message.messageId ?? "",
      seq: message.seq,
      welinkSessionId: message.welinkSessionId,
      role: message.role ?? "assistant",
      content: message.content ?? null,
      contentType: null,
      meta: null,
      messageSeq: message.messageSeq ?? null,
      parts: new Map(),
      createdAt: message.emittedAt ?? new Date().toISOString()
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

  private getSessionStore(sessionId: string): Map<string, CachedMessage> {
    let sessionStore = this.sessions.get(sessionId);

    if (!sessionStore) {
      sessionStore = new Map<string, CachedMessage>();
      this.sessions.set(sessionId, sessionStore);
    }

    return sessionStore;
  }

  private saveFinalText(sessionId: string, messageId: string, content: string): void {
    let sessionTexts = this.finalTexts.get(sessionId);

    if (!sessionTexts) {
      sessionTexts = new Map<string, string>();
      this.finalTexts.set(sessionId, sessionTexts);
    }

    sessionTexts.set(messageId, content);
  }

  private trackOrder(sessionId: string): void {
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
  return compareBySequence(left, right) || leftKey.localeCompare(rightKey);
}

function compareCachedMessagesDescending(left: CachedMessage, right: CachedMessage): number {
  return compareBySequence(right, left);
}

function compareBySequence(left: CachedMessage, right: CachedMessage): number {
  const leftSeq = left.seq ?? Number.MAX_SAFE_INTEGER;
  const rightSeq = right.seq ?? Number.MAX_SAFE_INTEGER;

  if (leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }

  const leftMessageSeq = left.messageSeq ?? Number.MAX_SAFE_INTEGER;
  const rightMessageSeq = right.messageSeq ?? Number.MAX_SAFE_INTEGER;

  return leftMessageSeq - rightMessageSeq;
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
    .map(renderPartContent)
    .join("");
}

function renderPartContent(part: SessionMessagePart): string {
  if (part.type === "tool") {
    return part.output ?? part.content ?? part.error ?? "";
  }

  if (part.type === "question") {
    const questionText = part.question ?? part.content ?? "";
    const optionsText = part.options?.length ? ` ${part.options.join(" / ")}` : "";
    return `${questionText}${optionsText}`.trim();
  }

  if (part.type === "permission") {
    const title = part.title ?? part.content ?? "";
    const response = part.response ? ` ${part.response}` : "";
    return `${title}${response}`.trim();
  }

  if (part.type === "file") {
    return buildFileContent(part.fileName ?? undefined, part.fileUrl ?? undefined) ?? "";
  }

  return part.content ?? part.question ?? "";
}

function buildFileContent(fileName?: string, fileUrl?: string): string | undefined {
  if (fileName && fileUrl) {
    return `${fileName} ${fileUrl}`;
  }

  return fileName ?? fileUrl;
}

function shouldPersistFinalText(type: string, status?: string | null): boolean {
  if (type === "text.done" || type === "thinking.done" || type === "question" || type === "permission.ask" || type === "permission.reply" || type === "file" || type === "step.done") {
    return true;
  }

  if (type === "tool.update" && (status === "completed" || status === "error")) {
    return true;
  }

  return false;
}

function toSessionMessage(message: CachedMessage): SessionMessage {
  const parts = [...(message.parts ?? new Map<string, SessionMessagePart>()).values()].sort(
    (left, right) => left.partSeq - right.partSeq
  );

  return {
    id: message.id,
    seq: message.seq,
    welinkSessionId: message.welinkSessionId,
    role: message.role,
    content: message.content,
    contentType: message.contentType,
    meta: message.meta,
    messageSeq: message.messageSeq,
    parts,
    createdAt: message.createdAt
  };
}
