import { createSdkError } from "../errors";
import type {
  CreateNewSessionParams,
  CursorResult,
  HistorySessionsParams,
  PageResult,
  ReplyPermissionParams,
  ReplyPermissionResult,
  Session,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMResult,
  SessionMessage,
  StopSkillResult
} from "../types";

interface CreateNewSessionPayload {
  ak?: string;
  title?: string;
  bussinessDomain: string;
  bussinessId: string;
  bussinessType: string;
  assistantAccount?: string;
}

interface Layer1Response<T> {
  code: number;
  errormsg: string;
  data: T | null;
}

export class SkillServerClient {
  constructor(private readonly baseUrl: string) {}

  async getHistorySessionsList(params: HistorySessionsParams): Promise<PageResult<Session>> {
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

    if (params.bussinessId?.trim()) {
      query.set("bussinessId", params.bussinessId.trim());
    }

    if (params.assistantAccount?.trim()) {
      query.set("assistantAccount", params.assistantAccount.trim());
    }

    if (params.businessSessionDomain?.trim()) {
      query.set("businessSessionDomain", params.businessSessionDomain.trim());
    }

    return this.request<PageResult<Session>>(`/api/skill/sessions?${query.toString()}`);
  }

  async createNewSession(params: CreateNewSessionParams): Promise<Session> {
    this.validateRequired(params.bussinessId, "bussinessId");

    return this.request<Session>("/api/skill/sessions", {
      method: "POST",
      body: JSON.stringify(this.normalizeCreateNewSessionPayload(params))
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

  async getSessionMessageHistory(
    welinkSessionId: string,
    beforeSeq: number | undefined,
    size = 50
  ): Promise<CursorResult<SessionMessage>> {
    this.validateSessionId(welinkSessionId);

    const query = new URLSearchParams({ size: String(size) });

    if (typeof beforeSeq === "number" && Number.isFinite(beforeSeq)) {
      query.set("beforeSeq", String(beforeSeq));
    }

    return this.request<CursorResult<SessionMessage>>(
      `/api/skill/sessions/${welinkSessionId}/messages/history?${query.toString()}`
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

  async createSession(params: CreateNewSessionParams): Promise<Session> {
    const sessions = await this.listReusableSessions(params);
    const latestReusableSession = sessions.content
      .filter((session) => {
        const status = session.status.toLowerCase();
        return status !== "close" && status !== "closed";
      })
      .sort((left, right) => this.toTimestamp(right.updatedAt) - this.toTimestamp(left.updatedAt))[0];

    if (latestReusableSession) {
      return latestReusableSession;
    }

    return this.createNewSession(params);
  }

  private async listReusableSessions(params: CreateNewSessionParams): Promise<PageResult<Session>> {
    const query = new URLSearchParams({ page: "0", size: "50" });

    if (params.ak?.trim()) {
      query.set("ak", params.ak.trim());
    }

    if (params.bussinessId?.trim()) {
      query.set("bussinessId", params.bussinessId.trim());
    }

    if (params.assistantAccount?.trim()) {
      query.set("assistantAccount", params.assistantAccount.trim());
    }

    if (params.bussinessDomain?.trim()) {
      query.set("businessSessionDomain", params.bussinessDomain.trim());
    }

    return this.request<PageResult<Session>>(`/api/skill/sessions?${query.toString()}`);
  }

  private normalizeCreateNewSessionPayload(
    payload: CreateNewSessionParams
  ): CreateNewSessionPayload {
    const normalized: CreateNewSessionPayload = {
      bussinessDomain: payload.bussinessDomain?.trim() || "miniapp",
      bussinessId: payload.bussinessId.trim(),
      bussinessType: payload.bussinessType?.trim() || "direct"
    };

    if (payload.ak?.trim()) {
      normalized.ak = payload.ak.trim();
    }

    if (payload.title?.trim()) {
      normalized.title = payload.title.trim();
    }

    if (payload.assistantAccount?.trim()) {
      normalized.assistantAccount = payload.assistantAccount.trim();
    }

    return normalized;
  }

  private toTimestamp(value: string): number {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
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
