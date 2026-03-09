import { describe, expect, it } from "vitest";
import { mapSessionStatus } from "../../src/sdk/core/statusMapper";

describe("mapSessionStatus", () => {
  it("maps executing events", () => {
    expect(
      mapSessionStatus({
        type: "text.delta",
        seq: 1,
        welinkSessionId: 1,
        emittedAt: new Date().toISOString()
      })
    ).toBe("executing");
  });

  it("maps completed session.status idle", () => {
    expect(
      mapSessionStatus({
        type: "session.status",
        seq: 1,
        welinkSessionId: 1,
        emittedAt: new Date().toISOString(),
        sessionStatus: "idle"
      })
    ).toBe("completed");
  });

  it("maps reject permission to stopped", () => {
    expect(
      mapSessionStatus({
        type: "permission.reply",
        seq: 1,
        welinkSessionId: 1,
        emittedAt: new Date().toISOString(),
        response: "reject"
      })
    ).toBe("stopped");
  });
});
