import { useEffect } from "react";
import App from "./App";
import {
  setEmbeddedMiniAppRuntimeConfig,
  type EmbeddedMiniAppRuntimeConfig
} from "./runtime/embeddedRuntime";

export interface EmbeddedMiniAppProps {
  sessionId: number | null;
  baseUrl: string;
  wsUrl: string;
  mockMode: "server" | "json";
}

export default function EmbeddedApp(props: EmbeddedMiniAppProps) {
  useEffect(() => {
    const config: EmbeddedMiniAppRuntimeConfig = {
      sessionId: props.sessionId !== null ? String(props.sessionId) : null,
      baseUrl: props.baseUrl,
      wsUrl: props.wsUrl,
      mockMode: props.mockMode
    };

    setEmbeddedMiniAppRuntimeConfig(config);

    return () => {
      setEmbeddedMiniAppRuntimeConfig(null);
    };
  }, [props.baseUrl, props.mockMode, props.sessionId, props.wsUrl]);

  return <App />;
}
