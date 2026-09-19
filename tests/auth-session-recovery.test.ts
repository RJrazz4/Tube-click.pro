import { describe, expect, it } from "vitest";
import { findValidSessionRecord } from "../src/lib/auth/sessionRecord";

const session = (token: string) =>
  JSON.stringify({ access_token: token, user: { id: "u1" } });

describe("findValidSessionRecord", () => {
  it("returns the first usable session record", () => {
    const good = session("tok-a");
    const entries: Array<[string, string | null]> = [
      ["sb-x:guest", null],
      ["sb-x:u:u1", good],
      ["sb-x:u:u2", session("tok-b")],
    ];
    expect(findValidSessionRecord(entries)).toBe(good);
  });

  it("skips nulls and non-JSON values", () => {
    expect(
      findValidSessionRecord([["a", null], ["b", "not-json"], ["c", session("t")]]),
    ).toBe(session("t"));
  });

  it("returns null when no record has an access token", () => {
    expect(
      findValidSessionRecord([
        ["a", JSON.stringify({ user: { id: "u" } })],
        ["b", JSON.stringify({})],
        ["c", null],
      ]),
    ).toBeNull();
  });

  it("supports the currentSession nesting", () => {
    const nested = JSON.stringify({ currentSession: { access_token: "tok-n" } });
    expect(findValidSessionRecord([["a", nested]])).toBe(nested);
  });
});
