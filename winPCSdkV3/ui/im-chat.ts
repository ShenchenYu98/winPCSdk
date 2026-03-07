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
  role: 'me' | 'ai';
  content: string;
  streaming?: boolean;
  seq?: number;
  ts: number;
}

interface SessionSlot {
  index: number;
  label: string;
  sessionId: string;
  imChatId: string;
  status: ExecutionState;
  preview: string;
  unread: number;
  updatedAt: number;
  messages: UiMessage[];
  lastAssistantContent: string;
  draftMessageId: string;
  lastSeq: number;
}

const SLOT_COUNT = 5;
const MAX_LOG_ITEMS = 260;

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
  sessionCount: $<HTMLSpanElement>('sessionCount'),
  sessionList: $<HTMLDivElement>('sessionList'),
  sessionIdLabel: $<HTMLElement>('sessionIdLabel'),
  executionStatusLabel: $<HTMLElement>('executionStatusLabel'),
  composerInput: $<HTMLTextAreaElement>('composerInput'),
  permissionId: $<HTMLInputElement>('permissionId'),
  imTimeline: $<HTMLDivElement>('imTimeline'),
  miniappPanel: $<HTMLDivElement>('miniappPanel'),
  miniappState: $<HTMLSpanElement>('miniappState'),
  miniAppUrl: $<HTMLInputElement>('miniAppUrl'),
  miniReload: $<HTMLButtonElement>('miniReload'),
  miniAppHint: $<HTMLDivElement>('miniAppHint'),
  miniAppFrame: $<HTMLIFrameElement>('miniAppFrame'),
  eventLog: $<HTMLPreElement>('eventLog'),
  clearEventLog: $<HTMLButtonElement>('clearEventLog'),
  metricsView: $<HTMLPreElement>('metricsView'),
  primaryAction: $<HTMLButtonElement>('primaryAction'),
  initClient: $<HTMLButtonElement>('initClient'),
  closeSkillAll: $<HTMLButtonElement>('closeSkillAll'),
  getHistory: $<HTMLButtonElement>('getHistory'),
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
let miniappState: MiniAppState = 'hidden';
let activeSlotIndex = 0;
let logs: string[] = [];

const slots: SessionSlot[] = createSlots();
const sessionIdToSlot = new Map<string, number>();
const listenerBoundSessions = new Set<string>();
const statusBoundSessions = new Set<string>();

function createSlots(): SessionSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({
    index: i,
    label: `Session ${i + 1}`,
    sessionId: '',
    imChatId: '',
    status: 'idle',
    preview: '',
    unread: 0,
    updatedAt: 0,
    messages: [],
    lastAssistantContent: '',
    draftMessageId: '',
    lastSeq: 0,
  }));
}

