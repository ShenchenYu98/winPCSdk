import { startMockSkillServer } from '../src/mock/mock-skill-server';

const args = process.argv.slice(2);
const portArg = args.find((arg) => !arg.startsWith('--'));
const port = portArg ? Number(portArg) : 19082;
const useFastStream = args.includes('--fast-stream');
const streamOptions = useFastStream
  ? {}
  : {
      streamChunkCount: 6,
      streamChunkIntervalMs: 220,
      streamStartDelayMs: 140,
    };

async function main(): Promise<void> {
  const server = await startMockSkillServer({
    port,
    ...streamOptions,
  });
  console.log(`[mock] Skill server started at ${server.baseUrl}`);
  console.log(`[mock] Stream mode: ${useFastStream ? 'fast' : 'slow-visible'}`);
  console.log('[mock] Press Ctrl+C to stop');

  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
