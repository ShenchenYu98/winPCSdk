import React from 'react';
import { Header } from '../components/Header';
import { Content } from '../components/Content';
import { Footer } from '../components/Footer';
import { StreamAssembler } from '../protocol/StreamAssembler';
import type { Message, StreamMessage, SessionMessage, SessionStatus } from '../types';
import '../styles/App.less';

export interface AIChatViewerProps {
  welinkSessionId: number;
  onMinimize?: () => void;
  onClose?: () => void;
  HWH5EXT?: {
    getSessionMessage: (params: {
      welinkSessionId: number;
      page?: number;
      size?: number;
    }) => Promise<{ content: SessionMessage[] }>;
    sendMessage: (params: { welinkSessionId: number; content: string }) => Promise<unknown>;
    stopSkill: (params: { welinkSessionId: number }) => Promise<unknown>;
    sendMessageToIM: (params: { welinkSessionId: number }) => Promise<unknown>;
    controlSkillWeCode: (params: { action: 'close' | 'minimize' }) => Promise<unknown>;
    replyPermission: (params: {
      welinkSessionId: number;
      permId: string;
      response: 'once' | 'always' | 'reject';
    }) => Promise<unknown>;
    registerSessionListener: (params: {
      welinkSessionId: number;
      onMessage: (msg: StreamMessage) => void;
      onError?: (err: { errorCode: number; errorMessage: string }) => void;
      onClose?: (reason: string) => void;
    }) => void;
    unregisterSessionListener: (params: { welinkSessionId: number }) => void;
  };
}

