import type {
  ControlSkillWeCodeResponse,
  GetSessionMessageResponse,
  RegenerateAnswerResponse,
  ReplyPermissionResponse,
  SendMessageResponse,
  SendMessageToIMResponse,
  SessionMessage,
  SessionMessagePart,
  StopSkillResponse,
  StreamMessage
} from "../types";

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
  response: "once" | "always" | "reject";
}

export interface RegenerateAnswerParams {
  welinkSessionId: number;
}

export interface ControlSkillWeCodeParams {
  action: "close" | "minimize";
}

export type SkillWeCodeStatusChangeCallback = (status: "closed" | "minimized") => void;

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

interface PedestalBridge {
  callMethod(methodName: string, ...args: unknown[]): Promise<unknown>;
}

interface PcSdkError {
  errorCode?: number;
  errorMessage?: string;
  code?: string;
  message?: string;
}

interface PcSessionError {
  code?: string;
  message?: string;
  timestamp?: number;
}

interface PcSessionMessagePart {
  partId: string;
  partSeq: number;
  type: SessionMessagePart["type"];
  content?: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: string;
  toolInput?: object;
  toolOutput?: string;
  question?: string;
  options?: string[];
  permissionId?: string;
  fileName?: string;
  fileUrl?: string;
  fileMime?: string;
}

interface PcSessionMessage {
  id: number;
  welinkSessionId: number;
  userId: string | null;
  role: SessionMessage["role"];
  content: string;
  messageSeq: number;
  parts: PcSessionMessagePart[];
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
  role?: SessionMessage["role"];
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
  sessionStatus?: "busy" | "idle" | "retry";
  permissionId?: string;
  permType?: string;
  metadata?: Record<string, unknown>;
  response?: "once" | "always" | "reject";
  messages?: PcSessionMessage[];
  parts?: PcSessionMessagePart[];
}

interface PcSkillSdk {
  regenerateAnswer(params: RegenerateAnswerParams): Promise<RegenerateAnswerResponse>;
  sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResponse>;
  getSessionMessage(params: GetSessionMessageParams): Promise<{
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
  onSkillWecodeStatusChange(params: {
    callback: (result: { status: "closed" | "minimized" }) => void;
  }): void;
}

interface WrappedPcListener {
  onMessage: (message: PcStreamMessage) => void;
  onError?: (error: PcSessionError) => void;
  onClose?: (reason: string) => void;
}

declare global {
  interface Window {
    HWH5EXT?: HWH5EXT;
    Pedestal?: PedestalBridge;
  }
}

let pcSdkPromise: Promise<PcSkillSdk> | null = null;
const listenerWrappers = new Map<number, WrappedPcListener>();

function isMobileRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;
  const touchCapable = maxTouchPoints > 0 || "ontouchstart" in window;

  return /(android|iphone|ipad|ipod|mobile|harmony)/.test(userAgent) && touchCapable;
}

function shouldUseJsapi(): boolean {
  return isMobileRuntime() && typeof window !== "undefined" && typeof window.HWH5EXT !== "undefined";
}

function getHWH5EXT(): HWH5EXT {
  if (typeof window !== "undefined" && window.HWH5EXT) {
    return window.HWH5EXT;
  }

  throw new Error("HWH5EXT 不可用，当前不是移动端小程序环境");
}

async function getPcSdk(): Promise<PcSkillSdk> {
  if (typeof window === "undefined" || !window.Pedestal?.callMethod) {
    throw new Error("Pedestal.callMethod 不可用，无法获取 PC SDK 实例");
  }

  if (!pcSdkPromise) {
    pcSdkPromise = window.Pedestal.callMethod("getSharedBrowserSkillSdk") as Promise<PcSkillSdk>;
  }

  return pcSdkPromise;
}

function normalizePcError(error: unknown): never {
  const candidate = error as PcSdkError;

  if (typeof candidate?.errorCode === "number" && typeof candidate?.errorMessage === "string") {
    throw candidate;
  }

  throw new Error(candidate?.message || "PC SDK 调用失败");
}

function normalizePcSessionError(error: PcSessionError): HWH5EXTError {
  const numericCode = Number(error.code);

  return {
    errorCode: Number.isFinite(numericCode) ? numericCode : 0,
    errorMessage: error.message ?? "PC SDK 会话监听错误"
  };
}

function mapPcPart(part: PcSessionMessagePart): SessionMessagePart {
  return {
    partId: part.partId,
    partSeq: part.partSeq,
    type: part.type,
    content: part.content ?? "",
    toolName: part.toolName,
    toolCallId: part.toolCallId,
    toolStatus: part.toolStatus as SessionMessagePart["toolStatus"],
    toolInput: part.toolInput,
    toolOutput: part.toolOutput,
    question: part.question,
    options: part.options,
    permissionId: part.permissionId,
    fileName: part.fileName,
    fileUrl: part.fileUrl,
    fileMime: part.fileMime
  };
}

function mapPcSessionMessage(message: PcSessionMessage): SessionMessage {
  return {
    id: message.id,
    welinkSessionId: message.welinkSessionId,
    userId: message.userId,
    role: message.role,
    content: message.content,
    messageSeq: message.messageSeq,
    parts: message.parts.map(mapPcPart),
    createdAt: message.createdAt
  };
}

