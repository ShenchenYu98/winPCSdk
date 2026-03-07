import type { SessionContext, SkillSession } from '../types';

export class SessionStore {
  private readonly sessions = new Map<string, SessionContext>();

  upsertFromSkillSession(session: SkillSession): SessionContext {
    const existing = this.sessions.get(session.id);
    const context: SessionContext = {
      id: session.id,
      userId: session.userId,
      lifecycle: session.status,
      executionStatus: existing?.executionStatus,
      connectionState: existing?.connectionState ?? 'DISCONNECTED',
      lastSeq: existing?.lastSeq,
      lastActiveAt: Date.now(),
      stopIssuedAt: existing?.stopIssuedAt,
    };
    this.sessions.set(session.id, context);
    return context;
  }

  get(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  require(sessionId: string): SessionContext {
    const context = this.sessions.get(sessionId);
    if (!context) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return context;
  }

  update(sessionId: string, updater: (context: SessionContext) => void): SessionContext | undefined {
    const context = this.sessions.get(sessionId);
    if (!context) {
      return undefined;
    }
    updater(context);
    context.lastActiveAt = Date.now();
    return context;
  }

  setConnectionState(sessionId: string, state: SessionContext['connectionState']): void {
    this.update(sessionId, (context) => {
      context.connectionState = state;
    });
  }

  setExecutionStatus(sessionId: string, status: SessionContext['executionStatus']): void {
    this.update(sessionId, (context) => {
      context.executionStatus = status;
    });
  }

  setLifecycle(sessionId: string, lifecycle: SessionContext['lifecycle']): void {
    this.update(sessionId, (context) => {
      context.lifecycle = lifecycle;
    });
  }

  setLastSeq(sessionId: string, seq: number): void {
    this.update(sessionId, (context) => {
      context.lastSeq = seq;
    });
  }

  markStopIssued(sessionId: string): void {
    this.update(sessionId, (context) => {
      context.stopIssuedAt = Date.now();
      context.executionStatus = 'stopped';
    });
  }

  clearStopIssued(sessionId: string): void {
    this.update(sessionId, (context) => {
      context.stopIssuedAt = undefined;
    });
  }

  entries(): SessionContext[] {
    return [...this.sessions.values()];
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }
}
