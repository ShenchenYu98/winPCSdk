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

import {getSharedBrowserSkillSdk} from '../../../src/sdk/runtime/browserSkillSdkSingleton'

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

export async function getSessionMessage(params: GetSessionMessageParams): Promise<any> {
  const sdk = await getPCSdk();
  return sdk.getSessionMessage(params);
}

export function registerSessionListener(params: any): void {
  const sdk = getSharedBrowserSkillSdk();
  return sdk.registerSessionListener(params);
}

export function unregisterSessionListener(params: any): void {
  const sdk = getSharedBrowserSkillSdk();
  return sdk.unregisterSessionListener(params);
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
