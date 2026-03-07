import {
  createSkillClient,
  type ControlSkillWeCodeParams,
  type ExecuteSkillParams,
  type ReplyPermissionParams,
  type SendMessageParams,
  type SendMessageToIMParams,
  type SkillClient,
  type StreamMessage,
} from '../src/index';

type Env = 'dev' | 'test' | 'prod';

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element not found: #${id}`);
  }
  return element as T;
};

const elements = {
  baseUrl: $<HTMLInputElement>('baseUrl'),
  wsUrl: $<HTMLInputElement>('wsUrl'),
  env: $<HTMLSelectElement>('env'),
  clientState: $<HTMLDivElement>('clientState'),
  imChatId: $<HTMLInputElement>('imChatId'),
  skillDefinitionId: $<HTMLInputElement>('skillDefinitionId'),
  userId: $<HTMLInputElement>('userId'),
  agentId: $<HTMLInputElement>('agentId'),
  title: $<HTMLInputElement>('title'),
  skillContent: $<HTMLTextAreaElement>('skillContent'),
  currentSessionId: $<HTMLInputElement>('currentSessionId'),
  sendContent: $<HTMLTextAreaElement>('sendContent'),
  imContent: $<HTMLTextAreaElement>('imContent'),
  permissionId: $<HTMLInputElement>('permissionId'),
  streamView: $<HTMLPreElement>('streamView'),
  logView: $<HTMLPreElement>('logView'),
  metricsView: $<HTMLPreElement>('metricsView'),
  initClient: $<HTMLButtonElement>('initClient'),
  closeSkillGlobal: $<HTMLButtonElement>('closeSkillGlobal'),
  executeSkill: $<HTMLButtonElement>('executeSkill'),
  registerListener: $<HTMLButtonElement>('registerListener'),
  unregisterListener: $<HTMLButtonElement>('unregisterListener'),
  bindStatus: $<HTMLButtonElement>('bindStatus'),
  stopSkill: $<HTMLButtonElement>('stopSkill'),
  regenerate: $<HTMLButtonElement>('regenerate'),
  getMessages: $<HTMLButtonElement>('getMessages'),
  sendMessage: $<HTMLButtonElement>('sendMessage'),
  sendToIm: $<HTMLButtonElement>('sendToIm'),
  replyApprove: $<HTMLButtonElement>('replyApprove'),
  replyReject: $<HTMLButtonElement>('replyReject'),
  wecodeMinimize: $<HTMLButtonElement>('wecodeMinimize'),
  wecodeClose: $<HTMLButtonElement>('wecodeClose'),
  bindWecode: $<HTMLButtonElement>('bindWecode'),
  refreshMetrics: $<HTMLButtonElement>('refreshMetrics'),
};

let client: SkillClient | null = null;
let currentSessionId = '';
let listenerBoundSessionId = '';
const logs: string[] = [];
const streamLines: string[] = [];

const messageListener = (message: StreamMessage) => {
  streamLines.unshift(`${time()} [${message.sessionId}] ${message.type} #${message.seq} ${message.content}`);
  streamLines.splice(120);
  renderStream();
};

const errorListener = (error: unknown) => {
  log(`listener error: ${JSON.stringify(error)}`);
};

const closeListener = (reason: string) => {
  log(`listener close: ${reason}`);
};

const statusCallback = ({ status }: { status: string }) => {
  log(`session status => ${status}`);
};

const wecodeCallback = ({ status }: { status: string }) => {
  log(`wecode status => ${status}`);
};

function time(): string {
  const d = new Date();
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

function log(message: string): void {
  logs.unshift(`${time()} ${message}`);
  logs.splice(0, 200);
  elements.logView.textContent = logs.join('\n');
}

function renderStream(): void {
  elements.streamView.textContent = streamLines.join('\n');
}

function renderMetrics(): void {
  if (!client) {
    elements.metricsView.textContent = '{}';
    return;
  }
  elements.metricsView.textContent = JSON.stringify(client.getMetricsSnapshot(), null, 2);
}

function requireClient(): SkillClient {
  if (!client) {
    throw new Error('Client not initialized. Click "Init Client" first.');
  }
  return client;
}

function ensureSessionId(): string {
  const sessionId = elements.currentSessionId.value.trim() || currentSessionId;
  if (!sessionId) {
    throw new Error('No sessionId. Please execute skill first or input sessionId.');
  }
  return sessionId;
}

async function runAction(name: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
    renderMetrics();
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    log(`${name} failed: ${msg}`);
  }
}

elements.initClient.addEventListener('click', () => {
  const baseUrl = elements.baseUrl.value.trim();
  const wsUrl = elements.wsUrl.value.trim();
  const env = elements.env.value as Env;

  client = createSkillClient({
    baseUrl,
    wsUrl,
    env,
  });

  elements.clientState.textContent = `client: initialized (${env})`;
  log(`client initialized: base=${baseUrl}, ws=${wsUrl}, env=${env}`);
  renderMetrics();
});

elements.executeSkill.addEventListener('click', () => {
  void runAction('executeSkill', async () => {
    const c = requireClient();

    const params: ExecuteSkillParams = {
      imChatId: elements.imChatId.value.trim(),
      skillDefinitionId: Number(elements.skillDefinitionId.value),
      userId: elements.userId.value.trim(),
      skillContent: elements.skillContent.value,
      title: elements.title.value.trim() || undefined,
      agentId: elements.agentId.value.trim() ? Number(elements.agentId.value.trim()) : undefined,
    };

    const session = await c.executeSkill(params);
    currentSessionId = session.id;
    elements.currentSessionId.value = session.id;
    log(`executeSkill success: sessionId=${session.id}`);
  });
});

