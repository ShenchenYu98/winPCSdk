import type {
  StreamMessage,
  StreamMessageType,
  SendMessageResponse,
  GetSessionMessageResponse,
  SessionMessageSnapshot,
  MessagePartSnapshot,
  SessionMessage as ViewerSessionMessage,
  SessionMessagePart as ViewerSessionMessagePart,
  StopSkillResponse,
  SendMessageToIMResponse,
  ReplyPermissionResponse,
  RegenerateAnswerResponse,
  ControlSkillWeCodeResponse,
} from '../types';
import type {
  SessionError as SdkSessionError,
  SessionMessage as SdkSessionMessage,
  SessionMessagePart as SdkSessionMessagePart,
  StreamMessage as SdkStreamMessage,
} from '../../../src/sdk';

import { getSharedBrowserSkillSdk } from '../../../src/sdk/runtime/browserSkillSdkSingleton'

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

export interface UnregisterSessionListenerParams {
  welinkSessionId: number;
  onMessage?: (message: StreamMessage) => void;
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
  unregisterSessionListener(params: UnregisterSessionListenerParams): void;
  sendMessage(params: SendMessageParams): Promise<SendMessageResponse>;
  stopSkill(params: StopSkillParams): Promise<StopSkillResponse>;
  replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResponse>;
  controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResponse>;
  onSkillWecodeStatusChange?: (callback: SkillWeCodeStatusChangeCallback) => void;
}

declare global {
  interface Window {
    HWH5EXT: HWH5EXT;
  }
}

async function getPCSdk() {
  const sdk = getSharedBrowserSkillSdk();
  return sdk;  
}

const viewerStreamTypes = new Set<StreamMessageType>([
  'text.delta',
  'text.done',
  'thinking.delta',
  'thinking.done',
  'tool.update',
  'question',
  'file',
  'step.start',
  'step.done',
  'session.status',
  'session.title',
  'session.error',
  'permission.ask',
  'permission.reply',
  'agent.online',
  'agent.offline',
  'error',
  'snapshot',
  'streaming',
]);

interface ListenerAdapterRecord {
  original: RegisterSessionListenerParams;
  adapted: {
    welinkSessionId: number;
    onMessage: (message: SdkStreamMessage) => void;
    onError?: (error: SdkSessionError) => void;
    onClose?: (reason: string) => void;
  };
}

const listenerAdapterStore = new Map<number, Set<ListenerAdapterRecord>>();

function isViewerStreamType(type: string): type is StreamMessageType {
  return viewerStreamTypes.has(type as StreamMessageType);
}

function isViewerToolStatus(
  status: string | undefined,
): status is NonNullable<ViewerSessionMessagePart['toolStatus']> {
  return (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'error'
  );
}

function adaptSessionError(error: SdkSessionError): HWH5EXTError {
  const parsed = Number.parseInt(error.code, 10);

  return {
    errorCode: Number.isFinite(parsed) ? parsed : 5000,
    errorMessage: error.message,
  };
}

function adaptSessionMessagePart(part: SdkSessionMessagePart): ViewerSessionMessagePart {
  return {
    partId: part.partId,
    partSeq: part.partSeq,
    type: part.type,
    content: part.content ?? '',
    toolName: part.toolName,
    toolCallId: part.toolCallId,
    toolStatus: isViewerToolStatus(part.toolStatus) ? part.toolStatus : undefined,
    toolInput: part.toolInput,
    toolOutput: part.toolOutput,
    question: part.question,
    options: part.options,
    permissionId: part.permissionId,
    fileName: part.fileName,
    fileUrl: part.fileUrl,
    fileMime: part.fileMime,
  };
}

function adaptMessagePartSnapshot(part: SdkSessionMessagePart): MessagePartSnapshot {
  return {
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
    fileMime: part.fileMime,
  };
}

function adaptSessionMessage(message: SdkSessionMessage): ViewerSessionMessage {
  return {
    id: message.id,
    welinkSessionId: message.welinkSessionId,
    userId: message.userId,
    role: message.role,
    content: message.content,
    messageSeq: message.messageSeq,
    parts: message.parts.map(adaptSessionMessagePart),
    createdAt: message.createdAt,
  };
}

