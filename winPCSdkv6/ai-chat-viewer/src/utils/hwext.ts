import type {
  StreamMessage,
  SendMessageResponse,
  GetSessionMessageResponse,
  StopSkillResponse,
  SendMessageToIMResponse,
  ReplyPermissionResponse,
  RegenerateAnswerResponse,
  ControlSkillWeCodeResponse,
} from '../types';

export interface HWH5EXTError {
  errorCode: number;
  errorMessage: string;
}

export interface RegisterSessionListenerParams {
  welinkSessionId: number;
  onMessage: (message: StreamMessage) => void;
  onError?: (error: HWH5EXTError) => void;
  onClose?: (reason: string) => void;
}

export interface SendMessageParams {
  welinkSessionId: number;
  content: string;
  toolCallId?: string;
}

export interface GetSessionMessageParams {
  welinkSessionId: number;
  page?: number;
  size?: number;
}

export interface StopSkillParams {
  welinkSessionId: number;
}

export interface SendMessageToIMParams {
  welinkSessionId: number;
  messageId?: number;
}

export interface ReplyPermissionParams {
  welinkSessionId: number;
  permId: string;
  response: 'once' | 'always' | 'reject';
}

export interface RegenerateAnswerParams {
  welinkSessionId: number;
}

export interface ControlSkillWeCodeParams {
  action: 'close' | 'minimize';
}

export type SkillWeCodeStatusChangeCallback = (status: 'closed' | 'minimized') => void;

export interface HWH5EXT {
  regenerateAnswer(params: RegenerateAnswerParams): Promise<RegenerateAnswerResponse>;
  sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResponse>;
  getSessionMessage(params: GetSessionMessageParams): Promise<GetSessionMessageResponse>;
  registerSessionListener(params: RegisterSessionListenerParams): void;
  unregisterSessionListener(params: RegisterSessionListenerParams): void;
  sendMessage(params: SendMessageParams): Promise<SendMessageResponse>;
  stopSkill(params: StopSkillParams): Promise<StopSkillResponse>;
  replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResponse>;
  controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResponse>;
  onSkillWecodeStatusChange?: (callback: SkillWeCodeStatusChangeCallback) => void;
}

interface PedestalApi {
  callMethod(methodName: string, ...args: unknown[]): Promise<unknown>;
}

interface PcSessionError {
  code: string;
  message: string;
  timestamp: number;
}

interface PcMessagePartSnapshot {
  partId: string;
  partSeq?: number;
  type: 'text' | 'thinking' | 'tool' | 'question' | 'permission' | 'file';
  content?: string;
  toolName?: string;
  toolCallId?: string;
  status?: string;
  header?: string;
  question?: string;
  options?: string[];
  fileName?: string;
  fileUrl?: string;
  fileMime?: string;
}

interface PcSessionMessage {
  id: number;
  welinkSessionId: number;
  userId: string | null;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  messageSeq: number;
  parts: Array<{
    partId: string;
    partSeq: number;
    type: 'text' | 'thinking' | 'tool' | 'question' | 'permission' | 'file';
    content?: string;
    toolName?: string;
    toolCallId?: string;
    toolStatus?: string;
    toolInput?: Record<string, unknown>;
    toolOutput?: string;
    header?: string;
    question?: string;
    options?: string[];
    permissionId?: string;
    fileName?: string;
    fileUrl?: string;
    fileMime?: string;
  }>;
  createdAt: string;
}

interface PcStreamMessage {
  type: string;
  seq: number;
  welinkSessionId: number;
  emittedAt: string;
  raw?: Record<string, unknown>;
  messageId?: string;
  messageSeq?: number;
  role?: 'user' | 'assistant' | 'system' | 'tool';
  partId?: string;
  partSeq?: number;
  content?: string;
  toolName?: string;
  toolCallId?: string;
  status?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  title?: string;
  header?: string;
  question?: string;
  options?: string[];
  fileName?: string;
  fileUrl?: string;
  fileMime?: string;
  tokens?: Record<string, unknown>;
  cost?: number;
  reason?: string;
  sessionStatus?: 'busy' | 'idle' | 'retry';
  permissionId?: string;
  permType?: string;
  metadata?: Record<string, unknown>;
  response?: 'once' | 'always' | 'reject';
  messages?: PcSessionMessage[];
  parts?: PcMessagePartSnapshot[];
}

interface PcSkillSdkLike {
  regenerateAnswer(params: RegenerateAnswerParams): Promise<RegenerateAnswerResponse>;
  sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResponse>;
  getSessionMessage(params: GetSessionMessageParams): Promise<GetSessionMessageResponse | {
    content: PcSessionMessage[];
    page: number;
    size: number;
    total: number;
  }>;
  registerSessionListener(params: {
    welinkSessionId: number;
    onMessage: (message: PcStreamMessage) => void;
    onError?: (error: PcSessionError) => void;
    onClose?: (reason: string) => void;
  }): void;
  unregisterSessionListener(params: {
    welinkSessionId: number;
    onMessage: (message: PcStreamMessage) => void;
    onError?: (error: PcSessionError) => void;
    onClose?: (reason: string) => void;
  }): void;
  sendMessage(params: SendMessageParams): Promise<SendMessageResponse>;
  stopSkill(params: StopSkillParams): Promise<StopSkillResponse>;
  replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResponse>;
  controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResponse>;
  onSkillWecodeStatusChange?: (params: {
    callback: (result: { status: 'closed' | 'minimized' }) => void;
  }) => void;
}

