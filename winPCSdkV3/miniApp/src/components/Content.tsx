import React, { useCallback, useEffect, useRef } from 'react';
import MarkdownContent from './MarkdownContent';
import type { ChatMessage } from '../types/jsapi';
import '../styles/Content.less';

interface ContentProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  onSendToIM?: (message: string) => void;
  streamingContent?: string;
  isStreaming?: boolean;
}

const Content: React.FC<ContentProps> = ({
  messages,
  onSend,
  onSendToIM,
  streamingContent = '',
  isStreaming = false,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isStreaming]);

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      showToast('已复制到剪贴板');
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('已复制到剪贴板');
    });
  }, []);

  const handleSendToChat = useCallback((content: string) => {
    if (onSendToIM) {
      onSendToIM(content);
    } else {
      onSend(content);
    }
  }, [onSend, onSendToIM]);

  const showToast = (message: string) => {
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('copy-toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  };

  return (
    <div className="content" ref={contentRef}>
      <div className="messages-container">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message-block ${
              message.role === 'USER' || message.role === 'user'
                ? 'message-user'
                : 'message-assistant'
            }`}
          >
            <div className="message-content">
              <MarkdownContent content={message.content} />
            </div>
            {(message.role === 'ASSISTANT' || message.role === 'assistant') && (
              <div className="message-actions">
                <button
                  className="action-btn copy-btn"
                  onClick={() => handleCopy(message.content)}
                  title="复制内容"
                >
                  📋 复制
                </button>
                <button
                  className="action-btn send-btn"
                  onClick={() => handleSendToChat(message.content)}
                  title="发送到聊天"
                >
                  ↗️ 发送
                </button>
              </div>
            )}
          </div>
        ))}

        {isStreaming && streamingContent && (
          <div className="message-block message-assistant message-streaming">
            <div className="message-content">
              <MarkdownContent content={streamingContent} />
            </div>
            <div className="streaming-indicator">
              <span className="typing-dot typing-dot-1"></span>
              <span className="typing-dot typing-dot-2"></span>
              <span className="typing-dot typing-dot-3"></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Content;
