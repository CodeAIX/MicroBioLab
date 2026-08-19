import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError, COVER_MAX_UPLOAD_BYTES, formatVersion, JSX_MAX_UPLOAD_BYTES, KNOWLEDGE_REVIEW_MAX_UPLOAD_BYTES } from "@microbio/shared";
import { config } from "./config.js";
import { safeRelativePath, sha256 } from "./security.js";

export async function ensureStorage(): Promise<void> {
  await Promise.all([config.sourceRoot, config.buildRoot, config.publishedRoot, config.coverRoot].map((dir) => mkdir(dir, { recursive: true })));
}

export function decodeJsx(buffer: Buffer): string {
  if (buffer.byteLength > JSX_MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_TOO_LARGE", "JSX 文件不能超过 10 MiB", 413);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new AppError("UPLOAD_INVALID", "JSX 文件必须使用 UTF-8 编码");
  }
}

export function decodeKnowledgeReview(buffer: Buffer): string {
  if (buffer.byteLength > KNOWLEDGE_REVIEW_MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_TOO_LARGE", "知识点文件不能超过 512 KiB", 413);
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new AppError("UPLOAD_INVALID", "知识点文件必须使用 UTF-8 编码");
  }
  if (!content.trim()) throw new AppError("UPLOAD_INVALID", "知识点文件不能为空");
  return content;
}

export async function saveSource(input: {
  experimentId: string;
  versionId: string;
  originalFilename: string;
  contents: Buffer;
  uploadedBy: string;
}): Promise<{ sourcePath: string; digest: string }> {
  const relativeDir = `${input.experimentId}/${input.versionId}`;
  const directory = path.join(config.sourceRoot, relativeDir);
  await mkdir(directory, { recursive: true });
  const digest = sha256(input.contents);
  await writeFile(path.join(directory, "App.jsx"), input.contents, { flag: "wx", mode: 0o640 });
  await writeFile(path.join(directory, "source.json"), JSON.stringify({
    schemaVersion: 1,
    originalFilename: input.originalFilename,
    sha256: digest,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uploadedBy,
  }, null, 2), { flag: "wx", mode: 0o640 });
  return { sourcePath: `${relativeDir}/App.jsx`, digest };
}

export async function removeSourceVersion(experimentId: string, versionId: string): Promise<void> {
  await rm(path.join(config.sourceRoot, safeRelativePath(`${experimentId}/${versionId}`)), { recursive: true, force: true });
}

async function directoryBytes(directory: string): Promise<number> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) total += await directoryBytes(target);
      else if (entry.isFile()) total += (await stat(target)).size;
    }
    return total;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export async function measureVersionStorage(experimentId: string, versionId: string): Promise<{ sourceBytes: number; buildBytes: number }> {
  const [sourceBytes, buildBytes] = await Promise.all([
    directoryBytes(path.join(config.sourceRoot, safeRelativePath(`${experimentId}/${versionId}`))),
    directoryBytes(path.join(config.buildRoot, safeRelativePath(versionId))),
  ]);
  return { sourceBytes, buildBytes };
}

export async function saveCover(contents: Buffer): Promise<string> {
  if (contents.byteLength > COVER_MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_TOO_LARGE", "封面图片不能超过 2 MiB", 413);
  let extension: string | undefined;
  if (contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) extension = ".png";
  else if (contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff) extension = ".jpg";
  else if (contents.subarray(0, 4).toString("ascii") === "RIFF" && contents.subarray(8, 12).toString("ascii") === "WEBP") extension = ".webp";
  if (!extension) throw new AppError("UPLOAD_INVALID", "封面只支持 PNG、JPEG 或 WebP 图片");
  const filename = `${randomUUID()}${extension}`;
  await writeFile(path.join(config.coverRoot, filename), contents, { flag: "wx", mode: 0o640 });
  return filename;
}

interface ManifestFile { path: string; sha256: string }
interface Manifest { sourceSha256: string; files: ManifestFile[] }

async function verifyBuild(buildDir: string, expectedSourceSha: string): Promise<Manifest> {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(buildDir, "manifest.json"), "utf8")) as Manifest;
  } catch {
    throw new AppError("PUBLISH_FAILED", "构建清单不存在或格式错误", 409);
  }
  if (manifest.sourceSha256 !== expectedSourceSha || !Array.isArray(manifest.files)) {
    throw new AppError("PUBLISH_FAILED", "构建清单与源码不匹配", 409);
  }
  for (const file of manifest.files) {
    safeRelativePath(file.path);
    const fullPath = path.join(buildDir, file.path);
    const info = await stat(fullPath);
    if (!info.isFile() || sha256(await readFile(fullPath)) !== file.sha256) {
      throw new AppError("PUBLISH_FAILED", `构建文件校验失败：${file.path}`, 409);
    }
  }
  return manifest;
}

export async function publishBuild(input: { slug: string; versionNumber: number; buildPath: string; sourceSha256: string }): Promise<{ publishedPath: string; created: boolean }> {
  const buildDir = path.join(config.buildRoot, safeRelativePath(input.buildPath));
  await verifyBuild(buildDir, input.sourceSha256);
  const versionName = formatVersion(input.versionNumber);
  const slugDir = path.join(config.publishedRoot, safeRelativePath(input.slug));
  const destination = path.join(slugDir, versionName);
  try {
    const existing = await stat(destination);
    if (existing.isDirectory()) {
      await verifyBuild(destination, input.sourceSha256);
      return { publishedPath: `${input.slug}/${versionName}`, created: false };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(slugDir, { recursive: true });
  const temp = path.join(slugDir, `.tmp-${randomUUID()}`);
  try {
    await cp(buildDir, temp, { recursive: true, errorOnExist: true, force: false });
    await verifyBuild(temp, input.sourceSha256);
    await rename(temp, destination);
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
  return { publishedPath: `${input.slug}/${versionName}`, created: true };
}
