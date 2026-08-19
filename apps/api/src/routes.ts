import { randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError, assertSlug, formatVersion } from "@microbio/shared";
import { config } from "./config.js";
import { pool, transaction } from "./db.js";
import { requireAdmin } from "./auth.js";
import { decodeJsx, decodeKnowledgeReview, publishBuild, removeSourceVersion, saveCover, saveSource } from "./storage.js";
import { newPreviewToken, safeRelativePath, sanitizeOriginalFilename, verifyPreviewToken } from "./security.js";
import { multipartLimitError } from "./upload-errors.js";

async function audit(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, request: FastifyRequest, action: string, entityType: string, entityId?: string, metadata: object = {}): Promise<void> {
  await client.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)", [request.user?.id ?? null, action, entityType, entityId ?? null, JSON.stringify(metadata)]);
}

type KnowledgeReviewUpload = { filename: string; content: string };

async function readMultipart(
  request: FastifyRequest,
  options: { allowCover?: boolean; allowKnowledge?: boolean } = {},
): Promise<{ fields: Record<string, string>; filename: string; contents: Buffer; cover?: Buffer; knowledge?: KnowledgeReviewUpload }> {
  const fields: Record<string, string> = {};
  let file: { filename: string; contents: Buffer } | undefined;
  let cover: Buffer | undefined;
  let knowledge: KnowledgeReviewUpload | undefined;
  try {
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname === "cover") {
          if (!options.allowCover) throw new AppError("UPLOAD_INVALID", "此处不允许上传封面");
          if (cover) throw new AppError("UPLOAD_INVALID", "只能上传一张封面");
          cover = await part.toBuffer();
        } else if (part.fieldname === "knowledge") {
          if (!options.allowKnowledge) throw new AppError("UPLOAD_INVALID", "此处不允许上传知识点文件");
          if (knowledge) throw new AppError("UPLOAD_INVALID", "只能上传一个知识点文件");
          if (!part.filename.toLowerCase().endsWith(".md")) throw new AppError("UPLOAD_INVALID", "知识点只允许上传 .md 文件");
          if (!["text/markdown", "text/plain", "application/octet-stream"].includes(part.mimetype)) throw new AppError("UPLOAD_INVALID", "知识点文件 MIME 类型不受支持");
          knowledge = { filename: sanitizeOriginalFilename(part.filename), content: decodeKnowledgeReview(await part.toBuffer()) };
        } else if (part.fieldname === "jsx") {
          if (file) throw new AppError("UPLOAD_INVALID", "每次只允许上传一个 JSX 文件");
          if (!part.filename.toLowerCase().endsWith(".jsx")) throw new AppError("UPLOAD_INVALID", "只允许上传 .jsx 文件");
          if (!["text/jsx", "text/plain", "text/javascript", "application/javascript", "application/octet-stream"].includes(part.mimetype)) throw new AppError("UPLOAD_INVALID", "JSX 文件 MIME 类型不受支持");
          file = { filename: sanitizeOriginalFilename(part.filename), contents: await part.toBuffer() };
        } else {
          await part.toBuffer();
          throw new AppError("UPLOAD_INVALID", `不支持的文件字段：${part.fieldname}`);
        }
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
  } catch (error) {
    throw multipartLimitError(error) ?? error;
  }
  if (!file) throw new AppError("UPLOAD_INVALID", "请选择 JSX 文件");
  decodeJsx(file.contents);
  return { fields, ...file, ...(cover?.byteLength ? { cover } : {}), ...(knowledge ? { knowledge } : {}) };
}

async function readKnowledgeReviewUpload(request: FastifyRequest): Promise<KnowledgeReviewUpload> {
  let knowledge: KnowledgeReviewUpload | undefined;
  try {
    for await (const part of request.parts()) {
      if (part.type !== "file") continue;
      if (part.fieldname !== "knowledge") {
        await part.toBuffer();
        throw new AppError("UPLOAD_INVALID", "只允许上传一个知识点文件");
      }
      if (knowledge) throw new AppError("UPLOAD_INVALID", "只能上传一个知识点文件");
      if (!part.filename.toLowerCase().endsWith(".md")) throw new AppError("UPLOAD_INVALID", "知识点只允许上传 .md 文件");
      if (!["text/markdown", "text/plain", "application/octet-stream"].includes(part.mimetype)) throw new AppError("UPLOAD_INVALID", "知识点文件 MIME 类型不受支持");
      knowledge = { filename: sanitizeOriginalFilename(part.filename), content: decodeKnowledgeReview(await part.toBuffer()) };
    }
  } catch (error) {
    throw multipartLimitError(error) ?? error;
  }
  if (!knowledge) throw new AppError("UPLOAD_INVALID", "请选择知识点文件");
  return knowledge;
}

