import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSharedBrowserSkillSdk
} from "../src/sdk";
import type {
  SessionMessage,
  SessionMessagePart,
  SessionStatus,
  SkillSdkApi,
  SkillWecodeStatus,
  StreamMessage
} from "../src/sdk";
import { SkillMiniApp } from "./miniApp/SkillMiniApp";
import mockFixture from "../mocks/mock.json";
import { getSharedFixtureBrowserSkillSdk } from "../mocks/runtime/fixtureSkillSdk";

interface RuntimeConfig {
  baseUrl: string;
  wsUrl: string;
}

interface ChatConversation {
  id: string;
  title: string;
  subtitle: string;
  imGroupId: string;
  accent: string;
  draft: string;
  welinkSessionId: number | null;
  activeSkillName: string | null;
  sessionStatus: SessionStatus;
  showSkillBar: boolean;
  isMiniAppOpen: boolean;
  messages: SessionMessage[];
  streamEvents: StreamMessage[];
  imMessages: string[];
  lastActivityAt: string;
}

interface SkillCommand {
  skillName: string;
  prompt: string;
}

type MockMode = "server" | "json";

const fallbackConfig: RuntimeConfig = {
  baseUrl: import.meta.env.VITE_SKILL_SERVER_BASE_URL ?? "http://localhost:8787",
  wsUrl:
    import.meta.env.VITE_SKILL_SERVER_WS_URL ?? "ws://localhost:8787/ws/skill/stream"
};

const seededConversations: ChatConversation[] = [
  createConversationSeed({
    id: "conv-product",
    title: "产品设计群",
    subtitle: "UI / 前端联动",
    imGroupId: "group_demo_001",
    accent: "#07c160",
    draft: "/opencode 帮我做一个任务协同台，支持过滤、看板和日报",
    messages: [
      createSeedMessage("assistant", "把需求发我，我来给你拆成组件、状态和接口。", 1),
      createSeedMessage("user", "先把整体骨架搭好。", 2)
    ]
  }),
  createConversationSeed({
    id: "conv-rd",
    title: "研发联调群",
    subtitle: "桌面端 / MiniApp",
    imGroupId: "group_demo_002",
    accent: "#5b8cff",
    draft: "",
    messages: [
      createSeedMessage("user", "MiniApp 面板准备什么时候接入？", 1),
      createSeedMessage("assistant", "先把状态栏和消息链路拉通，再做面板容器。", 2)
    ]
  }),
  createConversationSeed({
    id: "conv-qa",
    title: "测试回归群",
    subtitle: "Mock / SDK / Case",
    imGroupId: "group_demo_003",
    accent: "#fa9d3b",
    draft: "",
    messages: [
      createSeedMessage("assistant", "当前关注点：流式输出、停止技能、发送到 IM。", 1)
    ]
  })
];

