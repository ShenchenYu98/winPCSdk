import {
  getSharedBrowserSkillSdk,
  type SessionMessage as SDKSessionMessage,
  type SkillSdkApi,
  type StreamMessage as SDKStreamMessage
} from "../../../src/sdk";
import mockFixture from "../../../mocks/mock.json";
import { getSharedFixtureBrowserSkillSdk } from "../../../mocks/runtime/fixtureSkillSdk";
import { getEmbeddedMiniAppRuntimeConfig } from "../runtime/embeddedRuntime";
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
  UnregisterSessionListenerParams
} from "../types/jsapi";

type Channel = "jsapi" | "sdk";

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

interface SdkOptions {
  baseUrl: string;
  wsUrl: string;
}

const listenerWrappers = new Map<
  string,
  Map<RegisterSessionListenerParams["onMessage"], WrappedListener>
>();
const runtimeRouting = detectRuntimeRouting();
let sdkClient: SkillSdkApi | null = null;
let sdkClientKey: string | null = null;

function detectRuntimeRouting(): RuntimeRouting {
  if (typeof window === "undefined") {
    return {
      channel: "sdk",
      isMobile: false,
      hasHWH5: false
    };
  }

  const hostWindow = window as Window & { HWH5?: unknown };
  const userAgent = (window.navigator?.userAgent || "").toLowerCase();
  const maxTouchPoints = window.navigator?.maxTouchPoints || 0;
  const touchCapable = maxTouchPoints > 0 || "ontouchstart" in window;
  const mobileByUA = /(android|iphone|ipad|ipod|harmony|mobile)/.test(userAgent);
  const isMobile = mobileByUA && touchCapable;
  const hasHWH5 = typeof hostWindow.HWH5 !== "undefined";

  if (isMobile && hasHWH5) {
    return {
      channel: "jsapi",
      isMobile,
      hasHWH5
    };
  }

  return {
    channel: "sdk",
    isMobile,
    hasHWH5
  };
}

function checkJSAPI(): boolean {
  return runtimeRouting.channel === "jsapi";
}

function getSdkClient(): SkillSdkApi {
  const mockMode = resolveMockMode();
  const sdkOptions = resolveSdkOptions();
  const cacheKey = `${mockMode}:${sdkOptions.baseUrl}:${sdkOptions.wsUrl}`;

  if (sdkClient && sdkClientKey === cacheKey) {
    return sdkClient;
  }

  sdkClient =
    mockMode === "json"
      ? getSharedFixtureBrowserSkillSdk({
          runtimeKey: mockFixture.runtimeKey,
          fixtureData: mockFixture
        })
      : getSharedBrowserSkillSdk(sdkOptions);
  sdkClientKey = cacheKey;
  return sdkClient;
}

function resolveSdkOptions(): SdkOptions {
  const defaults: SdkOptions = {
    baseUrl: "http://127.0.0.1:19082",
    wsUrl: "ws://127.0.0.1:19082/ws/skill/stream"
  };
  const embeddedConfig = getEmbeddedMiniAppRuntimeConfig();

  if (embeddedConfig) {
    return {
      baseUrl: embeddedConfig.baseUrl,
      wsUrl: embeddedConfig.wsUrl
    };
  }

  if (typeof window === "undefined") {
    return defaults;
  }

  const params = new URLSearchParams(window.location.search);
  const baseUrl = params.get("baseUrl") || defaults.baseUrl;
  const wsUrl = params.get("wsUrl") || toWsUrl(baseUrl);

  return {
    baseUrl,
    wsUrl
  };
}

function toWsUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/ws/skill/stream";
    }

    return url.toString();
  } catch {
    return baseUrl;
  }
}

function parseSessionId(sessionId: string): number {
  return Number(sessionId);
}

