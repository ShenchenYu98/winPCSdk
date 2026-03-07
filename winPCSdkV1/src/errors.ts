export type SkillErrorCode =
  | 'INVALID_PARAMS'
  | 'MISSING_SESSION_ID'
  | 'MISSING_USER_ID'
  | 'MISSING_CONTENT'
  | 'SESSION_CREATE_FAILED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'MESSAGE_SEND_FAILED'
  | 'MESSAGE_HISTORY_FETCH_FAILED'
  | 'PERMISSION_REPLY_FAILED'
  | 'SEND_TO_IM_FAILED'
  | 'STREAM_CONNECT_FAILED'
  | 'STREAM_DISCONNECTED'
  | 'STREAM_MESSAGE_INVALID'
  | 'STREAM_EXECUTION_FAILED'
  | 'WECODE_CLOSE_FAILED'
  | 'WECODE_MINIMIZE_FAILED'
  | 'WECODE_STATUS_LISTEN_FAILED'
  | 'SERVER_INTERNAL_ERROR'
  | 'SESSION_BUSY';

export class SkillSdkError extends Error {
  readonly code: SkillErrorCode;
  readonly cause?: unknown;
  readonly httpStatus?: number;

  constructor(code: SkillErrorCode, message: string, options?: { cause?: unknown; httpStatus?: number }) {
    super(message);
    this.name = 'SkillSdkError';
    this.code = code;
    this.cause = options?.cause;
    this.httpStatus = options?.httpStatus;
  }
}

export function mapHttpStatusToSkillCode(status: number): SkillErrorCode {
  switch (status) {
    case 400:
      return 'INVALID_PARAMS';
    case 404:
      return 'SESSION_NOT_FOUND';
    case 409:
      return 'SESSION_CLOSED';
    default:
      return 'SERVER_INTERNAL_ERROR';
  }
}