export default function App() {
  const initialMockMode = getInitialMockMode();
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(fallbackConfig);
  const [configReady, setConfigReady] = useState(false);
  const [sdk, setSdk] = useState<SkillSdkApi | null>(null);
  const [mockMode] = useState<MockMode>(initialMockMode);
  const [conversations, setConversations] = useState<ChatConversation[]>(seededConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string>(
    seededConversations[0].id
  );
  const [miniStatus, setMiniStatus] = useState<SkillWecodeStatus>("minimized");
  const [busyConversationId, setBusyConversationId] = useState<string | null>(null);
  const sdkRef = useRef<SkillSdkApi | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const pendingMessagesRef = useRef<Map<string, string>>(new Map());
  const statusCallbacksRef = useRef<Set<number>>(new Set());

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedConversationId) ??
      conversations[0],
    [conversations, selectedConversationId]
  );

  const skillCommand = parseSkillCommand(selectedConversation?.draft ?? "");
  const isGenerating =
    selectedConversation?.sessionStatus === "executing" && selectedConversation.showSkillBar;
  const composerActionLabel = isGenerating ? "停止生成" : skillCommand ? "生成" : "发送";

  useEffect(() => {
    if (!configReady) {
      return;
    }

    const sharedSdk =
      mockMode === "json"
        ? getSharedFixtureBrowserSkillSdk({
            runtimeKey: mockFixture.runtimeKey,
            fixtureData: mockFixture
          })
        : getSharedBrowserSkillSdk({
            baseUrl: runtimeConfig.baseUrl,
            wsUrl: runtimeConfig.wsUrl
          });

    sdkRef.current = sharedSdk;
    setSdk(sharedSdk);
  }, [configReady, mockMode, runtimeConfig.baseUrl, runtimeConfig.wsUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeConfig() {
      if (mockMode === "json") {
        if (!cancelled) {
          setRuntimeConfig({
            baseUrl: mockFixture.displayBaseUrl ?? "mock-json://fixture",
            wsUrl: mockFixture.displayWsUrl ?? "mock-json://fixture/ws"
          });
          setConfigReady(true);
        }
        return;
      }

      try {
        const response = await fetch(`/mock-server-runtime.json?t=${Date.now()}`);

        if (!response.ok) {
          throw new Error("runtime config not found");
        }

        const config = (await response.json()) as Partial<RuntimeConfig>;

        if (!cancelled && config.baseUrl && config.wsUrl) {
          setRuntimeConfig({
            baseUrl: config.baseUrl,
            wsUrl: config.wsUrl
          });
        }
      } catch {
        if (!cancelled) {
          setRuntimeConfig(fallbackConfig);
        }
      } finally {
        if (!cancelled) {
          setConfigReady(true);
        }
      }
    }

    void loadRuntimeConfig();

    return () => {
      cancelled = true;
    };
  }, [mockMode]);

  useEffect(() => {
    if (!sdk) {
      return;
    }

    sdk.onSkillWecodeStatusChange({
      callback: ({ status }) => setMiniStatus(status)
    });
  }, [sdk]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [
    selectedConversation?.messages,
    selectedConversation?.streamEvents,
    selectedConversation?.isMiniAppOpen
  ]);

  useEffect(() => {
    if (!sdk || !selectedConversation?.welinkSessionId) {
      return;
    }

    const conversationId = selectedConversation.id;
    const sessionId = selectedConversation.welinkSessionId;
    const onMessage = (message: StreamMessage) => {
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        streamEvents: [...conversation.streamEvents.slice(-11), message],
        messages: applyStreamMessage(conversation.messages, message),
        lastActivityAt: message.emittedAt
      }));
    };

    sdk.registerSessionListener({
      welinkSessionId: sessionId,
      onMessage
    });

    if (!statusCallbacksRef.current.has(sessionId)) {
      sdk.onSessionStatusChange({
        welinkSessionId: sessionId,
        callback: ({ status }) => {
          updateConversation(conversationId, (conversation) => ({
            ...conversation,
            sessionStatus: status,
            lastActivityAt: new Date().toISOString()
          }));
        }
      });
      statusCallbacksRef.current.add(sessionId);
    }

    const pendingMessage = pendingMessagesRef.current.get(conversationId);

    if (pendingMessage) {
      pendingMessagesRef.current.delete(conversationId);
      void sdk.sendMessage({
        welinkSessionId: sessionId,
        content: pendingMessage
      });
    } else {
      void refreshConversationHistory(conversationId, sessionId);
    }

    return () => {
      sdk.unregisterSessionListener({
        welinkSessionId: sessionId,
        onMessage
      });
    };
  }, [sdk, selectedConversation?.id, selectedConversation?.welinkSessionId]);

  async function handleComposerSubmit() {
    if (!selectedConversation) {
      return;
    }

    if (isGenerating) {
      await stopSkill();
      return;
    }

    if (skillCommand) {
      await executeSkill(skillCommand);
      return;
    }

    await sendPlainMessage();
  }

  async function executeSkill(command: SkillCommand) {
    const currentSdk = sdkRef.current;

    if (!currentSdk || !selectedConversation) {
      return;
    }

    const rawInput = selectedConversation.draft.trim();
    const existingSessionId = selectedConversation.welinkSessionId;
    const hasReusableSession =
      existingSessionId !== null && selectedConversation.activeSkillName === command.skillName;

    setBusyConversationId(selectedConversation.id);
    appendOptimisticMessage(selectedConversation.id, rawInput, existingSessionId ?? -1);
    updateConversation(selectedConversation.id, (conversation) => ({
      ...conversation,
      draft: "",
      activeSkillName: command.skillName,
      showSkillBar: true,
      sessionStatus: "executing",
      lastActivityAt: new Date().toISOString()
    }));

    try {
      if (hasReusableSession && existingSessionId) {
        await currentSdk.sendMessage({
          welinkSessionId: existingSessionId,
          content: command.prompt
        });
        return;
      }

      const session = await currentSdk.createSession({
        ak: command.skillName,
        title: `${selectedConversation.title} / ${command.skillName}`,
        imGroupId: selectedConversation.imGroupId
      });

      updateConversation(selectedConversation.id, (conversation) => ({
        ...conversation,
        welinkSessionId: session.welinkSessionId,
        activeSkillName: command.skillName,
        showSkillBar: true
      }));

      if (existingSessionId === session.welinkSessionId && existingSessionId !== null) {
        await currentSdk.sendMessage({
          welinkSessionId: session.welinkSessionId,
          content: command.prompt
        });
      } else {
        pendingMessagesRef.current.set(selectedConversation.id, command.prompt);
      }
    } finally {
      setBusyConversationId(null);
    }
  }

  async function sendPlainMessage() {
    const currentSdk = sdkRef.current;

    if (!currentSdk || !selectedConversation) {
      return;
    }

    const content = selectedConversation.draft.trim();

    if (!content) {
      return;
    }

    const existingSessionId = selectedConversation.welinkSessionId;
    const defaultSkill = selectedConversation.activeSkillName ?? "assistant";

    setBusyConversationId(selectedConversation.id);
    appendOptimisticMessage(selectedConversation.id, content, existingSessionId ?? -1);
    updateConversation(selectedConversation.id, (conversation) => ({
      ...conversation,
      draft: "",
      lastActivityAt: new Date().toISOString()
    }));

    try {
      if (existingSessionId) {
        await currentSdk.sendMessage({
          welinkSessionId: existingSessionId,
          content
        });
        return;
      }

      const session = await currentSdk.createSession({
        ak: defaultSkill,
        title: `${selectedConversation.title} / ${defaultSkill}`,
        imGroupId: selectedConversation.imGroupId
      });

      updateConversation(selectedConversation.id, (conversation) => ({
        ...conversation,
        welinkSessionId: session.welinkSessionId,
        activeSkillName: defaultSkill
      }));
      pendingMessagesRef.current.set(selectedConversation.id, content);
    } finally {
      setBusyConversationId(null);
    }
  }

  async function stopSkill() {
    const currentSdk = sdkRef.current;

    if (!currentSdk || !selectedConversation?.welinkSessionId) {
      return;
    }

    await currentSdk.stopSkill({ welinkSessionId: selectedConversation.welinkSessionId });
  }

  async function openMiniApp() {
    if (!selectedConversation) {
      return;
    }

    updateConversation(selectedConversation.id, (conversation) => ({
      ...conversation,
      showSkillBar: true,
      isMiniAppOpen: !conversation.isMiniAppOpen
    }));
  }

  async function refreshConversationHistory(conversationId: string, sessionId: number) {
    const currentSdk = sdkRef.current;

    if (!currentSdk) {
      return;
    }

    const result = await currentSdk.getSessionMessage({
      welinkSessionId: sessionId,
      page: 0,
      size: 50
    });

    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: result.content
    }));
  }

  function updateConversation(
    conversationId: string,
    updater: (conversation: ChatConversation) => ChatConversation
  ) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation
      )
    );
  }

  function appendOptimisticMessage(conversationId: string, content: string, sessionId: number) {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: [...conversation.messages, createOptimisticUserMessage(content, sessionId)]
    }));
  }

  if (!selectedConversation) {
    return null;
  }

  return (
    <main className="wechat-shell">
      <aside className="conversation-sidebar">
        <header className="sidebar-header">
          <div>
            <p className="sidebar-kicker">Skill SDK Demo</p>
            <h1>消息会话</h1>
          </div>
          <div className="sidebar-runtime">
            <span>{configReady ? "Mock 已连接" : "读取配置中"}</span>
            <strong>{mockMode === "json" ? "Mock JSON" : "Mock Server"}</strong>
            <strong>{runtimeConfig.baseUrl.replace("http://", "")}</strong>
          </div>
        </header>

        <div className="mock-mode-switch">
          <button
            type="button"
            className={mockMode === "server" ? "active" : ""}
            onClick={() => switchMockMode("server")}
          >
            Mock Server
          </button>
          <button
            type="button"
            className={mockMode === "json" ? "active" : ""}
            onClick={() => switchMockMode("json")}
          >
            Mock JSON
          </button>
        </div>

        <div className="conversation-list">
          {conversations.map((conversation) => {
            const selected = conversation.id === selectedConversation.id;
            const preview = getConversationPreview(conversation);

            return (
              <button
                key={conversation.id}
                className={`conversation-item ${selected ? "selected" : ""}`}
                onClick={() => setSelectedConversationId(conversation.id)}
                type="button"
              >
                <span
                  className="conversation-avatar"
                  style={{ background: conversation.accent }}
                >
                  {conversation.title.slice(0, 1)}
                </span>
                <span className="conversation-copy">
                  <strong>{conversation.title}</strong>
                  <span>{preview}</span>
                </span>
                <span className="conversation-meta">
                  <time>{formatClock(conversation.lastActivityAt)}</time>
                  {conversation.sessionStatus === "executing" ? (
                    <em className="conversation-dot" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="chat-stage">
        <header className="chat-header">
          <div>
            <h2>{selectedConversation.title}</h2>
            <p>
              {selectedConversation.subtitle}
              {selectedConversation.activeSkillName
                ? ` · 当前技能 /${selectedConversation.activeSkillName}`
                : ""}
            </p>
          </div>
          <div className="chat-header-meta">
            <span>Session: {selectedConversation.welinkSessionId ?? "未创建"}</span>
            <span>MiniApp: {miniStatus}</span>
          </div>
        </header>

        <div ref={messageListRef} className="chat-scroll">
          <div className="chat-timeline">
            {selectedConversation.messages.map((message) => (
              <div
                key={`${selectedConversation.id}-${message.id}`}
                className={`bubble-row ${message.role === "user" ? "own" : ""}`}
              >
                <div
                  className={`bubble-avatar ${message.role === "user" ? "user" : "assistant"}`}
                >
                  {message.role === "user" ? "我" : "技"}
                </div>
                <div className={`bubble ${message.role}`}>
                  <p>{message.content}</p>
                  <time>{formatClock(message.createdAt)}</time>
                </div>
              </div>
            ))}
          </div>

          {selectedConversation.isMiniAppOpen ? (
            <div className="miniapp-drawer">
              <SkillMiniApp
                sessionId={selectedConversation.welinkSessionId}
                baseUrl={runtimeConfig.baseUrl}
                wsUrl={runtimeConfig.wsUrl}
                mockMode={mockMode}
              />
            </div>
          ) : null}
        </div>

        <footer className="composer-shell">
          {selectedConversation.showSkillBar ? (
            <div className="skill-status-bar">
              <span className={`status-pill ${selectedConversation.sessionStatus}`}>
                {mapSessionStatusLabel(selectedConversation.sessionStatus)}
              </span>
              <button
                type="button"
                onClick={() => void stopSkill()}
                disabled={!selectedConversation.welinkSessionId || !isGenerating}
              >
                停止生成
              </button>
              <button
                type="button"
                onClick={() => void openMiniApp()}
                disabled={!selectedConversation.welinkSessionId}
              >
                {selectedConversation.isMiniAppOpen ? "收起小程序" : "打开小程序"}
              </button>
            </div>
          ) : null}

          <div className="composer-box">
            <textarea
              value={selectedConversation.draft}
              onChange={(event) =>
                updateConversation(selectedConversation.id, (conversation) => ({
                  ...conversation,
                  draft: event.target.value
                }))
              }
              rows={4}
              placeholder="输入消息，或使用 /skillName 帮我做xxx 触发技能生成"
            />
            <div className="composer-toolbar">
              <span className="composer-hint">
                {skillCommand
                  ? `技能 /${skillCommand.skillName} 已识别，点击生成开始执行`
                  : "普通消息将发送到当前会话；执行中的技能可直接停止"}
              </span>
              <button
                type="button"
                className={`composer-action ${isGenerating ? "danger" : ""}`}
                onClick={() => void handleComposerSubmit()}
                disabled={
                  !configReady ||
                  !sdk ||
                  busyConversationId === selectedConversation.id ||
                  (!isGenerating && !selectedConversation.draft.trim())
                }
              >
                {composerActionLabel}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}

function createConversationSeed(seed: {
  id: string;
  title: string;
  subtitle: string;
  imGroupId: string;
  accent: string;
  draft: string;
  messages: SessionMessage[];
}): ChatConversation {
  return {
    id: seed.id,
    title: seed.title,
    subtitle: seed.subtitle,
    imGroupId: seed.imGroupId,
    accent: seed.accent,
    draft: seed.draft,
    welinkSessionId: null,
    activeSkillName: null,
    sessionStatus: "completed",
    showSkillBar: false,
    isMiniAppOpen: false,
    messages: seed.messages,
    streamEvents: [],
    imMessages: [],
    lastActivityAt: seed.messages[seed.messages.length - 1]?.createdAt ?? new Date().toISOString()
  };
}

function createSeedMessage(
  role: SessionMessage["role"],
  content: string,
  messageSeq: number
): SessionMessage {
  const createdAt = new Date(Date.now() - (3 - messageSeq) * 60_000).toISOString();

  return {
    id: messageSeq,
    welinkSessionId: -1,
    userId: role === "user" ? "10001" : null,
    role,
    content,
    messageSeq,
    parts: [
      {
        partId: `${messageSeq}:text`,
        partSeq: 0,
        type: "text",
        content
      }
    ],
    createdAt
  };
}

function createOptimisticUserMessage(content: string, welinkSessionId: number): SessionMessage {
  const timestamp = new Date().toISOString();

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    welinkSessionId,
    userId: "10001",
    role: "user",
    content,
    messageSeq: Date.now(),
    parts: [
      {
        partId: `${Date.now()}:text`,
        partSeq: 0,
        type: "text",
        content
      }
    ],
    createdAt: timestamp
  };
}

function parseSkillCommand(input: string): SkillCommand | null {
  const trimmed = input.trim();
  const match = /^\/([^\s]+)\s+(.+)$/.exec(trimmed);

  if (!match) {
    return null;
  }

  return {
    skillName: match[1],
    prompt: match[2]
  };
}

function getInitialMockMode(): MockMode {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("mockMode");

  if (candidate === "json" || candidate === "server") {
    return candidate;
  }

  return mockFixture.defaultMode === "json" ? "json" : "server";
}

function switchMockMode(nextMode: MockMode): void {
  const url = new URL(window.location.href);
  url.searchParams.set("mockMode", nextMode);
  window.location.assign(url.toString());
}

function getConversationPreview(conversation: ChatConversation): string {
  const lastMessage = conversation.messages[conversation.messages.length - 1];

  if (lastMessage?.content) {
    return lastMessage.content;
  }

  return conversation.subtitle;
}

function formatClock(value: string): string {
  const date = new Date(value);

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function mapSessionStatusLabel(status: SessionStatus): string {
  if (status === "executing") {
    return "执行中";
  }

  if (status === "stopped") {
    return "已停止";
  }

  return "已完成";
}

function applyStreamMessage(current: SessionMessage[], message: StreamMessage): SessionMessage[] {
  if (!message.messageId || !message.messageSeq || !message.role) {
    return current;
  }

  const messageId = Number(message.messageId);
  const existingIndex = current.findIndex((item) => item.id === messageId);
  const existingMessage =
    existingIndex >= 0
      ? current[existingIndex]
      : createStreamBackedMessage(messageId, message);

  const nextMessage = mergeStreamIntoMessage(existingMessage, message);

  if (existingIndex >= 0) {
    const next = [...current];
    next[existingIndex] = nextMessage;
    return next.sort(sortMessages);
  }

  return [...current, nextMessage].sort(sortMessages);
}

function createStreamBackedMessage(messageId: number, message: StreamMessage): SessionMessage {
  return {
    id: messageId,
    welinkSessionId: message.welinkSessionId,
    userId: null,
    role: message.role ?? "assistant",
    content: "",
    messageSeq: message.messageSeq ?? messageId,
    parts: [],
    createdAt: message.emittedAt
  };
}

function mergeStreamIntoMessage(message: SessionMessage, stream: StreamMessage): SessionMessage {
  const partId = stream.partId ?? `${stream.type}:${stream.seq}`;
  const existingPart =
    message.parts.find((part) => part.partId === partId) ??
    createStreamPart(stream, partId);

  let nextPart: SessionMessagePart = existingPart;

  if (stream.type === "text.delta" || stream.type === "thinking.delta") {
    nextPart = {
      ...existingPart,
      content: `${existingPart.content ?? ""}${stream.content ?? ""}`
    };
  } else if (stream.type === "text.done" || stream.type === "thinking.done") {
    nextPart = {
      ...existingPart,
      content: stream.content ?? existingPart.content ?? ""
    };
  } else if (stream.type === "tool.update") {
    nextPart = {
      ...existingPart,
      type: "tool",
      toolName: stream.toolName,
      toolCallId: stream.toolCallId,
      toolStatus: stream.status,
      toolOutput: stream.output,
      content: stream.output ?? existingPart.content
    };
  } else if (stream.type === "question") {
    nextPart = {
      ...existingPart,
      type: "question",
      question: stream.question,
      options: stream.options,
      content: stream.question ?? existingPart.content
    };
  } else if (stream.type === "permission.ask") {
    nextPart = {
      ...existingPart,
      type: "permission",
      permissionId: stream.permissionId,
      content: stream.title ?? existingPart.content
    };
  } else if (stream.type === "file") {
    nextPart = {
      ...existingPart,
      type: "file",
      fileName: stream.fileName,
      fileUrl: stream.fileUrl,
      fileMime: stream.fileMime,
      content: stream.fileName ?? existingPart.content
    };
  }

  const nextParts = upsertPart(message.parts, nextPart).sort(
    (left, right) => left.partSeq - right.partSeq
  );

  return {
    ...message,
    role: stream.role ?? message.role,
    messageSeq: stream.messageSeq ?? message.messageSeq,
    parts: nextParts,
    content: buildDisplayContent(nextParts)
  };
}

function createStreamPart(stream: StreamMessage, partId: string): SessionMessagePart {
  return {
    partId,
    partSeq: stream.partSeq ?? 0,
    type:
      stream.type === "tool.update"
        ? "tool"
        : stream.type === "question"
          ? "question"
          : stream.type.startsWith("permission")
            ? "permission"
            : stream.type === "file"
              ? "file"
              : stream.type.startsWith("thinking")
                ? "thinking"
                : "text",
    content: stream.content
  };
}

function upsertPart(parts: SessionMessagePart[], nextPart: SessionMessagePart): SessionMessagePart[] {
  const index = parts.findIndex((part) => part.partId === nextPart.partId);

  if (index === -1) {
    return [...parts, nextPart];
  }

  const next = [...parts];
  next[index] = nextPart;
  return next;
}

function sortMessages(left: SessionMessage, right: SessionMessage): number {
  return left.messageSeq - right.messageSeq || left.id - right.id;
}

function buildDisplayContent(parts: SessionMessagePart[]): string {
  return parts
    .filter((part) =>
      part.type === "text" ||
      part.type === "thinking" ||
      part.type === "question" ||
      part.type === "file"
    )
    .map((part) => part.content ?? part.question ?? "")
    .join("");
}
