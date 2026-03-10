import React from 'react';
import { Header } from '../components/Header';
import { Content } from '../components/Content';
import { Footer } from '../components/Footer';
import { StreamAssembler } from '../protocol/StreamAssembler';
import type { Message, StreamMessage, SessionMessage, SessionStatus } from '../types';
import type { HWH5EXT } from '../utils/hwext';
import { resolveRuntimeBridge } from '../utils/hwext';
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

const AIChatViewer: React.FC<AIChatViewerProps> = ({
  welinkSessionId,
  onMinimize,
  onClose,
  HWH5EXT: bridgeOverride,
}) => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [sessionStatus, setSessionStatus] = React.useState<SessionStatus>('idle');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const assemblerRef = React.useRef(new StreamAssembler());
  const streamingMsgIdRef = React.useRef<string | null>(null);
  const listenerRegisteredRef = React.useRef(false);
  const bridgePromise = React.useMemo(() => resolveRuntimeBridge(bridgeOverride), [bridgeOverride]);

  React.useEffect(() => {
    if (!welinkSessionId) {
      return;
    }

    let disposed = false;

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
              {
                id,
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
          setError(msg.error ?? 'Session error.');
          assemblerRef.current.reset();
          streamingMsgIdRef.current = null;
          break;

        case 'error':
          setError(msg.error ?? 'Unknown error.');
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
                partId: p.partId,
                type: p.type,
                content: p.content ?? '',
                isStreaming: false,
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
            })));
          }
          break;

        default:
          break;
      }
    };

    const onError = (err: { errorCode: number; errorMessage: string }) => {
      setError(`${err.errorCode}: ${err.errorMessage}`);
    };

    const onClose = (_reason: string) => {
      // no-op
    };

    const init = async () => {
      try {
        const bridge = await bridgePromise;
        const result = await bridge.getSessionMessage({ welinkSessionId, page: 0, size: 50 });

        if (disposed) {
          return;
        }

        setMessages(result.content.map(sessionMessageToMessage));
        setIsLoading(false);

        if (!listenerRegisteredRef.current) {
          bridge.registerSessionListener({
            welinkSessionId,
            onMessage: handleMessage,
            onError,
            onClose,
          });
          listenerRegisteredRef.current = true;
        }
      } catch (err) {
        if (!disposed) {
          setIsLoading(false);
          setError(err instanceof Error ? err.message : 'Failed to load session.');
        }
      }
    };

    void init();

    return () => {
      disposed = true;
      void bridgePromise.then((bridge) => {
        if (listenerRegisteredRef.current) {
          bridge.unregisterSessionListener({
            welinkSessionId,
            onMessage: handleMessage,
            onError,
            onClose,
          });
          listenerRegisteredRef.current = false;
        }
      });
    };
  }, [bridgePromise, welinkSessionId]);

  const handleSend = React.useCallback(async (content: string) => {
    if (!welinkSessionId || !content.trim()) return;

    setError(null);
    setMessages((prev) => [...prev, {
      id: genId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }]);

    try {
      const bridge = await bridgePromise;
      await bridge.sendMessage({ welinkSessionId, content: content.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    }
  }, [bridgePromise, welinkSessionId]);

  const handleStop = React.useCallback(async () => {
    if (!welinkSessionId) return;

    try {
      const bridge = await bridgePromise;
      await bridge.stopSkill({ welinkSessionId });
      assemblerRef.current.complete();
      setSessionStatus('idle');
    } catch (err) {
      console.error('Failed to stop skill:', err);
    }
  }, [bridgePromise, welinkSessionId]);

  const handleSubmitQuestionAnswer = React.useCallback(async (content: string, toolCallId?: string) => {
    if (!welinkSessionId || !content.trim()) return;

    try {
      const bridge = await bridgePromise;
      await bridge.sendMessage({
        welinkSessionId,
        content: content.trim(),
        toolCallId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit answer.';
      setError(message);
      throw err;
    }
  }, [bridgePromise, welinkSessionId]);

  const handleReplyPermission = React.useCallback(async (
    permId: string,
    response: 'once' | 'always' | 'reject',
  ) => {
    if (!welinkSessionId) return;

    try {
      const bridge = await bridgePromise;
      await bridge.replyPermission({
        welinkSessionId,
        permId,
        response,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reply permission.';
      setError(message);
      throw err;
    }
  }, [bridgePromise, welinkSessionId]);

  const handleSendToIM = React.useCallback(async (_content: string) => {
    if (!welinkSessionId) return;

    try {
      const bridge = await bridgePromise;
      await bridge.sendMessageToIM({ welinkSessionId });
    } catch {
      setError('Failed to send to IM.');
    }
  }, [bridgePromise, welinkSessionId]);

  const handleCopy = React.useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleMinimize = React.useCallback(async () => {
    try {
      const bridge = await bridgePromise;
      await bridge.controlSkillWeCode({ action: 'minimize' });
    } catch {
      // ignore host-side failures and still notify consumer
    }

    onMinimize?.();
  }, [bridgePromise, onMinimize]);

  const handleClose = React.useCallback(async () => {
    try {
      const bridge = await bridgePromise;
      await bridge.controlSkillWeCode({ action: 'close' });
    } catch {
      // ignore host-side failures and still notify consumer
    }

    onClose?.();
  }, [bridgePromise, onClose]);

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
        isLoading={isLoading}
        onCopy={handleCopy}
        onSendToIM={handleSendToIM}
        onSubmitQuestionAnswer={handleSubmitQuestionAnswer}
        onReplyPermission={handleReplyPermission}
      />
      <Footer isStreaming={sessionStatus === 'busy'} onSend={handleSend} onStop={handleStop} />
    </div>
  );
};

export default AIChatViewer;
