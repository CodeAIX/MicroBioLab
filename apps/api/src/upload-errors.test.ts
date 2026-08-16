import { describe, expect, it } from "vitest";
import { multipartLimitError } from "./upload-errors.js";

describe("multipartLimitError", () => {
  it("identifies an oversized cover", () => {
    const result = multipartLimitError({ code: "FST_REQ_FILE_TOO_LARGE", part: { fieldname: "cover" } });
    expect(result).toMatchObject({ code: "UPLOAD_TOO_LARGE", message: "封面图片不能超过 2 MiB", statusCode: 413 });
  });

  it("identifies an oversized JSX file", () => {
    const result = multipartLimitError({ code: "FST_REQ_FILE_TOO_LARGE", part: { fieldname: "jsx" } });
    expect(result).toMatchObject({ code: "UPLOAD_TOO_LARGE", message: "JSX 文件不能超过 2 MiB", statusCode: 413 });
  });

  it("ignores unrelated errors", () => {
    expect(multipartLimitError(new Error("unrelated"))).toBeNull();
  });
});
