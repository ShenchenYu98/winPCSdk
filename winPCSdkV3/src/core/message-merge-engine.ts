import type { ChatMessage, PageResult, StreamAccumulator, StreamMessage } from '../types';

export class MessageMergeEngine {
  private readonly streamBySession = new Map<string, StreamAccumulator>();

  onStreamMessage(message: StreamMessage): void {
    const now = Date.now();
    const existing = this.streamBySession.get(message.sessionId);

    if (message.type === 'delta') {
      const next: StreamAccumulator = {
        sessionId: message.sessionId,
        content: `${existing?.content ?? ''}${message.content}`,
        seq: message.seq,
        isStreaming: true,
        updatedAt: now,
      };
      this.streamBySession.set(message.sessionId, next);
      return;
    }

    if (message.type === 'done') {
      if (!existing) {
        return;
      }

      this.streamBySession.set(message.sessionId, {
        ...existing,
        seq: message.seq,
        isStreaming: false,
        updatedAt: now,
      });
      return;
    }

    if (message.type === 'error') {
      this.streamBySession.delete(message.sessionId);
    }
  }

  merge(
    sessionId: string,
    page: PageResult<ChatMessage>,
  ): PageResult<ChatMessage> {
    const accumulator = this.streamBySession.get(sessionId);
    if (!accumulator) {
      return page;
    }

    const dedupeIds = new Set(page.content.map((message) => String(message.id)));
    const hasCoveredAssistant = this.historyAlreadyCoversAccumulator(page.content, accumulator.content);

    if (hasCoveredAssistant) {
      this.streamBySession.delete(sessionId);
      return page;
    }

    const transientId = `streaming-${sessionId}-${accumulator.seq}`;
    if (dedupeIds.has(transientId)) {
      return page;
    }

    const synthetic: ChatMessage = {
      id: transientId,
      sessionId,
      seq: accumulator.seq,
      role: 'ASSISTANT',
      content: accumulator.content,
      contentType: 'MARKDOWN',
      createdAt: new Date(accumulator.updatedAt).toISOString(),
      meta: {
        isStreaming: accumulator.isStreaming,
      },
    };

    return {
      ...page,
      content: [...page.content, synthetic],
      totalElements: page.totalElements + 1,
    };
  }

  maybeNeedBackfill(sessionId: string, incomingSeq: number): boolean {
    const current = this.streamBySession.get(sessionId);
    if (!current) {
      return false;
    }

    return incomingSeq > current.seq + 1;
  }

  clearSession(sessionId: string): void {
    this.streamBySession.delete(sessionId);
  }

  clearAll(): void {
    this.streamBySession.clear();
  }

  getAccumulator(sessionId: string): StreamAccumulator | undefined {
    return this.streamBySession.get(sessionId);
  }

  private historyAlreadyCoversAccumulator(history: ChatMessage[], streamContent: string): boolean {
    const lastAssistant = [...history].reverse().find((message) => message.role === 'ASSISTANT');
    if (!lastAssistant) {
      return false;
    }

    return lastAssistant.content.startsWith(streamContent);
  }
}
