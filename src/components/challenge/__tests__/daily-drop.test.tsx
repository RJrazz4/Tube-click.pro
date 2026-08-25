import { describe, expect, it } from "vitest";
import { dropCountdownText } from "../dropCountdown";

describe("dropCountdownText (appointment countdown)", () => {
  it("shows READY once the drop time has passed", () => {
    expect(dropCountdownText("2026-08-25T05:00:00Z", new Date("2026-08-25T05:00:01Z"))).toBe("READY");
  });
  it("formats hours and minutes until the drop", () => {
    expect(dropCountdownText("2026-08-25T07:30:00Z", new Date("2026-08-25T05:00:00Z"))).toBe("in 2h 30m");
    expect(dropCountdownText("2026-08-25T05:20:00Z", new Date("2026-08-25T05:00:00Z"))).toBe("in 20m");
  });
});
