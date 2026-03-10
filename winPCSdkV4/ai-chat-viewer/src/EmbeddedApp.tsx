import { useEffect } from "react";
import App from "./App";
import {
  setEmbeddedAIChatViewerRuntimeConfig,
  type EmbeddedAIChatViewerRuntimeConfig
} from "./runtime/embeddedRuntime";

export interface EmbeddedAIChatViewerAppProps {
  welinkSessionId: number | null;
}

export default function EmbeddedApp(props: EmbeddedAIChatViewerAppProps) {
  const config: EmbeddedAIChatViewerRuntimeConfig = {
    welinkSessionId: props.welinkSessionId
  };

  // Make the embedded session id available before App mounts.
  setEmbeddedAIChatViewerRuntimeConfig(config);

  useEffect(() => {
    setEmbeddedAIChatViewerRuntimeConfig(config);

    return () => {
      setEmbeddedAIChatViewerRuntimeConfig(null);
    };
  }, [props.welinkSessionId]);

  return <App />;
}
