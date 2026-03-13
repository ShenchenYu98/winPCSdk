import { createSdkError } from "../errors";
import { SkillServerClient } from "../client/skillServerClient";
import type {
  CreateSessionParams,
  GetSessionMessageParams,
  PageResult,
  RegenerateAnswerParams,
  ReplyPermissionParams,
  ReplyPermissionResult,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  SessionMessage,
  SkillSession
} from "../types";
import { MessageCacheStore } from "./messageCacheStore";

export class SessionOrchestrator {
  constructor(
    private readonly client: SkillServerClient,
    private readonly cacheStore: MessageCacheStore
  ) {}

  async createSession(params: CreateSessionParams): Promise<SkillSession> {
    return this.client.createOrReuseSession(params);
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    validateSessionId(params.welinkSessionId);

    const result = await this.client.sendMessage(params);
    this.cacheStore.applyHistory(params.welinkSessionId, [
      {
        id: result.id,
        seq: result.seq,
        welinkSessionId: result.welinkSessionId,
        role: result.role,
        content: result.content,
        contentType: result.contentType,
        meta: result.meta,
        messageSeq: result.messageSeq,
        parts: result.parts,
        createdAt: result.createdAt
      }
    ]);
    return result;
  }

  async regenerateAnswer(params: RegenerateAnswerParams): Promise<SendMessageResult> {
    validateSessionId(params.welinkSessionId);

    let content = this.cacheStore.getLastUserMessageContent(params.welinkSessionId);

    if (!content) {
      const history = await this.client.getSessionMessages(params.welinkSessionId, 0, 50);
      this.cacheStore.applyHistory(params.welinkSessionId, history.content);
      content = this.cacheStore.getLastUserMessageContent(params.welinkSessionId);
    }

    if (!content) {
      throw createSdkError(4002, "会话中没有用户消息可用于重新生成");
    }

    return this.sendMessage({
      welinkSessionId: params.welinkSessionId,
      content
    });
  }

  async getSessionMessage(
    params: GetSessionMessageParams
  ): Promise<PageResult<SessionMessage>> {
    validateSessionId(params.welinkSessionId);

    const page = params.page ?? 0;
    const size = params.size ?? 50;
    const history = await this.client.getSessionMessages(params.welinkSessionId, page, size);
    return this.cacheStore.toPageResult(params.welinkSessionId, history);
  }

  async replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult> {
    validateSessionId(params.welinkSessionId);

    if (!params.permId?.trim()) {
      throw createSdkError(1000, "无效的参数: permId");
    }

    return this.client.replyPermission(params);
  }

  async sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult> {
    validateSessionId(params.welinkSessionId);

    if (params.messageId) {
      if (!this.cacheStore.hasMessage(params.welinkSessionId, params.messageId)) {
        throw createSdkError(4003, "消息不存在");
      }

      if (!this.cacheStore.hasFinalText(params.welinkSessionId, params.messageId)) {
        throw createSdkError(4004, "消息未完成");
      }
    }

    const content = this.cacheStore.getFinalText(params.welinkSessionId, params.messageId);

    if (!content) {
      throw createSdkError(4005, "会话中没有已完成消息");
    }

    return this.client.sendMessageToIM(params.welinkSessionId, content, params.chatId);
  }
}

function validateSessionId(sessionId: string): void {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw createSdkError(1000, "无效的参数: welinkSessionId");
  }
}
