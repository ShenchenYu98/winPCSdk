import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

type SessionStatus = 'ACTIVE' | 'IDLE' | 'CLOSED';

type SkillSession = {
  id: number;
  userId: number;
  skillDefinitionId: number;
  agentId?: number;
  toolSessionId?: string;
  title?: string;
  status: SessionStatus;
  imChatId?: string;
  createdAt: string;
  lastActiveAt: string;
};

type SkillMessage = {
  id: number;
  sessionId: number;
  seq: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  contentType: 'MARKDOWN' | 'CODE' | 'PLAIN';
  createdAt: string;
  meta: string | null;
};

const sessions = new Map<number, SkillSession>();
const messages = new Map<number, SkillMessage[]>();
const wsRooms = new Map<number, Set<WebSocket>>();
const wsSeq = new Map<number, number>();

let sessionIdSeed = 100;
let messageIdSeed = 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function pushStream(sessionId: number, type: string, content: unknown): void {
  const room = wsRooms.get(sessionId);
  if (!room || room.size === 0) {
    return;
  }

  const nextSeq = (wsSeq.get(sessionId) ?? 0) + 1;
  wsSeq.set(sessionId, nextSeq);

  const data = JSON.stringify({ type, seq: nextSeq, content });
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

async function handleRest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost:8082');
  const path = url.pathname;

  if (method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === 'POST' && path === '/api/skill/sessions') {
    const body = await readBody(req);
    const id = sessionIdSeed++;
    const session: SkillSession = {
      id,
      userId: Number(body.userId),
      skillDefinitionId: Number(body.skillDefinitionId),
      agentId: body.agentId,
      toolSessionId: `mock-tool-${id}`,
      title: body.title,
      status: 'ACTIVE',
      imChatId: body.imChatId,
      createdAt: nowIso(),
      lastActiveAt: nowIso()
    };
    sessions.set(id, session);
    messages.set(id, []);
    writeJson(res, 201, session);
    return;
  }

  if (method === 'GET' && path === '/api/skill/sessions') {
    const userId = Number(url.searchParams.get('userId'));
    const list = Array.from(sessions.values()).filter((session) => !userId || session.userId === userId);
    writeJson(res, 200, {
      content: list,
      totalElements: list.length,
      totalPages: 1,
      number: 0,
      size: list.length || 20
    });
    return;
  }

  const sessionDetailMatch = path.match(/^\/api\/skill\/sessions\/(\d+)$/);
  if (sessionDetailMatch && method === 'GET') {
    const sessionId = Number(sessionDetailMatch[1]);
    const session = sessions.get(sessionId);
    if (!session) {
      writeJson(res, 404, {});
      return;
    }
    writeJson(res, 200, session);
    return;
  }

  if (sessionDetailMatch && method === 'DELETE') {
    const sessionId = Number(sessionDetailMatch[1]);
    const session = sessions.get(sessionId);
    if (!session) {
      writeJson(res, 404, {});
      return;
    }

    session.status = 'CLOSED';
    session.lastActiveAt = nowIso();
    writeJson(res, 200, { status: 'closed', sessionId: String(sessionId) });
    return;
  }

  const messagesMatch = path.match(/^\/api\/skill\/sessions\/(\d+)\/messages$/);
  if (messagesMatch && method === 'POST') {
    const sessionId = Number(messagesMatch[1]);
    const session = sessions.get(sessionId);
    if (!session) {
      writeJson(res, 404, {});
      return;
    }

    if (session.status === 'CLOSED') {
      writeJson(res, 409, { success: false, error: 'Session is closed' });
      return;
    }

    const body = await readBody(req);
    if (!body.content || String(body.content).trim() === '') {
      writeJson(res, 400, { success: false, error: 'Content is required' });
      return;
    }

    const sessionMessages = messages.get(sessionId) ?? [];
    const message: SkillMessage = {
      id: messageIdSeed++,
      sessionId,
      seq: sessionMessages.length + 1,
      role: 'USER',
      content: String(body.content),
      contentType: 'MARKDOWN',
      createdAt: nowIso(),
      meta: null
    };
    sessionMessages.push(message);
    messages.set(sessionId, sessionMessages);

    setTimeout(() => pushStream(sessionId, 'delta', `mock回复: ${message.content.slice(0, 10)}`), 100);
    setTimeout(
      () =>
        pushStream(sessionId, 'done', {
          usage: {
            inputTokens: 10,
            outputTokens: 20
          }
        }),
      300
    );

    writeJson(res, 201, message);
    return;
  }

  if (messagesMatch && method === 'GET') {
    const sessionId = Number(messagesMatch[1]);
    const session = sessions.get(sessionId);
    if (!session) {
      writeJson(res, 404, {});
      return;
    }

    const page = Number(url.searchParams.get('page') ?? '0');
    const size = Number(url.searchParams.get('size') ?? '50');
    const list = messages.get(sessionId) ?? [];
    const start = page * size;
    const content = list.slice(start, start + size);

    writeJson(res, 200, {
      content,
      totalElements: list.length,
      totalPages: Math.max(1, Math.ceil(list.length / size)),
      number: page,
      size
    });
    return;
  }

  const permissionMatch = path.match(/^\/api\/skill\/sessions\/(\d+)\/permissions\/([^/]+)$/);
  if (permissionMatch && method === 'POST') {
    const sessionId = Number(permissionMatch[1]);
    if (!sessions.has(sessionId)) {
      writeJson(res, 404, {});
      return;
    }

    const body = await readBody(req);
    writeJson(res, 200, {
      success: true,
      permissionId: permissionMatch[2],
      approved: Boolean(body.approved)
    });
    return;
  }

  const sendImMatch = path.match(/^\/api\/skill\/sessions\/(\d+)\/send-to-im$/);
  if (sendImMatch && method === 'POST') {
    const sessionId = Number(sendImMatch[1]);
    const session = sessions.get(sessionId);
    if (!session) {
      writeJson(res, 404, {});
      return;
    }

    const body = await readBody(req);
    writeJson(res, 200, {
      success: true,
      chatId: session.imChatId ?? 'mock-chat',
      contentLength: String(body.content ?? '').length
    });
    return;
  }

  writeJson(res, 404, { success: false, error: 'Not Found' });
}

export function startMockSkillServer(port = 8082): Promise<() => Promise<void>> {
  const server = createServer((req, res) => {
    void handleRest(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost:8082');
    const match = url.pathname.match(/^\/ws\/skill\/stream\/(\d+)$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const sessionId = Number(match[1]);
    wss.handleUpgrade(request, socket, head, (client) => {
      const room = wsRooms.get(sessionId) ?? new Set();
      room.add(client);
      wsRooms.set(sessionId, room);

      client.on('close', () => {
        const clients = wsRooms.get(sessionId);
        if (!clients) {
          return;
        }
        clients.delete(client);
        if (clients.size === 0) {
          wsRooms.delete(sessionId);
        }
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[mock-skill-server] listening on http://localhost:${port}`);
      resolve(async () => {
        await new Promise<void>((done) => wss.close(() => done()));
        await new Promise<void>((done) => server.close(() => done()));
      });
    });
  });
}
