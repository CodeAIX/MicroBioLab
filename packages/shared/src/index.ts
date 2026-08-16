export const EXPERIMENT_STATUSES = ["draft", "published", "hidden", "archived"] as const;
export const VERSION_STATUSES = ["queued", "building", "success", "failed"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export interface ApiErrorBody {
  error: { code: string; message: string; requestId?: string; details?: unknown };
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function formatVersion(versionNumber: number): string {
  if (!Number.isSafeInteger(versionNumber) || versionNumber < 1) {
    throw new AppError("VERSION_INVALID", "版本号必须是正整数");
  }
  return `v${String(versionNumber).padStart(6, "0")}`;
}

export function assertSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new AppError("SLUG_INVALID", "Slug 只能包含小写字母、数字和单个连字符，最长 80 个字符");
  }
  return slug;
}
