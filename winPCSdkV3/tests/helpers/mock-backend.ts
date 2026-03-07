import type { ChatMessage, SkillSession } from '../../src/types';

interface MockBackendState {
  sessions: Map<string, SkillSession>;
  messages: Map<string, ChatMessage[]>;
  nextSessionId: number;
  nextMessageId: number;
  failNextByPath: Map<string, number>;
  requests: Array<{ method: string; path: string; body?: unknown }>;
}

export interface MockBackend {
  fetchImpl: typeof fetch;
  state: MockBackendState;
  failNext(pathIncludes: string, status: number): void;
}

export function createMockBackend(): MockBackend {
  const state: MockBackendState = {
    sessions: new Map(),
    messages: new Map(),
    nextSessionId: 1,
    nextMessageId: 1,
    failNextByPath: new Map(),
    requests: [],
  };

  const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://mock.local');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = `${url.pathname}${url.search}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    state.requests.push({ method, path, body });

    for (const [needle, status] of state.failNextByPath.entries()) {
      if (path.includes(needle)) {
        state.failNextByPath.delete(needle);
        return json(status, { error: `Forced error ${status}` });
      }
    }

    if (method === 'POST' && url.pathname === '/api/skill/sessions') {
      const now = new Date().toISOString();
      const id = String(state.nextSessionId++);
      const session: SkillSession = {
        id,
        userId: String(body?.userId ?? ''),
        skillDefinitionId: Number(body?.skillDefinitionId ?? 0),
        agentId: body?.agentId === undefined ? undefined : Number(body.agentId),
        title: body?.title === undefined ? undefined : String(body.title),
        status: 'ACTIVE',
        imChatId: String(body?.imChatId ?? `chat-${id}`),
        createdAt: now,
        lastActiveAt: now,
      };
      state.sessions.set(id, session);
      state.messages.set(id, []);
      return json(200, session);
    }

    const match = url.pathname.match(/^\/api\/skill\/sessions\/([^\/]+)(?:\/(.*))?$/);
    if (!match) {
      return json(404, { error: 'Not found' });
    }

    const sessionId = decodeURIComponent(match[1] ?? '');
    const suffix = match[2] ?? '';

    if (method === 'DELETE' && suffix === '') {
      if (!state.sessions.has(sessionId)) {
        return json(404, { error: 'Not found' });
      }
      state.sessions.delete(sessionId);
      return json(200, { status: 'closed' });
    }

    if (method === 'POST' && suffix === 'messages') {
      if (!state.sessions.has(sessionId)) {
        return json(404, { error: 'Not found' });
      }

      const content = String(body?.content ?? '');
      if (!content.trim()) {
        return json(400, { error: 'content required' });
      }

      const list = state.messages.get(sessionId) ?? [];
      const userMessage: ChatMessage = {
        id: String(state.nextMessageId++),
        sessionId,
        seq: list.length + 1,
        role: 'USER',
        content,
        contentType: 'PLAIN',
        createdAt: new Date().toISOString(),
      };
      list.push(userMessage);
      const assistant: ChatMessage = {
        id: String(state.nextMessageId++),
        sessionId,
        seq: list.length + 1,
        role: 'ASSISTANT',
        content: `mocked:${content}`,
        contentType: 'MARKDOWN',
        createdAt: new Date().toISOString(),
      };
      list.push(assistant);
      state.messages.set(sessionId, list);
      return json(200, {
        messageId: userMessage.id,
        seq: userMessage.seq,
        createdAt: userMessage.createdAt,
      });
    }

    if (method === 'GET' && suffix === 'messages') {
      if (!state.sessions.has(sessionId)) {
        return json(404, { error: 'Not found' });
      }

      const page = Number(url.searchParams.get('page') ?? '0');
      const size = Number(url.searchParams.get('size') ?? '50');
      const list = state.messages.get(sessionId) ?? [];
      const start = page * size;
      const content = list.slice(start, start + size);
      return json(200, {
        content,
        totalElements: list.length,
        totalPages: Math.ceil(list.length / size),
        number: page,
        size,
      });
    }

    if (method === 'POST' && suffix === 'send-to-im') {
      if (!state.sessions.has(sessionId)) {
        return json(404, { error: 'Not found' });
      }

      const content = String(body?.content ?? '');
      if (!content.trim()) {
        return json(400, { error: 'content required' });
      }
      return json(200, {
        success: true,
        chatId: state.sessions.get(sessionId)?.imChatId,
        contentLength: content.length,
      });
    }

    if (method === 'POST' && /^permissions\//.test(suffix)) {
      if (!state.sessions.has(sessionId)) {
        return json(404, { error: 'Not found' });
      }
      const permissionId = suffix.split('/')[1];
      return json(200, {
        success: true,
        permissionId,
        approved: Boolean(body?.approved),
      });
    }

    return json(404, { error: 'Not found' });
  };

  return {
    fetchImpl,
    state,
    failNext(pathIncludes: string, status: number): void {
      state.failNextByPath.set(pathIncludes, status);
    },
  };
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