function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function safeJson(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function truncateText(content: string, maxLength = 2000): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength)} ...[truncated]`;
}

function parseMaybeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return truncateText(value);
  }
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: string;
      source?: string;
      sessionId?: string;
      retriable?: boolean;
      httpStatus?: number;
    };
    return {
      name: candidate.name,
      message: candidate.message,
      code: candidate.code,
      source: candidate.source,
      sessionId: candidate.sessionId,
      retriable: candidate.retriable,
      httpStatus: candidate.httpStatus,
    };
  }
  return { message: String(error) };
}

function logEvent(title: string, payload?: unknown): void {
  const prefix = `${now()} ${title}`;
  const entry = payload === undefined ? prefix : `${prefix}\n${safeJson(payload)}`;
  logs.push(entry);
  if (logs.length > MAX_LOG_ITEMS) {
    logs = logs.slice(logs.length - MAX_LOG_ITEMS);
  }
  el.eventLog.textContent = logs.join('\n\n');
  el.eventLog.scrollTop = el.eventLog.scrollHeight;
}

async function callSdk<T>(name: string, input: unknown, action: () => Promise<T>): Promise<T> {
  logEvent(`[SDK CALL] ${name}.input`, input);
  try {
    const output = await action();
    logEvent(`[SDK CALL] ${name}.output`, output ?? { value: 'void' });
    return output;
  } catch (error) {
    logEvent(`[SDK CALL] ${name}.error`, normalizeError(error));
    throw error;
  }
}

function callSdkSync(name: string, input: unknown, action: () => void): void {
  logEvent(`[SDK CALL] ${name}.input`, input);
  try {
    action();
    logEvent(`[SDK CALL] ${name}.output`, { value: 'void' });
  } catch (error) {
    logEvent(`[SDK CALL] ${name}.error`, normalizeError(error));
    throw error;
  }
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function getRequestBody(init?: RequestInit): unknown {
  const body = init?.body;
  if (!body) {
    return undefined;
  }
  if (typeof body === 'string') {
    return parseMaybeJson(body);
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return '[FormData body]';
  }
  return '[Non-text body]';
}

async function getResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  const clone = response.clone();

  try {
    if (contentType.includes('application/json')) {
      return await clone.json();
    }
    const text = await clone.text();
    return text ? truncateText(text) : null;
  } catch {
    return '[Unreadable body]';
  }
}

function createLoggedFetch(): typeof fetch {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = getRequestMethod(input, init);
    const url = getRequestUrl(input);
    const requestBody = getRequestBody(init);

    logEvent(`[HTTP REQ] ${method} ${url}`, requestBody === undefined ? undefined : { body: requestBody });

    try {
      const response = await nativeFetch(input, init);
      const payload = await getResponsePayload(response);
      logEvent(`[HTTP RES] ${method} ${url} -> ${response.status}`, {
        ok: response.ok,
        body: payload,
      });
      return response;
    } catch (error) {
      logEvent(`[HTTP ERR] ${method} ${url}`, normalizeError(error));
      throw error;
    }
  }) as typeof fetch;
}

function getActiveSlot(): SessionSlot {
  return slots[activeSlotIndex];
}

function assertActiveSessionId(): string {
  const slot = getActiveSlot();
  if (!slot.sessionId) {
    throw new Error('Current slot has no session. Use /skillName ... first.');
  }
  return slot.sessionId;
}

function requireClient(): SkillClient {
  if (!client) {
    throw new Error('Please init client first.');
  }
  return client;
}

function buildMiniAppSrc(baseUrl: string, sessionId: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('sessionid', sessionId);
    return url.toString();
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}sessionid=${encodeURIComponent(sessionId)}`;
  }
}

function clearMiniAppFrame(reason: string): void {
  el.miniAppFrame.removeAttribute('src');
  el.miniAppFrame.dataset.currentSrc = '';
  el.miniAppHint.textContent = reason;
}

function syncMiniAppFrame(trigger: string, force = false): void {
  const slot = getActiveSlot();
  const baseUrl = el.miniAppUrl.value.trim();

  if (!baseUrl) {
    clearMiniAppFrame('Mini App URL is empty.');
    return;
  }
  if (!slot.sessionId) {
    clearMiniAppFrame('Current slot has no session yet.');
    return;
  }

  const src = buildMiniAppSrc(baseUrl, slot.sessionId);
  const currentSrc = el.miniAppFrame.dataset.currentSrc ?? '';
  if (!force && src === currentSrc) {
    return;
  }

  el.miniAppHint.textContent = `Loaded: sessionid=${slot.sessionId}`;
  el.miniAppFrame.src = src;
  el.miniAppFrame.dataset.currentSrc = src;
  logEvent('[MINI APP] iframe.load', {
    trigger,
    slot: slot.index + 1,
    sessionId: slot.sessionId,
    src,
  });
}

function upsertSlotSession(slot: SessionSlot, session: SkillSession): void {
  slot.sessionId = session.id;
  slot.imChatId = session.imChatId;
  slot.status = 'executing';
  slot.updatedAt = Date.now();
  sessionIdToSlot.set(session.id, slot.index);
}

function updateSlotPreview(slot: SessionSlot, content: string): void {
  slot.preview = content.replace(/\s+/g, ' ').trim();
  slot.updatedAt = Date.now();
}

function addSlotMessage(
  slot: SessionSlot,
  role: UiMessage['role'],
  content: string,
  seq?: number,
  streaming = false,
): UiMessage {
  const item: UiMessage = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    seq,
    streaming,
    ts: Date.now(),
  };
  slot.messages.push(item);
  updateSlotPreview(slot, item.content);
  return item;
}

function switchSlot(index: number): void {
  activeSlotIndex = index;
  const slot = getActiveSlot();
  slot.unread = 0;
  renderSessionList();
  renderMessages();
  renderStatus();
  syncMiniAppFrame('switch-slot');
}

