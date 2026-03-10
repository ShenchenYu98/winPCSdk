import { createSdkError } from "../../src/sdk/errors";
import type {
  CloseSkillResult,
  ControlSkillWeCodeParams,
  ControlSkillWeCodeResult,
  CreateSessionParams,
  GetSessionMessageParams,
  OnSessionStatusChangeParams,
  OnSkillWecodeStatusChangeParams,
  PageResult,
  RegisterSessionListenerParams,
  RegenerateAnswerParams,
  ReplyPermissionParams,
  ReplyPermissionResult,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  SessionMessage,
  SessionStatus,
  SkillSdkApi,
  SkillSession,
  SkillWecodeStatus,
  StopSkillParams,
  StopSkillResult,
  StreamMessage,
  UnregisterSessionListenerParams
} from "../../src/sdk/types";

interface FixtureSessionSeed {
  welinkSessionId: number;
  ak: string;
  title: string;
  imGroupId: string;
  status?: string;
  messages?: SessionMessage[];
}

interface FixtureTemplate {
  responsePrefix?: string;
  responseSuffix?: string;
  toolOutput?: string;
  permissionTitle?: string;
}

export interface FixtureSkillSdkData {
  runtimeKey?: string;
  chunkSize?: number;
  chunkIntervalMs?: number;
  displayBaseUrl?: string;
  displayWsUrl?: string;
  sessions?: FixtureSessionSeed[];
  templates?: Record<string, FixtureTemplate>;
  imMessages?: string[];
}

interface ActiveStream {
  timers: ReturnType<typeof setTimeout>[];
  assistantMessageId: number;
  streamedContent: string;
}

interface FixtureSkillSdkOptions {
  runtimeKey?: string;
  fixtureData: FixtureSkillSdkData;
}

type FixtureGlobalHost = typeof globalThis & {
  __skillSdkFixtureRuntimes__?: Map<string, FixtureRuntime>;
  top?: unknown;
};

const fallbackRuntimeRegistry = new Map<string, FixtureRuntime>();

export function getSharedFixtureBrowserSkillSdk(
  options: FixtureSkillSdkOptions
): SkillSdkApi {
  const registry = getRuntimeRegistry();
  const runtimeKey = options.runtimeKey ?? options.fixtureData.runtimeKey ?? "default";
  const existing = registry.get(runtimeKey);

  if (existing) {
    return existing.api;
  }

  const runtime = new FixtureRuntime(options.fixtureData);
  registry.set(runtimeKey, runtime);
  return runtime.api;
}

function getRuntimeRegistry(): Map<string, FixtureRuntime> {
  const topWindow = getTopWindow();

  if (!topWindow) {
    return fallbackRuntimeRegistry;
  }

  topWindow.__skillSdkFixtureRuntimes__ ??= new Map<string, FixtureRuntime>();
  return topWindow.__skillSdkFixtureRuntimes__;
}

function getTopWindow(): FixtureGlobalHost | null {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const host = globalThis as FixtureGlobalHost;

  try {
    return (((host.top as unknown) as FixtureGlobalHost | undefined) ?? host) as FixtureGlobalHost;
  } catch {
    return host;
  }
}

class FixtureRuntime {
  readonly api: SkillSdkApi;

  private readonly sessions = new Map<number, SkillSession>();
  private readonly messages = new Map<number, SessionMessage[]>();
  private readonly listeners = new Map<number, Set<RegisterSessionListenerParams>>();
  private readonly statusCallbacks = new Map<
    number,
    Set<OnSessionStatusChangeParams["callback"]>
  >();
  private readonly miniCallbacks = new Set<OnSkillWecodeStatusChangeParams["callback"]>();
  private readonly activeStreams = new Map<number, ActiveStream>();
  private readonly imMessages: string[];
  private sessionIdSeed = 1;
  private messageIdSeed = 1;
  private streamSeq = 1;

  constructor(private readonly fixtureData: FixtureSkillSdkData) {
    this.imMessages = [...(fixtureData.imMessages ?? [])];
    this.seed();
    this.api = {
      createSession: (params) => this.createSession(params),
      closeSkill: async () => this.closeSkill(),
      stopSkill: (params) => this.stopSkill(params),
      onSessionStatusChange: (params) => this.onSessionStatusChange(params),
      onSkillWecodeStatusChange: (params) => this.onSkillWecodeStatusChange(params),
      regenerateAnswer: (params) => this.regenerateAnswer(params),
      sendMessageToIM: (params) => this.sendMessageToIM(params),
      getSessionMessage: (params) => this.getSessionMessage(params),
      registerSessionListener: (params) => this.registerSessionListener(params),
      unregisterSessionListener: (params) => this.unregisterSessionListener(params),
      sendMessage: (params) => this.sendMessage(params),
      replyPermission: (params) => this.replyPermission(params),
      controlSkillWeCode: (params) => this.controlSkillWeCode(params)
    };
  }

