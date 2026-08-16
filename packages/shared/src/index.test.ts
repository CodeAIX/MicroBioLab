import { describe, expect, it } from "vitest";
import { assertSlug, formatVersion } from "./index.js";

describe("shared contracts", () => {
  it("formats immutable version paths", () => expect(formatVersion(12)).toBe("v000012"));
  it("normalizes valid slugs", () => expect(assertSlug("Demo-Lab")).toBe("demo-lab"));
  it("rejects unsafe slugs", () => expect(() => assertSlug("../demo")).toThrow(/Slug/));
});
