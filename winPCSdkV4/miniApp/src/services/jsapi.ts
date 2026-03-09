import { createSkillClient, type SkillClient, type SkillClientInitOptions } from '../../../src/index';
import type {
  ControlSkillWeCodeParams,
  ControlSkillWeCodeResult,
  GetSessionMessageParams,
  GetSessionMessageResult,
  RegisterSessionListenerParams,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  StopSkillParams,
  StopSkillResult,
  StreamMessage,
  UnregisterSessionListenerParams,
} from '../types/jsapi';

type Channel = 'jsapi' | 'sdk';

interface RuntimeRouting {
  channel: Channel;
  isMobile: boolean;
  hasHWH5: boolean;
}

interface WrappedListener {
  onMessage: (message: unknown) => void;
  onError?: (error: unknown) => void;
  onClose?: (reason: unknown) => void;
}

const listenerWrappers = new Map<string, Map<RegisterSessionListenerParams['onMessage'], WrappedListener>>();
const runtimeRouting = detectRuntimeRouting();
let sdkClient: SkillClient | null = null;

function detectRuntimeRouting(): RuntimeRouting {
  if (typeof window === 'undefined') {
    return {
      channel: 'sdk',
      isMobile: false,
      hasHWH5: false,
    };
  }

  const hostWindow = window as Window & { HWH5?: unknown };
  const userAgent = (window.navigator?.userAgent || '').toLowerCase();
  const maxTouchPoints = window.navigator?.maxTouchPoints || 0;
  const touchCapable = maxTouchPoints > 0 || 'ontouchstart' in window;
  const mobileByUA = /(android|iphone|ipad|ipod|harmony|mobile)/.test(userAgent);
  const isMobile = mobileByUA && touchCapable;
  const hasHWH5 = typeof hostWindow.HWH5 !== 'undefined';

  if (isMobile && hasHWH5) {
    return {
      channel: 'jsapi',
      isMobile,
      hasHWH5,
    };
  }

  return {
    channel: 'sdk',
    isMobile,
    hasHWH5,
  };
}

function checkJSAPI(): boolean {
  return runtimeRouting.channel === 'jsapi';
}

function getSdkClient(): SkillClient {
  if (sdkClient) {
    return sdkClient;
  }

  const options = resolveSdkOptionsFromURL();
  sdkClient = createSkillClient(options);
  return sdkClient;
}

function resolveSdkOptionsFromURL(): SkillClientInitOptions {
  const defaults: SkillClientInitOptions = {
    baseUrl: 'http://127.0.0.1:19082',
    wsUrl: 'ws://127.0.0.1:19082',
    env: 'test',
  };

  if (typeof window === 'undefined') {
    return defaults;
  }

  const params = new URLSearchParams(window.location.search);
  const baseUrl = params.get('baseUrl') || defaults.baseUrl;
  const wsUrl = params.get('wsUrl') || toWsUrl(baseUrl);
  const envParam = params.get('env');
  const env = envParam === 'dev' || envParam === 'test' || envParam === 'prod' ? envParam : defaults.env;

  return {
    baseUrl,
    wsUrl,
    env,
  };
}

function toWsUrl(baseUrl: string): string {
  if (baseUrl.startsWith('https://')) {
    return `wss://${baseUrl.slice('https://'.length)}`;
  }
  if (baseUrl.startsWith('http://')) {
    return `ws://${baseUrl.slice('http://'.length)}`;
  }
  return baseUrl;
}