function adaptSessionMessageSnapshot(message: SdkSessionMessage): SessionMessageSnapshot {
  return {
    id: String(message.id),
    seq: message.messageSeq,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    parts: message.parts.map(adaptMessagePartSnapshot),
  };
}

function adaptStreamMessage(message: SdkStreamMessage): StreamMessage {
  return {
    ...message,
    type: isViewerStreamType(message.type) ? message.type : 'error',
    welinkSessionId: String(message.welinkSessionId),
    status: isViewerToolStatus(message.status) ? message.status : undefined,
    messages: message.messages?.map(adaptSessionMessageSnapshot),
    parts: message.parts?.map(adaptMessagePartSnapshot),
  };
}

function getListenerRecords(sessionId: number): Set<ListenerAdapterRecord> {
  let records = listenerAdapterStore.get(sessionId);

  if (!records) {
    records = new Set<ListenerAdapterRecord>();
    listenerAdapterStore.set(sessionId, records);
  }

  return records;
}

function matchesListenerRecord(
  params: UnregisterSessionListenerParams,
  record: ListenerAdapterRecord,
): boolean {
  return (
    (!params.onMessage || record.original.onMessage === params.onMessage) &&
    (!params.onError || record.original.onError === params.onError) &&
    (!params.onClose || record.original.onClose === params.onClose)
  );
}

function getHWH5EXT(): HWH5EXT {
  if (typeof window !== 'undefined' && window.HWH5EXT) {
    return window.HWH5EXT;
  }
  throw new Error('HWH5EXT is not available. This code must run in WeLink miniapp environment.');
}

export async function regenerateAnswer(params: RegenerateAnswerParams): Promise<RegenerateAnswerResponse> {
  const sdk = await getPCSdk();
  return sdk.regenerateAnswer(params);
}

export async function sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResponse> {
  const sdk = await getPCSdk();
  return sdk.sendMessageToIM(params);
}

export async function getSessionMessage(params: GetSessionMessageParams): Promise<GetSessionMessageResponse> {
  const sdk = await getPCSdk();
  const result = await sdk.getSessionMessage(params);

  return {
    content: result.content.map(adaptSessionMessage),
    page: result.page,
    size: result.size,
    total: result.total,
  };
}

export async function registerSessionListener(params: RegisterSessionListenerParams): Promise<void> {
  const sdk = await getPCSdk();
  const record: ListenerAdapterRecord = {
    original: params,
    adapted: {
      welinkSessionId: params.welinkSessionId,
      onMessage: (message) => params.onMessage(adaptStreamMessage(message)),
      onError: params.onError
        ? (error) => params.onError?.(adaptSessionError(error))
        : undefined,
      onClose: params.onClose,
    },
  };

  getListenerRecords(params.welinkSessionId).add(record);
  return sdk.registerSessionListener(record.adapted);
}

export async function unregisterSessionListener(
  params: UnregisterSessionListenerParams,
): Promise<void> {
  const sdk = await getPCSdk();
  const records = listenerAdapterStore.get(params.welinkSessionId);

  if (!records || records.size === 0) {
    return;
  }

  for (const record of [...records]) {
    if (!matchesListenerRecord(params, record)) {
      continue;
    }

    sdk.unregisterSessionListener(record.adapted);
    records.delete(record);
  }

  if (records.size === 0) {
    listenerAdapterStore.delete(params.welinkSessionId);
  }
}

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
  const sdk = await getPCSdk();
  return sdk.sendMessage(params);
}

export async function stopSkill(params: StopSkillParams): Promise<StopSkillResponse> {
  const sdk = await getPCSdk();
  return sdk.stopSkill(params);
}

export async function replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResponse> {
  const sdk = await getPCSdk();
  return sdk.replyPermission(params);
}

export async function controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResponse> {
  const sdk = await getPCSdk();
  return sdk.controlSkillWeCode(params);
}

export function onSkillWecodeStatusChange(callback: SkillWeCodeStatusChangeCallback): void {
  const ext = getHWH5EXT();
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
