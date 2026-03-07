import { createSkillSdkError, ERROR_CODE, mapRestStatusToErrorCode } from '../errors';
import type { ApiClient, SkillSdkError } from '../types';

interface HttpClientOptions {
  baseUrl: string;
  fetchImpl: typeof fetch;
}

export class RawHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}: ${statusText}`);
  }
}

export function createApiClient(options: HttpClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await options.fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      let parsedBody: unknown = undefined;
      try {
        parsedBody = await response.json();
      } catch {
        parsedBody = undefined;
      }
      throw new RawHttpError(response.status, response.statusText, parsedBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    post<T>(path: string, body?: unknown): Promise<T> {
      return request('POST', path, body);
    },
    get<T>(path: string): Promise<T> {
      return request('GET', path);
    },
    delete<T>(path: string): Promise<T> {
      return request('DELETE', path);
    },
  };
}

export function normalizeRestError(error: unknown, sessionId?: string): SkillSdkError {
  if (error instanceof RawHttpError) {
    const code = mapRestStatusToErrorCode(error.status);
    return createSkillSdkError({
      code,
      message: `${error.status} ${error.statusText}`,
      source: 'REST',
      sessionId,
      httpStatus: error.status,
      retriable: error.status >= 500,
    });
  }

  if (error instanceof Error) {
    return createSkillSdkError({
      code: ERROR_CODE.NETWORK_ERROR,
      message: error.message,
      source: 'REST',
      sessionId,
      retriable: true,
    });
  }

  return createSkillSdkError({
    code: ERROR_CODE.NETWORK_ERROR,
    message: 'Network error',
    source: 'REST',
    sessionId,
    retriable: true,
  });
}
