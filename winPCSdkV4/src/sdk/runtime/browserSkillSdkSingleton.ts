import {
  createBrowserSkillSdk,
  resolveBrowserSkillSdkOptions,
  type BrowserSkillSdkOptions
} from "../browser/createBrowserSkillSdk";
import type { SkillSdkApi } from "../types";

let sharedBrowserSkillSdk: SkillSdkApi | null = null;
let sharedConfigKey: string | null = null;

export function getSharedBrowserSkillSdk(options: BrowserSkillSdkOptions = {}): SkillSdkApi {
  const resolvedOptions = resolveBrowserSkillSdkOptions(options);
  const configKey = buildConfigKey(resolvedOptions);

  if (!sharedBrowserSkillSdk || sharedConfigKey !== configKey) {
    sharedBrowserSkillSdk = createBrowserSkillSdk(resolvedOptions);
    sharedConfigKey = configKey;
  }

  return sharedBrowserSkillSdk;
}

export function resetSharedBrowserSkillSdk(): void {
  sharedBrowserSkillSdk = null;
  sharedConfigKey = null;
}

function buildConfigKey(options: { baseUrl: string; wsUrl: string }): string {
  return `${options.baseUrl}::${options.wsUrl}`;
}
