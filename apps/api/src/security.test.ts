import { describe, expect, it } from "vitest";
import { newPreviewToken, safeRelativePath, sanitizeOriginalFilename, sha256, verifyPreviewToken } from "./security.js";

describe("storage security", () => {
  it("hashes content", () => expect(sha256("abc")).toHaveLength(64));
  it("rejects traversal", () => expect(() => safeRelativePath("a/../b")).toThrow(/路径/));
  it("drops client directories", () => expect(sanitizeOriginalFilename("../../App.jsx")).toBe("App.jsx"));
  it("accepts only a current token bound to the preview version", () => {
    const token = newPreviewToken("version-a", 200);
    expect(verifyPreviewToken("version-a", token, 100)).toBe(true);
    expect(verifyPreviewToken("version-b", token, 100)).toBe(false);
    expect(verifyPreviewToken("version-a", token, 201)).toBe(false);
    expect(verifyPreviewToken("version-a", `${token}tampered`, 100)).toBe(false);
  });
});
