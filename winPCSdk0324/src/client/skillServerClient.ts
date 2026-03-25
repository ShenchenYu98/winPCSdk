import { createSdkError } from "../errors";
import type {
  CreateNewSessionParams,
  CreateSessionParams,
  HistorySessionsParams,
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
  ak?: string;
  title?: string;
  imGroupId?: string;
  parentAccount?: string;
}

interface Layer1Response<T> {
  code: number;
  errormsg: string;
  data: T | null;
}

export class SkillServerClient {
  constructor(private readonly baseUrl: string) {}

  async listActiveSessions(imGroupId: string, ak?: string): Promise<PageResult<SkillSession>> {
    this.validateRequired(imGroupId, "imGroupId");

    const query = new URLSearchParams({ imGroupId, status: "ACTIVE" });

    if (ak?.trim()) {
      query.set("ak", ak);
    }

    return this.request<PageResult<SkillSession>>(`/api/skill/sessions?${query.toString()}`);
  }

  async getHistorySessionsList(params: HistorySessionsParams): Promise<PageResult<SkillSession>> {
    const query = new URLSearchParams({
      page: String(params.page),
      size: String(params.size)
    });

    if (params.status) {
      query.set("status", params.status);
    }

    if (params.ak?.trim()) {
      query.set("ak", params.ak.trim());
    }

    if (params.imGroupId?.trim()) {
      query.set("imGroupId", params.imGroupId.trim());
    }

    if (params.partnerAccount?.trim()) {
      query.set("partnerAccount", params.partnerAccount.trim());
    }

    return this.request<PageResult<SkillSession>>(`/api/skill/sessions?${query.toString()}`);
  }

  async createSession(payload: CreateSessionPayload): Promise<SkillSession> {
    return this.request<SkillSession>("/api/skill/sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async createNewSession(params: CreateNewSessionParams): Promise<SkillSession> {
    return this.createSession(this.normalizeCreateSessionPayload(params));
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

  async abortSession(welinkSessionId: string): Promise<StopSkillResult> {
    this.validateSessionId(welinkSessionId);

    return this.request<StopSkillResult>(`/api/skill/sessions/${welinkSessionId}/abort`, {
      method: "POST"
    });
  }

  async getSessionMessages(
    welinkSessionId: string,
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

  async sendMessageToIM(
    welinkSessionId: string,
    content: string,
    chatId?: string
  ): Promise<SendMessageToIMResult> {
    this.validateSessionId(welinkSessionId);
    this.validateRequired(content, "content");

    return this.request<SendMessageToIMResult>(
      `/api/skill/sessions/${welinkSessionId}/send-to-im`,
      {
        method: "POST",
        body: JSON.stringify({ content, chatId })
      }
    );
  }

  async createOrReuseSession(params: CreateSessionParams): Promise<SkillSession> {
    this.validateRequired(params.imGroupId, "imGroupId");

    const sessions = await this.listActiveSessions(params.imGroupId, params.ak);
    const latestActiveSession = [...sessions.content].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    )[0];

    if (latestActiveSession) {
      return latestActiveSession;
    }

    return this.createSession({
      ...this.normalizeCreateSessionPayload(params),
      imGroupId: params.imGroupId.trim()
    });
  }

  private normalizeCreateSessionPayload(
    payload: CreateSessionParams | CreateNewSessionParams
  ): CreateSessionPayload {
    const normalized: CreateSessionPayload = {};

    if (payload.ak?.trim()) {
      normalized.ak = payload.ak.trim();
    }

    if (payload.title?.trim()) {
      normalized.title = payload.title.trim();
    }

    if (payload.imGroupId?.trim()) {
      normalized.imGroupId = payload.imGroupId.trim();
    }

    if ("parentAccount" in payload && payload.parentAccount?.trim()) {
      normalized.parentAccount = payload.parentAccount.trim();
    }

    return normalized;
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

    const body = (await response.json()) as Layer1Response<T>;

    if (!body || typeof body !== "object") {
      throw createSdkError(7000, "服务端错误: 响应格式非法");
    }

    if (body.code !== 0) {
      throw createSdkError(body.code, body.errormsg || "服务端错误");
    }

    if (body.data === null || body.data === undefined) {
      throw createSdkError(7000, "服务端错误: 响应数据为空");
    }

    return body.data;
  }

  private validateRequired(value: string | undefined, fieldName: string): void {
    if (!value || !value.trim()) {
      throw createSdkError(1000, `无效的参数: ${fieldName}`);
    }
  }

  private validateSessionId(sessionId: string): void {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw createSdkError(1000, "无效的参数: welinkSessionId");
    }
  }
}
