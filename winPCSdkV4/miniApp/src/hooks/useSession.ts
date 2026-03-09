import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSessionIdFromURL,
  getSessionMessage,
  registerSessionListener,
  unregisterSessionListener,
  sendMessage as sendJSAPIMessage,
  stopSkill as stopSkillJSAPI,
} from '../services/jsapi';
import type { ChatMessage, StreamMessage } from '../types/jsapi';

interface UseSessionOptions {
  autoConnect?: boolean;
}

interface UseSessionReturn {
  sessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useSession = ({
  autoConnect = true,
}: UseSessionOptions = {}): UseSessionReturn => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  const messageBufferRef = useRef<Map<string, ChatMessage>>(new Map());
  const partBufferRef = useRef<Map<string, string>>(new Map());
  const onMessageCallbackRef = useRef<((message: StreamMessage) => void) | null>(null);

  const connect = useCallback(async () => {
    const sid = getSessionIdFromURL();
    if (!sid) {
      console.warn('未找到 sessionId，使用 mock 模式');
      setSessionId('mock-session-id');
      return;
    }

    setSessionId(sid);

    try {
      const result = await getSessionMessage({ sessionId: sid, page: 0, size: 50 });
      setMessages(result.content);
    } catch (error) {
      console.error('获取历史消息失败:', error);
    }

    onMessageCallbackRef.current = (message: StreamMessage) => {
      switch (message.type) {
        case 'message.part.delta': {
          const delta = message.properties?.delta || '';
          const partId = message.properties?.part?.id || 'streaming-part';
          if (delta) {
            const current = partBufferRef.current.get(partId) || '';
            const updated = current + delta;
            partBufferRef.current.set(partId, updated);
            setStreamingContent(updated);
          }
          break;
        }
        case 'message.part.updated': {
          const part = message.properties?.part;
          if (part?.type === 'text' && part.text) {
            const partId = part.id || '';
            partBufferRef.current.set(partId, part.text);
            setStreamingContent(part.text);
          }
          break;
        }
        case 'delta': {
          const deltaContent = typeof message.content === 'string' ? message.content : '';
          if (deltaContent) {
            setStreamingContent((prev) => prev + deltaContent);
          }
          break;
        }
        case 'done': {
          if (streamingContent) {
            const assistantMessage: ChatMessage = {
              id: Date.now(),
              sessionId: parseInt(sid) || 0,
              seq: messages.length + 1,
              role: 'ASSISTANT',
              content: streamingContent,
              contentType: 'MARKDOWN',
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
          setStreamingContent('');
          partBufferRef.current.clear();
          setIsStreaming(false);
          setIsLoading(false);
          break;
        }
        case 'error': {
          console.error('流式消息错误:', message.content);
          setIsStreaming(false);
          setIsLoading(false);
          break;
        }
      }
    };

    registerSessionListener({
      sessionId: sid,
      onMessage: onMessageCallbackRef.current,
    });
  }, [messages.length, streamingContent]);

  const disconnect = useCallback(() => {
    if (sessionId && onMessageCallbackRef.current) {
      unregisterSessionListener({
        sessionId,
        onMessage: onMessageCallbackRef.current,
      });
    }
    messageBufferRef.current.clear();
    partBufferRef.current.clear();
    setStreamingContent('');
    setIsStreaming(false);
    setIsLoading(false);
  }, [sessionId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId) {
      console.error('sessionId 不存在');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      sessionId: parseInt(sessionId) || 0,
      seq: messages.length + 1,
      role: 'USER',
      content,
      contentType: 'MARKDOWN',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingContent('');
    partBufferRef.current.clear();

    try {
      await sendJSAPIMessage({ sessionId, content });
    } catch (error) {
      console.error('发送消息失败:', error);
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [sessionId, messages.length]);

  const stopStreaming = useCallback(async () => {
    if (!sessionId) return;

    try {
      await stopSkillJSAPI({ sessionId });
      setIsStreaming(false);
      setIsLoading(false);
      
      if (streamingContent) {
        const assistantMessage: ChatMessage = {
          id: Date.now(),
          sessionId: parseInt(sessionId) || 0,
          seq: messages.length + 1,
          role: 'ASSISTANT',
          content: streamingContent,
          contentType: 'MARKDOWN',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      setStreamingContent('');
      partBufferRef.current.clear();
    } catch (error) {
      console.error('停止技能失败:', error);
    }
  }, [sessionId, streamingContent, messages.length]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    sessionId,
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    sendMessage,
    stopStreaming,
    connect,
    disconnect,
  };
};