function mapPcStreamMessage(message: PcStreamMessage): StreamMessage {
  return {
    ...message,
    type: message.type as StreamMessage["type"],
    status: message.status as StreamMessage["status"],
    welinkSessionId: String(message.welinkSessionId),
    messages: message.messages?.map((item) => ({
      id: String(item.id),
      seq: item.messageSeq,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
      parts: item.parts?.map((part) => ({
        partId: part.partId,
        partSeq: part.partSeq,
        type: part.type,
        content: part.content,
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        status: part.toolStatus,
        question: part.question,
        options: part.options,
        fileName: part.fileName,
        fileUrl: part.fileUrl,
        fileMime: part.fileMime
      }))
    })),
    parts: message.parts?.map((part) => ({
      partId: part.partId,
      partSeq: part.partSeq,
      type: part.type,
      content: part.content,
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      status: part.toolStatus,
      question: part.question,
      options: part.options,
      fileName: part.fileName,
      fileUrl: part.fileUrl,
      fileMime: part.fileMime
    }))
  };
}

export async function regenerateAnswer(
  params: RegenerateAnswerParams
): Promise<RegenerateAnswerResponse> {
  if (shouldUseJsapi()) {
    return getHWH5EXT().regenerateAnswer(params);
  }

  try {
    const sdk = await getPcSdk();
    return await sdk.regenerateAnswer(params);
  } catch (error) {
    normalizePcError(error);
  }
}

export async function sendMessageToIM(
  params: SendMessageToIMParams
): Promise<SendMessageToIMResponse> {
  if (shouldUseJsapi()) {
    return getHWH5EXT().sendMessageToIM(params);
  }

  try {
    const sdk = await getPcSdk();
    return await sdk.sendMessageToIM(params);
  } catch (error) {
    normalizePcError(error);
  }
}

export async function getSessionMessage(
  params: GetSessionMessageParams
): Promise<GetSessionMessageResponse> {
  if (shouldUseJsapi()) {
    return getHWH5EXT().getSessionMessage(params);
  }

  try {
    const sdk = await getPcSdk();
    const result = await sdk.getSessionMessage(params);

    return {
      ...result,
      content: result.content.map(mapPcSessionMessage)
    };
  } catch (error) {
    normalizePcError(error);
  }
}

export function registerSessionListener(params: RegisterSessionListenerParams): void {
  if (shouldUseJsapi()) {
    getHWH5EXT().registerSessionListener(params);
    return;
  }

  const wrapped: WrappedPcListener = {
    onMessage: (message) => {
      params.onMessage(mapPcStreamMessage(message));
    },
    onError: params.onError
      ? (error) => {
          params.onError?.(normalizePcSessionError(error));
        }
      : undefined,
    onClose: params.onClose
  };

  listenerWrappers.set(params.welinkSessionId, wrapped);

  void getPcSdk()
    .then((sdk) => {
      sdk.registerSessionListener({
        welinkSessionId: params.welinkSessionId,
        onMessage: wrapped.onMessage,
        onError: wrapped.onError,
        onClose: wrapped.onClose
      });
    })
    .catch((error) => {
      params.onError?.(normalizePcSessionError(error as PcSessionError));
    });
}

export function unregisterSessionListener(params: RegisterSessionListenerParams): void {
  if (shouldUseJsapi()) {
    getHWH5EXT().unregisterSessionListener(params);
    return;
  }

  const wrapped = listenerWrappers.get(params.welinkSessionId);

  if (!wrapped) {
    return;
  }

  listenerWrappers.delete(params.welinkSessionId);

  void getPcSdk().then((sdk) => {
    sdk.unregisterSessionListener({
      welinkSessionId: params.welinkSessionId,
      onMessage: wrapped.onMessage,
      onError: wrapped.onError,
      onClose: wrapped.onClose
    });
  });
}

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
  if (shouldUseJsapi()) {
    return getHWH5EXT().sendMessage(params);
  }

  try {
    const sdk = await getPcSdk();
    return await sdk.sendMessage(params);
  } catch (error) {
    normalizePcError(error);
  }
}

export async function stopSkill(params: StopSkillParams): Promise<StopSkillResponse> {
  if (shouldUseJsapi()) {
    return getHWH5EXT().stopSkill(params);
  }

  try {
    const sdk = await getPcSdk();
    return await sdk.stopSkill(params);
  } catch (error) {
    normalizePcError(error);
  }
}

export async function replyPermission(
  params: ReplyPermissionParams
): Promise<ReplyPermissionResponse> {
  if (shouldUseJsapi()) {
    return getHWH5EXT().replyPermission(params);
  }

  try {
    const sdk = await getPcSdk();
    return await sdk.replyPermission(params);
  } catch (error) {
    normalizePcError(error);
  }
}

export async function controlSkillWeCode(
  params: ControlSkillWeCodeParams
): Promise<ControlSkillWeCodeResponse> {
  if (shouldUseJsapi()) {
    return getHWH5EXT().controlSkillWeCode(params);
  }

  try {
    const sdk = await getPcSdk();
    return await sdk.controlSkillWeCode(params);
  } catch (error) {
    normalizePcError(error);
  }
}

export function onSkillWecodeStatusChange(callback: SkillWeCodeStatusChangeCallback): void {
  if (shouldUseJsapi()) {
    const ext = getHWH5EXT();

    if (ext.onSkillWecodeStatusChange) {
      ext.onSkillWecodeStatusChange(callback);
    }
    return;
  }

  void getPcSdk().then((sdk) => {
    sdk.onSkillWecodeStatusChange({
      callback: ({ status }) => callback(status)
    });
  });
}

export function parseWelinkSessionId(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get("welinkSessionId");

  if (!sessionId) {
    return null;
  }

  const parsed = Number.parseInt(sessionId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
