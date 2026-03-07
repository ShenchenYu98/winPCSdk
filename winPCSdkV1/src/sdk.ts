import { SkillRestApi } from './clients/rest-client.js';
import { SkillStreamClient } from './clients/stream-client.js';
import { SkillSdkError } from './errors.js';
import { EventCenter } from './event-center.js';
import { MiniProgramController } from './mini-program-controller.js';
import { MessageStore } from './stores/message-store.js';
import { SessionStore } from './stores/session-store.js';
import type {
  AnswerResult,
  ChatMessage,
  PageResult,
  SessionStatus,
  SkillSDK,
  SkillSDKConfig,
  SkillSession,
  SkillWeCodeAction,
  StreamMessage
} from './types.js';

export class SkillSDKFacade implements SkillSDK {
  private readonly config: SkillSDKConfig;
  private readonly restApi: SkillRestApi;
  private readonly streamClient: SkillStreamClient;
  private readonly sessionStore = new SessionStore();
  private readonly messageStore = new MessageStore();
  private readonly eventCenter = new EventCenter();
  private readonly miniProgramController: MiniProgramController;
  private readonly sendLocks = new Set<string>();

  constructor(config: SkillSDKConfig) {
    this.config = {
      messagePageSize: 50,
      sessionListPageSize: 20,
      ...config
    };

    if (!this.config.skillDefinitionId) {
      throw new SkillSdkError('INVALID_PARAMS', 'skillDefinitionId must be provided in SDK config');
    }

    this.restApi = new SkillRestApi(this.config);
    this.streamClient = new SkillStreamClient(
      this.config,
      (sessionId, status) => {
        this.updateStatus(sessionId, status);
      },
      (sessionId, message) => {
        this.handleStreamMessage(sessionId, message);
      }
    );

    this.miniProgramController = new MiniProgramController(this.config.hostAdapter, (status) => {
      this.eventCenter.emitWecodeStatus(status);
    });

    this.miniProgramController.registerLifecycleListeners();
  }

  async executeSkill(
    imChatId: string,
    userId: string,
    skillContent: string,
    agentId?: number,
    title?: string
  ): Promise<SkillSession> {
    this.assertRequired(imChatId, 'imChatId');
    this.assertRequired(userId, 'userId');
    this.assertRequired(skillContent, 'content');

    const session = await this.restApi.createSession({
      userId: Number(userId),
      skillDefinitionId: this.config.skillDefinitionId,
      agentId,
      title,
      imChatId
    });

    const sessionId = String(session.id);
    this.sessionStore.upsert(session, 'idle');

    await this.streamClient.ensureConnection(sessionId);
    this.sessionStore.setStreamConnected(sessionId, true);

    await this.sendMessage(sessionId, skillContent, () => undefined);
    return session;
  }

  async closeSkill(sessionId: string): Promise<boolean> {
    this.assertRequired(sessionId, 'sessionId');

    await this.restApi.closeSession(sessionId);
    this.streamClient.disconnect(sessionId, { closedByUser: true });
    this.sessionStore.markClosed(sessionId);
    this.messageStore.clearSession(sessionId);
    this.eventCenter.clearSession(sessionId);

    return true;
  }

  async stopSkill(sessionId: string): Promise<boolean> {
    this.assertRequired(sessionId, 'sessionId');

    this.streamClient.disconnect(sessionId, { stoppedByUser: true });
    this.sessionStore.setStreamConnected(sessionId, false);
    this.sessionStore.setStatus(sessionId, 'stopped');
    this.eventCenter.emitSessionStatus(sessionId, 'stopped');

    return true;
  }

  onSessionStatus(sessionId: string, callback: (status: SessionStatus) => void): void {
    this.assertRequired(sessionId, 'sessionId');
    this.eventCenter.onSessionStatus(sessionId, callback);
  }

  onSkillWecodeStatus(callback: (status: 'closed' | 'minimized') => void): void {
    this.eventCenter.onWecodeStatus(callback);
  }

  async regenerateAnswer(sessionId: string): Promise<AnswerResult> {
    this.assertRequired(sessionId, 'sessionId');

    let lastUserMessage = this.messageStore.getLastUserMessage(sessionId);
    if (!lastUserMessage) {
      const messages = await this.getSessionMessage(sessionId, 0, this.config.messagePageSize);
      lastUserMessage = [...messages.content].reverse().find((message) => message.role === 'USER');
    }

    if (!lastUserMessage?.content) {
      throw new SkillSdkError('MESSAGE_SEND_FAILED', 'No user message found for regenerate');
    }

    await this.streamClient.ensureConnection(sessionId);
    const message = await this.restApi.sendUserMessage(sessionId, { content: lastUserMessage.content });
    this.messageStore.appendMessage(sessionId, message);
    this.sessionStore.setStatus(sessionId, 'pending');

    return {
      messageId: String(message.id),
      success: true
    };
  }

