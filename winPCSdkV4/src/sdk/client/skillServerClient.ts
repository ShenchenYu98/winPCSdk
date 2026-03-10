import { createSdkError } from "../errors";
import type {
  CreateSessionParams,
  PageResult,
  ReplyPermissionParams,
  ReplyPermissionResult,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMResult,
  SessionMessage,
  SkillSession,
  StopSkillResult
} from "../types";

interface CreateSessionPayload {
  ak: string;
  title?: string;
  imGroupId: string;
}

export class SkillServerClient {
  constructor(private readonly baseUrl: string) {}

  async listActiveSessions(imGroupId: string, ak: string): Promise<SkillSession[]> {
    const query = new URLSearchParams({ imGroupId, ak, status: "ACTIVE" });
    return this.request<SkillSession[]>(`/api/skill/sessions?${query.toString()}`);
  }

  async createSession(payload: CreateSessionPayload): Promise<SkillSession> {
    return this.request<SkillSession>("/api/skill/sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    this.validateSessionId(params.welinkSessionId);
    this.validateRequired(params.content, "content");

    return this.request<SendMessageResult>(`/api/skill/sessions/${params.welinkSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: params.content,
        toolCallId: params.toolCallId
      })
    });
  }

  async abortSession(welinkSessionId: number): Promise<StopSkillResult> {
    this.validateSessionId(welinkSessionId);

    return this.request<StopSkillResult>(`/api/skill/sessions/${welinkSessionId}/abort`, {
      method: "POST"
    });
  }

  async getSessionMessages(
    welinkSessionId: number,
    page: number,
    size: number
  ): Promise<PageResult<SessionMessage>> {
    this.validateSessionId(welinkSessionId);
    const query = new URLSearchParams({ page: String(page), size: String(size) });
    return this.request<PageResult<SessionMessage>>(
      `/api/skill/sessions/${welinkSessionId}/messages?${query.toString()}`
    );
  }

  async replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult> {
    this.validateSessionId(params.welinkSessionId);
    this.validateRequired(params.permId, "permId");

    return this.request<ReplyPermissionResult>(
      `/api/skill/sessions/${params.welinkSessionId}/permissions/${params.permId}`,
      {
        method: "POST",
        body: JSON.stringify({ response: params.response })
      }
    );
  }

  async sendMessageToIM(welinkSessionId: number, content: string): Promise<SendMessageToIMResult> {
    this.validateSessionId(welinkSessionId);
    this.validateRequired(content, "content");

    return this.request<SendMessageToIMResult>(`/api/skill/sessions/${welinkSessionId}/send-to-im`, {
      method: "POST",
      body: JSON.stringify({ content })
    });
  }

  async createOrReuseSession(params: CreateSessionParams): Promise<SkillSession> {
    this.validateRequired(params.ak, "ak");
    this.validateRequired(params.imGroupId, "imGroupId");

    const sessions = await this.listActiveSessions(params.imGroupId, params.ak);
    return (
      sessions[0] ??
      this.createSession({
        ak: params.ak,
        title: params.title,
        imGroupId: params.imGroupId
      })
    );
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("cookie", "userId=1");

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers
      });
    } catch {
      throw createSdkError(6000, "网络错误");
    }

    if (!response.ok) {
      throw createSdkError(7000, `服务端错误: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private validateRequired(value: string | undefined, fieldName: string): void {
    if (!value || !value.trim()) {
      throw createSdkError(1000, `无效的参数: ${fieldName}`);
    }
  }

  private validateSessionId(sessionId: number): void {
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      throw createSdkError(1000, "无效的参数: welinkSessionId");
    }
  }
}
