import { createSkillSDK } from '/dist/index.js';

let sdk;
let currentSessionId = '';

const el = {
  baseHttpUrl: document.getElementById('baseHttpUrl'),
  baseWsUrl: document.getElementById('baseWsUrl'),
  skillDefinitionId: document.getElementById('skillDefinitionId'),
  imChatId: document.getElementById('imChatId'),
  userId: document.getElementById('userId'),
  agentId: document.getElementById('agentId'),
  title: document.getElementById('title'),
  sessionId: document.getElementById('sessionId'),
  content: document.getElementById('content'),
  permissionId: document.getElementById('permissionId'),
  approved: document.getElementById('approved'),
  imContent: document.getElementById('imContent'),
  page: document.getElementById('page'),
  size: document.getElementById('size'),
  logs: document.getElementById('logs')
};

function log(message, data) {
  const ts = new Date().toISOString();
  const row = document.createElement('div');
  row.className = 'log-line';
  row.textContent = `[${ts}] ${message}${data !== undefined ? ` ${JSON.stringify(data)}` : ''}`;
  el.logs.prepend(row);
}

function extractError(error) {
  if (!error) return { message: 'unknown error' };
  const cause = error.cause;
  return {
    name: error.name,
    message: error.message ?? String(error),
    code: error.code,
    status: error.httpStatus,
    causeMessage: cause?.message ?? String(cause ?? ''),
    stackTop: typeof error.stack === 'string' ? error.stack.split('\n').slice(0, 2).join(' | ') : undefined
  };
}

async function pingServer() {
  const base = el.baseHttpUrl.value.trim().replace(/\/$/, '');
  const resp = await fetch(`${base}/api/skill/sessions?userId=0`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!resp.ok) {
    throw new Error(`Ping failed: HTTP ${resp.status}`);
  }
  return await resp.json();
}

function requireSdk() {
  if (!sdk) throw new Error('请先初始化 SDK');
}

function requireSessionId() {
  const id = (el.sessionId.value || currentSessionId || '').trim();
  if (!id) throw new Error('请先提供 sessionId');
  return id;
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    log('ERROR', extractError(error));
  }
}

document.getElementById('btnPing').addEventListener('click', () => {
  run(async () => {
    const data = await pingServer();
    log('Ping success', { totalElements: data?.totalElements, number: data?.number });
  });
});

document.getElementById('btnInit').addEventListener('click', () => {
  run(async () => {
    await pingServer();

    sdk = createSkillSDK({
      baseHttpUrl: el.baseHttpUrl.value.trim(),
      baseWsUrl: el.baseWsUrl.value.trim(),
      skillDefinitionId: Number(el.skillDefinitionId.value)
    });

    sdk.onSkillWecodeStatus((status) => {
      log('onSkillWecodeStatus', { status });
    });

    log('SDK 初始化成功');
  });
});

document.getElementById('btnExecute').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const agentIdRaw = el.agentId.value.trim();
    const session = await sdk.executeSkill(
      el.imChatId.value.trim(),
      el.userId.value.trim(),
      el.content.value,
      agentIdRaw === '' ? undefined : Number(agentIdRaw),
      el.title.value.trim() || undefined
    );

    currentSessionId = String(session.id);
    el.sessionId.value = currentSessionId;

    sdk.onSessionStatus(currentSessionId, (status) => {
      log('onSessionStatus', { sessionId: currentSessionId, status });
    });

    log('executeSkill success', session);
  });
});

document.getElementById('btnSend').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    await sdk.sendMessage(sessionId, el.content.value, (message) => {
      log('stream', { sessionId, message });
    });
    log('sendMessage 请求已发送', { sessionId });
  });
});

document.getElementById('btnStop').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    const ok = await sdk.stopSkill(sessionId);
    log('stopSkill', { sessionId, ok });
  });
});

document.getElementById('btnClose').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    const ok = await sdk.closeSkill(sessionId);
    log('closeSkill', { sessionId, ok });
  });
});

document.getElementById('btnRegenerate').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    const result = await sdk.regenerateAnswer(sessionId);
    log('regenerateAnswer', { sessionId, result });
  });
});

document.getElementById('btnHistory').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    const page = Number(el.page.value || 0);
    const size = Number(el.size.value || 50);
    const result = await sdk.getSessionMessage(sessionId, page, size);
    log('getSessionMessage', result);
  });
});

document.getElementById('btnSendIm').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    const ok = await sdk.sendMessageToIM(sessionId, el.imContent.value);
    log('sendMessageToIM', { sessionId, ok });
  });
});

document.getElementById('btnPermission').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    const permissionId = el.permissionId.value.trim();
    const approved = el.approved.value === 'true';
    const ok = await sdk.replyPermission(sessionId, permissionId, approved);
    log('replyPermission', { sessionId, permissionId, approved, ok });
  });
});

document.getElementById('btnMinimize').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const ok = await sdk.controlSkillWeCode('minimize');
    log('controlSkillWeCode(minimize)', { ok });
  });
});

document.getElementById('btnWeClose').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const ok = await sdk.controlSkillWeCode('close');
    log('controlSkillWeCode(close)', { ok });
  });
});

document.getElementById('btnCopy').addEventListener('click', () => {
  run(async () => {
    requireSdk();
    const sessionId = requireSessionId();
    const ok = await sdk.copySkillResult(sessionId);
    log('copySkillResult', { sessionId, ok });
  });
});

document.getElementById('btnClearLog').addEventListener('click', () => {
  el.logs.innerHTML = '';
});

log('页面已加载，请先点击“Ping服务端”再初始化');
