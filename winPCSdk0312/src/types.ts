export type SessionStatus = "executing" | "stopped" | "completed";
export type SkillWecodeStatus = "closed" | "minimized";
export type SkillWeCodeAction = "close" | "minimize";
export type PermissionResponse = "once" | "always" | "reject";

export interface SkillSession {
  welinkSessionId: number;
  userId: string;
  ak: string;
  title: string;
  imGroupId: string;
  status: string;
  toolSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionParams {
  ak: string;
  title?: string;
  imGroupId: string;
}

export interface StopSkillParams {
  welinkSessionId: number;
}

export interface RegenerateAnswerParams {
  welinkSessionId: number;
}

export interface OnSessionStatusChangeParams {
  welinkSessionId: number;
  callback: (result: SessionStatusResult) => void;
}

export interface OnSkillWecodeStatusChangeParams {
  callback: (result: SkillWecodeStatusResult) => void;
}

export interface GetSessionMessageParams {
  welinkSessionId: number;
  page?: number;
  size?: number;
}

export interface RegisterSessionListenerParams {
  welinkSessionId: number;
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SessionError) => void;
  onClose?: (reason: string) => void;
}

export interface UnregisterSessionListenerParams {
  welinkSessionId: number;
}

export interface SendMessageParams {
  welinkSessionId: number;
  content: string;
  toolCallId?: string;
}

export interface ReplyPermissionParams {
  welinkSessionId: number;
  permId: string;
  response: PermissionResponse;
}

export interface ControlSkillWeCodeParams {
  action: SkillWeCodeAction;
}

export interface SendMessageToIMParams {
  welinkSessionId: number;
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
  page: number;
  size: number;
  total: number;
}

export interface SessionMessagePart {
  partId: string;
  partSeq: number;
  type: "text" | "thinking" | "tool" | "question" | "permission" | "file";
  content?: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  question?: string;
  options?: string[];
  permissionId?: string;
  fileName?: string;
  fileUrl?: string;
  fileMime?: string;
}

export interface SessionMessage {
  id: number | string;
  welinkSessionId: number;
  userId: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  messageSeq: number;
  parts?: SessionMessagePart[];
  createdAt: string;
}

export interface StreamMessage {
  type: string;
  seq: number;
  welinkSessionId: number;
  emittedAt: string;
  raw?: Record<string, unknown>;
  messageId?: string;
  messageSeq?: number;
  role?: "user" | "assistant" | "system" | "tool";
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
  response?: PermissionResponse;
  messages?: SessionMessage[];
  parts?: SessionMessagePart[];
}

export interface SendMessageResult {
  id: number;
  welinkSessionId: number;
  userId: string;
  role: "user";
  content: string;
  messageSeq: number;
  createdAt: string;
}

export interface StopSkillResult {
  welinkSessionId: number;
  status: "aborted";
}

export interface CloseSkillResult {
  status: "success" | "failed";
}

export interface ReplyPermissionResult {
  welinkSessionId: number;
  permissionId: string;
  response: PermissionResponse;
}

export interface ControlSkillWeCodeResult {
  status: "success" | "failed";
}

export interface SendMessageToIMResult {
  status: "success" | "failed";
  chatId?: string;
  contentLength?: number;
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
