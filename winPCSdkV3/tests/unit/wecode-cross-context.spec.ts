import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSkillClient, type SkillClient } from '../../src/index';

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();

  readonly name: string;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    const set = FakeBroadcastChannel.channels.get(name) ?? new Set<FakeBroadcastChannel>();
    set.add(this);
    FakeBroadcastChannel.channels.set(name, set);
  }

  postMessage(message: unknown): void {
    const listeners = FakeBroadcastChannel.channels.get(this.name);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      if (listener === this) {
        continue;
      }
      listener.onmessage?.({ data: message } as MessageEvent<unknown>);
    }
  }

  close(): void {
    const listeners = FakeBroadcastChannel.channels.get(this.name);
    if (!listeners) {
      return;
    }

    listeners.delete(this);
    if (listeners.size === 0) {
      FakeBroadcastChannel.channels.delete(this.name);
    }
  }

  static reset(): void {
    FakeBroadcastChannel.channels.clear();
  }
}

function createClient(): SkillClient {
  return createSkillClient({
    baseUrl: 'http://mock.local',
    wsUrl: 'ws://mock.local',
    env: 'test',
    fetchImpl: async () => {
      throw new Error('fetch should not be called in wecode broadcast test');
    },
  });
}

const originalWindow = (globalThis as { window?: unknown }).window;
const originalBroadcastChannel = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeBroadcastChannel as unknown;
});

afterEach(async () => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = originalBroadcastChannel;
  FakeBroadcastChannel.reset();
});

describe('wecode status cross-context broadcast', () => {
  it('syncs onSkillWecodeStatusChange across client instances', async () => {
    const clientA = createClient();
    const clientB = createClient();

    const statesA: string[] = [];
    const statesB: string[] = [];

    clientA.onSkillWecodeStatusChange({ callback: ({ status }) => statesA.push(status) });
    clientB.onSkillWecodeStatusChange({ callback: ({ status }) => statesB.push(status) });

    await clientA.controlSkillWeCode({ action: 'minimize' });

    expect(statesA).toEqual(['minimized']);
    expect(statesB).toEqual(['minimized']);

    await clientA.closeSkill();
    await clientB.closeSkill();
  });
});
