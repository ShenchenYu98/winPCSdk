import {
  DEFAULT_LISTENER_CIRCUIT_BREAKER_THRESHOLD,
  DEFAULT_PAGE,
  DEFAULT_SIZE,
  resolveConnectionPolicy,
} from '../config';
import { createSkillSdkError, ERROR_CODE, isSkillSdkError } from '../errors';
import { ConnectionManager } from '../core/connection-manager';
import { ErrorNormalizer } from '../core/error-normalizer';
import { ListenerRegistry } from '../core/listener-registry';
import { MessageMergeEngine } from '../core/message-merge-engine';
import { MetricsCollector } from '../core/metrics';
import { SessionStore } from '../core/session-store';
import { assertNonEmptyString, assertPositiveNumber } from '../core/validators';
import { WeCodeController } from '../core/wecode-controller';
import { createApiClient } from '../net/http-client';
import { createDefaultSocketFactory } from '../net/socket-factory';
import type {
  AnswerResult,
  ChatMessage,
  ControlSkillWeCodeParams,
  ControlSkillWeCodeResult,
  ExecuteSkillParams,
  GetSessionMessageParams,
  PageResult,
  RegisterSessionListenerParams,
  RegenerateAnswerParams,
  ReplyPermissionParams,
  ReplyPermissionResult,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  SessionContext,
  SkillClient,
  SkillClientInitOptions,
  SkillSession,
  SkillSdkError,
  StopSkillParams,
  StopSkillResult,
  StreamMessage,
  UnregisterSessionListenerParams,
} from '../types';

interface ServerMessageResult {
  id?: string | number;
  messageId?: string | number;
  seq?: number;
  createdAt?: string;
}

