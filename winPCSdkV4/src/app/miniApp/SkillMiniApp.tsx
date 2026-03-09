import { useMemo } from "react";

interface SkillMiniAppProps {
  sessionId: number | null;
  baseUrl: string;
  wsUrl: string;
}

export function SkillMiniApp(props: SkillMiniAppProps) {
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams();

    if (props.sessionId !== null) {
      params.set("sessionId", String(props.sessionId));
    }

    params.set("baseUrl", props.baseUrl);
    params.set("wsUrl", props.wsUrl);
    params.set("env", "test");

    return `/miniapp/index.html?${params.toString()}`;
  }, [props.baseUrl, props.sessionId, props.wsUrl]);

  return (
    <section className="miniapp-panel">
      <header className="miniapp-panel-header">
        <div>
          <p className="miniapp-panel-kicker">MiniApp Project</p>
          <h3>真实 MiniApp 页面</h3>
        </div>
        <div className="miniapp-panel-meta">
          <span>Session {props.sessionId ?? "--"}</span>
          <span>/miniapp/index.html</span>
        </div>
      </header>

      <div className="miniapp-frame-shell">
        <iframe
          key={iframeSrc}
          title="Skill MiniApp"
          className="miniapp-frame"
          src={iframeSrc}
        />
      </div>
    </section>
  );
}