elements.closeSkillGlobal.addEventListener('click', () => {
  void runAction('closeSkill', async () => {
    const c = requireClient();
    const result = await c.closeSkill();
    currentSessionId = '';
    listenerBoundSessionId = '';
    elements.currentSessionId.value = '';
    streamLines.length = 0;
    renderStream();
    log(`closeSkill => ${result.status}`);
  });
});

elements.registerListener.addEventListener('click', () => {
  void runAction('registerSessionListener', async () => {
    const c = requireClient();
    const sessionId = ensureSessionId();
    c.registerSessionListener({
      sessionId,
      onMessage: messageListener,
      onError: errorListener,
      onClose: closeListener,
    });
    listenerBoundSessionId = sessionId;
    log(`listener registered on session=${sessionId}`);
  });
});

elements.unregisterListener.addEventListener('click', () => {
  void runAction('unregisterSessionListener', async () => {
    const c = requireClient();
    const sessionId = listenerBoundSessionId || ensureSessionId();
    c.unregisterSessionListener({
      sessionId,
      onMessage: messageListener,
      onError: errorListener,
      onClose: closeListener,
    });
    log(`listener unregistered on session=${sessionId}`);
    if (listenerBoundSessionId === sessionId) {
      listenerBoundSessionId = '';
    }
  });
});

elements.bindStatus.addEventListener('click', () => {
  void runAction('onSessionStatusChange', async () => {
    const c = requireClient();
    const sessionId = ensureSessionId();
    c.onSessionStatusChange({
      sessionId,
      callback: statusCallback,
    });
    log(`status callback bound on session=${sessionId}`);
  });
});

elements.stopSkill.addEventListener('click', () => {
  void runAction('stopSkill', async () => {
    const c = requireClient();
    const sessionId = ensureSessionId();
    const result = await c.stopSkill({ sessionId });
    log(`stopSkill => ${result.status} (session=${sessionId})`);
  });
});

elements.regenerate.addEventListener('click', () => {
  void runAction('regenerateAnswer', async () => {
    const c = requireClient();
    const sessionId = ensureSessionId();
    const result = await c.regenerateAnswer({ sessionId });
    log(`regenerateAnswer => success=${result.success}, messageId=${result.messageId}`);
  });
});

elements.getMessages.addEventListener('click', () => {
  void runAction('getSessionMessage', async () => {
    const c = requireClient();
    const sessionId = ensureSessionId();
    const page = await c.getSessionMessage({ sessionId, page: 0, size: 50 });
    const compact = page.content
      .map((m) => `${m.seq}:${m.role}:${m.content.slice(0, 80)}`)
      .join('\n');
    streamLines.unshift(`${time()} history(${sessionId})\n${compact}`);
    streamLines.splice(0, 120);
    renderStream();
    log(`getSessionMessage => ${page.content.length} items`);
  });
});

elements.sendMessage.addEventListener('click', () => {
  void runAction('sendMessage', async () => {
    const c = requireClient();
    const sessionId = ensureSessionId();
    const params: SendMessageParams = {
      sessionId,
      content: elements.sendContent.value,
    };
    const result = await c.sendMessage(params);
    log(`sendMessage => messageId=${result.messageId}, seq=${result.seq}`);
  });
});

elements.sendToIm.addEventListener('click', () => {
  void runAction('sendMessageToIM', async () => {
    const c = requireClient();
    const sessionId = ensureSessionId();
    const params: SendMessageToIMParams = {
      sessionId,
      content: elements.imContent.value,
    };
    const result = await c.sendMessageToIM(params);
    log(`sendMessageToIM => success=${result.success}, chatId=${result.chatId ?? '-'}`);
  });
});

elements.replyApprove.addEventListener('click', () => {
  void runAction('replyPermission(true)', async () => {
    await replyPermission(true);
  });
});

elements.replyReject.addEventListener('click', () => {
  void runAction('replyPermission(false)', async () => {
    await replyPermission(false);
  });
});

async function replyPermission(approved: boolean): Promise<void> {
  const c = requireClient();
  const sessionId = ensureSessionId();
  const params: ReplyPermissionParams = {
    sessionId,
    permissionId: elements.permissionId.value.trim(),
    approved,
  };
  const result = await c.replyPermission(params);
  log(`replyPermission => success=${result.success}, approved=${result.approved}`);
}

function bindWecode(action: ControlSkillWeCodeParams['action']): void {
  void runAction(`controlSkillWeCode(${action})`, async () => {
    const c = requireClient();
    const result = await c.controlSkillWeCode({ action });
    log(`controlSkillWeCode(${action}) => ${result.status}`);
  });
}

elements.wecodeMinimize.addEventListener('click', () => bindWecode('minimize'));
elements.wecodeClose.addEventListener('click', () => bindWecode('close'));

elements.bindWecode.addEventListener('click', () => {
  void runAction('onSkillWecodeStatusChange', async () => {
    const c = requireClient();
    c.onSkillWecodeStatusChange({ callback: wecodeCallback });
    log('wecode status callback bound');
  });
});

elements.refreshMetrics.addEventListener('click', () => {
  renderMetrics();
  log('metrics refreshed');
});

log('UI ready. 先点击 Init Client，再执行 executeSkill。');
renderMetrics();
