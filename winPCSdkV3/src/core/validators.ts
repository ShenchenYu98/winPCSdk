import { createSkillSdkError, ERROR_CODE } from '../errors';
import type { SkillSdkError } from '../types';

export function assertNonEmptyString(value: string, field: string, sessionId?: string): void {
  if (!value || value.trim().length === 0) {
    throw invalidArgError(`${field} is required`, sessionId);
  }
}

export function assertPositiveNumber(value: number, field: string, sessionId?: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw invalidArgError(`${field} must be a positive number`, sessionId);
  }
}

function invalidArgError(message: string, sessionId?: string): SkillSdkError {
  return createSkillSdkError({
    code: ERROR_CODE.INVALID_ARGUMENT,
    message,
    source: 'SDK',
    sessionId,
    retriable: false,
  });
}