function resolveMockMode(): "server" | "json" {
  const embeddedConfig = getEmbeddedMiniAppRuntimeConfig();

  if (embeddedConfig) {
    return embeddedConfig.mockMode;
  }

  if (typeof window === "undefined") {
    return mockFixture.defaultMode === "json" ? "json" : "server";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("mockMode") === "json" ? "json" : "server";
}

function toMiniRole(role: SDKSessionMessage["role"]): "USER" | "ASSISTANT" | "SYSTEM" | "TOOL" {
  if (role === "user") {
    return "USER";
  }

  if (role === "assistant") {
    return "ASSISTANT";
  }

  if (role === "tool") {
    return "TOOL";
  }

  return "SYSTEM";
}

function normalizeStreamMessage(raw: unknown): StreamMessage {
  const candidate = raw as Partial<SDKStreamMessage> & {
    sessionId?: string;
    properties?: StreamMessage["properties"];
    usage?: StreamMessage["usage"];
  };
  const sessionId = String(candidate.welinkSessionId ?? candidate.sessionId ?? "");
  const seq = typeof candidate.seq === "number" ? candidate.seq : 0;

  if (candidate.type === "text.delta" || candidate.type === "thinking.delta") {
    return {
      sessionId,
      type: "delta",
      seq,
      content: typeof candidate.content === "string" ? candidate.content : "",
      usage: candidate.usage
    };
  }

  if (candidate.type === "streaming") {
    return {
      sessionId,
      type: "message.part.updated",
      seq,
      content: buildPartsContent(candidate.parts),
      properties: {
        part: {
          id: candidate.partId || "streaming",
          sessionID: sessionId,
          type: "text",
          text: buildPartsContent(candidate.parts)
        }
      }
    };
  }

  if (candidate.type === "text.done" || candidate.type === "thinking.done") {
    return {
      sessionId,
      type: "done",
      seq,
      content: typeof candidate.content === "string" ? candidate.content : ""
    };
  }

  if (candidate.type === "tool.update") {
    return {
      sessionId,
      type: "message.updated",
      seq,
      content: candidate.output ?? candidate.content ?? candidate.toolName ?? ""
    };
  }

  if (candidate.type === "question") {
    return {
      sessionId,
      type: "message.updated",
      seq,
      content: candidate.question ?? candidate.content ?? ""
    };
  }

  if (candidate.type === "permission.ask") {
    return {
      sessionId,
      type: "message.updated",
      seq,
      content: candidate.title ?? candidate.content ?? ""
    };
  }

  if (candidate.type === "file") {
    return {
      sessionId,
      type: "message.updated",
      seq,
      content: candidate.fileName ?? candidate.content ?? ""
    };
  }

  if (typeof candidate.error === "string") {
    return {
      sessionId,
      type: "error",
      seq,
      content: candidate.error
    };
  }

  return {
    sessionId,
    type: "delta",
    seq,
    content: typeof candidate.content === "string" ? candidate.content : "",
    usage: candidate.usage
  };
}

function buildPartsContent(parts: SDKStreamMessage["parts"]): string {
  if (!parts?.length) {
    return "";
  }

  return parts
    .filter((part) => part.type === "text" || part.type === "thinking" || part.type === "file")
    .map((part) => part.content || part.question || "")
    .join("");
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
            code: String(candidate.code ?? "UNKNOWN"),
            message: String(candidate.message ?? "Unknown error"),
            timestamp: Number(candidate.timestamp ?? Date.now())
          });
        }
      : undefined,
    onClose: params.onClose
      ? (reason: unknown) => {
          params.onClose?.(String(reason ?? "closed"));
        }
      : undefined
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
  onMessage: RegisterSessionListenerParams["onMessage"]
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
  params: GetSessionMessageParams
): Promise<GetSessionMessageResult> {
  if (checkJSAPI()) {
    return window.HWH5!.getSessionMessage(params);
  }

  const sdkResult = await getSdkClient().getSessionMessage({
    welinkSessionId: parseSessionId(params.sessionId),
    page: params.page,
    size: params.size
  });

  return {
    content: sdkResult.content.map((message) => ({
      id: message.id,
      sessionId: message.welinkSessionId,
      seq: message.messageSeq,
      role: toMiniRole(message.role),
      content: message.content,
      contentType: "MARKDOWN",
      createdAt: message.createdAt
    })),
    totalElements: sdkResult.total,
    totalPages: sdkResult.size > 0 ? Math.ceil(sdkResult.total / sdkResult.size) : 0,
    number: sdkResult.page,
    size: sdkResult.size
  };
}

export function registerSessionListener(params: RegisterSessionListenerParams): void {
  if (checkJSAPI()) {
    window.HWH5!.registerSessionListener(params);
    return;
  }

  const wrapped = getOrCreateWrappedListener(params);
  getSdkClient().registerSessionListener({
    welinkSessionId: parseSessionId(params.sessionId),
    onMessage: wrapped.onMessage,
    onError: wrapped.onError,
    onClose: wrapped.onClose
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
    welinkSessionId: parseSessionId(params.sessionId),
    onMessage: wrapped.onMessage,
    onError: wrapped.onError,
    onClose: wrapped.onClose
  });
  deleteWrappedListener(params.sessionId, params.onMessage);
}

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  if (checkJSAPI()) {
    return window.HWH5!.sendMessage(params);
  }

  const result = await getSdkClient().sendMessage({
    welinkSessionId: parseSessionId(params.sessionId),
    content: params.content
  });

  return {
    messageId: result.id,
    seq: result.messageSeq,
    createdAt: result.createdAt
  };
}

export async function stopSkill(params: StopSkillParams): Promise<StopSkillResult> {
  if (checkJSAPI()) {
    return window.HWH5!.stopSkill(params);
  }

  const result = await getSdkClient().stopSkill({
    welinkSessionId: parseSessionId(params.sessionId)
  });

  return {
    status: result.status === "aborted" ? "success" : "failed"
  };
}

export async function sendMessageToIM(
  params: SendMessageToIMParams
): Promise<SendMessageToIMResult> {
  if (checkJSAPI()) {
    return window.HWH5!.sendMessageToIM(params);
  }

  const result = await getSdkClient().sendMessageToIM({
    welinkSessionId: parseSessionId(params.sessionId)
  });

  return {
    success: result.status === "success",
    chatId: result.chatId,
    contentLength: result.contentLength,
    errorMessage: result.status === "failed" ? "sendMessageToIM failed" : undefined
  };
}

export async function controlSkillWeCode(
  params: ControlSkillWeCodeParams
): Promise<ControlSkillWeCodeResult> {
  if (checkJSAPI()) {
    return window.HWH5!.controlSkillWeCode(params);
  }

  const result = await getSdkClient().controlSkillWeCode(params);

  return {
    status: result.status,
    errorMessage: result.status === "failed" ? "controlSkillWeCode failed" : undefined
  };
}

export function getSessionIdFromURL(): string | null {
  const embeddedConfig = getEmbeddedMiniAppRuntimeConfig();

  if (embeddedConfig) {
    return embeddedConfig.sessionId;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("sessionid") || urlParams.get("sessionId") || null;
}
