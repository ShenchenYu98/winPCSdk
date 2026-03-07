import { afterEach, describe, expect, it, vi } from 'vitest';

type WindowSetup = {
  userAgent: string;
  maxTouchPoints: number;
  withHwh5: boolean;
};

function setupWindow(config: WindowSetup): {
  hwh5SendMessage: ReturnType<typeof vi.fn>;
} {
  const hwh5SendMessage = vi.fn(async () => ({
    messageId: 1001,
    seq: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  const w: Record<string, unknown> = {
    navigator: {
      userAgent: config.userAgent,
      maxTouchPoints: config.maxTouchPoints,
    },
    location: {
      search: '',
    },
  };

  if (config.maxTouchPoints > 0) {
    w.ontouchstart = null;
  }

  if (config.withHwh5) {
    w.HWH5 = {
      sendMessage: hwh5SendMessage,
      getSessionMessage: vi.fn(),
      registerSessionListener: vi.fn(),
      unregisterSessionListener: vi.fn(),
      stopSkill: vi.fn(),
      sendMessageToIM: vi.fn(),
      controlSkillWeCode: vi.fn(),
    };
  }

  (globalThis as { window?: unknown }).window = w;
  return { hwh5SendMessage };
}

async function loadJsapiModule(sdkSendMessage = vi.fn(async () => ({
  messageId: '2002',
  seq: 2,
  createdAt: '2026-01-01T00:00:01.000Z',
}))) {
  vi.resetModules();
  const createSkillClient = vi.fn(() => ({
    sendMessage: sdkSendMessage,
    getSessionMessage: vi.fn(),
    registerSessionListener: vi.fn(),
    unregisterSessionListener: vi.fn(),
    stopSkill: vi.fn(),
    sendMessageToIM: vi.fn(),
    controlSkillWeCode: vi.fn(),
  }));

  vi.doMock('../../src/index', () => ({
    createSkillClient,
  }));

  const module = await import('../../miniApp/src/services/jsapi');
  return {
    module,
    createSkillClient,
    sdkSendMessage,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete (globalThis as { window?: unknown }).window;
});

describe('miniApp jsapi service routing', () => {
  it('uses JSAPI on mobile when HWH5 exists', async () => {
    const { hwh5SendMessage } = setupWindow({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      maxTouchPoints: 5,
      withHwh5: true,
    });
    const { module, createSkillClient, sdkSendMessage } = await loadJsapiModule();

    await module.sendMessage({ sessionId: '1', content: 'hello' });

    expect(module.getActiveChannel()).toBe('jsapi');
    expect(hwh5SendMessage).toHaveBeenCalledTimes(1);
    expect(createSkillClient).toHaveBeenCalledTimes(0);
    expect(sdkSendMessage).toHaveBeenCalledTimes(0);
  });

  it('falls back to SDK on mobile when HWH5 is missing', async () => {
    setupWindow({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel)',
      maxTouchPoints: 5,
      withHwh5: false,
    });
    const { module, createSkillClient, sdkSendMessage } = await loadJsapiModule();

    await module.sendMessage({ sessionId: '2', content: 'hello' });

    expect(module.getActiveChannel()).toBe('sdk');
    expect(createSkillClient).toHaveBeenCalledTimes(1);
    expect(sdkSendMessage).toHaveBeenCalledTimes(1);
  });

  it('uses SDK on desktop even when HWH5 exists', async () => {
    const { hwh5SendMessage } = setupWindow({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: 0,
      withHwh5: true,
    });
    const { module, createSkillClient, sdkSendMessage } = await loadJsapiModule();

    await module.sendMessage({ sessionId: '3', content: 'hello' });

    expect(module.getActiveChannel()).toBe('sdk');
    expect(createSkillClient).toHaveBeenCalledTimes(1);
    expect(sdkSendMessage).toHaveBeenCalledTimes(1);
    expect(hwh5SendMessage).toHaveBeenCalledTimes(0);
  });
});
