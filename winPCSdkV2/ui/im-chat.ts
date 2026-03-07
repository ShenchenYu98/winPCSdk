import {
  createSkillClient,
  type ExecuteSkillParams,
  type SkillClient,
  type SkillSession,
  type StreamMessage,
} from '../src/index';

type Env = 'dev' | 'test' | 'prod';
type MiniAppState = 'hidden' | 'minimized' | 'open' | 'closed';
type ExecutionState = 'idle' | 'executing' | 'stopped' | 'completed';

interface UiMessage {
  id: string;
  role: 'me' | 'ai' | 'sys';
  content: string;
  streaming?: boolean;
  seq?: number;
  ts: number;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
};

const el = {
  baseUrl: $<HTMLInputElement>('baseUrl'),
  wsUrl: $<HTMLInputElement>('wsUrl'),
  env: $<HTMLSelectElement>('env'),
  imChatId: $<HTMLInputElement>('imChatId'),
  skillDefinitionId: $<HTMLInputElement>('skillDefinitionId'),
  userId: $<HTMLInputElement>('userId'),
  statusChip: $<HTMLSpanElement>('statusChip'),
  sessionIdLabel: $<HTMLElement>('sessionIdLabel'),
  executionStatusLabel: $<HTMLElement>('executionStatusLabel'),
  composerInput: $<HTMLTextAreaElement>('composerInput'),
  permissionId: $<HTMLInputElement>('permissionId'),
  imTimeline: $<HTMLDivElement>('imTimeline'),
  miniappFeed: $<HTMLDivElement>('miniappFeed'),
  miniappPanel: $<HTMLDivElement>('miniappPanel'),
  miniappState: $<HTMLSpanElement>('miniappState'),
  eventLog: $<HTMLPreElement>('eventLog'),
  metricsView: $<HTMLPreElement>('metricsView'),
  primaryAction: $<HTMLButtonElement>('primaryAction'),
  initClient: $<HTMLButtonElement>('initClient'),
  closeSkillAll: $<HTMLButtonElement>('closeSkillAll'),
  regenerate: $<HTMLButtonElement>('regenerate'),
  sendToIm: $<HTMLButtonElement>('sendToIm'),
  permApprove: $<HTMLButtonElement>('permApprove'),
  permReject: $<HTMLButtonElement>('permReject'),
  miniOpen: $<HTMLButtonElement>('miniOpen'),
  miniMinimize: $<HTMLButtonElement>('miniMinimize'),
  miniClose: $<HTMLButtonElement>('miniClose'),
  refreshMetrics: $<HTMLButtonElement>('refreshMetrics'),
};

let client: SkillClient | null = null;
let currentSessionId = '';
let executionState: ExecutionState = 'idle';
let miniappState: MiniAppState = 'hidden';
let boundSessionId = '';
let streamSeqBySession = new Map<string, number>();
let messages: UiMessage[] = [];
let logs: string[] = [];
let assistantDraftId = '';
let lastAssistantContent = '';

function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function log(text: string): void {
  logs.unshift(`${now()} ${text}`);
  logs = logs.slice(0, 220);
  el.eventLog.textContent = logs.join('\n');
}

function addMessage(role: UiMessage['role'], content: string, seq?: number, streaming = false): UiMessage {
  const item: UiMessage = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    seq,
    streaming,
    ts: Date.now(),
  };
  messages.push(item);
  renderMessages();
  return item;
}

function renderMessages(): void {
  el.imTimeline.innerHTML = '';
  for (const msg of messages) {
    const row = document.createElement('div');
    row.className = `message ${msg.role}${msg.streaming ? ' streaming' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false })} · ${msg.role}${msg.seq !== undefined ? ` · #${msg.seq}` : ''}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.content;

    row.append(meta, bubble);
    el.imTimeline.appendChild(row);
  }
  el.imTimeline.scrollTop = el.imTimeline.scrollHeight;

  const aiLines = messages
    .filter((m) => m.role === 'ai')
    .slice(-8)
    .map((m) => `${m.seq ?? '-'} | ${m.streaming ? '[streaming] ' : ''}${m.content}`)
    .join('\n');
  el.miniappFeed.textContent = aiLines || '暂无 AI 输出';
}

function renderStatus(): void {
  el.sessionIdLabel.textContent = currentSessionId || '-';
  el.executionStatusLabel.textContent = executionState;

  const online = Boolean(client);
  const running = executionState === 'executing';

  el.statusChip.className = `chip ${running ? 'running' : online ? 'online' : 'offline'}`;
  el.statusChip.textContent = running ? 'Running' : online ? 'Client Online' : 'Client Offline';

  el.miniappState.textContent = miniappState;
  el.miniappPanel.classList.toggle('hidden', miniappState === 'hidden' || miniappState === 'closed');

  const input = el.composerInput.value.trim();
  if (running) {
    el.primaryAction.textContent = '停止';
    return;
  }

  if (input.startsWith('/')) {
    el.primaryAction.textContent = '执行';
  } else {
    el.primaryAction.textContent = '发送';
  }
}

