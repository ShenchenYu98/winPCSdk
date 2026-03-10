import { useEffect, useMemo, useRef } from "react";
import AIChatViewer from "../../ai-chat-viewer/src/lib/AIChatViewer";
import type { AIChatViewerProps } from "../../ai-chat-viewer/src/lib/AIChatViewer";
import type {
  SessionMessage as AIChatSessionMessage,
  SessionMessagePart as AIChatSessionMessagePart,
  StreamMessage as AIChatStreamMessage
} from "../../ai-chat-viewer/src/types";
import { getSharedFixtureBrowserSkillSdk } from "../../mocks/runtime/fixtureSkillSdk";
import mockFixture from "../../mocks/mock.json";
import { getSharedBrowserSkillSdk } from "../../src/sdk";
import type {
  SessionError,
  SessionMessage,
  SessionMessagePart,
  SkillSdkApi,
  StreamMessage
} from "../../src/sdk";

interface SkillMiniAppProps {
  sessionId: number | null;
  baseUrl: string;
  wsUrl: string;
  mockMode: "server" | "json";
}

declare global {
  interface Window {
    Pedestal?: {
      callMethod(methodName: string, ...args: unknown[]): Promise<unknown>;
    };
  }
}

type WrappedListener = {
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SessionError) => void;
  onClose?: (reason: string) => void;
};

type ViewerBridge = NonNullable<AIChatViewerProps["HWH5EXT"]>;

function mapSessionMessagePart(part: SessionMessagePart): AIChatSessionMessagePart {
  return {
    partId: part.partId,
    partSeq: part.partSeq,
    type: part.type,
    content: part.content ?? "",
    toolName: part.toolName,
    toolCallId: part.toolCallId,
    toolStatus: part.toolStatus as AIChatSessionMessagePart["toolStatus"],
    toolInput: part.toolInput,
    toolOutput: part.toolOutput,
    question: part.question,
    options: part.options,
    permissionId: part.permissionId,
    fileName: part.fileName,
    fileUrl: part.fileUrl,
    fileMime: part.fileMime
  };
}

function mapSessionMessage(message: SessionMessage): AIChatSessionMessage {
  return {
    id: message.id,
    welinkSessionId: message.welinkSessionId,
    userId: message.userId,
    role: message.role,
    content: message.content,
    messageSeq: message.messageSeq,
    parts: message.parts.map(mapSessionMessagePart),
    createdAt: message.createdAt
  };
}

function mapStreamMessage(message: StreamMessage): AIChatStreamMessage {
  return {
    ...message,
    type: message.type as AIChatStreamMessage["type"],
    welinkSessionId: String(message.welinkSessionId),
    status: message.status as AIChatStreamMessage["status"],
    messages: message.messages?.map((item) => ({
      id: String(item.id),
      seq: item.messageSeq,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
      parts: item.parts.map((part) => ({
        partId: part.partId,
        partSeq: part.partSeq,
        type: part.type,
        content: part.content,
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        status: part.toolStatus,
        question: part.question,
        options: part.options,
        fileName: part.fileName,
        fileUrl: part.fileUrl,
        fileMime: part.fileMime
      }))
    })),
    parts: message.parts?.map((part) => ({
      partId: part.partId,
      partSeq: part.partSeq,
      type: part.type,
      content: part.content,
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      status: part.toolStatus,
      question: part.question,
      options: part.options,
      fileName: part.fileName,
      fileUrl: part.fileUrl,
      fileMime: part.fileMime
    }))
  };
}

export function SkillMiniApp(props: SkillMiniAppProps) {
  const sdk = useMemo<SkillSdkApi>(
    () =>
      props.mockMode === "json"
        ? getSharedFixtureBrowserSkillSdk({
            runtimeKey: mockFixture.runtimeKey,
            fixtureData: mockFixture
          })
        : getSharedBrowserSkillSdk({
            baseUrl: props.baseUrl,
            wsUrl: props.wsUrl
          }),
    [props.baseUrl, props.mockMode, props.wsUrl]
  );
  const listenerMapRef = useRef<Map<number, WrappedListener>>(new Map());

  useEffect(() => {
    const previousPedestal = window.Pedestal;

    window.Pedestal = {
      callMethod: async (methodName: string) => {
        if (methodName === "getSharedBrowserSkillSdk") {
          return sdk;
        }

        if (previousPedestal?.callMethod) {
          return previousPedestal.callMethod(methodName);
        }

        throw new Error(`Unsupported Pedestal method: ${methodName}`);
      }
    };

    return () => {
      window.Pedestal = previousPedestal;
    };
  }, [sdk]);

  const hwBridge = useMemo<ViewerBridge>(
    () => ({
      getSessionMessage: async (params: { welinkSessionId: number; page?: number; size?: number }) =>
        sdk.getSessionMessage(params).then((result) => ({
          ...result,
          content: result.content.map(mapSessionMessage)
        })),
      sendMessage: async (params: {
        welinkSessionId: number;
        content: string;
        toolCallId?: string;
      }) => sdk.sendMessage(params),
      stopSkill: async (params: { welinkSessionId: number }) => sdk.stopSkill(params),
      sendMessageToIM: async (params: { welinkSessionId: number }) =>
        sdk.sendMessageToIM(params),
      controlSkillWeCode: async (params: { action: "close" | "minimize" }) =>
        sdk.controlSkillWeCode(params),
      replyPermission: async (params: {
        welinkSessionId: number;
        permId: string;
        response: "once" | "always" | "reject";
      }) => sdk.replyPermission(params),
      registerSessionListener: (params: {
        welinkSessionId: number;
        onMessage: (msg: AIChatStreamMessage) => void;
        onError?: (err: { errorCode: number; errorMessage: string }) => void;
        onClose?: (reason: string) => void;
      }) => {
        const wrapped: WrappedListener = {
          onMessage: (message) => {
            params.onMessage(mapStreamMessage(message));
          },
          onError: params.onError
            ? (error) => {
                params.onError?.({
                  errorCode: Number(error.code) || 0,
                  errorMessage: error.message
                });
              }
            : undefined,
          onClose: params.onClose
        };

        listenerMapRef.current.set(params.welinkSessionId, wrapped);
        sdk.registerSessionListener({
          welinkSessionId: params.welinkSessionId,
          onMessage: wrapped.onMessage,
          onError: wrapped.onError,
          onClose: wrapped.onClose
        });
      },
      unregisterSessionListener: (params: { welinkSessionId: number }) => {
        const wrapped = listenerMapRef.current.get(params.welinkSessionId);

        if (!wrapped) {
          return;
        }

        sdk.unregisterSessionListener({
          welinkSessionId: params.welinkSessionId,
          onMessage: wrapped.onMessage,
          onError: wrapped.onError,
          onClose: wrapped.onClose
        });
        listenerMapRef.current.delete(params.welinkSessionId);
      }
    }),
    [sdk]
  );

  return (
    <section className="miniapp-panel">
      <header className="miniapp-panel-header">
        <div>
          <p className="miniapp-panel-kicker">AI Chat Viewer</p>
          <h3>真实 AI Chat Viewer 页面</h3>
        </div>
        <div className="miniapp-panel-meta">
          <span>Session {props.sessionId ?? "--"}</span>
          <span>React Mounted</span>
        </div>
      </header>

      <div className="miniapp-embedded-shell">
        {props.sessionId !== null ? (
          <AIChatViewer welinkSessionId={props.sessionId} HWH5EXT={hwBridge} />
        ) : null}
      </div>
    </section>
  );
}