interface ListenerRegistration {
  params: RegisterSessionListenerParams;
  wrapped: {
    welinkSessionId: number;
    onMessage: (message: PcStreamMessage) => void;
    onError?: (error: PcSessionError) => void;
    onClose?: (reason: string) => void;
  };
}

const listenerRegistry = new Map<number, ListenerRegistration[]>();
let pcSdkPromise: Promise<PcSkillSdkLike> | null = null;

declare global {
  interface Window {
    HWH5EXT?: HWH5EXT;
    Pedestal?: PedestalApi;
  }
}

function isMobileEnv(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent);
}

function getGlobalHWH5EXT(): HWH5EXT | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.HWH5EXT ?? null;
}

function getPedestal(): PedestalApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.Pedestal ?? null;
}

function ensurePcSkillSdkLike(candidate: unknown): PcSkillSdkLike {
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as PcSkillSdkLike).getSessionMessage === 'function' &&
    typeof (candidate as PcSkillSdkLike).sendMessage === 'function' &&
    typeof (candidate as PcSkillSdkLike).registerSessionListener === 'function'
  ) {
    return candidate as PcSkillSdkLike;
  }

  throw new Error('Pedestal.getSharedBrowserSkillSdk did not return a valid PC SDK instance.');
}

async function getPcSkillSdk(): Promise<PcSkillSdkLike> {
  if (pcSdkPromise) {
    return pcSdkPromise;
  }

  pcSdkPromise = (async () => {
    const pedestal = getPedestal();

    if (!pedestal || typeof pedestal.callMethod !== 'function') {
      throw new Error('Pedestal.callMethod is not available in the current environment.');
    }

    const sdk = await pedestal.callMethod('getSharedBrowserSkillSdk');
    return ensurePcSkillSdkLike(sdk);
  })();

  return pcSdkPromise;
}

