import React from 'react';
import { Header } from '../components/Header';
import { Content } from '../components/Content';
import { Footer } from '../components/Footer';
import { StreamAssembler } from '../protocol/StreamAssembler';
import type { Message, StreamMessage, SessionMessage, SessionStatus } from '../types';
import type { HWH5EXT } from '../utils/hwext';
import '../styles/App.less';

export interface AIChatViewerProps {
  welinkSessionId: number;
  onMinimize?: () => void;
  onClose?: () => void;
  HWH5EXT?: HWH5EXT;
}

let nextMsgId = 1;
function genId(): string {
  return `msg_${Date.now()}_${nextMsgId++}`;
}

function sessionMessageToMessage(sm: SessionMessage): Message {
  return {
    id: String(sm.id),
    role: sm.role,
    content: sm.content,
    timestamp: new Date(sm.createdAt).getTime(),
    isStreaming: false,
    parts: sm.parts?.map(p => ({
      partId: p.partId,
      type: p.type,
      content: p.content ?? '',
      isStreaming: false,
      toolName: p.toolName,
      toolCallId: p.toolCallId,
      toolStatus: p.toolStatus,
      toolInput: p.toolInput,
      toolOutput: p.toolOutput,
      header: p.header,
      question: p.question,
      options: p.options,
      permissionId: p.permissionId,
      fileName: p.fileName,
      fileUrl: p.fileUrl,
      fileMime: p.fileMime,
    })),
  };
}

