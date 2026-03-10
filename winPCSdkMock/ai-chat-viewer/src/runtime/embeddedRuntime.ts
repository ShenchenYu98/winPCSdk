export interface EmbeddedAIChatViewerRuntimeConfig {
  welinkSessionId: number | null;
}

let embeddedRuntimeConfig: EmbeddedAIChatViewerRuntimeConfig | null = null;

export function setEmbeddedAIChatViewerRuntimeConfig(
  config: EmbeddedAIChatViewerRuntimeConfig | null
): void {
  embeddedRuntimeConfig = config;
}

export function getEmbeddedAIChatViewerRuntimeConfig(): EmbeddedAIChatViewerRuntimeConfig | null {
  return embeddedRuntimeConfig;
}
