import { createSkillSdkError, ERROR_CODE, normalizeUnknownError } from '../errors';
import { normalizeRestError, RawHttpError } from '../net/http-client';
import type { SkillSdkError } from '../types';

interface NormalizeInput {
  error: unknown;
  source: 'REST' | 'WS' | 'SDK';
  sessionId?: string;
  stopIssued?: boolean;
}

export class ErrorNormalizer {
  normalize(input: NormalizeInput): SkillSdkError {
    if (input.source === 'REST') {
      if (
        input.stopIssued &&
        input.error instanceof RawHttpError &&
        (input.error.status === 404 || input.error.status === 409)
      ) {
        return createSkillSdkError({
          code: ERROR_CODE.SESSION_TERMINATED_AFTER_STOP,
          message: 'Session terminated after stop request',
          source: 'REST',
          sessionId: input.sessionId,
          httpStatus: input.error.status,
          retriable: true,
        });
      }

      return normalizeRestError(input.error, input.sessionId);
    }

    return normalizeUnknownError(input.error, input.source, input.sessionId);
  }
}