  private seed(): void {
    for (const seed of this.fixtureData.sessions ?? []) {
      const now = new Date().toISOString();
      const session: SkillSession = {
        welinkSessionId: seed.welinkSessionId,
        userId: "10001",
        ak: seed.ak,
        title: seed.title,
        imGroupId: seed.imGroupId,
        status: seed.status ?? "ACTIVE",
        toolSessionId: null,
        createdAt: now,
        updatedAt: now
      };

      this.sessions.set(session.welinkSessionId, session);
      this.messages.set(session.welinkSessionId, cloneMessages(seed.messages ?? []));
      this.sessionIdSeed = Math.max(this.sessionIdSeed, session.welinkSessionId + 1);

      for (const message of seed.messages ?? []) {
        this.messageIdSeed = Math.max(this.messageIdSeed, message.id + 1);
      }
    }
  }

  private async createSession(params: CreateSessionParams): Promise<SkillSession> {
    validateRequired(params.ak, "ak");
    validateRequired(params.imGroupId, "imGroupId");

    for (const session of this.sessions.values()) {
      if (
        session.imGroupId === params.imGroupId &&
        session.ak === params.ak &&
        session.status === "ACTIVE"
      ) {
        return session;
      }
    }

    const now = new Date().toISOString();
    const session: SkillSession = {
      welinkSessionId: this.sessionIdSeed++,
      userId: "10001",
      ak: params.ak,
      title: params.title ?? "Fixture Session",
      imGroupId: params.imGroupId,
      status: "ACTIVE",
      toolSessionId: null,
      createdAt: now,
      updatedAt: now
    };

    this.sessions.set(session.welinkSessionId, session);
    this.messages.set(session.welinkSessionId, []);
    return session;
  }

  private async closeSkill(): Promise<CloseSkillResult> {
    return { status: "success" };
  }

  private async stopSkill(params: StopSkillParams): Promise<StopSkillResult> {
    validateSessionId(params.welinkSessionId);
    this.cancelActiveStream(params.welinkSessionId);
    this.emitStatus(params.welinkSessionId, "stopped");
    this.emitMessage(params.welinkSessionId, {
      type: "error",
      seq: this.streamSeq++,
      welinkSessionId: params.welinkSessionId,
      emittedAt: new Date().toISOString(),
      error: "aborted by user",
      content: "aborted by user"
    });

    return {
      welinkSessionId: params.welinkSessionId,
      status: "aborted"
    };
  }

  private onSessionStatusChange(params: OnSessionStatusChangeParams): void {
    const current = this.statusCallbacks.get(params.welinkSessionId) ?? new Set();
    current.add(params.callback);
    this.statusCallbacks.set(params.welinkSessionId, current);
  }

  private onSkillWecodeStatusChange(params: OnSkillWecodeStatusChangeParams): void {
    this.miniCallbacks.add(params.callback);
  }

  private async regenerateAnswer(params: RegenerateAnswerParams): Promise<SendMessageResult> {
    validateSessionId(params.welinkSessionId);
    const sessionMessages = this.messages.get(params.welinkSessionId) ?? [];
    const lastUserMessage = [...sessionMessages].reverse().find((message) => message.role === "user");

    if (!lastUserMessage) {
      throw createSdkError(4000, "No cached user message for regenerate");
    }

    return this.sendMessage({
      welinkSessionId: params.welinkSessionId,
      content: lastUserMessage.content
    });
  }

  private async sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult> {
    validateSessionId(params.welinkSessionId);
    const sessionMessages = this.messages.get(params.welinkSessionId) ?? [];
    const targetMessage =
      (params.messageId
        ? sessionMessages.find((message) => message.id === params.messageId)
        : undefined) ??
      [...sessionMessages].reverse().find((message) => message.role === "assistant");

    if (!targetMessage?.content) {
      throw createSdkError(4000, "No cached assistant content for sendMessageToIM");
    }

    this.imMessages.push(targetMessage.content);

    return {
      status: "success",
      chatId: `fixture_chat_${this.imMessages.length}`,
      contentLength: targetMessage.content.length
    };
  }

  private async getSessionMessage(
    params: GetSessionMessageParams
  ): Promise<PageResult<SessionMessage>> {
    validateSessionId(params.welinkSessionId);
    const page = params.page ?? 0;
    const size = params.size ?? 50;
    const sessionMessages = this.messages.get(params.welinkSessionId) ?? [];
    const start = page * size;
    const end = start + size;

    return {
      content: cloneMessages(sessionMessages.slice(start, end)),
      page,
      size,
      total: sessionMessages.length
    };
  }

