import express from "express";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

interface SkillSession {
  welinkSessionId: number;
  userId: string;
  ak: string;
  title: string;
  imGroupId: string;
  status: string;
  toolSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionMessagePart {
  partId: string;
  partSeq: number;
  type: "text" | "thinking" | "tool" | "question" | "permission" | "file";
  content?: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  question?: string;
  options?: string[];
  permissionId?: string;
  fileName?: string;
  fileUrl?: string;
  fileMime?: string;
}

interface SessionMessage {
  id: number;
  welinkSessionId: number;
  userId: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  messageSeq: number;
  parts: SessionMessagePart[];
  createdAt: string;
}

interface ActiveStream {
  timers: ReturnType<typeof setTimeout>[];
  assistantMessageId: number;
  streamedContent: string;
}

const app = express();
app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", "*");
  response.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.header("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json());

const requestedPort = Number(process.env.MOCK_SERVER_PORT ?? 0);
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/skill/stream" });
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtimeConfigPath = path.join(projectRoot, "public", "mock-server-runtime.json");

const sessions = new Map<number, SkillSession>();
const sessionMessages = new Map<number, SessionMessage[]>();
const activeStreams = new Map<number, ActiveStream>();
const imMessages: string[] = [];
let sessionIdSeed = 1;
let messageIdSeed = 1;
let streamSeq = 1;

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "agent.online",
      seq: streamSeq++,
      welinkSessionId: 0,
      emittedAt: new Date().toISOString()
    })
  );
});

app.get("/api/skill/sessions", (request, response) => {
  const imGroupId = String(request.query.imGroupId ?? "");
  const ak = String(request.query.ak ?? "");
  const matched = [...sessions.values()].filter(
    (session) =>
      session.imGroupId === imGroupId &&
      session.ak === ak &&
      session.status === "ACTIVE"
  );
  response.json(matched);
});

app.post("/api/skill/sessions", (request, response) => {
  const now = new Date().toISOString();
  const session: SkillSession = {
    welinkSessionId: sessionIdSeed++,
    userId: "10001",
    ak: String(request.body.ak),
    title: String(request.body.title ?? "OpenCode Demo"),
    imGroupId: String(request.body.imGroupId),
    status: "ACTIVE",
    toolSessionId: null,
    createdAt: now,
    updatedAt: now
  };

  sessions.set(session.welinkSessionId, session);
  sessionMessages.set(session.welinkSessionId, []);
  response.json(session);
});

app.post("/api/skill/sessions/:sessionId/messages", (request, response) => {
  const sessionId = Number(request.params.sessionId);
  const content = String(request.body.content ?? "");
  const message = createUserMessage(sessionId, content);
  sessionMessages.get(sessionId)?.push(message);
  response.json(message);
  simulateAssistantStream(sessionId, content);
});

app.post("/api/skill/sessions/:sessionId/abort", (request, response) => {
  const sessionId = Number(request.params.sessionId);
  cancelActiveStream(sessionId, true);
  response.json({
    welinkSessionId: sessionId,
    status: "aborted"
  });
});

app.get("/api/skill/sessions/:sessionId/messages", (request, response) => {
  const sessionId = Number(request.params.sessionId);
  const page = Number(request.query.page ?? 0);
  const size = Number(request.query.size ?? 50);
  const messages = sessionMessages.get(sessionId) ?? [];
  const start = page * size;
  const end = start + size;

  response.json({
    content: messages.slice(start, end),
    page,
    size,
    total: messages.length
  });
});

app.post("/api/skill/sessions/:sessionId/permissions/:permId", (request, response) => {
  const sessionId = Number(request.params.sessionId);
  const permissionId = String(request.params.permId);
  const permissionResult = {
    welinkSessionId: sessionId,
    permissionId,
    response: String(request.body.response)
  };

  broadcast({
    type: "permission.reply",
    seq: streamSeq++,
    welinkSessionId: sessionId,
    emittedAt: new Date().toISOString(),
    permissionId,
    response: permissionResult.response
  });

  response.json(permissionResult);
});

app.post("/api/skill/sessions/:sessionId/send-to-im", (request, response) => {
  const content = String(request.body.content ?? "");
  imMessages.push(content);
  response.json({
    status: "success",
    chatId: `chat_${imMessages.length}`,
    contentLength: content.length
  });
});

