import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { createSkillClient, ERROR_CODE } from '../../src';
import { startMockSkillServer, type MockSkillServer } from '../../src/mock/mock-skill-server';

function createClient(server: MockSkillServer) {
  return createSkillClient({
    baseUrl: server.baseUrl,
    wsUrl: server.wsUrl,
    env: 'test',
  });
}

describe('L1 registerSessionListener -> executeSkill -> onSessionStatusChange -> getSessionMessage', () => {
  let server: MockSkillServer;
  beforeAll(async () => {
    server = await startMockSkillServer(19101);
  });
  afterAll(async () => {
    await server.stop();
  });

  it('normal path: pre-register listener does not lose stream', async () => {
    const client = createClient(server);
    const events: string[] = [];
    client.registerSessionListener({ sessionId: '1', onMessage: (m) => events.push(m.type) });

    const session = await client.executeSkill({
      imChatId: 'chat-L1',
      skillDefinitionId: 1,
      userId: 'u1',
      skillContent: 'L1',
    });

    client.onSessionStatusChange({
      sessionId: session.id,
      callback: ({ status }) => events.push(status),
    });

    await delay(80);
    const history = await client.getSessionMessage({ sessionId: session.id });

    expect(events.some((e) => e === 'delta' || e === 'executing')).toBe(true);
    expect(history.content.length).toBeGreaterThan(0);
  });

  it('exception path: getSessionMessage on missing session returns 404 mapping', async () => {
    const client = createClient(server);
    await expect(client.getSessionMessage({ sessionId: '404' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_NOT_FOUND,
    });
  });

  it('idempotent path: repeated listener registration remains stable', async () => {
    const client = createClient(server);
    const seen: string[] = [];

    const session = await client.executeSkill({
      imChatId: 'chat-L1-b',
      skillDefinitionId: 1,
      userId: 'u1',
      skillContent: 'L1 repeat',
    });

    const listener = (message: { type: string }) => seen.push(message.type);
    client.registerSessionListener({ sessionId: session.id, onMessage: listener });
    client.registerSessionListener({ sessionId: session.id, onMessage: listener });

    await client.sendMessage({ sessionId: session.id, content: 'trigger' });
    await delay(80);
    expect(seen.length).toBeGreaterThanOrEqual(1);
  });
});

describe('L2 executeSkill -> sendMessage -> getSessionMessage', () => {
  let server: MockSkillServer;
  beforeAll(async () => {
    server = await startMockSkillServer(19102);
  });
  afterAll(async () => {
    await server.stop();
  });

  it('normal path: multi-turn history is merged', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L2',
      skillDefinitionId: 1,
      userId: 'u2',
      skillContent: 'first',
    });
    await client.sendMessage({ sessionId: session.id, content: 'second' });
    await delay(80);
    const messages = await client.getSessionMessage({ sessionId: session.id });
    expect(messages.content.filter((m) => m.role === 'USER').length).toBeGreaterThanOrEqual(2);
  });

  it('exception path: sendMessage missing content fails fast', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L2-b',
      skillDefinitionId: 1,
      userId: 'u2',
      skillContent: 'first',
    });
    await expect(client.sendMessage({ sessionId: session.id, content: '' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('idempotent path: repeated getSessionMessage is stable', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L2-c',
      skillDefinitionId: 1,
      userId: 'u2',
      skillContent: 'first',
    });
    const first = await client.getSessionMessage({ sessionId: session.id });
    const second = await client.getSessionMessage({ sessionId: session.id });
    expect(second.totalElements).toBeGreaterThanOrEqual(first.totalElements);
  });
});

describe('L3 executeSkill -> sendMessage -> stopSkill -> sendMessage', () => {
  let server: MockSkillServer;
  beforeAll(async () => {
    server = await startMockSkillServer(19103);
  });
  afterAll(async () => {
    await server.stop();
  });

  it('normal path: stop returns success', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L3',
      skillDefinitionId: 1,
      userId: 'u3',
      skillContent: 'first',
    });
    await client.sendMessage({ sessionId: session.id, content: 'second' });
    await expect(client.stopSkill({ sessionId: session.id })).resolves.toEqual({ status: 'success' });
  });

  it('exception path: post-stop send maps to SESSION_TERMINATED_AFTER_STOP', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L3-b',
      skillDefinitionId: 1,
      userId: 'u3',
      skillContent: 'first',
    });
    await client.stopSkill({ sessionId: session.id });
    await expect(client.sendMessage({ sessionId: session.id, content: 'again' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_TERMINATED_AFTER_STOP,
      retriable: true,
    });
  });

  it('idempotent path: repeated stop reports missing session on second try', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L3-c',
      skillDefinitionId: 1,
      userId: 'u3',
      skillContent: 'first',
    });
    await client.stopSkill({ sessionId: session.id });
    await expect(client.stopSkill({ sessionId: session.id })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_NOT_FOUND,
    });
  });
});