  private registerSessionListener(params: RegisterSessionListenerParams): void {
    const current = this.listeners.get(params.welinkSessionId) ?? new Set();
    current.add(params);
    this.listeners.set(params.welinkSessionId, current);
  }

  private unregisterSessionListener(params: UnregisterSessionListenerParams): void {
    const current = this.listeners.get(params.welinkSessionId);

    if (!current) {
      return;
    }

    current.forEach((candidate) => {
      if (
        candidate.onMessage === params.onMessage &&
        candidate.onError === params.onError &&
        candidate.onClose === params.onClose
      ) {
        current.delete(candidate);
      }
    });

    if (current.size === 0) {
      this.listeners.delete(params.welinkSessionId);
    }
  }

  private async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    validateSessionId(params.welinkSessionId);
    validateRequired(params.content, "content");
    const now = new Date().toISOString();
    const sessionMessages = this.messages.get(params.welinkSessionId) ?? [];
    const userMessage: SessionMessage = {
      id: this.messageIdSeed++,
      welinkSessionId: params.welinkSessionId,
      userId: "10001",
      role: "user",
      content: params.content,
      messageSeq: nextMessageSeq(sessionMessages),
      parts: [
        {
          partId: `${Date.now()}:text`,
          partSeq: 0,
          type: "text",
          content: params.content
        }
      ],
      createdAt: now
    };

    sessionMessages.push(userMessage);
    this.messages.set(params.welinkSessionId, sessionMessages);
    this.startAssistantStream(params.welinkSessionId, params.content);

