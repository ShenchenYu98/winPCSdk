export type {
  ChatMessage,
  AIProgressStatus,
  StreamMessage,
  SessionError,
  GetSessionMessageParams,
  GetSessionMessageResult,
  SendMessageParams,
  SendMessageResult,
  StopSkillParams,
  StopSkillResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  ControlSkillWeCodeParams,
  ControlSkillWeCodeResult,
  RegisterSessionListenerParams,
  UnregisterSessionListenerParams,
  HWH5,
} from './jsapi';

export interface AIProgressStatus {
  status: 'idle' | 'thinking' | 'processing' | 'completed' | 'error';
  step: number;
  totalSteps: number;
}
