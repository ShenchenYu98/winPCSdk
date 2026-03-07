/**
 * JSAPI 接口类型定义
 */

export interface ChatMessage {
  id: number;
  sessionId: number;
  seq: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  contentType: 'MARKDOWN' | 'CODE' | 'PLAIN';
  createdAt: string;
  meta?: string;
}

export interface GetSessionMessageParams {
  sessionId: string;
  page?: number;
  size?: number;
}

export interface GetSessionMessageResult {
  content: ChatMessage[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface StreamMessage {
  sessionId: string;
  type: 'delta' | 'done' | 'error' | 'agent_offline' | 'agent_online' | 'message.updated' | 'message.part.updated' | 'message.part.delta';
  seq?: number;
  content?: string | any;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  properties?: {
    info?: {
      id?: string;
      sessionID?: string;
      role?: 'user' | 'assistant';
      content?: string;
      time?: {
        created?: number;
        completed?: number;
      };
    };
    part?: {
      id?: string;
      sessionID?: string;
      messageID?: string;
      type?: 'text' | 'reasoning' | 'tool';
      text?: string;
    };
    delta?: string;
  };
}

export interface SessionError {
  code: string;
  message: string;
  timestamp: number;
}

export interface SendMessageParams {
  sessionId: string;
  content: string;
}

export interface SendMessageResult {
  messageId: number;
  seq: number;
  createdAt: string;
}

export interface StopSkillParams {
  sessionId: string;
}

export interface StopSkillResult {
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface SendMessageToIMParams {
  sessionId: string;
  content: string;
}

export interface SendMessageToIMResult {
  success: boolean;
  chatId?: string;
  contentLength?: number;
  errorMessage?: string;
}

export interface ControlSkillWeCodeParams {
  action: 'close' | 'minimize';
}

export interface ControlSkillWeCodeResult {
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface RegisterSessionListenerParams {
  sessionId: string;
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SessionError) => void;
  onClose?: (reason: any) => void;
}

export interface UnregisterSessionListenerParams {
  sessionId: string;
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SessionError) => void;
  onClose?: (reason: any) => void;
}

export interface RegenerateAnswerParams {
  sessionId: string;
  content: string;
}

export interface RegenerateAnswerResult {
  messageId: string;
}

/**
 * HWH5 JSAPI 接口定义
 */
export interface HWH5 {
  getSessionMessage(params: GetSessionMessageParams): Promise<GetSessionMessageResult>;
  registerSessionListener(params: RegisterSessionListenerParams): void;
  unregisterSessionListener(params: UnregisterSessionListenerParams): void;
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  stopSkill(params: StopSkillParams): Promise<StopSkillResult>;
  sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult>;
  controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResult>;
  regenerateAnswer(params: RegenerateAnswerParams): Promise<RegenerateAnswerResult>;
  onSkillWecodeStatusChange?: (callback: (status: string) => void) => void;
}

declare global {
  interface Window {
    HWH5?: HWH5;
  }
}