    return {
      id: userMessage.id,
      welinkSessionId: userMessage.welinkSessionId,
      userId: "10001",
      role: "user",
      content: userMessage.content,
      messageSeq: userMessage.messageSeq,
      createdAt: userMessage.createdAt
    };
  }

  private async replyPermission(
    params: ReplyPermissionParams
  ): Promise<ReplyPermissionResult> {
    validateSessionId(params.welinkSessionId);
    validateRequired(params.permId, "permId");
    this.emitMessage(params.welinkSessionId, {
      type: "permission.reply",
      seq: this.streamSeq++,
      welinkSessionId: params.welinkSessionId,
      emittedAt: new Date().toISOString(),
      permissionId: params.permId,
      response: params.response
    });

    this.emitStatus(
      params.welinkSessionId,
      params.response === "reject" ? "stopped" : "executing"
    );

    return {
      welinkSessionId: params.welinkSessionId,
      permissionId: params.permId,
      response: params.response
    };
  }

  private async controlSkillWeCode(
    params: ControlSkillWeCodeParams
  ): Promise<ControlSkillWeCodeResult> {
    const status: SkillWecodeStatus = params.action === "close" ? "closed" : "minimized";

    for (const callback of this.miniCallbacks) {
      callback({
        status,
        timestamp: Date.now()
      });
    }

    return { status: "success" };
  }

  private startAssistantStream(sessionId: number, prompt: string): void {
    this.cancelActiveStream(sessionId);
    this.emitStatus(sessionId, "executing");
    const session = this.sessions.get(sessionId);
    const template = this.resolveTemplate(session?.ak);
    const assistantContent = `${template.responsePrefix ?? 'Request received:'} "${prompt}". ${
      template.responseSuffix ?? "Returning a structured Skill SDK response."
    }`;
    const assistantMessage = this.createAssistantMessage(sessionId);
    const sessionMessages = this.messages.get(sessionId) ?? [];
    sessionMessages.push(assistantMessage);
    this.messages.set(sessionId, sessionMessages);

    const activeStream: ActiveStream = {
      timers: [],
      assistantMessageId: assistantMessage.id,
      streamedContent: ""
    };
    this.activeStreams.set(sessionId, activeStream);

    const emittedAt = new Date().toISOString();
    const chunkSize = this.fixtureData.chunkSize ?? 14;
    const interval = this.fixtureData.chunkIntervalMs ?? 220;
    const chunks = splitIntoChunks(assistantContent, chunkSize);
    const events: StreamMessage[] = [
      {
        type: "step.start",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt
      },
      {
        type: "session.status",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt,
        sessionStatus: "busy"
      },
      {
        type: "tool.update",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt,
        messageId: String(assistantMessage.id),
        messageSeq: assistantMessage.messageSeq,
        role: "assistant",
        partId: `${assistantMessage.id}:tool`,
        partSeq: 1,
        toolName: "fixture-builder",
        toolCallId: `fixture_tool_${assistantMessage.id}`,
        status: "completed",
        output: template.toolOutput ?? "Project scaffold generated."
      },
      {
        type: "permission.ask",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt,
        messageId: String(assistantMessage.id),
        messageSeq: assistantMessage.messageSeq,
        role: "assistant",
        partId: `${assistantMessage.id}:permission`,
        partSeq: 2,
        permissionId: `fixture_perm_${assistantMessage.id}`,
        title: template.permissionTitle ?? "Allow writing files into the local project directory"
      },
      ...chunks.map<StreamMessage>((chunk) => ({
        type: "text.delta",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt,
        messageId: String(assistantMessage.id),
        messageSeq: assistantMessage.messageSeq,
        role: "assistant",
        partId: `${assistantMessage.id}:text`,
        partSeq: 0,
        content: chunk
      })),
      {
        type: "text.done",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt,
        messageId: String(assistantMessage.id),
        messageSeq: assistantMessage.messageSeq,
        role: "assistant",
        partId: `${assistantMessage.id}:text`,
        partSeq: 0,
        content: assistantContent
      },
      {
        type: "step.done",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt,
        messageId: String(assistantMessage.id),
        messageSeq: assistantMessage.messageSeq,
        role: "assistant",
        reason: "completed"
      },
      {
        type: "session.status",
        seq: this.streamSeq++,
        welinkSessionId: sessionId,
        emittedAt,
        sessionStatus: "idle"
      }
    ];

    events.forEach((event, index) => {
      const timer = setTimeout(() => {
        const currentStream = this.activeStreams.get(sessionId);

        if (!currentStream || currentStream.assistantMessageId !== assistantMessage.id) {
          return;
        }

        this.applyEventToMessage(sessionId, assistantMessage.id, assistantContent, event, currentStream);
        this.emitMessage(sessionId, event);

        if (event.type === "text.done") {
          this.emitStatus(sessionId, "completed");
        }

        if (event.type === "session.status" && event.sessionStatus === "idle") {
          this.activeStreams.delete(sessionId);
        }
      }, interval * (index + 1));

      activeStream.timers.push(timer);
    });
  }

  private applyEventToMessage(
    sessionId: number,
    assistantMessageId: number,
    assistantContent: string,
    event: StreamMessage,
    activeStream: ActiveStream
  ): void {
    if (event.type === "text.delta") {
      activeStream.streamedContent += event.content ?? "";
      this.updateAssistantMessageContent(sessionId, assistantMessageId, activeStream.streamedContent);
      return;
    }

    if (event.type === "text.done") {
      this.updateAssistantMessageContent(sessionId, assistantMessageId, assistantContent);
    }
  }

  private cancelActiveStream(sessionId: number): void {
    const activeStream = this.activeStreams.get(sessionId);

    if (!activeStream) {
      return;
    }

    activeStream.timers.forEach((timer) => clearTimeout(timer));
    this.activeStreams.delete(sessionId);
  }

  private emitMessage(sessionId: number, message: StreamMessage): void {
    for (const listener of this.listeners.get(sessionId) ?? []) {
      listener.onMessage(message);
    }
  }

  private emitStatus(sessionId: number, status: SessionStatus): void {
    for (const callback of this.statusCallbacks.get(sessionId) ?? []) {
      callback({ status });
    }
  }

  private updateAssistantMessageContent(
    sessionId: number,
    messageId: number,
    content: string
  ): void {
    const sessionMessages = this.messages.get(sessionId);

    if (!sessionMessages) {
      return;
    }

    const targetMessage = sessionMessages.find((message) => message.id === messageId);

    if (!targetMessage) {
      return;
    }

    targetMessage.content = content;
    targetMessage.parts = [
      {
        partId: `${messageId}:text`,
        partSeq: 0,
        type: "text",
        content
      }
    ];
  }

  private createAssistantMessage(sessionId: number): SessionMessage {
    const sessionMessages = this.messages.get(sessionId) ?? [];

    return {
      id: this.messageIdSeed++,
      welinkSessionId: sessionId,
      userId: null,
      role: "assistant",
      content: "",
      messageSeq: nextMessageSeq(sessionMessages),
      parts: [],
      createdAt: new Date().toISOString()
    };
  }

  private resolveTemplate(ak?: string | null): FixtureTemplate {
    return this.fixtureData.templates?.[ak ?? ""] ?? this.fixtureData.templates?.default ?? {};
  }
}

function validateRequired(value: string | undefined, fieldName: string): void {
  if (!value || !value.trim()) {
    throw createSdkError(1000, `Invalid parameter: ${fieldName}`);
  }
}

function validateSessionId(sessionId: number): void {
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    throw createSdkError(1000, "Invalid parameter: welinkSessionId");
  }
}

function nextMessageSeq(messages: SessionMessage[]): number {
  return (messages[messages.length - 1]?.messageSeq ?? 0) + 1;
}

function splitIntoChunks(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < content.length; index += chunkSize) {
    chunks.push(content.slice(index, index + chunkSize));
  }

  return chunks;
}

function cloneMessages(messages: SessionMessage[]): SessionMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => ({ ...part }))
  }));
}