function renderSessionList(): void {
  el.sessionCount.textContent = String(SLOT_COUNT);
  el.sessionList.innerHTML = '';

  for (const slot of slots) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `session-item${slot.index === activeSlotIndex ? ' active' : ''}`;
    item.dataset.slot = String(slot.index);

    const top = document.createElement('div');
    top.className = 'session-top';
    const title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = slot.label;
    const status = document.createElement('span');
    status.className = 'session-status';
    status.textContent = slot.sessionId ? slot.status : 'empty';
    top.append(title, status);

    const preview = document.createElement('div');
    preview.className = 'session-preview';
    preview.textContent = slot.preview || 'Use /skillName ... to create';

    const meta = document.createElement('div');
    meta.className = 'session-meta';
    const sid = document.createElement('span');
    sid.textContent = slot.sessionId ? `#${slot.sessionId}` : 'not-created';
    meta.appendChild(sid);

    if (slot.unread > 0) {
      const unread = document.createElement('span');
      unread.className = 'unread';
      unread.textContent = String(slot.unread);
      meta.appendChild(unread);
    }

    item.append(top, preview, meta);
    el.sessionList.appendChild(item);
  }
}

function renderMessages(): void {
  el.imTimeline.innerHTML = '';
  const slot = getActiveSlot();

  if (!slot.sessionId) {
    const empty = document.createElement('div');
    empty.className = 'empty-chat';
    empty.textContent = 'This slot is empty. Use /skillName ... first.';
    el.imTimeline.appendChild(empty);
    return;
  }

  for (const msg of slot.messages) {
    const row = document.createElement('div');
    row.className = `wx-msg ${msg.role}${msg.streaming ? ' streaming' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'wx-avatar';
    avatar.textContent = msg.role === 'me' ? 'ME' : 'AI';

    const content = document.createElement('div');
    content.className = 'wx-content';

    const time = document.createElement('div');
    time.className = 'wx-time';
    time.textContent = `${new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false })}${msg.seq !== undefined ? ` #${msg.seq}` : ''}`;

    const bubble = document.createElement('div');
    bubble.className = 'wx-bubble';
    bubble.textContent = msg.content;

    content.append(time, bubble);
    if (msg.role === 'me') {
      row.append(content, avatar);
    } else {
      row.append(avatar, content);
    }
    el.imTimeline.appendChild(row);
  }
  el.imTimeline.scrollTop = el.imTimeline.scrollHeight;
}

function renderStatus(): void {
  const slot = getActiveSlot();
  const online = Boolean(client);
  const running = slot.status === 'executing';

  el.sessionIdLabel.textContent = slot.sessionId || '-';
  el.executionStatusLabel.textContent = slot.sessionId ? slot.status : 'idle';

  el.statusChip.className = `chip ${running ? 'running' : online ? 'online' : 'offline'}`;
  el.statusChip.textContent = running ? 'Running' : online ? 'Client Online' : 'Client Offline';

  el.miniappState.textContent = miniappState;
  el.miniappPanel.classList.toggle('hidden', miniappState === 'hidden' || miniappState === 'closed');

  const input = el.composerInput.value.trim();
  if (running) {
    el.primaryAction.textContent = 'Stop';
    return;
  }
  if (input.startsWith('/')) {
    el.primaryAction.textContent = slot.sessionId ? 'Send' : 'Execute';
  } else {
    el.primaryAction.textContent = 'Send';
  }
}

function renderMetrics(): void {
  if (!client) {
    el.metricsView.textContent = '{}';
    return;
  }
  el.metricsView.textContent = safeJson(client.getMetricsSnapshot());
}

function bindSessionEvents(sessionId: string): void {
  const c = requireClient();

  if (!listenerBoundSessions.has(sessionId)) {
    callSdkSync(
      'registerSessionListener',
      {
        sessionId,
        callbacks: ['onMessage', 'onError', 'onClose'],
      },
      () => {
        c.registerSessionListener({
          sessionId,
          onMessage: onStreamMessage,
          onError: onStreamError,
          onClose: onStreamClose,
        });
      },
    );
    listenerBoundSessions.add(sessionId);
  }

  if (!statusBoundSessions.has(sessionId)) {
    callSdkSync(
      'onSessionStatusChange',
      {
        sessionId,
        callback: 'statusCallback',
      },
      () => {
        c.onSessionStatusChange({
          sessionId,
          callback: ({ status }) => {
            const slotIndex = sessionIdToSlot.get(sessionId);
            if (slotIndex === undefined) {
              return;
            }
            slots[slotIndex].status = status;
            slots[slotIndex].updatedAt = Date.now();
            logEvent('[SDK EVENT] onSessionStatusChange.callback', { sessionId, status });
            if (status === 'executing') {
              miniappState = miniappState === 'hidden' || miniappState === 'closed' ? 'minimized' : miniappState;
            }
            renderSessionList();
            if (slotIndex === activeSlotIndex) {
              renderStatus();
            }
          },
        });
      },
    );
    statusBoundSessions.add(sessionId);
  }
}

function onStreamMessage(message: StreamMessage): void {
  logEvent('[WS EVENT] onMessage', message);

  const slotIndex = sessionIdToSlot.get(message.sessionId);
  if (slotIndex === undefined) {
    return;
  }
  const slot = slots[slotIndex];

  if (message.seq <= slot.lastSeq) {
    logEvent('[WS WARN] seq regression', {
      sessionId: message.sessionId,
      prev: slot.lastSeq,
      incoming: message.seq,
    });
  }
  slot.lastSeq = Math.max(slot.lastSeq, message.seq);

  if (message.type === 'delta') {
    slot.status = 'executing';
    if (!slot.draftMessageId) {
      const draft = addSlotMessage(slot, 'ai', message.content, message.seq, true);
      slot.draftMessageId = draft.id;
      slot.lastAssistantContent = draft.content;
      if (slot.index !== activeSlotIndex) {
        slot.unread += 1;
      }
    } else {
      const target = slot.messages.find((item) => item.id === slot.draftMessageId);
      if (target) {
        target.content += message.content;
        target.streaming = true;
        target.seq = message.seq;
        slot.lastAssistantContent = target.content;
        updateSlotPreview(slot, target.content);
      }
    }
  }

  if (message.type === 'done') {
    slot.status = 'completed';
    if (slot.draftMessageId) {
      const target = slot.messages.find((item) => item.id === slot.draftMessageId);
      if (target) {
        target.streaming = false;
      }
      slot.draftMessageId = '';
    }
  }

  if (message.type === 'error' || message.type === 'agent_offline') {
    slot.status = 'stopped';
    if (slot.draftMessageId) {
      const target = slot.messages.find((item) => item.id === slot.draftMessageId);
      if (target) {
        target.streaming = false;
      }
      slot.draftMessageId = '';
    }
    logEvent('[WS EVENT] stream stopped', {
      type: message.type,
      content: message.content,
      sessionId: message.sessionId,
    });
  }

  if (message.type === 'agent_online') {
    slot.status = 'executing';
  }

  renderSessionList();
  if (slot.index === activeSlotIndex) {
    renderMessages();
    renderStatus();
  }
  renderMetrics();
}

function onStreamError(error: unknown): void {
  logEvent('[WS EVENT] onError', normalizeError(error));
}

function onStreamClose(reason: string): void {
  logEvent('[WS EVENT] onClose', { reason });
}

function resetLocalSlots(): void {
  sessionIdToSlot.clear();
  listenerBoundSessions.clear();
  statusBoundSessions.clear();
  miniappState = 'hidden';
  activeSlotIndex = 0;

  for (const slot of slots) {
    slot.sessionId = '';
    slot.imChatId = '';
    slot.status = 'idle';
    slot.preview = '';
    slot.unread = 0;
    slot.updatedAt = 0;
    slot.messages = [];
    slot.lastAssistantContent = '';
    slot.draftMessageId = '';
    slot.lastSeq = 0;
  }

  clearMiniAppFrame('Current slot has no session yet.');
  renderSessionList();
  renderMessages();
  renderStatus();
  renderMetrics();
}

function composeImChatId(slot: SessionSlot): string {
  const base = el.imChatId.value.trim() || 'chat-im';
  return `${base}-slot${slot.index + 1}`;
}

async function executeInActiveSlot(input: string): Promise<void> {
  const c = requireClient();
  const slot = getActiveSlot();
  const params: ExecuteSkillParams = {
    imChatId: composeImChatId(slot),
    skillDefinitionId: Number(el.skillDefinitionId.value),
    userId: el.userId.value.trim(),
    skillContent: input.trim(),
    title: `${slot.label} ${new Date().toISOString()}`,
  };

  const session = await callSdk('executeSkill', params, () => c.executeSkill(params));
  upsertSlotSession(slot, session);
  bindSessionEvents(session.id);
  addSlotMessage(slot, 'me', input.trim());
  slot.status = 'executing';
  slot.unread = 0;

  renderSessionList();
  renderMessages();
  renderStatus();
  syncMiniAppFrame('session-created', true);
}

async function sendInActiveSlot(input: string): Promise<void> {
  const c = requireClient();
  const slot = getActiveSlot();
  const sessionId = assertActiveSessionId();
  addSlotMessage(slot, 'me', input.trim());
  slot.status = 'executing';
  renderMessages();
  renderSessionList();
  renderStatus();

  const params = {
    sessionId,
    content: input.trim(),
  };
  await callSdk('sendMessage', params, () => c.sendMessage(params));
}

async function loadHistory(): Promise<void> {
  const c = requireClient();
  const slot = getActiveSlot();
  const sessionId = assertActiveSessionId();
  const params = {
    sessionId,
    page: 0,
    size: 50,
  };
  const page = await callSdk('getSessionMessage', params, () => c.getSessionMessage(params));
  slot.messages = [...page.content]
    .sort((a, b) => a.seq - b.seq)
    .map((msg) => ({
      id: String(msg.id),
      role: msg.role === 'USER' ? 'me' : 'ai',
      content: msg.content,
      seq: msg.seq,
      ts: Date.parse(msg.createdAt) || Date.now(),
      streaming: Boolean((msg.meta as Record<string, unknown> | undefined)?.isStreaming),
    }));

  const lastAi = [...slot.messages].reverse().find((item) => item.role === 'ai');
  if (lastAi) {
    slot.lastAssistantContent = lastAi.content;
    updateSlotPreview(slot, lastAi.content);
  }

  renderMessages();
  renderSessionList();
  logEvent('[UI] history summary', {
    totalElements: page.totalElements,
    number: page.number,
    size: page.size,
  });
}

async function onPrimaryAction(): Promise<void> {
  const c = requireClient();
  const slot = getActiveSlot();
  const input = el.composerInput.value.trim();

  if (slot.status === 'executing' && slot.sessionId) {
    await callSdk('stopSkill', { sessionId: slot.sessionId }, () => c.stopSkill({ sessionId: slot.sessionId }));
    slot.status = 'stopped';
    renderStatus();
    renderSessionList();
    return;
  }

  if (!input) {
    throw new Error('Please enter message content.');
  }

  if (!slot.sessionId) {
    if (!input.startsWith('/')) {
      throw new Error('Current slot is empty. Use /skillName ... first.');
    }
    await executeInActiveSlot(input);
    el.composerInput.value = '';
    return;
  }

  await sendInActiveSlot(input);
  el.composerInput.value = '';
}

async function sendToIm(): Promise<void> {
  const c = requireClient();
  const slot = getActiveSlot();
  const sessionId = assertActiveSessionId();
  const params = {
    sessionId,
    content: slot.lastAssistantContent || 'No AI content yet',
  };
  await callSdk('sendMessageToIM', params, () => c.sendMessageToIM(params));
}

async function regenerate(): Promise<void> {
  const c = requireClient();
  const slot = getActiveSlot();
  const sessionId = assertActiveSessionId();
  const params = { sessionId };
  await callSdk('regenerateAnswer', params, () => c.regenerateAnswer(params));
  slot.status = 'executing';
  renderStatus();
  renderSessionList();
}

async function replyPermission(approved: boolean): Promise<void> {
  const c = requireClient();
  const sessionId = assertActiveSessionId();
  const params = {
    sessionId,
    permissionId: el.permissionId.value.trim(),
    approved,
  };
  await callSdk('replyPermission', params, () => c.replyPermission(params));
}

async function controlMini(action: 'minimize' | 'close'): Promise<void> {
  const c = requireClient();
  await callSdk('controlSkillWeCode', { action }, () => c.controlSkillWeCode({ action }));
}

function withAction(name: string, action: () => Promise<void>): void {
  void action()
    .then(() => {
      renderMetrics();
    })
    .catch((error: unknown) => {
      logEvent(`[UI ACTION] ${name}.failed`, normalizeError(error));
      renderStatus();
    });
}

el.composerInput.addEventListener('input', () => renderStatus());

el.sessionList.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLButtonElement>('.session-item');
  if (!item) {
    return;
  }
  const raw = item.dataset.slot;
  const slotIndex = raw ? Number(raw) : NaN;
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    return;
  }
  switchSlot(slotIndex);
  logEvent('[UI ACTION] switch slot', { slot: slotIndex + 1 });
});

el.initClient.addEventListener('click', () => {
  withAction('initClient', async () => {
    const previous = client;
    if (previous) {
      try {
        await callSdk('closeSkill', { reason: 're-init' }, () => previous.closeSkill());
      } catch {
        // Ignore cleanup failures.
      }
    }

    const env = el.env.value as Env;
    const initOptions = {
      baseUrl: el.baseUrl.value.trim(),
      wsUrl: el.wsUrl.value.trim(),
      env,
    };

    logs = [];
    el.eventLog.textContent = '';
    logEvent('[SDK INIT] createSkillClient.input', initOptions);
    client = createSkillClient({
      ...initOptions,
      fetchImpl: createLoggedFetch(),
    });
    logEvent('[SDK INIT] createSkillClient.output', { value: 'SkillClient' });

    resetLocalSlots();

    const c = requireClient();
    callSdkSync(
      'onSkillWecodeStatusChange',
      { callback: 'wecodeStatusCallback' },
      () => {
        c.onSkillWecodeStatusChange({
          callback: ({ status, timestamp, message }) => {
            miniappState = status === 'closed' ? 'closed' : 'minimized';
            logEvent('[SDK EVENT] onSkillWecodeStatusChange.callback', {
              status,
              timestamp,
              message,
            });
            renderStatus();
          },
        });
      },
    );
  });
});

el.primaryAction.addEventListener('click', () => withAction('primaryAction', onPrimaryAction));
el.getHistory.addEventListener('click', () => withAction('getSessionMessage', loadHistory));
el.sendToIm.addEventListener('click', () => withAction('sendMessageToIM', sendToIm));
el.regenerate.addEventListener('click', () => withAction('regenerateAnswer', regenerate));
el.permApprove.addEventListener('click', () => withAction('replyPermission(true)', () => replyPermission(true)));
el.permReject.addEventListener('click', () => withAction('replyPermission(false)', () => replyPermission(false)));
el.miniOpen.addEventListener('click', () => {
  miniappState = 'open';
  logEvent('[UI ACTION] miniapp opened locally');
  renderStatus();
  syncMiniAppFrame('mini-open');
});
el.miniMinimize.addEventListener('click', () =>
  withAction('controlSkillWeCode(minimize)', () => controlMini('minimize')),
);
el.miniClose.addEventListener('click', () =>
  withAction('controlSkillWeCode(close)', () => controlMini('close')),
);
el.miniReload.addEventListener('click', () => {
  syncMiniAppFrame('manual-reload', true);
});
el.miniAppUrl.addEventListener('change', () => {
  syncMiniAppFrame('url-change', true);
});
el.clearEventLog.addEventListener('click', () => {
  logs = [];
  el.eventLog.textContent = '';
});
el.refreshMetrics.addEventListener('click', () => {
  if (!client) {
    logEvent('[SDK CALL] getMetricsSnapshot.output', {});
    renderMetrics();
    return;
  }
  const snapshot = client.getMetricsSnapshot();
  logEvent('[SDK CALL] getMetricsSnapshot.output', snapshot);
  renderMetrics();
});
el.closeSkillAll.addEventListener('click', () => {
  withAction('closeSkill', async () => {
    const c = requireClient();
    await callSdk('closeSkill', {}, () => c.closeSkill());
    resetLocalSlots();
  });
});

renderSessionList();
renderMessages();
renderStatus();
renderMetrics();
clearMiniAppFrame('Current slot has no session yet.');
logEvent('[UI] Ready. Click Init Client to start.');