function toNumberId(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStreamMessage(raw: unknown): StreamMessage {
  const candidate = raw as Partial<StreamMessage>;
  const type = String(candidate.type ?? 'delta');
  const sessionId = String(candidate.sessionId ?? '');

  if (type === 'message.part.delta') {
    return {
      sessionId,
      type: 'message.part.delta',
      seq: typeof candidate.seq === 'number' ? candidate.seq : 0,
      content: candidate.properties?.delta ?? '',
      properties: candidate.properties,
      usage: candidate.usage,
    };
  }

  if (type === 'message.part.updated') {
    return {
      sessionId,
      type: 'message.part.updated',
      seq: typeof candidate.seq === 'number' ? candidate.seq : 0,
      content: candidate.properties?.part?.text ?? '',
      properties: candidate.properties,
      usage: candidate.usage,
    };
  }

  return {
    sessionId,
    type: type as StreamMessage['type'],
    seq: typeof candidate.seq === 'number' ? candidate.seq : 0,
    content: typeof candidate.content === 'string' ? candidate.content : '',
    properties: candidate.properties,
    usage: candidate.usage,
  };
}

function getOrCreateWrappedListener(params: RegisterSessionListenerParams): WrappedListener {
  const bySession = listenerWrappers.get(params.sessionId) ?? new Map();
  listenerWrappers.set(params.sessionId, bySession);

  const existing = bySession.get(params.onMessage);
  if (existing) {
    return existing;
  }

  const wrapped: WrappedListener = {
    onMessage: (message) => {
      params.onMessage(normalizeStreamMessage(message));
    },
    onError: params.onError
      ? (error: unknown) => {
          const candidate = error as { code?: string; message?: string; timestamp?: number };
          params.onError?.({
            code: String(candidate.code ?? 'UNKNOWN'),
            message: String(candidate.message ?? 'Unknown error'),
            timestamp: Number(candidate.timestamp ?? Date.now()),
          });
        }
      : undefined,
    onClose: params.onClose
      ? (reason: unknown) => {
          params.onClose?.(String(reason ?? 'closed'));
        }
      : undefined,
  };

  bySession.set(params.onMessage, wrapped);
  return wrapped;
}

function getWrappedListener(params: UnregisterSessionListenerParams): WrappedListener | undefined {
  const bySession = listenerWrappers.get(params.sessionId);
  return bySession?.get(params.onMessage);
}

function deleteWrappedListener(
  sessionId: string,
  onMessage: RegisterSessionListenerParams['onMessage'],
): void {
  const bySession = listenerWrappers.get(sessionId);
  if (!bySession) {
    return;
  }
  bySession.delete(onMessage);
  if (bySession.size === 0) {
    listenerWrappers.delete(sessionId);
  }
}

export function getActiveChannel(): Channel {
  return runtimeRouting.channel;
}

export function isMobileRuntimeDetected(): boolean {
  return runtimeRouting.isMobile;
}

export function hasHwh5Injected(): boolean {
  return runtimeRouting.hasHWH5;
}

export async function getSessionMessage(
  params: GetSessionMessageParams,
): Promise<GetSessionMessageResult> {
  if (checkJSAPI()) {
    return window.HWH5!.getSessionMessage(params);
  }

  const sdkResult = await getSdkClient().getSessionMessage(params);
  return {
    ...sdkResult,
    content: sdkResult.content.map((message, index) => ({
      id: toNumberId(message.id, index + 1),
      sessionId: toNumberId(message.sessionId, toNumberId(params.sessionId, 0)),
      seq: message.seq,
      role: message.role,
      content: message.content,
      contentType: message.contentType,
      createdAt: message.createdAt,
      meta: message.meta ? JSON.stringify(message.meta) : undefined,
    })),
  };
}

export function registerSessionListener(params: RegisterSessionListenerParams): void {
  if (checkJSAPI()) {
    window.HWH5!.registerSessionListener(params);
    return;
  }

  const wrapped = getOrCreateWrappedListener(params);
  getSdkClient().registerSessionListener({
    sessionId: params.sessionId,
    onMessage: wrapped.onMessage,
    onError: wrapped.onError,
    onClose: wrapped.onClose,
  });
}

export function unregisterSessionListener(params: UnregisterSessionListenerParams): void {
  if (checkJSAPI()) {
    window.HWH5!.unregisterSessionListener(params);
    return;
  }

  const wrapped = getWrappedListener(params);
  if (!wrapped) {
    return;
  }

  getSdkClient().unregisterSessionListener({
    sessionId: params.sessionId,
    onMessage: wrapped.onMessage,
    onError: wrapped.onError,
    onClose: wrapped.onClose,
  });
  deleteWrappedListener(params.sessionId, params.onMessage);
}

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  if (checkJSAPI()) {
    return window.HWH5!.sendMessage(params);
  }

  const result = await getSdkClient().sendMessage(params);
  return {
    messageId: toNumberId(result.messageId, Date.now()),
    seq: result.seq,
    createdAt: result.createdAt,
  };
}

export async function stopSkill(params: StopSkillParams): Promise<StopSkillResult> {
  if (checkJSAPI()) {
    return window.HWH5!.stopSkill(params);
  }
  return getSdkClient().stopSkill(params);
}

export async function sendMessageToIM(
  params: SendMessageToIMParams,
): Promise<SendMessageToIMResult> {
  if (checkJSAPI()) {
    return window.HWH5!.sendMessageToIM(params);
  }
  return getSdkClient().sendMessageToIM(params);
}

export async function controlSkillWeCode(
  params: ControlSkillWeCodeParams,
): Promise<ControlSkillWeCodeResult> {
  if (checkJSAPI()) {
    return window.HWH5!.controlSkillWeCode(params);
  }
  return getSdkClient().controlSkillWeCode(params);
}

export function getSessionIdFromURL(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('sessionid') || urlParams.get('sessionId') || null;
}
