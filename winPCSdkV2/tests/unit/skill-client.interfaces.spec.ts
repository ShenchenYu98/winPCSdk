import { describe, expect, it } from 'vitest';
import { createSkillClient, ERROR_CODE, type SkillClient, type SkillClientInitOptions, type StreamMessage } from '../../src/index';
import { FakeSocketHub } from '../helpers/fake-socket';
import { createMockBackend } from '../helpers/mock-backend';

function setup(options: Partial<SkillClientInitOptions> = {}): {
  client: SkillClient;
  backend: ReturnType<typeof createMockBackend>;
  hub: FakeSocketHub;
} {
  const backend = createMockBackend();
  const hub = new FakeSocketHub();
  const client = createSkillClient({
    baseUrl: 'http://mock.local',
    wsUrl: 'ws://mock.local',
    env: 'test',
    fetchImpl: backend.fetchImpl,
    socketFactory: hub.createFactory(),
    ...options,
  });

  return { client, backend, hub };
}

async function createSession(client: SkillClient): Promise<string> {
  const session = await client.executeSkill({
    imChatId: 'chat-1',
    skillDefinitionId: 1,
    userId: 'u1',
    skillContent: 'hello',
  });
  return session.id;
}

describe('executeSkill', () => {
  it('creates a session and returns id as string', async () => {
    const { client } = setup();
    const session = await client.executeSkill({
      imChatId: 'chat-1',
      skillDefinitionId: 1,
      userId: 'u1',
      skillContent: 'hello',
    });
    expect(typeof session.id).toBe('string');
    expect(session.status).toBe('ACTIVE');
  });

  it('sends first message automatically', async () => {
    const { client, backend } = setup();
    await client.executeSkill({
      imChatId: 'chat-1',
      skillDefinitionId: 1,
      userId: 'u1',
      skillContent: 'hello',
    });
    const hasPostMessage = backend.state.requests.some(
      (req) => req.method === 'POST' && req.path.includes('/messages'),
    );
    expect(hasPostMessage).toBe(true);
  });

  it('opens ws connection for created session', async () => {
    const { client, hub } = setup();
    await client.executeSkill({
      imChatId: 'chat-1',
      skillDefinitionId: 1,
      userId: 'u1',
      skillContent: 'hello',
    });
    expect(hub.count()).toBeGreaterThan(0);
  });

  it('throws for invalid params', async () => {
    const { client } = setup();
    await expect(
      client.executeSkill({
        imChatId: '',
        skillDefinitionId: 0,
        userId: '',
        skillContent: '',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_ARGUMENT });
  });

  it('maps backend error', async () => {
    const { client, backend } = setup();
    backend.failNext('/api/skill/sessions', 500);
    await expect(
      client.executeSkill({
        imChatId: 'chat-1',
        skillDefinitionId: 1,
        userId: 'u1',
        skillContent: 'hello',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.REST_ERROR });
  });
});

describe('closeSkill', () => {
  it('returns success', async () => {
    const { client } = setup();
    expect(await client.closeSkill()).toEqual({ status: 'success' });
  });

  it('is idempotent', async () => {
    const { client } = setup();
    await client.closeSkill();
    await expect(client.closeSkill()).resolves.toEqual({ status: 'success' });
  });

  it('closes all connections', async () => {
    const { client, hub } = setup();
    await createSession(client);
    expect(hub.count()).toBeGreaterThan(0);
    await client.closeSkill();
    const socket = hub.latest();
    expect(socket.readyState).toBe(3);
  });

  it('clears listeners', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const onMessage = () => undefined;
    client.registerSessionListener({ sessionId, onMessage });
    await client.closeSkill();
    expect(() => client.unregisterSessionListener({ sessionId, onMessage })).toThrow();
  });

  it('records metric call', async () => {
    const { client } = setup();
    await client.closeSkill();
    expect(client.getMetricsSnapshot().interfaceCalls).toBe(1);
  });
});

describe('stopSkill', () => {
  it('stops current session', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    await expect(client.stopSkill({ sessionId })).resolves.toEqual({ status: 'success' });
  });

  it('emits stopped status callback', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const statuses: string[] = [];
    client.onSessionStatusChange({
      sessionId,
      callback: (result) => statuses.push(result.status),
    });
    await client.stopSkill({ sessionId });
    expect(statuses).toContain('stopped');
  });

  it('requires sessionId', async () => {
    const { client } = setup();
    await expect(client.stopSkill({ sessionId: '' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('maps not found error', async () => {
    const { client } = setup();
    await expect(client.stopSkill({ sessionId: 'missing' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_NOT_FOUND,
    });
  });

  it('maps post-stop send to SESSION_TERMINATED_AFTER_STOP', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    await client.stopSkill({ sessionId });
    await expect(client.sendMessage({ sessionId, content: 'again' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_TERMINATED_AFTER_STOP,
      retriable: true,
    });
  });
});

describe('onSessionStatusChange', () => {
  it('registers callback without creating ws', () => {
    const { client, hub } = setup();
    client.onSessionStatusChange({
      sessionId: 'future',
      callback: () => undefined,
    });
    expect(hub.count()).toBe(0);
  });

  it('receives executing from delta', async () => {
    const { client, hub } = setup();
    const sessionId = await createSession(client);
    const statuses: string[] = [];
    client.onSessionStatusChange({ sessionId, callback: ({ status }) => statuses.push(status) });
    hub.bySession(sessionId)[0]?.emitMessage({ sessionId, type: 'delta', seq: 1, content: 'x' });
    expect(statuses).toContain('executing');
  });

  it('receives completed from done', async () => {
    const { client, hub } = setup();
    const sessionId = await createSession(client);
    const statuses: string[] = [];
    client.onSessionStatusChange({ sessionId, callback: ({ status }) => statuses.push(status) });
    hub.bySession(sessionId)[0]?.emitMessage({ sessionId, type: 'done', seq: 2, content: '' });
    expect(statuses).toContain('completed');
  });

  it('receives stopped from agent_offline', async () => {
    const { client, hub } = setup();
    const sessionId = await createSession(client);
    const statuses: string[] = [];
    client.onSessionStatusChange({ sessionId, callback: ({ status }) => statuses.push(status) });
    hub.bySession(sessionId)[0]?.emitMessage({ sessionId, type: 'agent_offline', seq: 2, content: '' });
    expect(statuses).toContain('stopped');
  });

  it('supports multiple callbacks', async () => {
    const { client, hub } = setup();
    const sessionId = await createSession(client);
    let a = 0;
    let b = 0;
    client.onSessionStatusChange({ sessionId, callback: () => { a += 1; } });
    client.onSessionStatusChange({ sessionId, callback: () => { b += 1; } });
    hub.bySession(sessionId)[0]?.emitMessage({ sessionId, type: 'delta', seq: 1, content: '' });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});

describe('onSkillWecodeStatusChange', () => {
  it('registers callback', async () => {
    const { client } = setup();
    const states: string[] = [];
    client.onSkillWecodeStatusChange({ callback: ({ status }) => states.push(status) });
    await client.controlSkillWeCode({ action: 'minimize' });
    expect(states).toContain('minimized');
  });

  it('supports close status', async () => {
    const { client } = setup();
    const states: string[] = [];
    client.onSkillWecodeStatusChange({ callback: ({ status }) => states.push(status) });
    await client.controlSkillWeCode({ action: 'close' });
    expect(states).toContain('closed');
  });

  it('supports multiple listeners', async () => {
    const { client } = setup();
    let count = 0;
    client.onSkillWecodeStatusChange({ callback: () => { count += 1; } });
    client.onSkillWecodeStatusChange({ callback: () => { count += 1; } });
    await client.controlSkillWeCode({ action: 'minimize' });
    expect(count).toBe(2);
  });

  it('listener failure does not stop others', async () => {
    const { client } = setup();
    let called = false;
    client.onSkillWecodeStatusChange({ callback: () => { throw new Error('x'); } });
    client.onSkillWecodeStatusChange({ callback: () => { called = true; } });
    await client.controlSkillWeCode({ action: 'close' });
    expect(called).toBe(true);
  });

  it('records callback metrics', async () => {
    const { client } = setup();
    client.onSkillWecodeStatusChange({ callback: () => undefined });
    await client.controlSkillWeCode({ action: 'close' });
    expect(client.getMetricsSnapshot().callbackDelivered).toBeGreaterThan(0);
  });
});

describe('regenerateAnswer', () => {
  it('regenerates from latest user message', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const result = await client.regenerateAnswer({ sessionId });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeTruthy();
  });

  it('requires sessionId', async () => {
    const { client } = setup();
    await expect(client.regenerateAnswer({ sessionId: '' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('fails when no previous user message', async () => {
    const { client, backend } = setup();
    const session = await client.executeSkill({
      imChatId: 'chat-1',
      skillDefinitionId: 1,
      userId: 'u1',
      skillContent: 'hello',
    });
    backend.state.messages.set(session.id, []);
    await expect(client.regenerateAnswer({ sessionId: session.id })).rejects.toMatchObject({
      code: ERROR_CODE.NO_USER_MESSAGE_FOR_REGENERATE,
    });
  });

  it('maps backend error', async () => {
    const { client, backend } = setup();
    const sessionId = await createSession(client);
    backend.failNext('/messages?', 500);
    await expect(client.regenerateAnswer({ sessionId })).rejects.toMatchObject({ code: ERROR_CODE.REST_ERROR });
  });

  it('records interface metric', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    await client.regenerateAnswer({ sessionId });
    expect(client.getMetricsSnapshot().interfaceCalls).toBeGreaterThan(0);
  });
});

describe('sendMessageToIM', () => {
  it('sends message to im', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const result = await client.sendMessageToIM({ sessionId, content: 'sync' });
    expect(result.success).toBe(true);
    expect(result.contentLength).toBe(4);
  });

  it('requires sessionId', async () => {
    const { client } = setup();
    await expect(client.sendMessageToIM({ sessionId: '', content: 'x' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('requires content', async () => {
    const { client } = setup();
    await expect(client.sendMessageToIM({ sessionId: '1', content: '' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('maps not found', async () => {
    const { client } = setup();
    await expect(client.sendMessageToIM({ sessionId: '404', content: 'x' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_NOT_FOUND,
    });
  });

  it('maps 500', async () => {
    const { client, backend } = setup();
    const sessionId = await createSession(client);
    backend.failNext('/send-to-im', 500);
    await expect(client.sendMessageToIM({ sessionId, content: 'x' })).rejects.toMatchObject({
      code: ERROR_CODE.REST_ERROR,
    });
  });
});

describe('getSessionMessage', () => {
  it('returns paged messages', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const result = await client.getSessionMessage({ sessionId });
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('uses default page and size', async () => {
    const { client, backend } = setup();
    const sessionId = await createSession(client);
    await client.getSessionMessage({ sessionId });
    const req = backend.state.requests.at(-1);
    expect(req?.path).toContain('page=0');
    expect(req?.path).toContain('size=50');
  });

  it('merges streaming message from ws accumulator', async () => {
    const { client, hub } = setup();
    const sessionId = await createSession(client);
    hub.bySession(sessionId)[0]?.emitMessage({
      sessionId,
      type: 'delta',
      seq: 999,
      content: 'streaming',
    });
    const result = await client.getSessionMessage({ sessionId });
    expect(result.content.some((m) => String(m.id).startsWith('streaming-'))).toBe(true);
  });

  it('requires sessionId', async () => {
    const { client } = setup();
    await expect(client.getSessionMessage({ sessionId: '' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('maps 404', async () => {
    const { client } = setup();
    await expect(client.getSessionMessage({ sessionId: '404' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_NOT_FOUND,
    });
  });
});

describe('registerSessionListener', () => {
  it('registers listener', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const seen: StreamMessage[] = [];
    client.registerSessionListener({ sessionId, onMessage: (m) => seen.push(m) });
    expect(seen).toHaveLength(0);
  });

  it('auto connects by default', () => {
    const { client, hub } = setup();
    client.registerSessionListener({ sessionId: 'x', onMessage: () => undefined });
    expect(hub.count()).toBe(1);
  });

  it('can disable auto connect', () => {
    const { client, hub } = setup({ autoConnectOnRegister: false });
    client.registerSessionListener({ sessionId: 'x', onMessage: () => undefined });
    expect(hub.count()).toBe(0);
  });

  it('requires sessionId', () => {
    const { client } = setup();
    expect(() => client.registerSessionListener({ sessionId: '', onMessage: () => undefined })).toThrow();
  });

  it('dispatches incoming messages', async () => {
    const { client, hub } = setup();
    const sessionId = await createSession(client);
    const seen: string[] = [];
    client.registerSessionListener({ sessionId, onMessage: (m) => seen.push(m.type) });
    hub.bySession(sessionId)[0]?.emitMessage({ sessionId, type: 'delta', seq: 1, content: 'a' });
    expect(seen).toContain('delta');
  });
});

describe('unregisterSessionListener', () => {
  it('unregisters existing listener', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const onMessage = () => undefined;
    client.registerSessionListener({ sessionId, onMessage });
    expect(() => client.unregisterSessionListener({ sessionId, onMessage })).not.toThrow();
  });

  it('throws when listener missing', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    expect(() => client.unregisterSessionListener({ sessionId, onMessage: () => undefined })).toThrow();
  });

  it('supports optional error and close refs', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const onMessage = () => undefined;
    const onError = () => undefined;
    const onClose = () => undefined;
    client.registerSessionListener({ sessionId, onMessage, onError, onClose });
    expect(() =>
      client.unregisterSessionListener({ sessionId, onMessage, onError, onClose }),
    ).not.toThrow();
  });

  it('auto disconnects when no listeners', async () => {
    const { client, hub } = setup();
    const sessionId = await createSession(client);
    const onMessage = () => undefined;
    client.registerSessionListener({ sessionId, onMessage });
    client.unregisterSessionListener({ sessionId, onMessage });
    expect(hub.bySession(sessionId)[0]?.readyState).toBe(3);
  });

  it('keeps connection if option disabled', async () => {
    const { client, hub } = setup({ autoDisconnectWhenNoListeners: false });
    const sessionId = await createSession(client);
    const onMessage = () => undefined;
    client.registerSessionListener({ sessionId, onMessage });
    client.unregisterSessionListener({ sessionId, onMessage });
    expect(hub.bySession(sessionId)[0]?.readyState).toBe(1);
  });
});

describe('sendMessage', () => {
  it('sends message and returns result', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const result = await client.sendMessage({ sessionId, content: 'next' });
    expect(result.messageId).toBeTruthy();
  });

  it('requires sessionId', async () => {
    const { client } = setup();
    await expect(client.sendMessage({ sessionId: '', content: 'x' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('requires content', async () => {
    const { client } = setup();
    await expect(client.sendMessage({ sessionId: '1', content: '' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('maps 404 when session missing', async () => {
    const { client } = setup();
    await expect(client.sendMessage({ sessionId: '404', content: 'x' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_NOT_FOUND,
    });
  });

  it('records successful call metric', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    await client.sendMessage({ sessionId, content: 'x' });
    expect(client.getMetricsSnapshot().interfaceSuccess).toBeGreaterThan(0);
  });
});

describe('replyPermission', () => {
  it('replies with approve=true', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const result = await client.replyPermission({
      sessionId,
      permissionId: 'p-1',
      approved: true,
    });
    expect(result.approved).toBe(true);
  });

  it('replies with approve=false', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    const result = await client.replyPermission({
      sessionId,
      permissionId: 'p-2',
      approved: false,
    });
    expect(result.approved).toBe(false);
  });

  it('requires sessionId', async () => {
    const { client } = setup();
    await expect(client.replyPermission({ sessionId: '', permissionId: 'p', approved: true })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('requires permissionId', async () => {
    const { client } = setup();
    await expect(client.replyPermission({ sessionId: '1', permissionId: '', approved: true })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('tracks permission cycle metric', async () => {
    const { client } = setup();
    const sessionId = await createSession(client);
    await client.replyPermission({ sessionId, permissionId: 'p-1', approved: true });
    expect(client.getMetricsSnapshot().permissionCycleMsP95).toBeGreaterThanOrEqual(0);
  });
});

describe('controlSkillWeCode', () => {
  it('supports minimize', async () => {
    const { client } = setup();
    await expect(client.controlSkillWeCode({ action: 'minimize' })).resolves.toEqual({ status: 'success' });
  });

  it('supports close', async () => {
    const { client } = setup();
    await expect(client.controlSkillWeCode({ action: 'close' })).resolves.toEqual({ status: 'success' });
  });

  it('rejects invalid action', async () => {
    const { client } = setup();
    await expect(
      client.controlSkillWeCode({ action: 'invalid' as never }),
    ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_ARGUMENT });
  });

  it('notifies registered wecode listener', async () => {
    const { client } = setup();
    const states: string[] = [];
    client.onSkillWecodeStatusChange({ callback: ({ status }) => states.push(status) });
    await client.controlSkillWeCode({ action: 'minimize' });
    expect(states).toEqual(['minimized']);
  });

  it('increments interface call metrics', async () => {
    const { client } = setup();
    await client.controlSkillWeCode({ action: 'close' });
    expect(client.getMetricsSnapshot().interfaceCalls).toBe(1);
  });
});
