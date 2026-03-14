export type SessionStatus = "executing" | "stopped" | "completed";
export type SkillWecodeStatus = "closed" | "minimized";
export type SkillWeCodeAction = "close" | "minimize";
export type PermissionResponse = "once" | "always" | "reject";
export type SessionRole = "user" | "assistant" | "system" | "tool";

export interface SkillSession {
  welinkSessionId: string;
  userId: string;
  ak: string | null;
  title: string | null;
  imGroupId: string | null;
  status: string;
  toolSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionParams {
  ak?: string;
  title?: string;
  imGroupId: string;
}

export interface StopSkillParams {
  welinkSessionId: string;
}

export interface RegenerateAnswerParams {
  welinkSessionId: string;
}

export interface OnSessionStatusChangeParams {
  welinkSessionId: string;
  callback: (result: SessionStatusResult) => void;
}

export interface OnSkillWecodeStatusChangeParams {
  callback: (result: SkillWecodeStatusResult) => void;
}

export interface GetSessionMessageParams {
  welinkSessionId: string;
  page?: number;
  size?: number;
}

export interface RegisterSessionListenerParams {
  welinkSessionId: string;
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SessionError) => void;
  onClose?: (reason: string) => void;
}

export interface UnregisterSessionListenerParams {
  welinkSessionId: string;
}

export interface SendMessageParams {
  welinkSessionId: string;
  content: string;
  toolCallId?: string;
}

export interface ReplyPermissionParams {
  welinkSessionId: string;
  permId: string;
  response: PermissionResponse;
}

export interface ControlSkillWeCodeParams {
  action: SkillWeCodeAction;
}

export interface SendMessageToIMParams {
  welinkSessionId: string;
  messageId?: string;
  chatId?: string;
}

export interface SessionError {
  code: string;
  message: string;
  timestamp: number;
}

export interface SDKError {
  errorCode: number;
  errorMessage: string;
}

export interface PageResult<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
}

export interface SessionMessagePart {
  partId: string;
  partSeq: number;
  type: "text" | "thinking" | "tool" | "question" | "permission" | "file";
  content?: string | null;
  toolName?: string | null;
  toolCallId?: string | null;
  input?: Record<string, unknown> | null;
  output?: string | null;
  error?: string | null;
  title?: string | null;
  header?: string | null;
  question?: string | null;
  options?: string[] | null;
  permissionId?: string | null;
  permType?: string | null;
  metadata?: Record<string, unknown> | null;
  response?: PermissionResponse | null;
  status?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  fileMime?: string | null;
}

export interface SessionMessage {
  id: string;
  seq: number | null;
  welinkSessionId: string;
  role: SessionRole;
  content: string | null;
  contentType: string | null;
  meta?: Record<string, unknown> | null;
  messageSeq: number | null;
  parts?: SessionMessagePart[] | null;
  createdAt: string;
}

export interface StreamMessage {
  type: string;
  seq: number | null;
  welinkSessionId: string;
  emittedAt: string | null;
  raw?: Record<string, unknown>;
  messageId?: string | null;
  sourceMessageId?: string | null;
  messageSeq?: number | null;
  role?: SessionRole | null;
  partId?: string | null;
  partSeq?: number | null;
  content?: string | null;
  toolName?: string | null;
  toolCallId?: string | null;
  status?: string | null;
  input?: Record<string, unknown> | null;
  output?: string | null;
  error?: string | null;
  title?: string | null;
  header?: string | null;
  question?: string | null;
  options?: string[] | null;
  fileName?: string | null;
  fileUrl?: string | null;
  fileMime?: string | null;
  tokens?: Record<string, unknown> | null;
  cost?: number | null;
  reason?: string | null;
  sessionStatus?: "busy" | "idle" | "retry" | null;
  permissionId?: string | null;
  permType?: string | null;
  metadata?: Record<string, unknown> | null;
  response?: PermissionResponse | null;
  messages?: SessionMessage[] | null;
  parts?: SessionMessagePart[] | null;
}

export interface SendMessageResult {
  id: string;
  seq: number | null;
  welinkSessionId: string;
  role: SessionRole;
  content: string | null;
  contentType: string | null;
  meta?: Record<string, unknown> | null;
  messageSeq: number | null;
  parts?: SessionMessagePart[] | null;
  createdAt: string;
}

export interface StopSkillResult {
  welinkSessionId: string;
  status: "aborted";
}

export interface CloseSkillResult {
  status: "success" | "failed";
}

export interface ReplyPermissionResult {
  welinkSessionId: string;
  permissionId: string;
  response: PermissionResponse;
}

export interface ControlSkillWeCodeResult {
  status: "success" | "failed";
}

export interface SendMessageToIMResult {
  success: boolean;
}

export interface SessionStatusResult {
  status: SessionStatus;
}

export interface SkillWecodeStatusResult {
  status: SkillWecodeStatus;
  timestamp: number;
  message?: string;
}

export interface RegisterSessionListenerResult {
  status: "success";
}

export interface UnregisterSessionListenerResult {
  status: "success";
}

export interface SkillSdkApi {
  createSession(params: CreateSessionParams): Promise<SkillSession>;
  closeSkill(): Promise<CloseSkillResult>;
  stopSkill(params: StopSkillParams): Promise<StopSkillResult>;
  onSessionStatusChange(params: OnSessionStatusChangeParams): void;
  onSkillWecodeStatusChange(params: OnSkillWecodeStatusChangeParams): void;
  regenerateAnswer(params: RegenerateAnswerParams): Promise<SendMessageResult>;
  sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult>;
  getSessionMessage(params: GetSessionMessageParams): Promise<PageResult<SessionMessage>>;
  registerSessionListener(
    params: RegisterSessionListenerParams
  ): RegisterSessionListenerResult;
  unregisterSessionListener(
    params: UnregisterSessionListenerParams
  ): UnregisterSessionListenerResult;
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult>;
  controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResult>;
}
