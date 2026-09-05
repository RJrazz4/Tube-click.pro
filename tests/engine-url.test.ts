import { describe, expect, it } from "vitest";
import { normalizeBaseUrl } from "../src/lib/engine/url";

describe("normalizeBaseUrl", () => {
  it("repairs the malformed deployed value (embedded space)", () => {
    expect(
      normalizeBaseUrl("https://tubeclickpro- backend-engine.onrender.com"),
    ).toBe("https://tubeclickpro-backend-engine.onrender.com");
  });

  it("strips trailing slashes and surrounding whitespace", () => {
    expect(normalizeBaseUrl("  https://example.com/  ")).toBe("https://example.com");
    expect(normalizeBaseUrl("https://example.com///")).toBe("https://example.com");
  });

  it("drops accidental surrounding quotes and newlines", () => {
    expect(normalizeBaseUrl('"https://example.com"')).toBe("https://example.com");
    expect(normalizeBaseUrl("'https://a.com\n'")).toBe("https://a.com");
  });

  it("returns empty string for missing values", () => {
    expect(normalizeBaseUrl(undefined)).toBe("");
    expect(normalizeBaseUrl(null)).toBe("");
    expect(normalizeBaseUrl("")).toBe("");
  });

  it("leaves a clean URL untouched", () => {
    expect(normalizeBaseUrl("https://tubeclickpro-backend-engine.onrender.com")).toBe(
      "https://tubeclickpro-backend-engine.onrender.com",
    );
  });
});
