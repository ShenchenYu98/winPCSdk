import type { InternalSessionState, SkillSession } from '../types.js';

export type SessionRecord = {
  session: SkillSession;
  status: InternalSessionState;
  streamConnected: boolean;
  lastError?: string;
  updatedAt: number;
};

export class SessionStore {
  private readonly byId = new Map<string, SessionRecord>();
  private readonly listByUserId = new Map<string, Set<string>>();

  upsert(session: SkillSession, status: InternalSessionState = 'idle'): SessionRecord {
    const sessionId = String(session.id);
    const existing = this.byId.get(sessionId);
    const record: SessionRecord = {
      session,
      status: existing?.status ?? status,
      streamConnected: existing?.streamConnected ?? false,
      lastError: existing?.lastError,
      updatedAt: Date.now()
    };
    this.byId.set(sessionId, record);

    const key = String(session.userId);
    const sessions = this.listByUserId.get(key) ?? new Set();
    sessions.add(sessionId);
    this.listByUserId.set(key, sessions);

    return record;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.byId.get(sessionId);
  }

  getSession(sessionId: string): SkillSession | undefined {
    return this.byId.get(sessionId)?.session;
  }

  setStatus(sessionId: string, status: InternalSessionState, lastError?: string): void {
    const record = this.byId.get(sessionId);
    if (!record) {
      return;
    }
    record.status = status;
    record.updatedAt = Date.now();
    record.lastError = lastError;
  }

  setStreamConnected(sessionId: string, streamConnected: boolean): void {
    const record = this.byId.get(sessionId);
    if (!record) {
      return;
    }
    record.streamConnected = streamConnected;
    record.updatedAt = Date.now();
  }

  listByUser(userId: string): SkillSession[] {
    const ids = this.listByUserId.get(userId);
    if (!ids) {
      return [];
    }
    return Array.from(ids)
      .map((sessionId) => this.byId.get(sessionId)?.session)
      .filter((item): item is SkillSession => Boolean(item));
  }

  getAllSessionIds(): string[] {
    return Array.from(this.byId.keys());
  }

  markClosed(sessionId: string): void {
    const record = this.byId.get(sessionId);
    if (!record) {
      return;
    }
    record.status = 'closed';
    record.streamConnected = false;
    record.updatedAt = Date.now();
  }

  remove(sessionId: string): void {
    const record = this.byId.get(sessionId);
    if (!record) {
      return;
    }
    this.byId.delete(sessionId);
    const userKey = String(record.session.userId);
    const ids = this.listByUserId.get(userKey);
    if (!ids) {
      return;
    }
    ids.delete(sessionId);
    if (ids.size === 0) {
      this.listByUserId.delete(userKey);
    }
  }
}
