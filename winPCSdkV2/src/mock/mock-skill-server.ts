import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

interface MockSession {
  id: string;
  userId: string;
  skillDefinitionId: number;
  agentId?: number;
  title?: string;
  status: 'ACTIVE' | 'IDLE' | 'CLOSED';
  imChatId: string;
  createdAt: string;
  lastActiveAt: string;
  nextSeq: number;
}

interface MockMessage {
  id: string;
  sessionId: string;
  seq: number;
  role: 'USER' | 'ASSISTANT';
  content: string;
  contentType: 'MARKDOWN' | 'PLAIN';
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface MockSkillServer {
  port: number;
  baseUrl: string;
  wsUrl: string;
  stop(): Promise<void>;
}

export interface MockSkillServerOptions {
  port?: number;
  streamChunkCount?: number;
  streamChunkIntervalMs?: number;
  streamStartDelayMs?: number;
}

interface ResolvedMockSkillServerOptions {
  port: number;
  streamChunkCount: number;
  streamChunkIntervalMs: number;
  streamStartDelayMs: number;
}

export async function startMockSkillServer(
  portOrOptions: number | MockSkillServerOptions = 19082,
): Promise<MockSkillServer> {
  const options = resolveOptions(portOrOptions);
  const sessions = new Map<string, MockSession>();
  const messages = new Map<string, MockMessage[]>();
  const wsBySession = new Map<string, Set<WebSocket>>();
  let nextSessionId = 1;
  let nextMessageId = 1;

  const server = http.createServer(async (req, res) => {
    try {
      applyCors(res);
      if ((req.method ?? 'GET').toUpperCase() === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      await handleRequest(req, res);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Unknown mock server error',
      });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`);
    if (requestUrl.pathname !== '/ws/skill/stream') {
      socket.destroy();
      return;
    }

    const sessionId = requestUrl.searchParams.get('sessionId');
    if (!sessionId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const bucket = wsBySession.get(sessionId) ?? new Set<WebSocket>();
      bucket.add(ws);
      wsBySession.set(sessionId, bucket);

      ws.on('close', () => {
        bucket.delete(ws);
        if (bucket.size === 0) {
          wsBySession.delete(sessionId);
        }
      });
    });
  });

  function broadcast(sessionId: string, payload: Record<string, unknown>): void {
    const clients = wsBySession.get(sessionId);
    if (!clients || clients.size === 0) {
      return;
    }

    const encoded = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(encoded);
      }
    }
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const method = req.method ?? 'GET';

    if (method === 'POST' && requestUrl.pathname === '/api/skill/sessions') {
      const body = await readJson(req);
      const id = String(nextSessionId++);
      const now = new Date().toISOString();
      const session: MockSession = {
        id,
        userId: String(body.userId ?? ''),
        skillDefinitionId: Number(body.skillDefinitionId ?? 0),
        agentId: body.agentId === undefined ? undefined : Number(body.agentId),
        title: body.title === undefined ? undefined : String(body.title),
        status: 'ACTIVE',
        imChatId: String(body.imChatId ?? `chat-${id}`),
        createdAt: now,
        lastActiveAt: now,
        nextSeq: 1,
      };
      sessions.set(id, session);
      messages.set(id, []);
      sendJson(res, 200, session);
      return;
    }

    const sessionMatch = requestUrl.pathname.match(/^\/api\/skill\/sessions\/([^\/]+)(?:\/(.*))?$/);
    if (!sessionMatch) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const sessionId = decodeURIComponent(sessionMatch[1] ?? '');
    const suffix = sessionMatch[2] ?? '';
    const session = sessions.get(sessionId);

    if (method === 'DELETE' && suffix === '') {
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sessions.delete(sessionId);
      sendJson(res, 200, { status: 'closed', sessionId });
      return;
    }

    if (method === 'POST' && suffix === 'messages') {
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }

      const body = await readJson(req);
      const content = String(body.content ?? '');
      if (!content.trim()) {
        sendJson(res, 400, { error: 'content is required' });
        return;
      }

      const now = new Date().toISOString();
      const userMessage: MockMessage = {
        id: String(nextMessageId++),
        sessionId,
        seq: session.nextSeq++,
        role: 'USER',
        content,
        contentType: 'PLAIN',
        createdAt: now,
      };

      const assistantMessage: MockMessage = {
        id: String(nextMessageId++),
        sessionId,
        seq: session.nextSeq++,
        role: 'ASSISTANT',
        content: `mocked:${content}`,
        contentType: 'MARKDOWN',
        createdAt: new Date(Date.now() + 5).toISOString(),
      };

      messages.set(sessionId, [...(messages.get(sessionId) ?? []), userMessage, assistantMessage]);
      session.lastActiveAt = now;

      const chunks = splitIntoChunks(assistantMessage.content, options.streamChunkCount);
      chunks.forEach((chunk, index) => {
        setTimeout(() => {
          broadcast(sessionId, {
            sessionId,
            type: 'delta',
            seq: assistantMessage.seq + index,
            content: chunk,
          });
        }, options.streamStartDelayMs + options.streamChunkIntervalMs * index);
      });

      setTimeout(() => {
        broadcast(sessionId, {
          sessionId,
          type: 'done',
          seq: assistantMessage.seq + chunks.length,
          content: '',
          usage: {
            inputTokens: content.length,
            outputTokens: assistantMessage.content.length,
          },
        });
      }, options.streamStartDelayMs + options.streamChunkIntervalMs * chunks.length + 20);

      sendJson(res, 200, {
        messageId: userMessage.id,
        seq: userMessage.seq,
        createdAt: userMessage.createdAt,
      });
      return;
    }

    if (method === 'GET' && suffix.startsWith('messages')) {
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }

      const page = Number(requestUrl.searchParams.get('page') ?? '0');
      const size = Number(requestUrl.searchParams.get('size') ?? '50');
      const all = messages.get(sessionId) ?? [];
      const start = page * size;
      const end = start + size;
      const content = all.slice(start, end);
      sendJson(res, 200, {
        content,
        totalElements: all.length,
        totalPages: Math.ceil(all.length / size),
        number: page,
        size,
      });
      return;
    }

    if (method === 'POST' && suffix === 'send-to-im') {
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }

      const body = await readJson(req);
      const content = String(body.content ?? '');
      if (!content.trim()) {
        sendJson(res, 400, { error: 'content is required' });
        return;
      }

      sendJson(res, 200, {
        success: true,
        chatId: session.imChatId,
        contentLength: content.length,
      });
      return;
    }

    const permissionMatch = suffix.match(/^permissions\/([^\/]+)$/);
    if (method === 'POST' && permissionMatch) {
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }

      const permissionId = decodeURIComponent(permissionMatch[1] ?? '');
      const body = await readJson(req);
      sendJson(res, 200, {
        success: true,
        permissionId,
        approved: Boolean(body.approved),
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  }

  await new Promise<void>((resolve) => {
    server.listen(options.port, resolve);
  });
  const address = server.address();
  const actualPort =
    typeof address === 'object' && address && typeof address.port === 'number'
      ? address.port
      : options.port;

  return {
    port: actualPort,
    baseUrl: `http://127.0.0.1:${actualPort}`,
    wsUrl: `ws://127.0.0.1:${actualPort}`,
    async stop(): Promise<void> {
      for (const clients of wsBySession.values()) {
        for (const client of clients) {
          client.close();
        }
      }

      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  res.statusCode = statusCode;
  applyCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', Buffer.byteLength(encoded));
  res.end(encoded);
}

function applyCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function splitIntoChunks(content: string, count: number): string[] {
  if (content.length <= count) {
    return [content];
  }

  const chunks: string[] = [];
  const size = Math.ceil(content.length / count);
  for (let i = 0; i < content.length; i += size) {
    chunks.push(content.slice(i, i + size));
  }
  return chunks;
}

function resolveOptions(portOrOptions: number | MockSkillServerOptions): ResolvedMockSkillServerOptions {
  if (typeof portOrOptions === 'number') {
    return {
      port: portOrOptions,
      streamChunkCount: 3,
      streamChunkIntervalMs: 60,
      streamStartDelayMs: 60,
    };
  }

  const streamChunkCount = Math.max(1, portOrOptions.streamChunkCount ?? 3);
  return {
    port: portOrOptions.port ?? 19082,
    streamChunkCount,
    streamChunkIntervalMs: Math.max(10, portOrOptions.streamChunkIntervalMs ?? 60),
    streamStartDelayMs: Math.max(0, portOrOptions.streamStartDelayMs ?? 60),
  };
}
