import { createHash, createHmac, randomBytes } from "node:crypto";
import { AppError } from "@microbio/shared";
import { config } from "./config.js";

export const SESSION_COOKIE = "microbio_session";
export const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");
export const newSessionToken = (): string => randomBytes(32).toString("base64url");
export const hashSessionToken = (token: string): string => createHmac("sha256", config.sessionSecret).update(token).digest("hex");

export function safeRelativePath(value: string): string {
  if (!value || value.includes("\\") || value.startsWith("/") || value.split("/").includes("..")) {
    throw new AppError("STORAGE_ERROR", "检测到不安全的文件路径", 500);
  }
  return value;
}

export function sanitizeOriginalFilename(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "App.jsx";
  return base.slice(0, 200).replace(/[\u0000-\u001f]/g, "_");
}
