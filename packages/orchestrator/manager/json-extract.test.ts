import { describe, expect, it } from "vitest";

import { extractJsonObject } from "./json-extract.js";

describe("extractJsonObject", () => {
  it("returns a plain object as-is", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("unwraps ```json fences", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("unwraps language-less fences", () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips prose around the object", () => {
    expect(extractJsonObject('Sure! Here it is: {"a":{"b":2}} — done.')).toBe('{"a":{"b":2}}');
  });

  it("spans nested objects via first/last brace", () => {
    expect(extractJsonObject('{"outer":{"inner":[1,{"x":2}]}}')).toBe('{"outer":{"inner":[1,{"x":2}]}}');
  });

  it("returns null for array-only or brace-less output", () => {
    expect(extractJsonObject("[1,2,3]")).toBeNull();
    expect(extractJsonObject("no json here at all")).toBeNull();
  });
});