app.get("/api/mock/im-messages", (_request, response) => {
  response.json({ messages: imMessages });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Mock Skill Server could not start because port ${requestedPort} is already in use.\n` +
        `Use a different port, for example:\n` +
        `$env:MOCK_SERVER_PORT=8788; npm run mock:server`
    );
    process.exit(1);
  }

  throw error;
});

server.listen(requestedPort, async () => {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve mock server address");
  }

  const actualPort = address.port;
  const runtimeConfig = {
    port: actualPort,
    baseUrl: `http://localhost:${actualPort}`,
    wsUrl: `ws://localhost:${actualPort}/ws/skill/stream`
  };

  await writeFile(runtimeConfigPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`, "utf8");
  console.log(`Mock Skill Server listening on ${runtimeConfig.baseUrl}`);
  console.log(`Runtime config written to ${runtimeConfigPath}`);
});

function createUserMessage(sessionId: number, content: string): SessionMessage {
  const now = new Date().toISOString();
  const list = sessionMessages.get(sessionId) ?? [];
  const id = messageIdSeed++;

  return {
    id,
    welinkSessionId: sessionId,
    userId: "10001",
    role: "user",
    content,
    messageSeq: list.length + 1,
    parts: [{ partId: `${id}:text`, partSeq: 0, type: "text", content }],
    createdAt: now
  };
}

function createAssistantMessage(sessionId: number, content = ""): SessionMessage {
  const now = new Date().toISOString();
  const list = sessionMessages.get(sessionId) ?? [];
  const id = messageIdSeed++;

  return {
    id,
    welinkSessionId: sessionId,
    userId: null,
    role: "assistant",
    content,
    messageSeq: list.length + 1,
    parts: [
      {
        partId: `${id}:text`,
        partSeq: 0,
        type: "text",
        content
      }
    ],
    createdAt: now
  };
}

function simulateAssistantStream(sessionId: number, prompt: string): void {
  cancelActiveStream(sessionId, false);
  const now = new Date().toISOString();
  const assistantContent = `Request received: "${prompt}". Returning a structured Skill SDK response.`;
  const assistant = createAssistantMessage(sessionId);
  sessionMessages.get(sessionId)?.push(assistant);
  const textChunks = splitIntoChunks(assistantContent, 14);
  const activeStream: ActiveStream = {
    timers: [],
    assistantMessageId: assistant.id,
    streamedContent: ""
  };
  activeStreams.set(sessionId, activeStream);

  const chunks = [
    { type: "step.start", seq: streamSeq++, welinkSessionId: sessionId, emittedAt: now },
    {
      type: "session.status",
      seq: streamSeq++,
      welinkSessionId: sessionId,
      emittedAt: now,
      sessionStatus: "busy"
    },
    {
      type: "tool.update",
      seq: streamSeq++,
      welinkSessionId: sessionId,
      emittedAt: now,
      messageId: String(assistant.id),
      messageSeq: assistant.messageSeq,
      role: assistant.role,
      partId: `${assistant.id}:tool`,
      partSeq: 1,
      toolName: "mock-builder",
      toolCallId: `tool_${assistant.id}`,
      status: "completed",
      output: "Project scaffold generated."
    },
    {
      type: "permission.ask",
      seq: streamSeq++,
      welinkSessionId: sessionId,
      emittedAt: now,
      messageId: String(assistant.id),
      messageSeq: assistant.messageSeq,
      role: assistant.role,
      partId: `${assistant.id}:permission`,
      partSeq: 2,
      permissionId: `perm_${assistant.id}`,
      title: "Allow writing files into the local project directory"
    }
  ];

  const textDeltaEvents = textChunks.map((chunk) => ({
    type: "text.delta",
    seq: streamSeq++,
    welinkSessionId: sessionId,
    emittedAt: now,
    messageId: String(assistant.id),
    messageSeq: assistant.messageSeq,
    role: assistant.role,
    partId: `${assistant.id}:text`,
    partSeq: 0,
    content: chunk
  }));

  const endingEvents = [
    {
      type: "text.done",
      seq: streamSeq++,
      welinkSessionId: sessionId,
      emittedAt: now,
      messageId: String(assistant.id),
      messageSeq: assistant.messageSeq,
      role: assistant.role,
      partId: `${assistant.id}:text`,
      partSeq: 0,
      content: assistantContent
    },
    {
      type: "step.done",
      seq: streamSeq++,
      welinkSessionId: sessionId,
      emittedAt: now,
      messageId: String(assistant.id),
      messageSeq: assistant.messageSeq,
      role: assistant.role,
      reason: "completed"
    },
    {
      type: "session.status",
      seq: streamSeq++,
      welinkSessionId: sessionId,
      emittedAt: now,
      sessionStatus: "idle"
    }
  ];

  [...chunks, ...textDeltaEvents, ...endingEvents].forEach((event, index) => {
    const timer = setTimeout(() => {
      const stream = activeStreams.get(sessionId);

      if (!stream || stream.assistantMessageId !== assistant.id) {
        return;
      }

      applyEventToAssistantMessage(sessionId, assistant.id, event, stream, assistantContent);

      broadcast(event);

      if (
        event.type === "session.status" &&
        "sessionStatus" in event &&
        event.sessionStatus === "idle"
      ) {
        activeStreams.delete(sessionId);
      }
    }, 220 * (index + 1));

    activeStream.timers.push(timer);
  });
}

function cancelActiveStream(sessionId: number, emitStopped: boolean): void {
  const activeStream = activeStreams.get(sessionId);

  if (activeStream) {
    activeStream.timers.forEach((timer) => clearTimeout(timer));
    activeStreams.delete(sessionId);
  }

  if (emitStopped && activeStream) {
    broadcast({
      type: "error",
      seq: streamSeq++,
      welinkSessionId: sessionId,
      emittedAt: new Date().toISOString(),
      error: "aborted by user",
      content: "aborted by user"
    });
  }
}

function updateAssistantMessageContent(
  sessionId: number,
  messageId: number,
  content: string
): void {
  const messages = sessionMessages.get(sessionId);

  if (!messages) {
    return;
  }

  const target = messages.find((message) => message.id === messageId);

  if (!target) {
    return;
  }

  target.content = content;
  upsertMessagePart(target, {
    partId: `${messageId}:text`,
    partSeq: 0,
    type: "text",
    content
  });
}

function applyEventToAssistantMessage(
  sessionId: number,
  messageId: number,
  event: Record<string, unknown>,
  stream: ActiveStream,
  finalAssistantContent: string
): void {
  const messages = sessionMessages.get(sessionId);
  const target = messages?.find((message) => message.id === messageId);

  if (!target) {
    return;
  }

  if (event.type === "tool.update") {
    upsertMessagePart(target, {
      partId: String(event.partId),
      partSeq: Number(event.partSeq ?? 0),
      type: "tool",
      toolName: typeof event.toolName === "string" ? event.toolName : undefined,
      toolCallId: typeof event.toolCallId === "string" ? event.toolCallId : undefined,
      toolStatus: typeof event.status === "string" ? event.status : undefined,
      toolOutput: typeof event.output === "string" ? event.output : undefined,
      content: typeof event.output === "string" ? event.output : undefined
    });
    return;
  }

  if (event.type === "permission.ask") {
    upsertMessagePart(target, {
      partId: String(event.partId),
      partSeq: Number(event.partSeq ?? 0),
      type: "permission",
      permissionId: typeof event.permissionId === "string" ? event.permissionId : undefined,
      content: typeof event.title === "string" ? event.title : undefined
    });
    return;
  }

  if (event.type === "text.delta") {
    stream.streamedContent += String(event.content ?? "");
    updateAssistantMessageContent(sessionId, messageId, stream.streamedContent);
    return;
  }

  if (event.type === "text.done") {
    updateAssistantMessageContent(sessionId, messageId, finalAssistantContent);
  }
}

function upsertMessagePart(message: SessionMessage, nextPart: SessionMessagePart): void {
  const index = message.parts.findIndex((part) => part.partId === nextPart.partId);

  if (index === -1) {
    message.parts.push(nextPart);
  } else {
    message.parts[index] = {
      ...message.parts[index],
      ...nextPart
    };
  }

  message.parts.sort((left, right) => left.partSeq - right.partSeq);
}

function broadcast(payload: Record<string, unknown>): void {
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }
}

function splitIntoChunks(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < content.length; index += chunkSize) {
    chunks.push(content.slice(index, index + chunkSize));
  }

  return chunks;
}
