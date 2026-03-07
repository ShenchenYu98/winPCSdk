import type { SkillSdkError } from './types';

export const ERROR_CODE = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  REST_ERROR: 'REST_ERROR',
  WS_ERROR: 'WS_ERROR',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CLOSED: 'SESSION_CLOSED',
  SESSION_TERMINATED_AFTER_STOP: 'SESSION_TERMINATED_AFTER_STOP',
  LISTENER_NOT_FOUND: 'LISTENER_NOT_FOUND',
  NO_USER_MESSAGE_FOR_REGENERATE: 'NO_USER_MESSAGE_FOR_REGENERATE',
  CONNECTION_UNAVAILABLE: 'CONNECTION_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export function createSkillSdkError(args: {
  code: string;
  message: string;
  source: 'REST' | 'WS' | 'SDK';
  sessionId?: string;
  httpStatus?: number;
  retriable?: boolean;
}): SkillSdkError {
  return {
    code: args.code,
    message: args.message,
    source: args.source,
    sessionId: args.sessionId,
    httpStatus: args.httpStatus,
    retriable: args.retriable ?? false,
    timestamp: Date.now(),
  };
}

export function normalizeUnknownError(
  error: unknown,
  source: 'REST' | 'WS' | 'SDK',
  sessionId?: string,
): SkillSdkError {
  if (isSkillSdkError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createSkillSdkError({
      code: ERROR_CODE.INTERNAL_ERROR,
      message: error.message,
      source,
      sessionId,
      retriable: false,
    });
  }

  return createSkillSdkError({
    code: ERROR_CODE.INTERNAL_ERROR,
    message: 'Unknown error',
    source,
    sessionId,
    retriable: false,
  });
}

export function isSkillSdkError(error: unknown): error is SkillSdkError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Partial<SkillSdkError>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.retriable === 'boolean' &&
    typeof candidate.timestamp === 'number'
  );
}

export function mapRestStatusToErrorCode(status: number): ErrorCode {
  if (status === 404) {
    return ERROR_CODE.SESSION_NOT_FOUND;
  }

  if (status === 409) {
    return ERROR_CODE.SESSION_CLOSED;
  }

  return ERROR_CODE.REST_ERROR;
}
