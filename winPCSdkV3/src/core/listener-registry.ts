import { createSkillSdkError, ERROR_CODE } from '../errors';
import type {
  ListenerBucket,
  SessionStatusResult,
  SkillSdkError,
  SkillWecodeStatusResult,
  StreamMessage,
} from '../types';

function createBucket(): ListenerBucket {
  return {
    onMessage: new Set(),
    onError: new Set(),
    onClose: new Set(),
    onStatus: new Set(),
  };
}

export class ListenerRegistry {
  private readonly buckets = new Map<string, ListenerBucket>();
  private readonly wecodeListeners = new Set<(result: SkillWecodeStatusResult) => void>();
  private readonly faultCounter = new Map<Function, number>();
  private readonly circuitBroken = new Set<Function>();

  constructor(private readonly breakerThreshold: number) {}

  registerMessageListener(
    sessionId: string,
    onMessage: (message: StreamMessage) => void,
    onError?: (error: SkillSdkError) => void,
    onClose?: (reason: string) => void,
  ): void {
    const bucket = this.ensureBucket(sessionId);
    bucket.onMessage.add(onMessage);
    if (onError) {
      bucket.onError.add(onError);
    }
    if (onClose) {
      bucket.onClose.add(onClose);
    }
  }

  unregisterMessageListener(
    sessionId: string,
    onMessage: (message: StreamMessage) => void,
    onError?: (error: SkillSdkError) => void,
    onClose?: (reason: string) => void,
  ): boolean {
    const bucket = this.buckets.get(sessionId);
    if (!bucket) {
      return false;
    }

    const removed = bucket.onMessage.delete(onMessage);
    if (onError) {
      bucket.onError.delete(onError);
    }
    if (onClose) {
      bucket.onClose.delete(onClose);
    }

    if (
      bucket.onMessage.size === 0 &&
      bucket.onError.size === 0 &&
      bucket.onClose.size === 0 &&
      bucket.onStatus.size === 0
    ) {
      this.buckets.delete(sessionId);
    }

    return removed;
  }

  registerStatusListener(sessionId: string, callback: (status: SessionStatusResult) => void): void {
    const bucket = this.ensureBucket(sessionId);
    bucket.onStatus.add(callback);
  }

  registerWecodeStatusListener(callback: (result: SkillWecodeStatusResult) => void): void {
    this.wecodeListeners.add(callback);
  }

  emitMessage(sessionId: string, message: StreamMessage): DispatchStats {
    const bucket = this.buckets.get(sessionId);
    if (!bucket || bucket.onMessage.size === 0) {
      return { delivered: 0, failed: 0, callbacks: 0 };
    }

    return this.dispatch(bucket.onMessage, (listener) => listener(message));
  }

  emitError(sessionId: string, error: SkillSdkError): DispatchStats {
    const bucket = this.buckets.get(sessionId);
    if (!bucket || bucket.onError.size === 0) {
      return { delivered: 0, failed: 0, callbacks: 0 };
    }

    return this.dispatch(bucket.onError, (listener) => listener(error));
  }

  emitClose(sessionId: string, reason: string): DispatchStats {
    const bucket = this.buckets.get(sessionId);
    if (!bucket || bucket.onClose.size === 0) {
      return { delivered: 0, failed: 0, callbacks: 0 };
    }

    return this.dispatch(bucket.onClose, (listener) => listener(reason));
  }

  emitStatus(sessionId: string, status: SessionStatusResult): DispatchStats {
    const bucket = this.buckets.get(sessionId);
    if (!bucket || bucket.onStatus.size === 0) {
      return { delivered: 0, failed: 0, callbacks: 0 };
    }

    return this.dispatch(bucket.onStatus, (listener) => listener(status));
  }

  emitWecodeStatus(status: SkillWecodeStatusResult): DispatchStats {
    if (this.wecodeListeners.size === 0) {
      return { delivered: 0, failed: 0, callbacks: 0 };
    }

    return this.dispatch(this.wecodeListeners, (listener) => listener(status));
  }

  hasListeners(sessionId: string): boolean {
    const bucket = this.buckets.get(sessionId);
    if (!bucket) {
      return false;
    }

    return (
      bucket.onMessage.size > 0 ||
      bucket.onError.size > 0 ||
      bucket.onClose.size > 0 ||
      bucket.onStatus.size > 0
    );
  }

  listenerCount(sessionId: string): number {
    const bucket = this.buckets.get(sessionId);
    if (!bucket) {
      return 0;
    }

    return bucket.onMessage.size + bucket.onError.size + bucket.onClose.size + bucket.onStatus.size;
  }

  clear(): void {
    this.buckets.clear();
    this.wecodeListeners.clear();
    this.faultCounter.clear();
    this.circuitBroken.clear();
  }

  getListenerNotFoundError(sessionId: string): SkillSdkError {
    return createSkillSdkError({
      code: ERROR_CODE.LISTENER_NOT_FOUND,
      message: `Listener not found for session ${sessionId}`,
      source: 'SDK',
      sessionId,
      retriable: false,
    });
  }

  private ensureBucket(sessionId: string): ListenerBucket {
    const existing = this.buckets.get(sessionId);
    if (existing) {
      return existing;
    }

    const created = createBucket();
    this.buckets.set(sessionId, created);
    return created;
  }

  private dispatch<T extends Function>(listeners: Set<T>, invoke: (listener: T) => void): DispatchStats {
    let delivered = 0;
    let failed = 0;
    const callbacks = listeners.size;

    for (const listener of listeners) {
      if (this.circuitBroken.has(listener)) {
        continue;
      }

      try {
        invoke(listener);
        delivered += 1;
        this.faultCounter.set(listener, 0);
      } catch {
        failed += 1;
        const current = (this.faultCounter.get(listener) ?? 0) + 1;
        this.faultCounter.set(listener, current);
        if (current >= this.breakerThreshold) {
          this.circuitBroken.add(listener);
        }
      }
    }

    return { delivered, failed, callbacks };
  }
}

export interface DispatchStats {
  delivered: number;
  failed: number;
  callbacks: number;
}
