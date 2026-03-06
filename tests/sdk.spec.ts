import { beforeEach, describe, expect, it } from 'vitest';
import { SkillSDKFacade } from '../src/sdk.js';
import type { StreamMessage } from '../src/types.js';

class FakeWebSocket {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    queueMicrotask(() => {
      this.onopen?.({});
    });
  }

  close(): void {
    this.closed = true;
    this.onclose?.({});
  }

  emit(message: StreamMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

type FetchResponder = (input: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('SkillSDKFacade', () => {
  let sockets: Map<string, FakeWebSocket>;

  beforeEach(() => {
    sockets = new Map();
  });

  function createSdk(fetchResponder: FetchResponder): SkillSDKFacade {
    return new SkillSDKFacade({
      baseHttpUrl: 'http://localhost:8082',
      baseWsUrl: 'ws://localhost:8082',
      skillDefinitionId: 1,
      fetchImpl: async (input, init) => fetchResponder(String(input), init),
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.set(url, socket);
        return socket as unknown as WebSocket;
      }
    });
  }

  it('executeSkill should create session and send first message', async () => {
    const callLog: string[] = [];

    const sdk = createSdk(async (input, init) => {
      callLog.push(`${init?.method ?? 'GET'} ${input}`);

      if (input.endsWith('/api/skill/sessions') && init?.method === 'POST') {
        return jsonResponse(201, {
          id: 42,
          userId: 1001,
          skillDefinitionId: 1,
          agentId: 99,
          toolSessionId: 'tool-1',
          title: 'test',
          status: 'ACTIVE',
          imChatId: 'chat-1',
          createdAt: '2026-03-06T10:00:00'
        });
      }

      if (input.endsWith('/api/skill/sessions/42/messages') && init?.method === 'POST') {
        return jsonResponse(201, {
          id: 1,
          sessionId: 42,
          seq: 1,
          role: 'USER',
          content: 'hello',
          contentType: 'MARKDOWN',
          createdAt: '2026-03-06T10:00:01',
          meta: null
        });
      }

      return jsonResponse(404, { error: 'not found' });
    });

    const statusList: string[] = [];
    sdk.onSessionStatus('42', (status) => {
      statusList.push(status);
    });

    const session = await sdk.executeSkill('chat-1', '1001', 'hello', 99, 'test');
    expect(session.id).toBe(42);

    const ws = sockets.get('ws://localhost:8082/ws/skill/stream/42');
    expect(ws).toBeDefined();

    ws?.emit({ type: 'delta', seq: 1, content: 'part-1' });
    ws?.emit({ type: 'done', seq: 2, content: { usage: { inputTokens: 1, outputTokens: 2 } } });

    expect(callLog).toContain('POST http://localhost:8082/api/skill/sessions');
    expect(callLog).toContain('POST http://localhost:8082/api/skill/sessions/42/messages');
    expect(statusList).toEqual(['executing', 'completed']);
  });

  it('stopSkill should close ws and mark stopped', async () => {
    const sdk = createSdk(async (input, init) => {
      if (input.endsWith('/api/skill/sessions') && init?.method === 'POST') {
        return jsonResponse(201, {
          id: 7,
          userId: 1001,
          skillDefinitionId: 1,
          status: 'ACTIVE',
          createdAt: '2026-03-06T10:00:00'
        });
      }

      if (input.endsWith('/api/skill/sessions/7/messages') && init?.method === 'POST') {
        return jsonResponse(201, {
          id: 1,
          sessionId: 7,
          seq: 1,
          role: 'USER',
          content: 'hello',
          contentType: 'MARKDOWN',
          createdAt: '2026-03-06T10:00:01',
          meta: null
        });
      }

      return jsonResponse(404, { error: 'not found' });
    });

    await sdk.executeSkill('chat-1', '1001', 'hello');
    const ws = sockets.get('ws://localhost:8082/ws/skill/stream/7');
    expect(ws?.closed).toBe(false);

    const statuses: string[] = [];
    sdk.onSessionStatus('7', (status) => statuses.push(status));
    await sdk.stopSkill('7');

    expect(ws?.closed).toBe(true);
    expect(statuses).toContain('stopped');
  });

  it('regenerateAnswer should fallback to remote history and resend last user message', async () => {
    const sentBodies: string[] = [];

    const sdk = createSdk(async (input, init) => {
      if (input.endsWith('/api/skill/sessions/9/messages?page=0&size=50') && init?.method === 'GET') {
        return jsonResponse(200, {
          content: [
            {
              id: 100,
              sessionId: 9,
              seq: 1,
              role: 'USER',
              content: 'history-user-msg',
              contentType: 'MARKDOWN',
              createdAt: '2026-03-06T10:00:00',
              meta: null
            }
          ],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 50
        });
      }

      if (input.endsWith('/api/skill/sessions/9/messages') && init?.method === 'POST') {
        sentBodies.push(String(init?.body ?? ''));
        return jsonResponse(201, {
          id: 101,
          sessionId: 9,
          seq: 2,
          role: 'USER',
          content: 'history-user-msg',
          contentType: 'MARKDOWN',
          createdAt: '2026-03-06T10:00:05',
          meta: null
        });
      }

      return jsonResponse(404, { error: 'not found' });
    });

    const result = await sdk.regenerateAnswer('9');
    expect(result.success).toBe(true);
    expect(sentBodies.length).toBe(1);
    expect(sentBodies[0]).toContain('history-user-msg');
  });
});
