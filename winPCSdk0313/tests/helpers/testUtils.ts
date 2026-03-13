import type { RealtimeConnection } from "../../src/core/streamConnectionManager";
import type { SDKError, StreamMessage } from "../../src/types";

interface Layer1Envelope<T> {
  code: number;
  errormsg: string;
  data: T | null;
}

export function createLayer1SuccessResponse<T>(data: T): Response {
  return createJsonResponse<Layer1Envelope<T>>({
    code: 0,
    errormsg: "",
    data
  });
}

export function createLayer1ErrorResponse(code: number, errormsg: string): Response {
  return createJsonResponse<Layer1Envelope<null>>({
    code,
    errormsg,
    data: null
  });
}

export function createJsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export function asSdkError(error: unknown): SDKError {
  return error as SDKError;
}

export class MockRealtimeConnection implements RealtimeConnection {
  private handlers:
    | {
        onMessage: (payload: unknown) => void;
        onError: (error: Error) => void;
        onClose: (reason: string) => void;
      }
    | null = null;

  connectCalls = 0;
  closeCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  close(): void {
    this.closeCalls += 1;
  }

  setHandlers(handlers: {
    onMessage: (payload: unknown) => void;
    onError: (error: Error) => void;
    onClose: (reason: string) => void;
  }): void {
    this.handlers = handlers;
  }

  emitMessage(message: StreamMessage | Record<string, unknown> | string): void {
    if (!this.handlers) {
      throw new Error("Connection handlers are not registered");
    }

    const payload = typeof message === "string" ? message : JSON.stringify(message);
    this.handlers.onMessage(payload);
  }

  emitError(message: string): void {
    if (!this.handlers) {
      throw new Error("Connection handlers are not registered");
    }

    this.handlers.onError(new Error(message));
  }

  emitClose(reason: string): void {
    if (!this.handlers) {
      throw new Error("Connection handlers are not registered");
    }

    this.handlers.onClose(reason);
  }
}
