import { afterEach, describe, expect, it } from "vitest";
import {
  getSharedBrowserSkillSdk,
  resetSharedBrowserSkillSdk
} from "../../src/sdk/runtime/browserSkillSdkSingleton";

describe("browserSkillSdkSingleton", () => {
  afterEach(() => {
    resetSharedBrowserSkillSdk();
  });

  it("returns the same SDK instance for the same runtime config", () => {
    const first = getSharedBrowserSkillSdk({
      baseUrl: "http://localhost:8787",
      wsUrl: "ws://localhost:8787/ws/skill/stream"
    });
    const second = getSharedBrowserSkillSdk({
      baseUrl: "http://localhost:8787",
      wsUrl: "ws://localhost:8787/ws/skill/stream"
    });

    expect(first).toBe(second);
  });

  it("recreates the shared SDK when the runtime config changes", () => {
    const first = getSharedBrowserSkillSdk({
      baseUrl: "http://localhost:8787",
      wsUrl: "ws://localhost:8787/ws/skill/stream"
    });
    const second = getSharedBrowserSkillSdk({
      baseUrl: "http://localhost:9999",
      wsUrl: "ws://localhost:9999/ws/skill/stream"
    });

    expect(first).not.toBe(second);
  });
});