function renderMetrics(): void {
  if (!client) {
    el.metricsView.textContent = '{}';
    return;
  }
  el.metricsView.textContent = JSON.stringify(client.getMetricsSnapshot(), null, 2);
}

function requireClient(): SkillClient {
  if (!client) {
    throw new Error('请先 Init Client');
  }
  return client;
}

function assertSession(): string {
  if (!currentSessionId) {
    throw new Error('当前无 session，请先执行 /skillName 指令');
  }
  return currentSessionId;
}

function cleanupBoundSessionListener(): void {
  if (!client || !boundSessionId) {
    return;
  }

  try {
    client.unregisterSessionListener({
      sessionId: boundSessionId,
      onMessage: onStreamMessage,
      onError: onStreamError,
      onClose: onStreamClose,
    });
  } catch {
    // ignore
  }
}

function bindSession(session: SkillSession): void {
  const c = requireClient();
  if (boundSessionId && boundSessionId !== session.id) {
    cleanupBoundSessionListener();
  }

  currentSessionId = session.id;
  boundSessionId = session.id;
  streamSeqBySession.set(session.id, 0);

  c.registerSessionListener({
    sessionId: session.id,
    onMessage: onStreamMessage,
    onError: onStreamError,
    onClose: onStreamClose,
  });

  c.onSessionStatusChange({
    sessionId: session.id,
    callback: ({ status }) => {
      executionState = status;
      log(`session status => ${status}`);
      if (status === 'executing') {
        miniappState = miniappState === 'hidden' || miniappState === 'closed' ? 'minimized' : miniappState;
      }
      renderStatus();
    },
  });

  addMessage('sys', `绑定会话 ${session.id}`);
  renderStatus();
}

function onStreamMessage(message: StreamMessage): void {
  const prev = streamSeqBySession.get(message.sessionId) ?? 0;
  if (message.seq <= prev) {
    log(`seq 警告: session=${message.sessionId}, prev=${prev}, incoming=${message.seq}`);
  }
  streamSeqBySession.set(message.sessionId, Math.max(prev, message.seq));

  if (message.type === 'delta') {
    executionState = 'executing';
    if (!assistantDraftId) {
      const draft = addMessage('ai', message.content, message.seq, true);
      assistantDraftId = draft.id;
      lastAssistantContent = draft.content;
    } else {
      const msg = messages.find((m) => m.id === assistantDraftId);
      if (msg) {
        msg.content += message.content;
        msg.streaming = true;
        msg.seq = message.seq;
        lastAssistantContent = msg.content;
        renderMessages();
      }
    }
  }

  if (message.type === 'done') {
    executionState = 'completed';
    if (assistantDraftId) {
      const msg = messages.find((m) => m.id === assistantDraftId);
      if (msg) {
        msg.streaming = false;
        lastAssistantContent = msg.content;
      }
      assistantDraftId = '';
      renderMessages();
    }
  }

  if (message.type === 'error' || message.type === 'agent_offline') {
    executionState = 'stopped';
    if (assistantDraftId) {
      const msg = messages.find((m) => m.id === assistantDraftId);
      if (msg) {
        msg.streaming = false;
      }
      assistantDraftId = '';
    }
    addMessage('sys', `${message.type}: ${message.content || '无内容'}`);
  }

  if (message.type === 'agent_online') {
    executionState = 'executing';
  }

  renderStatus();
  renderMetrics();
}

function onStreamError(error: unknown): void {
  executionState = 'stopped';
  log(`stream error: ${JSON.stringify(error)}`);
  addMessage('sys', `stream error: ${JSON.stringify(error)}`);
  renderStatus();
}

function onStreamClose(reason: string): void {
  executionState = 'stopped';
  log(`stream close: ${reason}`);
  addMessage('sys', `stream close: ${reason}`);
  renderStatus();
}

async function executeCommand(input: string): Promise<void> {
  const c = requireClient();
  const trimmed = input.trim();
  const params: ExecuteSkillParams = {
    imChatId: el.imChatId.value.trim(),
    skillDefinitionId: Number(el.skillDefinitionId.value),
    userId: el.userId.value.trim(),
    skillContent: trimmed,
    title: `IM Chat ${new Date().toISOString()}`,
  };

  addMessage('me', trimmed);
  const session = await c.executeSkill(params);
  bindSession(session);
  miniappState = 'minimized';
  executionState = 'executing';
  log(`executeSkill success: session=${session.id}`);
  el.composerInput.value = '';
  renderStatus();
}

