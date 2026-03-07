import type { SessionStatus, SkillWecodeStatus, StreamMessage } from './types.js';

export class EventCenter {
  private readonly sessionStatusListeners = new Map<string, Set<(status: SessionStatus) => void>>();
  private readonly streamListeners = new Map<string, Set<(message: StreamMessage) => void>>();
  private readonly wecodeStatusListeners = new Set<(status: SkillWecodeStatus) => void>();

  onSessionStatus(sessionId: string, callback: (status: SessionStatus) => void): () => void {
    const existing = this.sessionStatusListeners.get(sessionId) ?? new Set();
    existing.add(callback);
    this.sessionStatusListeners.set(sessionId, existing);
    return () => {
      const set = this.sessionStatusListeners.get(sessionId);
      if (!set) {
        return;
      }
      set.delete(callback);
      if (set.size === 0) {
        this.sessionStatusListeners.delete(sessionId);
      }
    };
  }

  emitSessionStatus(sessionId: string, status: SessionStatus): void {
    const listeners = this.sessionStatusListeners.get(sessionId);
    if (!listeners) {
      return;
    }
    for (const callback of listeners) {
      callback(status);
    }
  }

  onStreamMessage(sessionId: string, callback: (message: StreamMessage) => void): () => void {
    const existing = this.streamListeners.get(sessionId) ?? new Set();
    existing.add(callback);
    this.streamListeners.set(sessionId, existing);
    return () => {
      const set = this.streamListeners.get(sessionId);
      if (!set) {
        return;
      }
      set.delete(callback);
      if (set.size === 0) {
        this.streamListeners.delete(sessionId);
      }
    };
  }

  emitStreamMessage(sessionId: string, message: StreamMessage): void {
    const listeners = this.streamListeners.get(sessionId);
    if (!listeners) {
      return;
    }
    for (const callback of listeners) {
      callback(message);
    }
  }

  onWecodeStatus(callback: (status: SkillWecodeStatus) => void): () => void {
    this.wecodeStatusListeners.add(callback);
    return () => {
      this.wecodeStatusListeners.delete(callback);
    };
  }

  emitWecodeStatus(status: SkillWecodeStatus): void {
    for (const callback of this.wecodeStatusListeners) {
      callback(status);
    }
  }

  clearSession(sessionId: string): void {
    this.sessionStatusListeners.delete(sessionId);
    this.streamListeners.delete(sessionId);
  }

  clearAll(): void {
    this.sessionStatusListeners.clear();
    this.streamListeners.clear();
    this.wecodeStatusListeners.clear();
  }
}
