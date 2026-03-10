import { afterEach, describe, expect, it, vi } from "vitest";
import { getSharedFixtureBrowserSkillSdk } from "../../mocks/runtime/fixtureSkillSdk";
import type { FixtureSkillSdkData } from "../../mocks/runtime/fixtureSkillSdk";
import type { StreamMessage } from "../../src/sdk/types";

const fixtureData: FixtureSkillSdkData = {
  chunkSize: 8,
  chunkIntervalMs: 10,
  templates: {
    default: {
      responsePrefix: "Fixture response:",
      responseSuffix: "done.",
      toolOutput: "fixture tool output"
    }
  }
};

describe("fixtureSkillSdk", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams fixture events and stores assistant history", async () => {
    vi.useFakeTimers();
    const sdk = getSharedFixtureBrowserSkillSdk({
      runtimeKey: `fixture-stream-${Date.now()}`,
      fixtureData
    });
    const session = await sdk.createSession({
      ak: "fixture-skill",
      imGroupId: "group_fixture_001"
    });
    const events: StreamMessage[] = [];

    sdk.registerSessionListener({
      welinkSessionId: session.welinkSessionId,
      onMessage: (message) => events.push(message)
    });

    await sdk.sendMessage({
      welinkSessionId: session.welinkSessionId,
      content: "build something"
    });

    await vi.runAllTimersAsync();

    expect(events.some((event) => event.type === "text.delta")).toBe(true);
    expect(events.some((event) => event.type === "text.done")).toBe(true);

    const history = await sdk.getSessionMessage({
      welinkSessionId: session.welinkSessionId,
      page: 0,
      size: 20
    });

    expect(history.content.at(-1)?.role).toBe("assistant");
    expect(history.content.at(-1)?.content).toContain("Fixture response:");
  });

  it("stops an active fixture stream and does not emit text.done afterwards", async () => {
    vi.useFakeTimers();
    const sdk = getSharedFixtureBrowserSkillSdk({
      runtimeKey: `fixture-stop-${Date.now()}`,
      fixtureData
    });
    const session = await sdk.createSession({
      ak: "fixture-skill",
      imGroupId: "group_fixture_002"
    });
    const events: StreamMessage[] = [];

    sdk.registerSessionListener({
      welinkSessionId: session.welinkSessionId,
      onMessage: (message) => events.push(message)
    });

    await sdk.sendMessage({
      welinkSessionId: session.welinkSessionId,
      content: "stop this response"
    });

    await vi.advanceTimersByTimeAsync(35);
    await sdk.stopSkill({ welinkSessionId: session.welinkSessionId });
    await vi.runAllTimersAsync();

    expect(events.some((event) => event.type === "error")).toBe(true);
    expect(events.some((event) => event.type === "text.done")).toBe(false);
  });
});
