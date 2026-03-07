import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createSkillClient, ERROR_CODE, type StreamMessage } from '../src/index';
import { startMockSkillServer } from '../src/mock/mock-skill-server';

async function run(): Promise<void> {
  const mock = await startMockSkillServer({
    port: 0,
    streamChunkCount: 3,
    streamChunkIntervalMs: 40,
    streamStartDelayMs: 30,
  });
  const messages: StreamMessage[] = [];
  const statusTimeline: string[] = [];
  const wecodeStates: string[] = [];

  const client = createSkillClient({
    baseUrl: mock.baseUrl,
    wsUrl: mock.wsUrl,
    env: 'test',
  });

  try {
    const session = await client.executeSkill({
      imChatId: 'chat-l7',
      skillDefinitionId: 1,
      userId: 'user-1',
      skillContent: 'hello',
    });

    client.registerSessionListener({
      sessionId: session.id,
      onMessage: (message) => messages.push(message),
      onError: (error) => {
        throw new Error(error.message);
      },
    });

    client.onSessionStatusChange({
      sessionId: session.id,
      callback: ({ status }) => statusTimeline.push(status),
    });

    client.onSkillWecodeStatusChange({
      callback: ({ status }) => wecodeStates.push(status),
    });

    await client.sendMessage({ sessionId: session.id, content: 'follow-up' });
    await delay(80);

    assert.ok(messages.some((message) => message.type === 'delta'));
    assert.ok(statusTimeline.includes('executing'));

    const regen = await client.regenerateAnswer({ sessionId: session.id });
    assert.equal(regen.success, true);

    const im = await client.sendMessageToIM({ sessionId: session.id, content: 'sync to im' });
    assert.equal(im.success, true);

    await client.stopSkill({ sessionId: session.id });

    await assert.rejects(
      () => client.sendMessage({ sessionId: session.id, content: 'after-stop' }),
      (error: unknown) => {
        const candidate = error as { code?: string };
        return candidate?.code === ERROR_CODE.SESSION_TERMINATED_AFTER_STOP;
      },
    );

    const control = await client.controlSkillWeCode({ action: 'minimize' });
    assert.equal(control.status, 'success');
    assert.ok(wecodeStates.includes('minimized'));

    const metrics = client.getMetricsSnapshot();
    assert.ok(metrics.interfaceCalls >= 6);

    const close = await client.closeSkill();
    assert.equal(close.status, 'success');
    console.log('L7 fixture run passed');
  } finally {
    await mock.stop();
  }
}

void run();