async function readCoverUpload(request: FastifyRequest): Promise<Buffer> {
  let cover: Buffer | undefined;
  try {
    for await (const part of request.parts()) {
      if (part.type !== "file") continue;
      if (part.fieldname !== "cover") {
        await part.toBuffer();
        throw new AppError("UPLOAD_INVALID", "只允许上传一张封面图片");
      }
      if (cover) throw new AppError("UPLOAD_INVALID", "只能上传一张封面");
      cover = await part.toBuffer();
    }
  } catch (error) {
    throw multipartLimitError(error) ?? error;
  }
  if (!cover?.byteLength) throw new AppError("UPLOAD_INVALID", "请选择封面图片");
  return cover;
}

async function createVersion(request: FastifyRequest, experimentId: string, requestedVersionNumber: number | null, filename: string, contents: Buffer): Promise<string> {
  const versionId = randomUUID();
  const jobId = randomUUID();
  const source = await saveSource({ experimentId, versionId, originalFilename: filename, contents, uploadedBy: request.user!.id });
  try {
    await transaction(async (client) => {
      const experiment = await client.query("SELECT id FROM experiments WHERE id=$1 FOR UPDATE", [experimentId]);
      if (!experiment.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
      const next = await client.query("SELECT COALESCE(max(version_number),0)::int+1 AS value FROM experiment_versions WHERE experiment_id=$1", [experimentId]);
      const versionNumber = requestedVersionNumber ?? next.rows[0]!.value as number;
      if (requestedVersionNumber !== null && requestedVersionNumber !== next.rows[0]!.value) throw new AppError("VERSION_CONFLICT", "版本号与当前实验状态冲突", 409);
      await client.query(
        `INSERT INTO experiment_versions(id,experiment_id,version_number,source_filename,source_path,source_sha256,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [versionId, experimentId, versionNumber, filename, source.sourcePath, source.digest, request.user!.id],
      );
      await client.query("INSERT INTO build_jobs(id,version_id) VALUES ($1,$2)", [jobId, versionId]);
      await audit(client, request, "upload_version", "experiment_version", versionId, { versionNumber, sourceSha256: source.digest });
    });
  } catch (error) {
    await removeSourceVersion(experimentId, versionId);
    throw error;
  }
  return versionId;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      await Promise.all([config.sourceRoot, config.buildRoot, config.publishedRoot].map((root) => stat(root)));
      return { status: "ready", database: "ok", storage: "ok" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  app.get("/api/public/experiments", async () => {
    const result = await pool.query(
      `SELECT e.slug,e.title,e.description,e.category,e.cover_path,e.updated_at,v.version_number
       FROM experiments e JOIN experiment_versions v ON v.id=e.active_version_id
       WHERE e.status='published' ORDER BY e.display_order,e.created_at`,
    );
    return { experiments: result.rows.map((row) => ({ ...row, version: formatVersion(row.version_number as number), iframeUrl: `${config.experimentOrigin}/e/${row.slug as string}/${formatVersion(row.version_number as number)}/` })) };
  });

  app.get("/api/public/experiments/:slug", async (request) => {
    const { slug } = request.params as { slug: string };
    const result = await pool.query(
      `SELECT e.slug,e.title,e.description,e.category,e.cover_path,e.updated_at,v.version_number,
       EXISTS(SELECT 1 FROM experiment_knowledge_reviews k WHERE k.experiment_id=e.id) AS has_knowledge_review
       FROM experiments e JOIN experiment_versions v ON v.id=e.active_version_id WHERE e.slug=$1 AND e.status='published'`,
      [slug],
    );
    if (!result.rowCount) throw new AppError("NOT_FOUND", "实验不存在或尚未发布", 404);
    const row = result.rows[0]!;
    return { experiment: { ...row, version: formatVersion(row.version_number as number), iframeUrl: `${config.experimentOrigin}/e/${row.slug as string}/${formatVersion(row.version_number as number)}/` } };
  });

  app.get("/api/public/experiments/:slug/knowledge-review", async (request) => {
    const { slug } = request.params as { slug: string };
    const result = await pool.query(
      `SELECT k.content,k.updated_at
       FROM experiment_knowledge_reviews k JOIN experiments e ON e.id=k.experiment_id
       WHERE e.slug=$1 AND e.status='published'`,
      [slug],
    );
    if (!result.rowCount) throw new AppError("NOT_FOUND", "该实验暂未提供知识点复习", 404);
    return { knowledgeReview: result.rows[0] };
  });

  app.get("/covers/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(filename)) throw new AppError("NOT_FOUND", "封面不存在", 404);
    const content = await readFile(path.join(config.coverRoot, filename)).catch(() => { throw new AppError("NOT_FOUND", "封面不存在", 404); });
    const type = filename.endsWith(".png") ? "image/png" : filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
    reply.header("Content-Type", type).header("Cache-Control", "public, max-age=86400");
    return reply.send(content);
  });

  app.get("/api/dashboard", { preHandler: requireAdmin }, async () => {
    const [counts, failed, recent, logs] = await Promise.all([
      pool.query("SELECT status,count(*)::int AS count FROM experiments GROUP BY status"),
      pool.query("SELECT count(*)::int AS count FROM experiment_versions WHERE status='failed'"),
      pool.query("SELECT id,slug,title,status,updated_at FROM experiments ORDER BY updated_at DESC LIMIT 8"),
      pool.query("SELECT a.*,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 8"),
    ]);
    return { counts: counts.rows, buildFailed: failed.rows[0]?.count ?? 0, recent: recent.rows, logs: logs.rows };
  });

  app.get("/api/experiments", { preHandler: requireAdmin }, async () => {
    const result = await pool.query(
      `SELECT e.*,v.version_number AS active_version_number,
       (SELECT count(*)::int FROM experiment_versions ev WHERE ev.experiment_id=e.id) AS version_count
       FROM experiments e LEFT JOIN experiment_versions v ON v.id=e.active_version_id ORDER BY e.display_order,e.created_at`,
    );
    return { experiments: result.rows };
  });

  app.put("/api/experiments/order", { preHandler: requireAdmin }, async (request) => {
    const body = (request.body ?? {}) as { experimentIds?: unknown };
    const experimentIds = body.experimentIds;
    if (!Array.isArray(experimentIds) || experimentIds.length > 1000 || experimentIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      throw new AppError("ORDER_INVALID", "教学顺序数据格式不正确");
    }
    if (new Set(experimentIds).size !== experimentIds.length) throw new AppError("ORDER_INVALID", "教学顺序中存在重复实验");
    await transaction(async (client) => {
      const existing = await client.query("SELECT id FROM experiments FOR UPDATE");
      const existingIds = new Set(existing.rows.map((row) => row.id as string));
      if (experimentIds.length !== existingIds.size || experimentIds.some((id) => !existingIds.has(id as string))) {
        throw new AppError("ORDER_CONFLICT", "实验列表已发生变化，请刷新后重试", 409);
      }
      await client.query(
        `UPDATE experiments SET display_order=(ordering.position*10)::integer
         FROM unnest($1::uuid[]) WITH ORDINALITY AS ordering(id,position)
         WHERE experiments.id=ordering.id`,
        [experimentIds],
      );
      await audit(client, request, "reorder_experiments", "experiment", undefined, { count: experimentIds.length });
    });
    return { ok: true };
  });

  app.post("/api/experiments", { preHandler: requireAdmin }, async (request, reply) => {
    const upload = await readMultipart(request, { allowCover: true, allowKnowledge: true });
    const title = upload.fields.title?.trim();
    if (!title || title.length > 200) throw new AppError("UPLOAD_INVALID", "实验标题必填且最长 200 个字符");
    const slug = assertSlug(upload.fields.slug ?? "");
    const experimentId = randomUUID();
    const coverPath = upload.cover ? await saveCover(upload.cover) : null;
    try {
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO experiments(id,slug,title,description,category,cover_path,created_by,display_order)
           SELECT $1,$2,$3,$4,$5,$6,$7,COALESCE(max(display_order),0)+10 FROM experiments`,
          [experimentId, slug, title, upload.fields.description?.slice(0, 4000) ?? "", upload.fields.category?.slice(0, 100) ?? "", coverPath, request.user!.id],
        );
        if (upload.knowledge) {
          await client.query(
            `INSERT INTO experiment_knowledge_reviews(experiment_id,content,source_filename,updated_by)
             VALUES ($1,$2,$3,$4)`,
            [experimentId, upload.knowledge.content, upload.knowledge.filename, request.user!.id],
          );
        }
        await audit(client, request, "create_experiment", "experiment", experimentId, { slug });
      });
      const versionId = await createVersion(request, experimentId, 1, upload.filename, upload.contents);
      return reply.code(201).send({ experimentId, versionId });
    } catch (error) {
      await pool.query("DELETE FROM experiments WHERE id=$1", [experimentId]).catch(() => undefined);
      await rm(path.join(config.sourceRoot, experimentId), { recursive: true, force: true });
      if (coverPath) await rm(path.join(config.coverRoot, coverPath), { force: true });
      throw error;
    }
  });

  app.get("/api/experiments/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `SELECT e.*,k.content AS knowledge_review,k.source_filename AS knowledge_review_filename,k.updated_at AS knowledge_review_updated_at
       FROM experiments e LEFT JOIN experiment_knowledge_reviews k ON k.experiment_id=e.id WHERE e.id=$1`,
      [id],
    );
    if (!result.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
    return { experiment: result.rows[0] };
  });

  app.patch("/api/experiments/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { title?: string; description?: string; category?: string; slug?: string };
    const current = await pool.query("SELECT slug,slug_locked FROM experiments WHERE id=$1", [id]);
    if (!current.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
    const nextSlug = body.slug ? assertSlug(body.slug) : current.rows[0]!.slug as string;
    if (current.rows[0]!.slug_locked && nextSlug !== current.rows[0]!.slug) throw new AppError("SLUG_LOCKED", "实验首次发布后不能修改 Slug", 409);
    await transaction(async (client) => {
      await client.query(
        `UPDATE experiments SET slug=$2,title=COALESCE($3,title),description=COALESCE($4,description),category=COALESCE($5,category),updated_at=now() WHERE id=$1`,
        [id, nextSlug, body.title?.trim() || null, body.description?.slice(0, 4000) ?? null, body.category?.slice(0, 100) ?? null],
      );
      await audit(client, request, "update_experiment", "experiment", id);
    });
    return { ok: true };
  });

  app.post("/api/experiments/:id/cover", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const coverPath = await saveCover(await readCoverUpload(request));
    let previousPath: string | null = null;
    try {
      await transaction(async (client) => {
        const found = await client.query("SELECT cover_path FROM experiments WHERE id=$1 FOR UPDATE", [id]);
        if (!found.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
        previousPath = found.rows[0]!.cover_path as string | null;
        await client.query("UPDATE experiments SET cover_path=$2,updated_at=now() WHERE id=$1", [id, coverPath]);
        await audit(client, request, "update_cover", "experiment", id, { coverPath });
      });
    } catch (error) {
      await rm(path.join(config.coverRoot, coverPath), { force: true });
      throw error;
    }
    if (previousPath) await rm(path.join(config.coverRoot, safeRelativePath(previousPath)), { force: true });
    return { ok: true, coverPath };
  });

  app.delete("/api/experiments/:id/cover", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    let previousPath: string | null = null;
    await transaction(async (client) => {
      const found = await client.query("SELECT cover_path FROM experiments WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
      previousPath = found.rows[0]!.cover_path as string | null;
      await client.query("UPDATE experiments SET cover_path=NULL,updated_at=now() WHERE id=$1", [id]);
      await audit(client, request, "delete_cover", "experiment", id);
    });
    if (previousPath) await rm(path.join(config.coverRoot, safeRelativePath(previousPath)), { force: true });
    return { ok: true };
  });

  app.post("/api/experiments/:id/knowledge-review", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const knowledge = await readKnowledgeReviewUpload(request);
    await transaction(async (client) => {
      const found = await client.query("SELECT id FROM experiments WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
      await client.query(
        `INSERT INTO experiment_knowledge_reviews(experiment_id,content,source_filename,updated_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (experiment_id) DO UPDATE SET content=EXCLUDED.content,source_filename=EXCLUDED.source_filename,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [id, knowledge.content, knowledge.filename, request.user!.id],
      );
      await client.query("UPDATE experiments SET updated_at=now() WHERE id=$1", [id]);
      await audit(client, request, "update_knowledge_review", "experiment", id, { sourceFilename: knowledge.filename });
    });
    return { ok: true };
  });

  app.delete("/api/experiments/:id/knowledge-review", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    await transaction(async (client) => {
      const deleted = await client.query("DELETE FROM experiment_knowledge_reviews WHERE experiment_id=$1 RETURNING experiment_id", [id]);
      if (!deleted.rowCount) throw new AppError("NOT_FOUND", "该实验没有知识点复习", 404);
      await client.query("UPDATE experiments SET updated_at=now() WHERE id=$1", [id]);
      await audit(client, request, "delete_knowledge_review", "experiment", id);
    });
    return { ok: true };
  });

  app.get("/api/experiments/:id/versions", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `SELECT v.*,j.status AS job_status,j.error_code,j.error_message,j.started_at,j.finished_at
       FROM experiment_versions v LEFT JOIN build_jobs j ON j.version_id=v.id WHERE v.experiment_id=$1 ORDER BY v.version_number DESC`, [id],
    );
    return { versions: result.rows };
  });

  app.post("/api/experiments/:id/versions", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const upload = await readMultipart(request);
    const versionId = await createVersion(request, id, null, upload.filename, upload.contents);
    return reply.code(201).send({ versionId });
  });

  app.get("/api/versions/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `SELECT v.*,e.slug,e.title,e.active_version_id,j.status AS job_status,j.error_code,j.error_message,j.started_at,j.finished_at
       FROM experiment_versions v JOIN experiments e ON e.id=v.experiment_id LEFT JOIN build_jobs j ON j.version_id=v.id WHERE v.id=$1`, [id],
    );
    if (!result.rowCount) throw new AppError("NOT_FOUND", "版本不存在", 404);
    return { version: result.rows[0] };
  });

  app.get("/api/versions/:id/build-log", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await pool.query("SELECT status,worker_id,created_at,started_at,finished_at,error_code,error_message FROM build_jobs WHERE version_id=$1", [id]);
    if (!result.rowCount) throw new AppError("NOT_FOUND", "构建任务不存在", 404);
    return { build: result.rows[0] };
  });

  app.post("/api/versions/:id/publish", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `SELECT v.*,e.slug,e.active_version_id FROM experiment_versions v JOIN experiments e ON e.id=v.experiment_id WHERE v.id=$1`, [id],
    );
    if (!result.rowCount) throw new AppError("NOT_FOUND", "版本不存在", 404);
    const version = result.rows[0]!;
    if (version.status !== "success" || !version.build_path) throw new AppError("PUBLISH_FAILED", "只有构建成功的版本才能发布", 409);
    const published = await publishBuild({ slug: version.slug as string, versionNumber: version.version_number as number, buildPath: version.build_path as string, sourceSha256: version.source_sha256 as string });
    try {
      await transaction(async (client) => {
        await client.query("UPDATE experiments SET active_version_id=$2,status='published',slug_locked=true,updated_at=now() WHERE id=$1", [version.experiment_id, id]);
        await client.query("UPDATE experiment_versions SET published_at=COALESCE(published_at,now()) WHERE id=$1", [id]);
        await audit(client, request, version.published_at ? "rollback" : "publish", "experiment_version", id, { publishedPath: published.publishedPath });
      });
    } catch (error) {
      if (published.created) await rm(path.join(config.publishedRoot, safeRelativePath(published.publishedPath)), { recursive: true, force: true });
      throw error;
    }
    return { ok: true, publishedPath: published.publishedPath };
  });

  app.delete("/api/versions/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const deleted = await transaction(async (client) => {
      const found = await client.query(
        `SELECT v.experiment_id,v.published_at,v.status,e.active_version_id
         FROM experiment_versions v JOIN experiments e ON e.id=v.experiment_id
         WHERE v.id=$1 FOR UPDATE OF v,e`, [id],
      );
      if (!found.rowCount) throw new AppError("NOT_FOUND", "版本不存在", 404);
      if (found.rows[0]!.active_version_id === id) throw new AppError("VERSION_ACTIVE", "当前生效版本不能删除", 409);
      if (found.rows[0]!.published_at) throw new AppError("VERSION_PUBLISHED", "已发布过的历史版本不可删除", 409);
      if (["queued", "building"].includes(found.rows[0]!.status as string)) throw new AppError("VERSION_BUSY", "构建中的版本暂时不能删除", 409);
      await audit(client, request, "delete_version", "experiment_version", id);
      await client.query("DELETE FROM experiment_versions WHERE id=$1", [id]);
      return found.rows[0]!;
    });
    await removeSourceVersion(deleted.experiment_id as string, id);
    await rm(path.join(config.buildRoot, id), { recursive: true, force: true });
    return { ok: true };
  });

  for (const [route, status, action] of [
    ["hide", "hidden", "hide_experiment"], ["archive", "archived", "archive_experiment"], ["restore", "draft", "restore_experiment"],
  ] as const) {
    app.post(`/api/experiments/:id/${route}`, { preHandler: requireAdmin }, async (request) => {
      const { id } = request.params as { id: string };
      const result = await transaction(async (client) => {
        const updated = await client.query("UPDATE experiments SET status=$2,updated_at=now() WHERE id=$1 RETURNING id", [id, status]);
        if (!updated.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
        await audit(client, request, action, "experiment", id);
        return updated;
      });
      return { ok: Boolean(result) };
    });
  }

  app.delete("/api/experiments/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { slug?: string };
    const deleted = await transaction(async (client) => {
      const found = await client.query("SELECT slug,status,cover_path FROM experiments WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rowCount) throw new AppError("NOT_FOUND", "实验不存在", 404);
      if (found.rows[0]!.status !== "archived" || body.slug !== found.rows[0]!.slug) throw new AppError("DELETE_CONFIRMATION_REQUIRED", "请先归档实验并输入完整 Slug 确认", 409);
      const versions = await client.query("SELECT id,status FROM experiment_versions WHERE experiment_id=$1 FOR UPDATE", [id]);
      if (versions.rows.some((version) => ["queued", "building"].includes(version.status as string))) throw new AppError("EXPERIMENT_BUSY", "仍有版本正在构建，请稍后再删除", 409);
      await audit(client, request, "delete_experiment", "experiment", id, { slug: body.slug });
      await client.query("DELETE FROM experiments WHERE id=$1", [id]);
      return { ...found.rows[0]!, versionIds: versions.rows.map((row) => row.id as string) };
    });
    await rm(path.join(config.sourceRoot, id), { recursive: true, force: true });
    await Promise.all(deleted.versionIds.map((versionId: string) => rm(path.join(config.buildRoot, versionId), { recursive: true, force: true })));
    await rm(path.join(config.publishedRoot, safeRelativePath(deleted.slug as string)), { recursive: true, force: true });
    if (deleted.cover_path) await rm(path.join(config.coverRoot, safeRelativePath(deleted.cover_path as string)), { force: true });
    return { ok: true };
  });

  app.get("/api/admin/audit", { preHandler: requireAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 100), 1), 500);
    const result = await pool.query("SELECT a.*,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT $1", [limit]);
    return { logs: result.rows };
  });

  app.get("/preview/:versionId/*", async (request, reply) => {
    const params = request.params as { versionId: string; "*": string };
    const query = request.query as { token?: string };
    const tokenValid = Boolean(query.token && verifyPreviewToken(params.versionId, query.token));
    if (!request.user && !tokenValid) throw new AppError("AUTH_REQUIRED", "请先登录管理员账户", 401);
    const result = await pool.query("SELECT build_path,status FROM experiment_versions WHERE id=$1", [params.versionId]);
    if (!result.rowCount || result.rows[0]!.status !== "success") throw new AppError("NOT_FOUND", "预览版本不存在", 404);
    const relative = safeRelativePath(params["*"] || "index.html");
    const fullPath = path.join(config.buildRoot, safeRelativePath(result.rows[0]!.build_path as string), relative);
    const content = await readFile(fullPath).catch(() => { throw new AppError("NOT_FOUND", "预览文件不存在", 404); });
    const ext = path.extname(fullPath);
    const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
    reply.header("Content-Type", types[ext] ?? "application/octet-stream");
    reply.header("Cache-Control", "private, no-store");
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Content-Security-Policy", "default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com");
    if (ext === ".html") {
      const token = tokenValid ? query.token! : newPreviewToken(params.versionId);
      const html = content.toString("utf8").replace(/src="\.\/([^"?#]+)"/g, (_match, asset: string) => `src="./${asset}?token=${encodeURIComponent(token)}"`);
      return reply.send(html);
    }
    return reply.send(content);
  });
}