  async sendMessageToIM(sessionId: string, content: string): Promise<boolean> {
    this.assertRequired(sessionId, 'sessionId');
    this.assertRequired(content, 'content');

    const response = await this.restApi.sendMessageToIM(sessionId, { content });
    return Boolean(response.success);
  }

  async getSessionMessage(sessionId: string, page = 0, size = 50): Promise<PageResult<ChatMessage>> {
    this.assertRequired(sessionId, 'sessionId');

    const pageData = await this.restApi.getSessionMessages(sessionId, page, size);
    this.messageStore.setMessages(sessionId, pageData);
    return pageData;
  }

  async sendMessage(
    sessionId: string,
    content: string,
    onMessage: (message: StreamMessage) => void
  ): Promise<boolean> {
    this.assertRequired(sessionId, 'sessionId');
    this.assertRequired(content, 'content');

    if (this.sendLocks.has(sessionId)) {
      throw new SkillSdkError('SESSION_BUSY', `Session ${sessionId} is busy`);
    }

    this.sendLocks.add(sessionId);

    try {
      await this.streamClient.ensureConnection(sessionId);
      this.sessionStore.setStreamConnected(sessionId, true);

      const unsubscribe = this.eventCenter.onStreamMessage(sessionId, onMessage);
      const userMessage = await this.restApi.sendUserMessage(sessionId, { content });
      this.messageStore.appendMessage(sessionId, userMessage);
      this.sessionStore.setStatus(sessionId, 'pending');

      const endWatcher = this.eventCenter.onSessionStatus(sessionId, (status) => {
        if (status === 'completed' || status === 'stopped') {
          unsubscribe();
          endWatcher();
        }
      });

      return true;
    } finally {
      this.sendLocks.delete(sessionId);
    }
  }

  async replyPermission(sessionId: string, permissionId: string, approved: boolean): Promise<boolean> {
    this.assertRequired(sessionId, 'sessionId');
    this.assertRequired(permissionId, 'permissionId');

    const result = await this.restApi.replyPermission(sessionId, permissionId, { approved });
    return Boolean(result.success);
  }

  async controlSkillWeCode(action: SkillWeCodeAction): Promise<boolean> {
    await this.miniProgramController.control(action);

    if (action === 'close') {
      const sessionIds = this.sessionStore.getAllSessionIds();
      for (const sessionId of sessionIds) {
        const record = this.sessionStore.get(sessionId);
        if (record?.status !== 'closed') {
          await this.closeSkill(sessionId);
        }
      }
    }

    return true;
  }

  async copySkillResult(sessionId: string, content?: string): Promise<boolean> {
    this.assertRequired(sessionId, 'sessionId');

    const toCopy = content ?? this.messageStore.getLastAssistantMessage(sessionId)?.content;
    if (!toCopy) {
      return false;
    }

    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      return false;
    }

    await clipboard.writeText(toCopy);
    return true;
  }

  private updateStatus(sessionId: string, status: SessionStatus): void {
    if (status === 'executing') {
      this.sessionStore.setStatus(sessionId, 'executing');
    } else if (status === 'completed') {
      this.sessionStore.setStatus(sessionId, 'completed');
    } else {
      this.sessionStore.setStatus(sessionId, 'stopped');
      this.messageStore.failStreaming(sessionId);
    }

    this.eventCenter.emitSessionStatus(sessionId, status);
  }

  private handleStreamMessage(sessionId: string, message: StreamMessage): void {
    if (message.type === 'delta') {
      const chunk = typeof message.content === 'string' ? message.content : '';
      this.messageStore.appendStreamingDelta(sessionId, chunk);
    }

    if (message.type === 'done') {
      const usage = this.parseUsage(message.content);
      this.messageStore.completeStreaming(sessionId, usage);
    }

    if (message.type === 'error') {
      this.messageStore.failStreaming(sessionId);
    }

    this.eventCenter.emitStreamMessage(sessionId, message);
  }

  private parseUsage(content: unknown): { inputTokens: number; outputTokens: number } | undefined {
    if (!content || typeof content !== 'object') {
      return undefined;
    }

    const usage = (content as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
    if (!usage) {
      return undefined;
    }

    if (typeof usage.inputTokens !== 'number' || typeof usage.outputTokens !== 'number') {
      return undefined;
    }

    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    };
  }

  private assertRequired(value: string | number | undefined, key: string): void {
    const isMissing = value === undefined || value === null || String(value).trim() === '';
    if (!isMissing) {
      return;
    }

    const code = key === 'sessionId' ? 'MISSING_SESSION_ID' : key === 'userId' ? 'MISSING_USER_ID' : 'MISSING_CONTENT';
    throw new SkillSdkError(code, `${key} is required`);
  }
}

export function createSkillSDK(config: SkillSDKConfig): SkillSDKFacade {
  return new SkillSDKFacade(config);
}