describe('L4 executeSkill -> regenerateAnswer -> sendMessageToIM', () => {
  let server: MockSkillServer;
  beforeAll(async () => {
    server = await startMockSkillServer(19104);
  });
  afterAll(async () => {
    await server.stop();
  });

  it('normal path: regenerate then send to IM succeeds', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L4',
      skillDefinitionId: 1,
      userId: 'u4',
      skillContent: 'seed',
    });
    const regen = await client.regenerateAnswer({ sessionId: session.id });
    const im = await client.sendMessageToIM({ sessionId: session.id, content: 'to-im' });
    expect(regen.success).toBe(true);
    expect(im.success).toBe(true);
  });

  it('exception path: sendMessageToIM empty content fails', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L4-b',
      skillDefinitionId: 1,
      userId: 'u4',
      skillContent: 'seed',
    });
    await expect(client.sendMessageToIM({ sessionId: session.id, content: '' })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('idempotent path: regenerate can run repeatedly', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L4-c',
      skillDefinitionId: 1,
      userId: 'u4',
      skillContent: 'seed',
    });
    const a = await client.regenerateAnswer({ sessionId: session.id });
    const b = await client.regenerateAnswer({ sessionId: session.id });
    expect(a.messageId).not.toBe('');
    expect(b.messageId).not.toBe('');
  });
});

describe('L5 controlSkillWeCode -> onSkillWecodeStatusChange -> closeSkill', () => {
  let server: MockSkillServer;
  beforeAll(async () => {
    server = await startMockSkillServer(19105);
  });
  afterAll(async () => {
    await server.stop();
  });

  it('normal path: close/minimize callbacks are emitted', async () => {
    const client = createClient(server);
    const states: string[] = [];
    client.onSkillWecodeStatusChange({ callback: ({ status }) => states.push(status) });
    await client.controlSkillWeCode({ action: 'close' });
    await client.controlSkillWeCode({ action: 'minimize' });
    expect(states).toEqual(['closed', 'minimized']);
  });

  it('exception path: invalid action returns validation error', async () => {
    const client = createClient(server);
    await expect(client.controlSkillWeCode({ action: 'bad' as never })).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_ARGUMENT,
    });
  });

  it('idempotent path: closeSkill can be repeated', async () => {
    const client = createClient(server);
    await expect(client.closeSkill()).resolves.toEqual({ status: 'success' });
    await expect(client.closeSkill()).resolves.toEqual({ status: 'success' });
  });
});

describe('L6 executeSkill -> replyPermission -> sendMessage', () => {
  let server: MockSkillServer;
  beforeAll(async () => {
    server = await startMockSkillServer(19106);
  });
  afterAll(async () => {
    await server.stop();
  });

  it('normal path: approved permission allows continued sendMessage', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L6',
      skillDefinitionId: 1,
      userId: 'u6',
      skillContent: 'seed',
    });
    const perm = await client.replyPermission({ sessionId: session.id, permissionId: 'perm-1', approved: true });
    const send = await client.sendMessage({ sessionId: session.id, content: 'after-perm' });
    expect(perm.success).toBe(true);
    expect(send.messageId).toBeTruthy();
  });

  it('exception path: missing permissionId fails', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L6-b',
      skillDefinitionId: 1,
      userId: 'u6',
      skillContent: 'seed',
    });
    await expect(
      client.replyPermission({ sessionId: session.id, permissionId: '', approved: true }),
    ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_ARGUMENT });
  });

  it('idempotent path: approve and reject both supported', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L6-c',
      skillDefinitionId: 1,
      userId: 'u6',
      skillContent: 'seed',
    });
    const approve = await client.replyPermission({ sessionId: session.id, permissionId: 'perm-1', approved: true });
    const reject = await client.replyPermission({ sessionId: session.id, permissionId: 'perm-2', approved: false });
    expect(approve.approved).toBe(true);
    expect(reject.approved).toBe(false);
  });
});

describe('L7 chat command flow with miniapp actions', () => {
  let server: MockSkillServer;
  beforeAll(async () => {
    server = await startMockSkillServer(19107);
  });
  afterAll(async () => {
    await server.stop();
  });

  it('normal path: execute -> stream -> minimize -> sendToIM -> send -> regenerate', async () => {
    const client = createClient(server);
    const streamEvents: string[] = [];

    const session = await client.executeSkill({
      imChatId: 'chat-L7',
      skillDefinitionId: 1,
      userId: 'u7',
      skillContent: '/skillName do xxx',
    });

    client.registerSessionListener({
      sessionId: session.id,
      onMessage: (message) => streamEvents.push(message.type),
    });

    await delay(80);
    await client.controlSkillWeCode({ action: 'minimize' });
    await client.sendMessageToIM({ sessionId: session.id, content: 'sync result' });
    await client.sendMessage({ sessionId: session.id, content: 'continue' });
    await client.regenerateAnswer({ sessionId: session.id });

    expect(streamEvents.includes('delta') || streamEvents.includes('done')).toBe(true);
  });

  it('exception path: stop then send follows compatibility error', async () => {
    const client = createClient(server);
    const session = await client.executeSkill({
      imChatId: 'chat-L7-b',
      skillDefinitionId: 1,
      userId: 'u7',
      skillContent: '/skillName do xxx',
    });

    await client.stopSkill({ sessionId: session.id });
    await expect(client.sendMessage({ sessionId: session.id, content: 'continue' })).rejects.toMatchObject({
      code: ERROR_CODE.SESSION_TERMINATED_AFTER_STOP,
    });
  });

  it('idempotent path: closeSkill always succeeds', async () => {
    const client = createClient(server);
    await expect(client.closeSkill()).resolves.toEqual({ status: 'success' });
    await expect(client.closeSkill()).resolves.toEqual({ status: 'success' });
  });
});

