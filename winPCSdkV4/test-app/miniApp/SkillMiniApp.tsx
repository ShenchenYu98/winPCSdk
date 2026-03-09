import EmbeddedMiniApp from "../../miniApp/src/EmbeddedApp";

interface SkillMiniAppProps {
  sessionId: number | null;
  baseUrl: string;
  wsUrl: string;
  mockMode: "server" | "json";
}

export function SkillMiniApp(props: SkillMiniAppProps) {
  return (
    <section className="miniapp-panel">
      <header className="miniapp-panel-header">
        <div>
          <p className="miniapp-panel-kicker">MiniApp Project</p>
          <h3>真实 MiniApp 组件</h3>
        </div>
        <div className="miniapp-panel-meta">
          <span>Session {props.sessionId ?? "--"}</span>
          <span>React Mounted</span>
        </div>
      </header>

      <div className="miniapp-embedded-shell">
        <EmbeddedMiniApp
          sessionId={props.sessionId}
          baseUrl={props.baseUrl}
          wsUrl={props.wsUrl}
          mockMode={props.mockMode}
        />
      </div>
    </section>
  );
}
