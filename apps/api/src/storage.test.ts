import { describe, expect, it } from "vitest";
import { COVER_MAX_UPLOAD_BYTES, JSX_MAX_UPLOAD_BYTES } from "@microbio/shared";
import { decodeJsx, saveCover } from "./storage.js";

describe("upload size limits", () => {
  it("accepts JSX larger than the former 2 MiB limit", () => {
    const contents = Buffer.alloc(COVER_MAX_UPLOAD_BYTES + 1, 0x61);
    expect(() => decodeJsx(contents)).not.toThrow();
  });

  it("rejects JSX larger than 10 MiB", () => {
    const contents = Buffer.alloc(JSX_MAX_UPLOAD_BYTES + 1);
    expect(() => decodeJsx(contents)).toThrow(/JSX 文件不能超过 10 MiB/);
  });

  it("keeps the cover limit at 2 MiB", async () => {
    const contents = Buffer.alloc(COVER_MAX_UPLOAD_BYTES + 1);
    await expect(saveCover(contents)).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE", statusCode: 413 });
  });
});
