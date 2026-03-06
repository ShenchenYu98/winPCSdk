import WebSocket from 'ws';
import { createSkillSDK } from '../src/sdk.js';

async function main(): Promise<void> {
  const sdk = createSkillSDK({
    baseHttpUrl: 'http://localhost:8082',
    baseWsUrl: 'ws://localhost:8082',
    skillDefinitionId: 1,
    webSocketFactory: (url) => new WebSocket(url) as unknown as WebSocket
  });

  const session = await sdk.executeSkill('chat-demo-1', '10001', '请给出一个mock联调示例', 1, '本地联调会话');
  const sessionId = String(session.id);

  console.log('[demo] session created:', sessionId);

  sdk.onSessionStatus(sessionId, (status) => {
    console.log('[demo] status:', status);
  });

  await sdk.sendMessage(sessionId, '继续输出第二段内容', (message) => {
    console.log('[demo] stream:', message.type, message.content);
  });

  const history = await sdk.getSessionMessage(sessionId, 0, 20);
  console.log('[demo] history count:', history.totalElements);

  const sent = await sdk.sendMessageToIM(sessionId, '这是一条发送到IM的mock消息');
  console.log('[demo] send to IM success:', sent);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await sdk.closeSkill(sessionId);
  console.log('[demo] closed session');
}

main().catch((error) => {
  console.error('[demo] failed:', error);
  process.exit(1);
});
