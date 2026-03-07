export type SessionStatus = 'executing' | 'stopped' | 'completed';

export type SkillWecodeStatus = 'closed' | 'minimized';

export type SkillWeCodeAction = 'close' | 'minimize';

export type InternalSessionState =
  | 'idle'
  | 'pending'
  | 'executing'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'closed';

export type SkillSessionServerStatus = 'ACTIVE' | 'IDLE' | 'CLOSED';

export type ChatRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export type ContentType = 'MARKDOWN' | 'CODE' | 'PLAIN';

export type StreamMessageType = 'delta' | 'done' | 'error' | 'agent_offline' | 'agent_online';

export type ChatMessage = {
  id: number;
  sessionId: number;
  seq: number;
  role: ChatRole;
  content: string;
  contentType: ContentType;
  createdAt: string;
  meta?: string | null;
};

export type StreamMessage = {
  type: StreamMessageType;
  seq: number;
  content: unknown;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type SkillSession = {
  id: number;
  userId: number;
  skillDefinitionId: number;
  agentId?: number;
  toolSessionId?: string;
  title?: string;
  status: SkillSessionServerStatus;
  imChatId?: string;
  createdAt: string | number;
  lastActiveAt?: string;
};

export type PageResult<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export type AnswerResult = {
  messageId: string;
  success: boolean;
};

export type CreateSessionRequest = {
  userId: number;
  skillDefinitionId: number;
  agentId?: number;
  title?: string;
  imChatId?: string;
};

export type SendMessageRequest = {
  content: string;
};

export type ReplyPermissionRequest = {
  approved: boolean;
};

export type ReplyPermissionResponse = {
  success: boolean;
  permissionId: string;
  approved: boolean;
};

export type SendToIMRequest = {
  content: string;
};

export type SendToIMResponse = {
  success: boolean;
  chatId?: string;
  contentLength?: number;
};

export type CloseSessionResponse = {
  status: 'closed';
  sessionId: string;
};

export type GetSessionListParams = {
  userId: number;
  statuses?: SkillSessionServerStatus[];
  page?: number;
  size?: number;
};

export interface MiniProgramHostAdapter {
  close(): Promise<void>;
  minimize(): Promise<void>;
  onClosed?(callback: () => void): () => void;
  onMinimized?(callback: () => void): () => void;
}

export type Logger = {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
};

export type SkillSDKConfig = {
  baseHttpUrl: string;
  baseWsUrl: string;
  skillDefinitionId: number;
  sessionListPageSize?: number;
  messagePageSize?: number;
  wsReconnectMaxTimes?: number;
  wsReconnectBaseDelayMs?: number;
  requestTimeoutMs?: number;
  hostAdapter?: MiniProgramHostAdapter;
  fetchImpl?: typeof fetch;
  webSocketFactory?: (url: string) => WebSocket;
  logger?: Logger;
};

export interface SkillSDK {
  executeSkill(
    imChatId: string,
    userId: string,
    skillContent: string,
    agentId?: number,
    title?: string
  ): Promise<SkillSession>;

  closeSkill(sessionId: string): Promise<boolean>;

  stopSkill(sessionId: string): Promise<boolean>;

  onSessionStatus(sessionId: string, callback: (status: SessionStatus) => void): void;

  onSkillWecodeStatus(callback: (status: SkillWecodeStatus) => void): void;

  regenerateAnswer(sessionId: string): Promise<AnswerResult>;

  sendMessageToIM(sessionId: string, content: string): Promise<boolean>;

  getSessionMessage(sessionId: string, page?: number, size?: number): Promise<PageResult<ChatMessage>>;

  sendMessage(
    sessionId: string,
    content: string,
    onMessage: (message: StreamMessage) => void
  ): Promise<boolean>;

  replyPermission(sessionId: string, permissionId: string, approved: boolean): Promise<boolean>;

  controlSkillWeCode(action: SkillWeCodeAction): Promise<boolean>;

  copySkillResult?(sessionId: string, content?: string): Promise<boolean>;
}
