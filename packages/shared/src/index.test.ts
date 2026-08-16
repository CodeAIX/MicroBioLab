import { describe, expect, it } from "vitest";
import { assertSlug, COVER_MAX_UPLOAD_BYTES, formatVersion, JSX_MAX_UPLOAD_BYTES } from "./index.js";

describe("shared contracts", () => {
  it("formats immutable version paths", () => expect(formatVersion(12)).toBe("v000012"));
  it("normalizes valid slugs", () => expect(assertSlug("Demo-Lab")).toBe("demo-lab"));
  it("rejects unsafe slugs", () => expect(() => assertSlug("../demo")).toThrow(/Slug/));
  it("keeps upload limits explicit", () => {
    expect(JSX_MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(COVER_MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
  });
});
