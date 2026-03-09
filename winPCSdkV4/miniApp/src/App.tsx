import { useState, useCallback } from 'react';
import Header from './components/Header';
import Content from './components/Content';
import Footer from './components/Footer';
import { useSession } from './hooks/useSession';
import { sendMessageToIM } from './services/jsapi';
import type { AIProgressStatus } from './types';
import './styles/App.less';

const initialTitle = 'AI 智能问答';

function App() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [progress, setProgress] = useState<AIProgressStatus>({
    status: 'idle',
    step: 0,
    totalSteps: 0,
  });

  const {
    sessionId,
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    sendMessage,
    stopStreaming,
  } = useSession({ autoConnect: true });

  const handleSendMessage = useCallback(
    async (content: string) => {
      setTitle(content.substring(0, 50) + (content.length > 50 ? '...' : ''));
      setProgress({
        status: 'thinking',
        step: 0,
        totalSteps: 3,
      });
      await sendMessage(content);
    },
    [sendMessage]
  );

  const handleStopStreaming = useCallback(async () => {
    await stopStreaming();
    setProgress({
      status: 'completed',
      step: 3,
      totalSteps: 3,
    });
  }, [stopStreaming]);

  const handleSendToIM = useCallback(async (content: string) => {
    if (!sessionId) return;

    try {
      await sendMessageToIM({ sessionId, content });
    } catch (error) {
      console.error('发送到 IM 失败:', error);
    }
  }, [sessionId]);

  const handleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    const confirmClose = window.confirm('确认要关闭当前问答吗？');
    if (confirmClose) {
      setTitle(initialTitle);
      setIsMaximized(false);
    }
  }, []);

  return (
    <div className={`app-container ${isMaximized ? 'maximized' : ''}`}>
      <div className="header-wrapper">
        <Header
          title={title}
          progress={progress}
          sessionId={sessionId}
          isMaximized={isMaximized}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />
      </div>
      <div className="content-wrapper">
        <Content
          messages={messages}
          onSend={handleSendMessage}
          onSendToIM={handleSendToIM}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
        />
      </div>
      <div className="footer-wrapper">
        <Footer
          onSend={handleSendMessage}
          onStop={handleStopStreaming}
          isStreaming={isStreaming}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

export default App;
