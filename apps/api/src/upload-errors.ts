import { AppError } from "@microbio/shared";

export function multipartLimitError(error: unknown): AppError | null {
  const multipartError = error as { code?: unknown; part?: { fieldname?: unknown } };
  if (multipartError?.code !== "FST_REQ_FILE_TOO_LARGE") return null;

  const fieldname = multipartError.part?.fieldname;
  const message = fieldname === "cover"
    ? "封面图片不能超过 2 MiB"
    : fieldname === "knowledge"
      ? "知识点文件不能超过 512 KiB"
    : fieldname === "jsx"
      ? "JSX 文件不能超过 10 MiB"
      : "上传文件不能超过 10 MiB";
  return new AppError("UPLOAD_TOO_LARGE", message, 413);
}