async function sendFollowup(input: string): Promise<void> {
  const c = requireClient();
  const sessionId = assertSession();
  addMessage('me', input);
  executionState = 'executing';
  await c.sendMessage({
    sessionId,
    content: input,
  });
  el.composerInput.value = '';
  renderStatus();
}

async function onPrimaryAction(): Promise<void> {
  const c = requireClient();
  const input = el.composerInput.value.trim();

  if (executionState === 'executing') {
    const sessionId = assertSession();
    await c.stopSkill({ sessionId });
    executionState = 'stopped';
    addMessage('sys', 'stopSkill 已调用');
    renderStatus();
    return;
  }

  if (!input) {
    throw new Error('请输入消息内容');
  }

  if (input.startsWith('/')) {
    await executeCommand(input);
    return;
  }

  await sendFollowup(input);
}

async function sendToIm(): Promise<void> {
  const c = requireClient();
  const sessionId = assertSession();
  const content = lastAssistantContent || '暂无 AI 内容';
  const result = await c.sendMessageToIM({ sessionId, content });
  log(`sendMessageToIM success=${result.success}, chatId=${result.chatId ?? '-'}`);
}

async function regenerate(): Promise<void> {
  const c = requireClient();
  const sessionId = assertSession();
  const result = await c.regenerateAnswer({ sessionId });
  executionState = 'executing';
  log(`regenerateAnswer success=${result.success}, messageId=${result.messageId}`);
  renderStatus();
}

async function replyPermission(approved: boolean): Promise<void> {
  const c = requireClient();
  const sessionId = assertSession();
  const permissionId = el.permissionId.value.trim();
  const result = await c.replyPermission({
    sessionId,
    permissionId,
    approved,
  });
  log(`replyPermission(${approved}) => ${result.success}`);
}

async function controlMini(action: 'minimize' | 'close'): Promise<void> {
  const c = requireClient();
  const result = await c.controlSkillWeCode({ action });
  log(`controlSkillWeCode(${action}) => ${result.status}`);
}

function withAction(name: string, action: () => Promise<void>): void {
  void action()
    .then(() => {
      renderMetrics();
    })
    .catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`${name} failed: ${msg}`);
      addMessage('sys', `${name} failed: ${msg}`);
      renderStatus();
    });
}

el.composerInput.addEventListener('input', () => renderStatus());

el.initClient.addEventListener('click', () => {
  withAction('initClient', async () => {
    cleanupBoundSessionListener();
    const env = el.env.value as Env;
    client = createSkillClient({
      baseUrl: el.baseUrl.value.trim(),
      wsUrl: el.wsUrl.value.trim(),
      env,
    });

    currentSessionId = '';
    boundSessionId = '';
    executionState = 'idle';
    miniappState = 'hidden';
    assistantDraftId = '';
    lastAssistantContent = '';
    messages = [];
    logs = [];
    streamSeqBySession = new Map();

    client.onSkillWecodeStatusChange({
      callback: ({ status }) => {
        miniappState = status === 'closed' ? 'closed' : 'minimized';
        log(`wecode status => ${status}`);
        renderStatus();
      },
    });

    addMessage('sys', `Client initialized (${env})`);
    renderStatus();
    renderMetrics();
  });
});

el.primaryAction.addEventListener('click', () => withAction('primaryAction', onPrimaryAction));
el.sendToIm.addEventListener('click', () => withAction('sendMessageToIM', sendToIm));
el.regenerate.addEventListener('click', () => withAction('regenerateAnswer', regenerate));
el.permApprove.addEventListener('click', () => withAction('replyPermission(true)', () => replyPermission(true)));
el.permReject.addEventListener('click', () => withAction('replyPermission(false)', () => replyPermission(false)));
el.miniOpen.addEventListener('click', () => {
  miniappState = 'open';
  log('mini app opened locally');
  renderStatus();
});
el.miniMinimize.addEventListener('click', () => withAction('controlMini(minimize)', () => controlMini('minimize')));
el.miniClose.addEventListener('click', () => withAction('controlMini(close)', () => controlMini('close')));
el.refreshMetrics.addEventListener('click', () => {
  renderMetrics();
  log('metrics refreshed');
});
el.closeSkillAll.addEventListener('click', () => {
  withAction('closeSkill', async () => {
    const c = requireClient();
    await c.closeSkill();
    cleanupBoundSessionListener();
    boundSessionId = '';
    currentSessionId = '';
    executionState = 'idle';
    miniappState = 'hidden';
    assistantDraftId = '';
    addMessage('sys', 'closeSkill done');
    renderStatus();
  });
});

renderStatus();
renderMetrics();
addMessage('sys', '页面已就绪。先点击 Init Client，再输入 /skillName ... 执行技能。');
