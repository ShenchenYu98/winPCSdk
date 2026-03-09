import { createBrowserSkillSdk, type BrowserSkillSdkOptions } from "../browser/createBrowserSkillSdk";
import type { SkillSdkApi } from "../types";

let sharedBrowserSkillSdk: SkillSdkApi | null = null;
let sharedConfigKey: string | null = null;

export function getSharedBrowserSkillSdk(options: BrowserSkillSdkOptions): SkillSdkApi {
  const configKey = buildConfigKey(options);

  if (!sharedBrowserSkillSdk || sharedConfigKey !== configKey) {
    sharedBrowserSkillSdk = createBrowserSkillSdk(options);
    sharedConfigKey = configKey;
  }

  return sharedBrowserSkillSdk;
}

export function resetSharedBrowserSkillSdk(): void {
  sharedBrowserSkillSdk = null;
  sharedConfigKey = null;
}

function buildConfigKey(options: BrowserSkillSdkOptions): string {
  return `${options.baseUrl}::${options.wsUrl}`;
}