export function createSkillClient(options: SkillClientInitOptions): SkillClient {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const sessionStore = new SessionStore();
  const messageMergeEngine = new MessageMergeEngine();
  const metrics = new MetricsCollector();
  const errorNormalizer = new ErrorNormalizer();
  const listenerRegistry = new ListenerRegistry(
    options.listenerCircuitBreakerThreshold ?? DEFAULT_LISTENER_CIRCUIT_BREAKER_THRESHOLD,
  );
  const weCodeController = new WeCodeController(listenerRegistry);
  const apiClient = createApiClient({
    baseUrl: options.baseUrl,
    fetchImpl,
  });
  const policy = resolveConnectionPolicy(options.env ?? 'prod', options.connectionPolicy);
  const wsBaseUrl = options.wsUrl ?? options.baseUrl;
  const socketFactory = options.socketFactory ?? createDefaultSocketFactory();
  const pendingFirstPacketBySession = new Map<string, number>();
  const pendingPermissionCycleBySession = new Map<string, number>();

  const connectionManager = new ConnectionManager(wsBaseUrl, policy, socketFactory, {
    onConnecting(sessionId) {
      sessionStore.setConnectionState(sessionId, 'CONNECTING');
    },
    onOpen(sessionId) {
      sessionStore.setConnectionState(sessionId, 'CONNECTED');
    },
    onMessage(sessionId, message) {
      handleStreamMessage(sessionId, message);
    },
    onError(sessionId, error) {
      sessionStore.setConnectionState(sessionId, 'DISCONNECTED');
      const dispatch = listenerRegistry.emitError(sessionId, error);
      metrics.recordCallbackStats(dispatch.delivered, dispatch.failed);
    },
    onClose(sessionId, reason) {
      sessionStore.setConnectionState(sessionId, 'DISCONNECTED');
      const dispatch = listenerRegistry.emitClose(sessionId, reason);
      metrics.recordCallbackStats(dispatch.delivered, dispatch.failed);
    },
    onReconnect() {
      metrics.recordWsReconnect();
    },
  });

  function ensurePlaceholderContext(sessionId: string): SessionContext {
    const existing = sessionStore.get(sessionId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    return sessionStore.upsertFromSkillSession({
      id: sessionId,
      userId: '',
      skillDefinitionId: 0,
      status: 'IDLE',
      imChatId: '',
      createdAt: now,
      lastActiveAt: now,
    });
  }

  function normalizeSession(raw: Record<string, unknown>): SkillSession {
    const id = String(raw.id ?? raw.sessionId ?? '');
    return {
      id,
      userId: String(raw.userId ?? ''),
      skillDefinitionId: Number(raw.skillDefinitionId ?? 0),
      agentId: raw.agentId === undefined ? undefined : Number(raw.agentId),
      toolSessionId: raw.toolSessionId === undefined ? undefined : String(raw.toolSessionId),
      title: raw.title === undefined ? undefined : String(raw.title),
      status: ((raw.status ?? 'IDLE') as string).toUpperCase() as SkillSession['status'],
      imChatId: String(raw.imChatId ?? ''),
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      lastActiveAt: String(raw.lastActiveAt ?? new Date().toISOString()),
    };
  }

  function normalizeMessage(raw: Record<string, unknown>, sessionId: string): ChatMessage {
    return {
      id: String(raw.id ?? raw.messageId ?? `${sessionId}-unknown`),
      sessionId: String(raw.sessionId ?? sessionId),
      seq: Number(raw.seq ?? 0),
      role: (raw.role as ChatMessage['role']) ?? 'ASSISTANT',
      content: String(raw.content ?? ''),
      contentType: (raw.contentType as ChatMessage['contentType']) ?? 'MARKDOWN',
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      meta: (raw.meta as Record<string, unknown> | undefined) ?? undefined,
    };
  }

  function mapStreamTypeToStatus(type: StreamMessage['type']): 'executing' | 'stopped' | 'completed' {
    if (type === 'done') {
      return 'completed';
    }

    if (type === 'error' || type === 'agent_offline') {
      return 'stopped';
    }

    return 'executing';
  }

  function handleStreamMessage(sessionId: string, message: StreamMessage): void {
    const ctx = sessionStore.get(sessionId);
    if (ctx) {
      const lastSeq = ctx.lastSeq ?? -1;
      if (message.seq > lastSeq) {
        sessionStore.setLastSeq(sessionId, message.seq);
      }
    }

    const firstPacketStart = pendingFirstPacketBySession.get(sessionId);
    if (firstPacketStart !== undefined && message.type === 'delta') {
      metrics.recordFirstPacketLatency(Date.now() - firstPacketStart);
      pendingFirstPacketBySession.delete(sessionId);
    }

    messageMergeEngine.onStreamMessage(message);
    const nextExecutionStatus = mapStreamTypeToStatus(message.type);
    sessionStore.setExecutionStatus(sessionId, nextExecutionStatus);

    const dispatchStart = Date.now();
    const statusDispatch = listenerRegistry.emitStatus(sessionId, { status: nextExecutionStatus });
    const messageDispatch = listenerRegistry.emitMessage(sessionId, message);
    const dispatchLatencyMs = Date.now() - dispatchStart;

    metrics.recordDispatchLatency(dispatchLatencyMs);
    metrics.recordCallbackStats(
      statusDispatch.delivered + messageDispatch.delivered,
      statusDispatch.failed + messageDispatch.failed,
    );
  }

  function normalizeAndThrow(
    error: unknown,
    source: 'REST' | 'WS' | 'SDK',
    sessionId?: string,
    stopIssued?: boolean,
  ): never {
    if (isSkillSdkError(error)) {
      throw error;
    }

    throw errorNormalizer.normalize({
      error,
      source,
      sessionId,
      stopIssued,
    });
  }

  async function safeCall<T>(
    operation: () => Promise<T>,
    source: 'REST' | 'WS' | 'SDK',
    sessionId?: string,
    stopIssued?: boolean,
  ): Promise<T> {
    try {
      const result = await operation();
      metrics.recordInterfaceCall(true);
      return result;
    } catch (error) {
      metrics.recordInterfaceCall(false);
      normalizeAndThrow(error, source, sessionId, stopIssued);
    }
  }

  async function waitForConnectionReady(sessionId: string): Promise<void> {
    const timeoutMs = Math.min(policy.disconnectThresholdMs, 2500);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const state = sessionStore.get(sessionId)?.connectionState;
      if (state === 'CONNECTED') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 16));
    }

    throw createSkillSdkError({
      code: ERROR_CODE.CONNECTION_UNAVAILABLE,
      message: 'WebSocket connection is not ready before message send',
      source: 'WS',
      sessionId,
      retriable: true,
    });
  }

  async function sendMessageInternal(
    params: SendMessageParams,
    trackMetrics: boolean,
  ): Promise<SendMessageResult> {
    assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
    assertNonEmptyString(params.content, 'content', params.sessionId);

    const run = async (): Promise<SendMessageResult> => {
      const context = sessionStore.get(params.sessionId);
      if (context?.lifecycle === 'CLOSED') {
        throw createSkillSdkError({
          code: ERROR_CODE.SESSION_CLOSED,
          message: 'Session already closed',
          source: 'SDK',
          sessionId: params.sessionId,
          retriable: false,
        });
      }

      connectionManager.ensureConnection(ensurePlaceholderContext(params.sessionId));
      await waitForConnectionReady(params.sessionId);
      pendingFirstPacketBySession.set(params.sessionId, Date.now());
      const response = await apiClient.post<ServerMessageResult>(
        `/api/skill/sessions/${encodeURIComponent(params.sessionId)}/messages`,
        { content: params.content },
      );

      sessionStore.setExecutionStatus(params.sessionId, 'executing');

      return {
        messageId: String(response.messageId ?? response.id ?? ''),
        seq: Number(response.seq ?? 0),
        createdAt: String(response.createdAt ?? new Date().toISOString()),
      };
    };

    if (trackMetrics) {
      return safeCall(run, 'REST', params.sessionId, Boolean(sessionStore.get(params.sessionId)?.stopIssuedAt));
    }

    try {
      return await run();
    } catch (error) {
      normalizeAndThrow(error, 'REST', params.sessionId, Boolean(sessionStore.get(params.sessionId)?.stopIssuedAt));
    }
  }

  function replayBufferedStreamToListener(params: RegisterSessionListenerParams): void {
    const accumulator = messageMergeEngine.getAccumulator(params.sessionId);
    if (!accumulator || !accumulator.content) {
      return;
    }

    try {
      params.onMessage({
        sessionId: params.sessionId,
        type: 'delta',
        seq: accumulator.seq,
        content: accumulator.content,
      });

      if (!accumulator.isStreaming) {
        params.onMessage({
          sessionId: params.sessionId,
          type: 'done',
          seq: accumulator.seq + 1,
          content: '',
        });
      }
    } catch (error) {
      if (!params.onError) {
        return;
      }
      params.onError(
        errorNormalizer.normalize({
          error,
          source: 'SDK',
          sessionId: params.sessionId,
        }),
      );
    }
  }

  return {
    async executeSkill(params: ExecuteSkillParams): Promise<SkillSession> {
      assertNonEmptyString(params.imChatId, 'imChatId');
      assertPositiveNumber(params.skillDefinitionId, 'skillDefinitionId');
      assertNonEmptyString(params.userId, 'userId');
      assertNonEmptyString(params.skillContent, 'skillContent');

      return safeCall(async () => {
        const created = await apiClient.post<Record<string, unknown>>('/api/skill/sessions', {
          userId: params.userId,
          skillDefinitionId: params.skillDefinitionId,
          agentId: params.agentId,
          title: params.title,
          imChatId: params.imChatId,
        });

        const session = normalizeSession(created);
        sessionStore.upsertFromSkillSession(session);
        sessionStore.setLifecycle(session.id, 'ACTIVE');
        connectionManager.ensureConnection(ensurePlaceholderContext(session.id));

        await sendMessageInternal({ sessionId: session.id, content: params.skillContent }, false);
        return session;
      }, 'REST');
    },

    async closeSkill() {
      return safeCall(async () => {
        connectionManager.closeAll('closeSkill');
        sessionStore.clear();
        listenerRegistry.clear();
        messageMergeEngine.clearAll();
        pendingFirstPacketBySession.clear();
        pendingPermissionCycleBySession.clear();
        return { status: 'success' as const };
      }, 'SDK');
    },

    async stopSkill(params: StopSkillParams): Promise<StopSkillResult> {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      return safeCall(async () => {
        await apiClient.delete(`/api/skill/sessions/${encodeURIComponent(params.sessionId)}`);
        sessionStore.markStopIssued(params.sessionId);
        listenerRegistry.emitStatus(params.sessionId, { status: 'stopped' });
        return { status: 'success' };
      }, 'REST', params.sessionId);
    },

    onSessionStatusChange(params) {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      listenerRegistry.registerStatusListener(params.sessionId, params.callback);
    },

    onSkillWecodeStatusChange(params) {
      listenerRegistry.registerWecodeStatusListener(params.callback);
    },

    async regenerateAnswer(params: RegenerateAnswerParams): Promise<AnswerResult> {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      return safeCall(async () => {
        const messages = await this.getSessionMessage({
          sessionId: params.sessionId,
          page: DEFAULT_PAGE,
          size: DEFAULT_SIZE,
        });

        const latestUserMessage = [...messages.content].reverse().find((message) => message.role === 'USER');
        if (!latestUserMessage) {
          throw createSkillSdkError({
            code: ERROR_CODE.NO_USER_MESSAGE_FOR_REGENERATE,
            message: 'Cannot regenerate without a previous user message',
            source: 'SDK',
            sessionId: params.sessionId,
            retriable: false,
          });
        }

        const result = await sendMessageInternal(
          { sessionId: params.sessionId, content: latestUserMessage.content },
          false,
        );

        return {
          messageId: result.messageId,
          success: true,
        };
      }, 'REST', params.sessionId);
    },

    async sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult> {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      assertNonEmptyString(params.content, 'content', params.sessionId);
      return safeCall(async () => {
        const result = await apiClient.post<Record<string, unknown>>(
          `/api/skill/sessions/${encodeURIComponent(params.sessionId)}/send-to-im`,
          { content: params.content },
        );

        return {
          success: Boolean(result.success ?? true),
          chatId: result.chatId === undefined ? undefined : String(result.chatId),
          contentLength: result.contentLength === undefined ? params.content.length : Number(result.contentLength),
          errorMessage: result.errorMessage === undefined ? undefined : String(result.errorMessage),
        };
      }, 'REST', params.sessionId);
    },

    async getSessionMessage(params: GetSessionMessageParams): Promise<PageResult<ChatMessage>> {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      const page = params.page ?? DEFAULT_PAGE;
      const size = params.size ?? DEFAULT_SIZE;
      return safeCall(async () => {
        const response = await apiClient.get<PageResult<Record<string, unknown>>>(
          `/api/skill/sessions/${encodeURIComponent(params.sessionId)}/messages?page=${page}&size=${size}`,
        );

        const normalized: PageResult<ChatMessage> = {
          ...response,
          content: response.content.map((message) => normalizeMessage(message, params.sessionId)),
        };

        return messageMergeEngine.merge(params.sessionId, normalized);
      }, 'REST', params.sessionId);
    },

    registerSessionListener(params: RegisterSessionListenerParams): void {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      listenerRegistry.registerMessageListener(
        params.sessionId,
        params.onMessage,
        params.onError,
        params.onClose,
      );

      if (options.autoConnectOnRegister ?? true) {
        connectionManager.ensureConnection(ensurePlaceholderContext(params.sessionId));
      }

      replayBufferedStreamToListener(params);
    },

    unregisterSessionListener(params: UnregisterSessionListenerParams): void {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      const removed = listenerRegistry.unregisterMessageListener(
        params.sessionId,
        params.onMessage,
        params.onError,
        params.onClose,
      );

      if (!removed) {
        throw listenerRegistry.getListenerNotFoundError(params.sessionId);
      }

      if ((options.autoDisconnectWhenNoListeners ?? true) && !listenerRegistry.hasListeners(params.sessionId)) {
        connectionManager.closeSession(params.sessionId, 'no listeners');
      }
    },

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
      return sendMessageInternal(params, true);
    },

    async replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult> {
      assertNonEmptyString(params.sessionId, 'sessionId', params.sessionId);
      assertNonEmptyString(params.permissionId, 'permissionId', params.sessionId);
      const start = Date.now();
      pendingPermissionCycleBySession.set(params.sessionId, start);

      return safeCall(async () => {
        const result = await apiClient.post<Record<string, unknown>>(
          `/api/skill/sessions/${encodeURIComponent(params.sessionId)}/permissions/${encodeURIComponent(params.permissionId)}`,
          { approved: params.approved },
        );

        const cycleStart = pendingPermissionCycleBySession.get(params.sessionId);
        if (cycleStart !== undefined) {
          metrics.recordPermissionCycle(Date.now() - cycleStart);
          pendingPermissionCycleBySession.delete(params.sessionId);
        }

        return {
          success: Boolean(result.success ?? true),
          permissionId: String(result.permissionId ?? params.permissionId),
          approved: Boolean(result.approved ?? params.approved),
        };
      }, 'REST', params.sessionId);
    },

    async controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResult> {
      if (params.action !== 'close' && params.action !== 'minimize') {
        throw createSkillSdkError({
          code: ERROR_CODE.INVALID_ARGUMENT,
          message: 'action must be close or minimize',
          source: 'SDK',
          retriable: false,
        });
      }

      return safeCall(async () => {
        const output = weCodeController.trigger(params.action);
        metrics.recordCallbackStats(output.dispatch.delivered, output.dispatch.failed);
        return output.result;
      }, 'SDK');
    },

    getMetricsSnapshot() {
      return metrics.snapshot();
    },
  };
}