type HwBridge = NonNullable<AIChatViewerProps['HWH5EXT']>;

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
    parts: sm.parts?.map((p) => ({
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

function getWindowBridge(): HwBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as unknown as { HWH5EXT?: HwBridge }).HWH5EXT ?? null;
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

  const resolveHwBridge = React.useCallback((): HwBridge | null => {
    return HWH5EXT ?? getWindowBridge();
  }, [HWH5EXT]);

  React.useEffect(() => {
    const hw = resolveHwBridge();

    if (!welinkSessionId || !hw) {
      setIsLoading(false);
      if (!welinkSessionId) {
        setError('Missing welinkSessionId');
      }
      return;
    }

    const loadMessages = async () => {
      try {
        const result = await hw.getSessionMessage({ welinkSessionId, page: 0, size: 50 });
        setMessages(result.content.map(sessionMessageToMessage));
      } catch (err) {
        console.error('Failed to load messages:', err);
        setError('Failed to load messages');
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
          const streamingMsgId = streamingMsgIdRef.current ?? genId();
          const hasStreamingMessage = streamingMsgIdRef.current !== null;

          if (!hasStreamingMessage) {
            streamingMsgIdRef.current = streamingMsgId;
          }

          setMessages((prev) => {
            if (hasStreamingMessage) {
              return prev.map((m) =>
                m.id === streamingMsgId
                  ? { ...m, content: currentText, parts: [...currentParts], isStreaming: true }
                  : m,
              );
            }

            return [
              ...prev,
              {
                id: streamingMsgId,
                role: 'assistant',
                content: currentText,
                timestamp: Date.now(),
                isStreaming: true,
                parts: [...currentParts],
              },
            ];
          });
          break;
        }

        case 'session.status': {
          if (msg.sessionStatus === 'idle') {
            assemblerRef.current.complete();
            setSessionStatus('idle');

            if (streamingMsgIdRef.current) {
              const finalId = streamingMsgIdRef.current;
              const finalParts = assemblerRef.current.getParts();
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === finalId ? { ...m, isStreaming: false, parts: [...finalParts] } : m,
                ),
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
          setError(msg.error ?? 'Session error');
          assemblerRef.current.reset();
          streamingMsgIdRef.current = null;
          break;

        case 'error':
          setError(msg.error ?? 'Unknown error');
          break;

        case 'snapshot':
          if (msg.messages && msg.messages.length > 0) {
            setMessages(
              msg.messages.map((sm) => ({
                id: sm.id,
                role: sm.role as Message['role'],
                content: sm.content,
                timestamp: sm.createdAt ? new Date(sm.createdAt).getTime() : Date.now(),
                isStreaming: false,
                parts: sm.parts?.map((p) => ({
                  partId: p.partId,
                  type: p.type,
                  content: p.content ?? '',
                  isStreaming: false,
                  toolName: p.toolName,
                  toolCallId: p.toolCallId,
                  toolStatus: p.status as
                    | 'pending'
                    | 'running'
                    | 'completed'
                    | 'error'
                    | undefined,
                  header: p.header,
                  question: p.question,
                  options: p.options,
                  fileName: p.fileName,
                  fileUrl: p.fileUrl,
                  fileMime: p.fileMime,
                })),
              })),
            );
          }
          break;

        default:
          break;
      }
    };

    const init = async () => {
      await loadMessages();
      setIsLoading(false);

      if (!listenerRegisteredRef.current) {
        hw.registerSessionListener({
          welinkSessionId,
          onMessage: handleMessage,
          onError: (err: { errorCode: number; errorMessage: string }) => {
            setError(`${err.errorCode}: ${err.errorMessage}`);
          },
        });
        listenerRegisteredRef.current = true;
      }
    };

    void init();

    return () => {
      if (listenerRegisteredRef.current) {
        hw.unregisterSessionListener({ welinkSessionId });
        listenerRegisteredRef.current = false;
      }
    };
  }, [welinkSessionId, resolveHwBridge]);

  const handleSend = React.useCallback(
    async (content: string) => {
      const hw = resolveHwBridge();
      if (!welinkSessionId || !hw || !content.trim()) {
        return;
      }

      setError(null);
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: 'user', content: content.trim(), timestamp: Date.now() },
      ]);

      try {
        await hw.sendMessage({ welinkSessionId, content: content.trim() });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    },
    [welinkSessionId, resolveHwBridge],
  );

  const handleStop = React.useCallback(async () => {
    const hw = resolveHwBridge();
    if (!welinkSessionId || !hw) {
      return;
    }

    try {
      await hw.stopSkill({ welinkSessionId });
      assemblerRef.current.complete();
      setSessionStatus('idle');
    } catch (err) {
      console.error('Failed to stop skill:', err);
    }
  }, [welinkSessionId, resolveHwBridge]);

  const handleSendToIM = React.useCallback(async () => {
    const hw = resolveHwBridge();
    if (!welinkSessionId || !hw) {
      return;
    }

    try {
      await hw.sendMessageToIM({ welinkSessionId });
    } catch {
      setError('Failed to send to IM');
    }
  }, [welinkSessionId, resolveHwBridge]);

  const handleCopy = React.useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleMinimize = React.useCallback(async () => {
    const hw = resolveHwBridge();
    if (hw) {
      try {
        await hw.controlSkillWeCode({ action: 'minimize' });
      } catch {}
    }

    onMinimize?.();
  }, [onMinimize, resolveHwBridge]);

  const handleClose = React.useCallback(async () => {
    const hw = resolveHwBridge();
    if (hw) {
      try {
        await hw.controlSkillWeCode({ action: 'close' });
      } catch {}
    }

    onClose?.();
  }, [onClose, resolveHwBridge]);

  return (
    <div className="ai-chat-viewer-container">
      <Header onMinimize={handleMinimize} onClose={handleClose} />
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}
      <Content
        messages={messages}
        welinkSessionId={welinkSessionId}
        isLoading={isLoading}
        onCopy={handleCopy}
        onSendToIM={handleSendToIM}
      />
      <Footer isStreaming={sessionStatus === 'busy'} onSend={handleSend} onStop={handleStop} />
    </div>
  );
};

export default AIChatViewer;
