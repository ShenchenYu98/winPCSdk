import type { SDKError } from "./types";

export function createSdkError(errorCode: number, errorMessage: string): SDKError {
  return {
    errorCode,
    errorMessage
  };
}

export function isSdkError(error: unknown): error is SDKError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "errorCode" in error &&
      "errorMessage" in error
  );
}
