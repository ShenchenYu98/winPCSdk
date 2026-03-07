export type SessionLifecycle = 'ACTIVE' | 'IDLE' | 'CLOSED';
export type SessionExecutionStatus = 'executing' | 'stopped' | 'completed';
export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'CLOSING';

export type StreamMessageType =
  | 'delta'
  | 'done'
  | 'error'
  | 'agent_offline'
  | 'agent_online';

export interface ExecuteSkillParams {
  imChatId: string;
  skillDefinitionId: number;
  userId: string;
  title?: string;
  agentId?: number;
  skillContent: string;
}

export interface StopSkillParams {
  sessionId: string;
}

export interface OnSessionStatusChangeParams {
  sessionId: string;
  callback: (result: SessionStatusResult) => void;
}

export interface OnSkillWecodeStatusChangeParams {
  callback: (result: SkillWecodeStatusResult) => void;
}

export interface RegenerateAnswerParams {
  sessionId: string;
}

export interface SendMessageToIMParams {
  sessionId: string;
  content: string;
}

export interface GetSessionMessageParams {
  sessionId: string;
  page?: number;
  size?: number;
}

export interface SendMessageParams {
  sessionId: string;
  content: string;
}

export interface ReplyPermissionParams {
  sessionId: string;
  permissionId: string;
  approved: boolean;
}

export type SkillWeCodeAction = 'close' | 'minimize';

export interface ControlSkillWeCodeParams {
  action: SkillWeCodeAction;
}

export interface RegisterSessionListenerParams {
  sessionId: string;
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SkillSdkError) => void;
  onClose?: (reason: string) => void;
}

export interface UnregisterSessionListenerParams {
  sessionId: string;
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SkillSdkError) => void;
  onClose?: (reason: string) => void;
}

export interface CloseSkillResult {
  status: 'success' | 'failed';
}

export interface StopSkillResult {
  status: 'success' | 'failed';
}

export interface AnswerResult {
  messageId: string;
  success: boolean;
}

export interface SendMessageToIMResult {
  success: boolean;
  chatId?: string;
  contentLength?: number;
  errorMessage?: string;
}

export interface SendMessageResult {
  messageId: string;
  seq: number;
  createdAt: string;
}

export interface ReplyPermissionResult {
  success: boolean;
  permissionId: string;
  approved: boolean;
}

export interface ControlSkillWeCodeResult {
  status: 'success' | 'failed';
}

export interface SkillSession {
  id: string;
  userId: string;
  skillDefinitionId: number;
  agentId?: number;
  toolSessionId?: string;
  title?: string;
  status: SessionLifecycle;
  imChatId: string;
  createdAt: string;
  lastActiveAt: string;
}

export type ChatMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface ChatMessage {
  id: string | number;
  sessionId: string;
  seq: number;
  role: ChatMessageRole;
  content: string;
  contentType: 'MARKDOWN' | 'CODE' | 'PLAIN';
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface StreamMessage {
  sessionId: string;
  type: StreamMessageType;
  seq: number;
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface PageResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface SessionStatusResult {
  status: SessionExecutionStatus;
}

export type SkillWecodeStatus = 'closed' | 'minimized';

export interface SkillWecodeStatusResult {
  status: SkillWecodeStatus;
  timestamp: number;
  message?: string;
}

export interface SkillSdkError {
  code: string;
  message: string;
  httpStatus?: number;
  retriable: boolean;
  source: 'REST' | 'WS' | 'SDK';
  sessionId?: string;
  timestamp: number;
}

export interface ConnectionPolicy {
  maxRetryCount: number;
  backoffInitialMs: number;
  backoffMaxMs: number;
  heartbeatIntervalMs: number;
  disconnectThresholdMs: number;
}

export interface SkillClientInitOptions {
  baseUrl: string;
  wsUrl?: string;
  env?: 'dev' | 'test' | 'prod';
  connectionPolicy?: Partial<ConnectionPolicy>;
  autoConnectOnRegister?: boolean;
  autoDisconnectWhenNoListeners?: boolean;
  listenerCircuitBreakerThreshold?: number;
  fetchImpl?: typeof fetch;
  socketFactory?: SocketFactory;
}

export interface SkillClient {
  executeSkill(params: ExecuteSkillParams): Promise<SkillSession>;
  closeSkill(): Promise<CloseSkillResult>;
  stopSkill(params: StopSkillParams): Promise<StopSkillResult>;
  onSessionStatusChange(params: OnSessionStatusChangeParams): void;
  onSkillWecodeStatusChange(params: OnSkillWecodeStatusChangeParams): void;
  regenerateAnswer(params: RegenerateAnswerParams): Promise<AnswerResult>;
  sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult>;
  getSessionMessage(params: GetSessionMessageParams): Promise<PageResult<ChatMessage>>;
  registerSessionListener(params: RegisterSessionListenerParams): void;
  unregisterSessionListener(params: UnregisterSessionListenerParams): void;
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult>;
  controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResult>;
  getMetricsSnapshot(): MetricsSnapshot;
}

export interface MetricsSnapshot {
  interfaceCalls: number;
  interfaceSuccess: number;
  wsReconnects: number;
  callbackDelivered: number;
  callbackFailed: number;
  firstPacketLatencyMsP95: number;
  dispatchLatencyMsP95: number;
  permissionCycleMsP95: number;
}

export interface SessionContext {
  id: string;
  userId: string;
  lifecycle: SessionLifecycle;
  executionStatus?: SessionExecutionStatus;
  connectionState: ConnectionState;
  lastSeq?: number;
  lastActiveAt: number;
  stopIssuedAt?: number;
}

export interface StreamAccumulator {
  sessionId: string;
  content: string;
  seq: number;
  isStreaming: boolean;
  updatedAt: number;
}

export interface ListenerBucket {
  onMessage: Set<(message: StreamMessage) => void>;
  onError: Set<(error: SkillSdkError) => void>;
  onClose: Set<(reason: string) => void>;
  onStatus: Set<(status: SessionStatusResult) => void>;
}

export interface SocketMessageEvent {
  data: unknown;
}

export interface SocketCloseEvent {
  code?: number;
  reason?: string;
}

export interface SocketErrorEvent {
  message?: string;
}

export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: SocketMessageEvent) => void) | null;
  onerror: ((event: SocketErrorEvent) => void) | null;
  onclose: ((event: SocketCloseEvent) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string) => SocketLike;

export interface ApiClient {
  post<T>(path: string, body?: unknown): Promise<T>;
  get<T>(path: string): Promise<T>;
  delete<T>(path: string): Promise<T>;
}
