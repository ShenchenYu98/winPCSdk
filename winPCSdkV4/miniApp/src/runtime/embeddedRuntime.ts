export interface EmbeddedMiniAppRuntimeConfig {
  sessionId: string | null;
  baseUrl: string;
  wsUrl: string;
  mockMode: "server" | "json";
}

let embeddedRuntimeConfig: EmbeddedMiniAppRuntimeConfig | null = null;

export function setEmbeddedMiniAppRuntimeConfig(
  config: EmbeddedMiniAppRuntimeConfig | null
): void {
  embeddedRuntimeConfig = config;
}

export function getEmbeddedMiniAppRuntimeConfig(): EmbeddedMiniAppRuntimeConfig | null {
  return embeddedRuntimeConfig;
}
