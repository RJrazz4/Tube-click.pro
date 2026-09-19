import { describe, expect, it } from "vitest";
import { hasScriptCues, parseScriptCues } from "../src/lib/scriptCues";

describe("parseScriptCues", () => {
  it("returns [] for empty input", () => {
    expect(parseScriptCues("")).toEqual([]);
  });

  it("passes plain text through as a single segment", () => {
    expect(parseScriptCues("just a normal line")).toEqual([{ type: "text", value: "just a normal line" }]);
  });

  it("splits spoken text around a directorial cue", () => {
    const segs = parseScriptCues("You freeze. [voice drops to a whisper] Then you run.");
    expect(segs).toEqual([
      { type: "text", value: "You freeze. " },
      { type: "cue", value: "voice drops to a whisper" },
      { type: "text", value: " Then you run." },
    ]);
  });

  it("handles multiple cues", () => {
    const segs = parseScriptCues("[silence] A [beat] B");
    expect(segs.filter((s) => s.type === "cue").map((s) => s.value)).toEqual(["silence", "beat"]);
  });

  it("does NOT treat markdown links as cues", () => {
    const segs = parseScriptCues("See [the docs](https://x.dev) for more.");
    expect(segs.every((s) => s.type === "text")).toBe(true);
    expect(hasScriptCues("See [the docs](https://x.dev) for more.")).toBe(false);
  });

  it("does NOT treat timestamps as cues", () => {
    expect(hasScriptCues("[00:42] and [1:02:03]")).toBe(false);
  });

  it("keeps a real cue that follows a link", () => {
    const segs = parseScriptCues("See [docs](x) then [whisper] now");
    expect(segs.some((s) => s.type === "cue" && s.value === "whisper")).toBe(true);
  });
});
