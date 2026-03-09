import type {
  SessionMessage,
  SessionStatus,
  SkillWecodeStatus,
  StreamMessage
} from "../../sdk";

interface SkillMiniAppProps {
  sessionId: number | null;
  sessionStatus: SessionStatus;
  miniStatus: SkillWecodeStatus;
  messages: SessionMessage[];
  streamEvents: StreamMessage[];
  imMessages: string[];
  onRegenerate: () => void;
  onSendLastToIm: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export function SkillMiniApp(props: SkillMiniAppProps) {
  const latestAssistantMessage = [...props.messages]
    .reverse()
    .find((message) => message.role === "assistant");

  return (
    <section className="miniapp-panel">
      <header className="miniapp-panel-header">
        <div>
          <p className="miniapp-panel-kicker">MiniApp Project</p>
          <h3>Skill 执行面板</h3>
        </div>
        <div className="miniapp-panel-meta">
          <span>Session {props.sessionId ?? "--"}</span>
          <span>{mapSessionStatusLabel(props.sessionStatus)}</span>
          <span>{props.miniStatus}</span>
        </div>
      </header>

      <div className="miniapp-panel-grid">
        <article className="miniapp-card">
          <h4>最新回复</h4>
          <p>{latestAssistantMessage?.content ?? "等待技能输出..."}</p>
        </article>

        <article className="miniapp-card">
          <h4>最近事件</h4>
          <div className="miniapp-list">
            {props.streamEvents.length === 0 ? <span>暂无流式事件</span> : null}
            {props.streamEvents.map((event) => (
              <div key={`${event.seq}-${event.type}`} className="miniapp-list-item">
                <strong>{event.type}</strong>
                <span>{event.content ?? event.title ?? event.status ?? "-"}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="miniapp-card">
          <h4>IM 回传</h4>
          <div className="miniapp-list">
            {props.imMessages.length === 0 ? <span>暂未发送到 IM</span> : null}
            {props.imMessages.map((message, index) => (
              <div key={`${message}-${index}`} className="miniapp-list-item">
                <strong>IM</strong>
                <span>{message}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="miniapp-actions">
        <button type="button" onClick={props.onRegenerate}>
          重新生成
        </button>
        <button type="button" onClick={props.onSendLastToIm}>
          发送到 IM
        </button>
        <button type="button" onClick={props.onMinimize}>
          最小化
        </button>
        <button type="button" onClick={props.onClose}>
          关闭
        </button>
      </div>
    </section>
  );
}

function mapSessionStatusLabel(status: SessionStatus): string {
  if (status === "executing") {
    return "执行中";
  }

  if (status === "stopped") {
    return "已停止";
  }

  return "已完成";
}