function normalizeErrorCode(code: string): number {
  const parsed = Number(code);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSessionMessageContent(
  message: PcSessionMessage | GetSessionMessageResponse['content'][number],
): GetSessionMessageResponse['content'][number] {
  return {
    id: message.id,
    welinkSessionId: message.welinkSessionId,
    userId: message.userId,
    role: message.role,
    content: message.content,
    messageSeq: message.messageSeq,
    parts: (message.parts ?? []).map((part) => ({
      partId: part.partId,
      partSeq: part.partSeq,
      type: part.type,
      content: part.content ?? '',
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      toolStatus: 'toolStatus' in part ? part.toolStatus : undefined,
      toolInput: 'toolInput' in part ? part.toolInput : undefined,
      toolOutput: 'toolOutput' in part ? part.toolOutput : undefined,
      header: part.header,
      question: part.question,
      options: part.options,
      permissionId: 'permissionId' in part ? part.permissionId : undefined,
      fileName: part.fileName,
      fileUrl: part.fileUrl,
      fileMime: part.fileMime,
    })),
    createdAt: message.createdAt,
  };
}

function normalizeStreamMessage(message: StreamMessage | PcStreamMessage): StreamMessage {
  return {
    ...message,
    type: message.type as StreamMessage['type'],
    welinkSessionId: String(message.welinkSessionId),
    status: message.status as StreamMessage['status'],
    messages: message.messages?.map((item) => ({
      id: String(item.id),
      seq: item.messageSeq,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
      parts: item.parts.map((part) => ({
        partId: part.partId,
        partSeq: part.partSeq,
        type: part.type,
        content: part.content,
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        status: 'toolStatus' in part ? part.toolStatus : part.status,
        header: part.header,
        question: part.question,
        options: part.options,
        fileName: part.fileName,
        fileUrl: part.fileUrl,
        fileMime: part.fileMime,
      })),
    })),
    parts: message.parts?.map((part) => ({
      partId: part.partId,
      partSeq: part.partSeq,
      type: part.type,
      content: part.content,
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      status: part.status,
      header: part.header,
      question: part.question,
      options: part.options,
      fileName: part.fileName,
      fileUrl: part.fileUrl,
      fileMime: part.fileMime,
    })),
  };
}

function registerPcListener(params: RegisterSessionListenerParams, sdk: PcSkillSdkLike): void {
  const wrapped: ListenerRegistration['wrapped'] = {
    welinkSessionId: params.welinkSessionId,
    onMessage: (message) => {
      params.onMessage(normalizeStreamMessage(message));
    },
    onError: params.onError
      ? (error) => {
          params.onError?.({
            errorCode: normalizeErrorCode(error.code),
            errorMessage: error.message,
          });
        }
      : undefined,
    onClose: params.onClose,
  };

  const current = listenerRegistry.get(params.welinkSessionId) ?? [];
  current.push({ params, wrapped });
  listenerRegistry.set(params.welinkSessionId, current);
  sdk.registerSessionListener(wrapped);
}

function findListenerRegistration(params: RegisterSessionListenerParams): ListenerRegistration | null {
  const current = listenerRegistry.get(params.welinkSessionId);

  if (!current || current.length === 0) {
    return null;
  }

  const exact = current.find((entry) =>
    entry.params.onMessage === params.onMessage &&
    entry.params.onError === params.onError &&
    entry.params.onClose === params.onClose,
  );

  if (exact) {
    return exact;
  }

  return current.length === 1 ? current[0] : null;
}

function unregisterPcListener(params: RegisterSessionListenerParams, sdk: PcSkillSdkLike): void {
  const current = listenerRegistry.get(params.welinkSessionId);
  const matched = findListenerRegistration(params);

  if (!current || !matched) {
    return;
  }

  sdk.unregisterSessionListener(matched.wrapped);

  const next = current.filter((entry) => entry !== matched);

  if (next.length === 0) {
    listenerRegistry.delete(params.welinkSessionId);
    return;
  }

  listenerRegistry.set(params.welinkSessionId, next);
}

function createPcBridge(sdk: PcSkillSdkLike): HWH5EXT {
  return {
    regenerateAnswer: (params) => sdk.regenerateAnswer(params),
    sendMessageToIM: (params) => sdk.sendMessageToIM(params),
    getSessionMessage: async (params) => {
      const result = await sdk.getSessionMessage(params);

      return {
        ...result,
        content: result.content.map(normalizeSessionMessageContent),
      };
    },
    registerSessionListener: (params) => registerPcListener(params, sdk),
    unregisterSessionListener: (params) => unregisterPcListener(params, sdk),
    sendMessage: (params) => sdk.sendMessage(params),
    stopSkill: (params) => sdk.stopSkill(params),
    replyPermission: (params) => sdk.replyPermission(params),
    controlSkillWeCode: (params) => sdk.controlSkillWeCode(params),
    onSkillWecodeStatusChange: sdk.onSkillWecodeStatusChange
      ? (callback) => {
          sdk.onSkillWecodeStatusChange?.({
            callback: (result) => callback(result.status),
          });
        }
      : undefined,
  };
}

export async function resolveRuntimeBridge(overrideBridge?: HWH5EXT): Promise<HWH5EXT> {
  if (overrideBridge) {
    return overrideBridge;
  }

  const globalHWH5EXT = getGlobalHWH5EXT();

  if (isMobileEnv() && globalHWH5EXT) {
    return globalHWH5EXT;
  }

  if (getPedestal()) {
    const sdk = await getPcSkillSdk();
    return createPcBridge(sdk);
  }

  if (globalHWH5EXT) {
    return globalHWH5EXT;
  }

  throw new Error(
    'Neither mobile JSAPI nor PC Skill SDK is available. Expected window.HWH5EXT or window.Pedestal.callMethod.',
  );
}

export async function regenerateAnswer(params: RegenerateAnswerParams): Promise<RegenerateAnswerResponse> {
  return (await resolveRuntimeBridge()).regenerateAnswer(params);
}

export async function sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResponse> {
  return (await resolveRuntimeBridge()).sendMessageToIM(params);
}

export async function getSessionMessage(params: GetSessionMessageParams): Promise<GetSessionMessageResponse> {
  return (await resolveRuntimeBridge()).getSessionMessage(params);
}

export async function registerSessionListener(params: RegisterSessionListenerParams): Promise<void> {
  return (await resolveRuntimeBridge()).registerSessionListener(params);
}

export async function unregisterSessionListener(params: RegisterSessionListenerParams): Promise<void> {
  return (await resolveRuntimeBridge()).unregisterSessionListener(params);
}

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
  return (await resolveRuntimeBridge()).sendMessage(params);
}

export async function stopSkill(params: StopSkillParams): Promise<StopSkillResponse> {
  return (await resolveRuntimeBridge()).stopSkill(params);
}

export async function replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResponse> {
  return (await resolveRuntimeBridge()).replyPermission(params);
}

export async function controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResponse> {
  return (await resolveRuntimeBridge()).controlSkillWeCode(params);
}

export async function onSkillWecodeStatusChange(callback: SkillWeCodeStatusChangeCallback): Promise<void> {
  const ext = await resolveRuntimeBridge();
  if (ext.onSkillWecodeStatusChange) {
    ext.onSkillWecodeStatusChange(callback);
  }
}

export function parseWelinkSessionId(): number | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('welinkSessionId');
  if (sessionId) {
    const parsed = parseInt(sessionId, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}
