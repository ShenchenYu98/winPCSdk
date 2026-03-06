import { startMockSkillServer } from './local-skill-server.js';

const stop = await startMockSkillServer(8082);

process.on('SIGINT', async () => {
  await stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stop();
  process.exit(0);
});

console.log('[mock-skill-server] press Ctrl+C to stop');
