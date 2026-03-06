import type { ChatMessage, PageResult } from '../types.js';

type SessionMessageState = {
  list: ChatMessage[];
  currentStreaming?: {
    buffer: string[];
    fullText: string;
    startedAt: number;
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  pageInfo?: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
};

export class MessageStore {
  private readonly bySessionId = new Map<string, SessionMessageState>();

  setMessages(sessionId: string, pageData: PageResult<ChatMessage>): void {
    const existing = this.bySessionId.get(sessionId);
    const nextList =
      pageData.number === 0 ? [...pageData.content] : [...(existing?.list ?? []), ...pageData.content];

    this.bySessionId.set(sessionId, {
      list: nextList,
      currentStreaming: existing?.currentStreaming,
      pageInfo: {
        page: pageData.number,
        size: pageData.size,
        totalElements: pageData.totalElements,
        totalPages: pageData.totalPages
      }
    });
  }

  appendMessage(sessionId: string, message: ChatMessage): void {
    const state = this.ensureState(sessionId);
    state.list.push(message);
  }

  appendStreamingDelta(sessionId: string, chunk: string): string {
    const state = this.ensureState(sessionId);
    if (!state.currentStreaming) {
      state.currentStreaming = {
        buffer: [],
        fullText: '',
        startedAt: Date.now()
      };
    }
    state.currentStreaming.buffer.push(chunk);
    state.currentStreaming.fullText += chunk;
    return state.currentStreaming.fullText;
  }

  completeStreaming(sessionId: string, usage?: { inputTokens: number; outputTokens: number }): string {
    const state = this.ensureState(sessionId);
    const streaming = state.currentStreaming;
    if (!streaming) {
      return '';
    }
    streaming.usage = usage;

    const maxSeq = state.list.reduce((max, msg) => Math.max(max, msg.seq), 0);
    state.list.push({
      id: Date.now(),
      sessionId: Number(sessionId),
      seq: maxSeq + 1,
      role: 'ASSISTANT',
      content: streaming.fullText,
      contentType: 'MARKDOWN',
      createdAt: new Date().toISOString(),
      meta: usage ? JSON.stringify({ usage }) : null
    });

    const finalText = streaming.fullText;
    delete state.currentStreaming;
    return finalText;
  }

  failStreaming(sessionId: string): void {
    const state = this.ensureState(sessionId);
    delete state.currentStreaming;
  }

  getLastUserMessage(sessionId: string): ChatMessage | undefined {
    const state = this.bySessionId.get(sessionId);
    if (!state) {
      return undefined;
    }
    for (let idx = state.list.length - 1; idx >= 0; idx -= 1) {
      if (state.list[idx].role === 'USER') {
        return state.list[idx];
      }
    }
    return undefined;
  }

  getLastAssistantMessage(sessionId: string): ChatMessage | undefined {
    const state = this.bySessionId.get(sessionId);
    if (!state) {
      return undefined;
    }
    for (let idx = state.list.length - 1; idx >= 0; idx -= 1) {
      if (state.list[idx].role === 'ASSISTANT') {
        return state.list[idx];
      }
    }
    return undefined;
  }

  getMessages(sessionId: string): ChatMessage[] {
    return [...(this.bySessionId.get(sessionId)?.list ?? [])];
  }

  clearSession(sessionId: string): void {
    this.bySessionId.delete(sessionId);
  }

  private ensureState(sessionId: string): SessionMessageState {
    const existing = this.bySessionId.get(sessionId);
    if (existing) {
      return existing;
    }
    const state: SessionMessageState = { list: [] };
    this.bySessionId.set(sessionId, state);
    return state;
  }
}