const AIChatViewer: React.FC<AIChatViewerProps> = ({
  welinkSessionId,
  onMinimize,
  onClose,
  HWH5EXT,
}) => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [sessionStatus, setSessionStatus] = React.useState<SessionStatus>('idle');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const assemblerRef = React.useRef(new StreamAssembler());
  const streamingMsgIdRef = React.useRef<string | null>(null);
  const listenerRegisteredRef = React.useRef(false);

  const hw = HWH5EXT || (typeof window !== 'undefined' 
    ? (window as unknown as { HWH5EXT?: AIChatViewerProps['HWH5EXT'] }).HWH5EXT 
    : null);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !HWH5EXT) {
      return;
    }

    const hostWindow = window as Window & { HWH5EXT?: AIChatViewerProps['HWH5EXT'] };
    const previousBridge = hostWindow.HWH5EXT;
    hostWindow.HWH5EXT = HWH5EXT;

    return () => {
      hostWindow.HWH5EXT = previousBridge;
    };
  }, [HWH5EXT]);

  React.useEffect(() => {
    if (!welinkSessionId || !hw) return;

    const loadMessages = async () => {
      try {
        const result = await hw.getSessionMessage({ welinkSessionId, page: 0, size: 50 });
        setMessages(result.content.map(sessionMessageToMessage));
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };

    const handleMessage = (msg: StreamMessage) => {
      switch (msg.type) {
        case 'text.delta':
        case 'text.done':
        case 'thinking.delta':
        case 'thinking.done':
        case 'tool.update':
        case 'question':
        case 'permission.ask':
        case 'file': {
          setSessionStatus('busy');
          assemblerRef.current.handleMessage(msg);
          const currentText = assemblerRef.current.getText();
          const currentParts = assemblerRef.current.getParts();

          setMessages((prev) => {
            if (streamingMsgIdRef.current) {
              return prev.map((m) =>
                m.id === streamingMsgIdRef.current
                  ? { ...m, content: currentText, parts: [...currentParts], isStreaming: true }
                  : m,
              );
            }
            const id = genId();
            streamingMsgIdRef.current = id;
            return [
              ...prev,
              { id, role: 'assistant', content: currentText, timestamp: Date.now(), isStreaming: true, parts: [...currentParts] },
            ];
          });
          break;
        }

        case 'step.start':
          setSessionStatus('busy');
          break;

        case 'step.done':
          if (streamingMsgIdRef.current && msg.tokens) {
            const finalId = streamingMsgIdRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === finalId
                  ? { ...m, meta: { ...m.meta, tokens: msg.tokens, cost: msg.cost } }
                  : m,
              ),
            );
          }
          break;

        case 'session.status': {
          if (msg.sessionStatus === 'idle') {
            assemblerRef.current.complete();
            setSessionStatus('idle');
            if (streamingMsgIdRef.current) {
              const finalId = streamingMsgIdRef.current;
              const finalParts = assemblerRef.current.getParts();
              setMessages((prev) =>
                prev.map((m) => (m.id === finalId ? { ...m, isStreaming: false, parts: [...finalParts] } : m)),
              );
            }
            assemblerRef.current.reset();
            streamingMsgIdRef.current = null;
          } else if (msg.sessionStatus === 'busy') {
            setSessionStatus('busy');
          } else if (msg.sessionStatus === 'retry') {
            setSessionStatus('retry');
          }
          break;
        }

        case 'session.error':
          setSessionStatus('error');
          setError(msg.error ?? '会话错误');
          assemblerRef.current.reset();
          streamingMsgIdRef.current = null;
          break;

        case 'error':
          setError(msg.error ?? '未知错误');
          break;

        case 'snapshot':
          if (msg.messages && msg.messages.length > 0) {
            setMessages(msg.messages.map((sm) => ({
              id: sm.id,
              role: sm.role as Message['role'],
              content: sm.content,
              timestamp: sm.createdAt ? new Date(sm.createdAt).getTime() : Date.now(),
              isStreaming: false,
              parts: sm.parts?.map((p) => ({
                partId: p.partId, type: p.type, content: p.content ?? '', isStreaming: false,
                toolName: p.toolName, toolCallId: p.toolCallId,
                toolStatus: p.status as 'pending' | 'running' | 'completed' | 'error' | undefined,
                header: p.header, question: p.question, options: p.options,
                fileName: p.fileName, fileUrl: p.fileUrl, fileMime: p.fileMime,
              })),
            })));
          }
          break;

        case 'streaming':
          if (msg.parts && msg.parts.length > 0) {
            setSessionStatus(msg.sessionStatus === 'busy' ? 'busy' : 'idle');
            const id = genId();
            streamingMsgIdRef.current = id;
            const streamingMessage: Message = {
              id,
              role: (msg.role as Message['role']) ?? 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
              parts: msg.parts.map((p) => ({
                partId: p.partId,
                type: p.type,
                content: p.content ?? '',
                isStreaming: true,
                toolName: p.toolName,
                toolCallId: p.toolCallId,
                toolStatus: p.status as 'pending' | 'running' | 'completed' | 'error' | undefined,
                header: p.header,
                question: p.question,
                options: p.options,
                fileName: p.fileName,
                fileUrl: p.fileUrl,
                fileMime: p.fileMime,
              })),
            };

            setMessages((prev) => [...prev, streamingMessage]);
          }
          break;

        default:
          break;
      }
    };

    const handleError = (err: { errorCode: number; errorMessage: string }) =>
      setError(`${err.errorCode}: ${err.errorMessage}`);

    const init = async () => {
      if (!listenerRegisteredRef.current) {
        hw.registerSessionListener({
          welinkSessionId,
          onMessage: handleMessage,
          onError: handleError,
        });
        listenerRegisteredRef.current = true;
      }

      try {
        await loadMessages();
      } finally {
        setIsLoading(false);
      }
    };

    void init();

    return () => {
      if (listenerRegisteredRef.current && hw) {
        hw.unregisterSessionListener({
          welinkSessionId,
          onMessage: handleMessage,
          onError: handleError,
        });
        listenerRegisteredRef.current = false;
      }
    };
  }, [welinkSessionId, hw]);

  const handleSend = React.useCallback(async (content: string) => {
    if (!welinkSessionId || !hw || !content.trim()) return;
    setError(null);
    setMessages((prev) => [...prev, { id: genId(), role: 'user', content: content.trim(), timestamp: Date.now() }]);
    try {
      await hw.sendMessage({ welinkSessionId, content: content.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
    }
  }, [welinkSessionId, hw]);

  const handleStop = React.useCallback(async () => {
    if (!welinkSessionId || !hw) return;
    try {
      await hw.stopSkill({ welinkSessionId });
      assemblerRef.current.complete();
      setSessionStatus('idle');
    } catch (err) {
      console.error('Failed to stop skill:', err);
    }
  }, [welinkSessionId, hw]);

  const handleSendToIM = React.useCallback(async () => {
    if (!welinkSessionId || !hw) return;
    try {
      await hw.sendMessageToIM({ welinkSessionId });
    } catch {
      setError('发送到IM失败');
    }
  }, [welinkSessionId, hw]);

  const handleCopy = React.useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleMinimize = React.useCallback(async () => {
    if (hw) {
      try { await hw.controlSkillWeCode({ action: 'minimize' }); } catch {}
    }
    onMinimize?.();
  }, [hw, onMinimize]);

  const handleClose = React.useCallback(async () => {
    if (hw) {
      try { await hw.controlSkillWeCode({ action: 'close' }); } catch {}
    }
    onClose?.();
  }, [hw, onClose]);

  return (
    <div className="ai-chat-viewer-container">
      <Header onMinimize={handleMinimize} onClose={handleClose} />
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      <Content
        messages={messages}
        welinkSessionId={welinkSessionId}
        isLoading={isLoading}
        onCopy={handleCopy}
        onSendToIM={handleSendToIM}
      />
      <Footer
        isStreaming={sessionStatus === 'busy'}
        isLoading={isLoading}
        onSend={handleSend}
        onStop={handleStop}
      />
    </div>
  );
};

export default AIChatViewer;
