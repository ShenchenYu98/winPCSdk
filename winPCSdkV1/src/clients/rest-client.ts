import { SkillSdkError, mapHttpStatusToSkillCode } from '../errors.js';
import type {
  ChatMessage,
  CloseSessionResponse,
  CreateSessionRequest,
  GetSessionListParams,
  PageResult,
  ReplyPermissionRequest,
  ReplyPermissionResponse,
  SendMessageRequest,
  SendToIMRequest,
  SendToIMResponse,
  SkillSDKConfig,
  SkillSession
} from '../types.js';
import type { SkillErrorCode } from '../errors.js';

export class SkillRestApi {
  private readonly baseHttpUrl: string;
  private readonly fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  private readonly requestTimeoutMs: number;

  constructor(config: SkillSDKConfig) {
    this.baseHttpUrl = config.baseHttpUrl.replace(/\/$/, '');
    this.fetchImpl = (config.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
  }

  async createSession(payload: CreateSessionRequest): Promise<SkillSession> {
    return this.request<SkillSession>('POST', '/api/skill/sessions', payload, false, 'SESSION_CREATE_FAILED');
  }

  async getSessionList(params: GetSessionListParams): Promise<PageResult<SkillSession>> {
    const query = new URLSearchParams({
      userId: String(params.userId),
      page: String(params.page ?? 0),
      size: String(params.size ?? 20)
    });

    for (const status of params.statuses ?? []) {
      query.append('statuses', status);
    }

    return this.request<PageResult<SkillSession>>(
      'GET',
      `/api/skill/sessions?${query.toString()}`,
      undefined,
      true,
      'SERVER_INTERNAL_ERROR'
    );
  }

  async getSessionDetail(sessionId: string): Promise<SkillSession> {
    return this.request<SkillSession>('GET', `/api/skill/sessions/${sessionId}`, undefined, true, 'SESSION_NOT_FOUND');
  }

  async closeSession(sessionId: string): Promise<CloseSessionResponse> {
    return this.request<CloseSessionResponse>(
      'DELETE',
      `/api/skill/sessions/${sessionId}`,
      undefined,
      false,
      'SESSION_NOT_FOUND'
    );
  }

  async sendUserMessage(sessionId: string, payload: SendMessageRequest): Promise<ChatMessage> {
    return this.request<ChatMessage>(
      'POST',
      `/api/skill/sessions/${sessionId}/messages`,
      payload,
      false,
      'MESSAGE_SEND_FAILED'
    );
  }

  async getSessionMessages(sessionId: string, page = 0, size = 50): Promise<PageResult<ChatMessage>> {
    const query = new URLSearchParams({ page: String(page), size: String(size) });
    return this.request<PageResult<ChatMessage>>(
      'GET',
      `/api/skill/sessions/${sessionId}/messages?${query.toString()}`,
      undefined,
      true,
      'MESSAGE_HISTORY_FETCH_FAILED'
    );
  }

  async replyPermission(
    sessionId: string,
    permissionId: string,
    payload: ReplyPermissionRequest
  ): Promise<ReplyPermissionResponse> {
    return this.request<ReplyPermissionResponse>(
      'POST',
      `/api/skill/sessions/${sessionId}/permissions/${permissionId}`,
      payload,
      false,
      'PERMISSION_REPLY_FAILED'
    );
  }

  async sendMessageToIM(sessionId: string, payload: SendToIMRequest): Promise<SendToIMResponse> {
    return this.request<SendToIMResponse>(
      'POST',
      `/api/skill/sessions/${sessionId}/send-to-im`,
      payload,
      false,
      'SEND_TO_IM_FAILED'
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    allowRetry: boolean,
    fallbackCode: SkillErrorCode
  ): Promise<T> {
    const attempts = allowRetry ? 3 : 1;
    let attempt = 0;

    while (attempt < attempts) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      try {
        const response = await this.fetchImpl(`${this.baseHttpUrl}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json'
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        });

        if (!response.ok) {
          const text = await response.text();
          const code = mapHttpStatusToSkillCode(response.status);
          throw new SkillSdkError(code ?? fallbackCode, text || `HTTP ${response.status}`, {
            httpStatus: response.status
          });
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        const isAbort = error instanceof Error && error.name === 'AbortError';
        const retryable = allowRetry && (isAbort || !(error instanceof SkillSdkError));

        if (!retryable || attempt === attempts - 1) {
          if (error instanceof SkillSdkError) {
            throw error;
          }
          throw new SkillSdkError(fallbackCode, `REST request failed: ${method} ${path}`, { cause: error });
        }

        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }

      attempt += 1;
    }

    throw new SkillSdkError(fallbackCode, `REST request failed: ${method} ${path}`);
  }
}
