import { describe, expect, it } from "vitest";
import { safeRelativePath, sanitizeOriginalFilename, sha256 } from "./security.js";

describe("storage security", () => {
  it("hashes content", () => expect(sha256("abc")).toHaveLength(64));
  it("rejects traversal", () => expect(() => safeRelativePath("a/../b")).toThrow(/路径/));
  it("drops client directories", () => expect(sanitizeOriginalFilename("../../App.jsx")).toBe("App.jsx"));
});
