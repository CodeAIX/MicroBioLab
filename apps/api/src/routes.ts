import { randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError, assertSlug, BATCH_JSX_MAX_FILES, BATCH_JSX_MAX_TOTAL_BYTES, formatVersion, JSX_MAX_UPLOAD_BYTES } from "@microbio/shared";
import { config } from "./config.js";
import { pool, transaction } from "./db.js";
import { requireAdmin } from "./auth.js";
import { decodeJsx, decodeKnowledgeReview, measureVersionStorage, publishBuild, removeSourceVersion, saveCover, saveSource } from "./storage.js";
import { newPreviewToken, safeRelativePath, sanitizeOriginalFilename, sha256, verifyPreviewToken } from "./security.js";
import { multipartLimitError } from "./upload-errors.js";
import { deriveBatchStatus, matchBatchFilename } from "./batch.js";

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

type BatchJsxUpload = { filename: string; contents: Buffer; digest: string };

async function readBatchJsxUploads(request: FastifyRequest): Promise<BatchJsxUpload[]> {
  const files: BatchJsxUpload[] = [];
  let totalBytes = 0;
  try {
    for await (const part of request.parts()) {
      if (part.type !== "file") throw new AppError("BATCH_UPLOAD_INVALID", "批量更新只接受 JSX 文件");
      if (part.fieldname !== "jsx") {
        await part.toBuffer();
        throw new AppError("BATCH_UPLOAD_INVALID", `不支持的文件字段：${part.fieldname}`);
      }
      if (files.length >= BATCH_JSX_MAX_FILES) throw new AppError("BATCH_TOO_MANY_FILES", `每批最多上传 ${BATCH_JSX_MAX_FILES} 个 JSX 文件`, 413);
      if (!part.filename.toLowerCase().endsWith(".jsx")) throw new AppError("BATCH_UPLOAD_INVALID", "批量更新只允许上传 .jsx 文件");
      const contents = await part.toBuffer();
      decodeJsx(contents);
      totalBytes += contents.byteLength;
      if (totalBytes > BATCH_JSX_MAX_TOTAL_BYTES) throw new AppError("BATCH_TOO_LARGE", "批量 JSX 总大小不能超过 100 MiB", 413);
      files.push({ filename: sanitizeOriginalFilename(part.filename), contents, digest: sha256(contents) });
    }
  } catch (error) {
    throw multipartLimitError(error) ?? error;
  }
  if (!files.length) throw new AppError("BATCH_UPLOAD_INVALID", "请选择至少一个 JSX 文件");
  return files;
}

type BatchRow = {
  id: string;
  item_count: number;
  created_at: string;
  published_at?: string | null;
  created_by_email?: string;
  success_count: number;
  failed_count: number;
  pending_count: number;
  missing_count: number;
};

function presentBatch(row: BatchRow) {
  const statuses = [
    ...Array(row.success_count).fill("success"),
    ...Array(row.failed_count).fill("failed"),
    ...Array(row.pending_count).fill("building"),
    ...Array(row.missing_count).fill(null),
  ];
  return { ...row, status: deriveBatchStatus({ publishedAt: row.published_at, statuses }) };
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
      `SELECT e.*,v.version_number AS active_version_number,v.source_sha256 AS active_source_sha256,
       v.created_at AS active_version_created_at,v.published_at AS active_version_published_at,
       (SELECT count(*)::int FROM experiment_versions ev WHERE ev.experiment_id=e.id) AS version_count
       FROM experiments e LEFT JOIN experiment_versions v ON v.id=e.active_version_id ORDER BY e.display_order,e.created_at`,
    );
    return { experiments: result.rows };
  });

  app.post("/api/batch-updates/preflight", { preHandler: requireAdmin }, async (request) => {
    const body = (request.body ?? {}) as { files?: Array<{ filename?: unknown; relativePath?: unknown; size?: unknown; sha256?: unknown }> };
    if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > BATCH_JSX_MAX_FILES) {
      throw new AppError("BATCH_PREFLIGHT_INVALID", `请选择 1-${BATCH_JSX_MAX_FILES} 个 JSX 文件`);
    }
    const inputs = body.files.map((file, index) => {
      const filename = typeof file.filename === "string" ? sanitizeOriginalFilename(file.filename) : "";
      const relativePath = typeof file.relativePath === "string" ? file.relativePath.slice(0, 500) : filename;
      const size = typeof file.size === "number" && Number.isSafeInteger(file.size) ? file.size : -1;
      const digest = typeof file.sha256 === "string" ? file.sha256.toLowerCase() : "";
      if (!filename || size < 0 || size > JSX_MAX_UPLOAD_BYTES || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new AppError("BATCH_PREFLIGHT_INVALID", `第 ${index + 1} 个文件信息不正确`);
      }
      return { index, filename, relativePath, size, digest };
    });
    if (inputs.reduce((total, file) => total + file.size, 0) > BATCH_JSX_MAX_TOTAL_BYTES) {
      throw new AppError("BATCH_TOO_LARGE", "批量 JSX 总大小不能超过 100 MiB", 413);
    }

    const experiments = await pool.query(
      `SELECT e.id,e.slug,e.title,e.status,e.active_version_id,
       v.version_number AS active_version_number,v.source_sha256 AS active_source_sha256
       FROM experiments e LEFT JOIN experiment_versions v ON v.id=e.active_version_id`,
    );
    const bySlug = new Map(experiments.rows.map((row) => [row.slug as string, row]));
    const knownSlugs = new Set(bySlug.keys());
    const provisional = inputs.map((file) => ({ file, match: matchBatchFilename(file.filename, knownSlugs) }));
    const matched = provisional.filter((entry): entry is typeof entry & { match: { status: "matched"; slug: string } } => entry.match.status === "matched");
    const slugCounts = new Map<string, number>();
    for (const entry of matched) slugCounts.set(entry.match.slug, (slugCounts.get(entry.match.slug) ?? 0) + 1);
    const digests = [...new Set(inputs.map((file) => file.digest))];
    const existing = digests.length
      ? await pool.query(
        `SELECT experiment_id,id,version_number,source_sha256,status,published_at
         FROM experiment_versions WHERE source_sha256=ANY($1::text[])`,
        [digests],
      )
      : { rows: [] };
    const existingByKey = new Map(existing.rows.map((row) => [`${row.experiment_id as string}:${row.source_sha256 as string}`, row]));

    const files = provisional.map(({ file, match }) => {
      if (match.status !== "matched") return { ...file, status: match.status, candidates: match.candidates };
      const experiment = bySlug.get(match.slug)!;
      const base = {
        ...file,
        slug: match.slug,
        experimentId: experiment.id,
        experimentTitle: experiment.title,
        experimentStatus: experiment.status,
        activeVersionNumber: experiment.active_version_number,
      };
      if ((slugCounts.get(match.slug) ?? 0) > 1) return { ...base, status: "duplicate_slug" };
      if (experiment.active_source_sha256 === file.digest) return { ...base, status: "unchanged", existingVersionNumber: experiment.active_version_number };
      const prior = existingByKey.get(`${experiment.id as string}:${file.digest}`);
      if (prior) return { ...base, status: "existing_version", existingVersionNumber: prior.version_number, existingVersionStatus: prior.status };
      return { ...base, status: "ready" };
    });
    return { files };
  });

  app.post("/api/batch-updates", { preHandler: requireAdmin }, async (request, reply) => {
    const uploads = await readBatchJsxUploads(request);
    const experiments = await pool.query("SELECT id,slug,title,active_version_id FROM experiments");
    const bySlug = new Map(experiments.rows.map((row) => [row.slug as string, row]));
    const knownSlugs = new Set(bySlug.keys());
    const matched = uploads.map((upload) => ({ upload, match: matchBatchFilename(upload.filename, knownSlugs) }));
    const invalid = matched.find((entry) => entry.match.status !== "matched");
    if (invalid) throw new AppError("BATCH_MATCH_FAILED", `无法根据文件名匹配实验：${invalid.upload.filename}`, 409, invalid.match);
    const plans = matched.map((entry) => ({ upload: entry.upload, experiment: bySlug.get((entry.match as { slug: string }).slug)! }));
    const slugs = plans.map((plan) => plan.experiment.slug as string);
    if (new Set(slugs).size !== slugs.length) throw new AppError("BATCH_DUPLICATE_SLUG", "同一批次中存在多个文件匹配相同 Slug", 409);
    const experimentIds = plans.map((plan) => plan.experiment.id as string);
    const digests = plans.map((plan) => plan.upload.digest);
    const existing = await pool.query(
      `SELECT experiment_id,version_number,source_sha256 FROM experiment_versions
       WHERE experiment_id=ANY($1::uuid[]) AND source_sha256=ANY($2::text[])`,
      [experimentIds, digests],
    );
    for (const plan of plans) {
      const prior = existing.rows.find((row) => row.experiment_id === plan.experiment.id && row.source_sha256 === plan.upload.digest);
      if (prior) throw new AppError("BATCH_VERSION_EXISTS", `${plan.experiment.slug as string} 的相同内容已存在于 ${formatVersion(prior.version_number as number)}`, 409);
    }

    const batchId = randomUUID();
    const prepared = plans.map((plan) => ({ ...plan, versionId: randomUUID(), jobId: randomUUID() }));
    const saved: Array<{ experimentId: string; versionId: string }> = [];
    try {
      for (const plan of prepared) {
        await saveSource({
          experimentId: plan.experiment.id as string,
          versionId: plan.versionId,
          originalFilename: plan.upload.filename,
          contents: plan.upload.contents,
          uploadedBy: request.user!.id,
        });
        saved.push({ experimentId: plan.experiment.id as string, versionId: plan.versionId });
      }
      await transaction(async (client) => {
        const locked = await client.query("SELECT id FROM experiments WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [experimentIds]);
        if (locked.rowCount !== experimentIds.length) throw new AppError("BATCH_STALE", "实验列表已发生变化，请重新预检", 409);
        await client.query("INSERT INTO batch_updates(id,item_count,created_by) VALUES ($1,$2,$3)", [batchId, prepared.length, request.user!.id]);
        for (const plan of prepared) {
          const next = await client.query("SELECT COALESCE(max(version_number),0)::int+1 AS value FROM experiment_versions WHERE experiment_id=$1", [plan.experiment.id]);
          const versionNumber = next.rows[0]!.value as number;
          const sourcePath = `${plan.experiment.id as string}/${plan.versionId}/App.jsx`;
          await client.query(
            `INSERT INTO experiment_versions(id,experiment_id,version_number,source_filename,source_path,source_sha256,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [plan.versionId, plan.experiment.id, versionNumber, plan.upload.filename, sourcePath, plan.upload.digest, request.user!.id],
          );
          await client.query("INSERT INTO build_jobs(id,version_id) VALUES ($1,$2)", [plan.jobId, plan.versionId]);
          await client.query(
            `INSERT INTO batch_update_items(batch_id,experiment_id,version_id,previous_active_version_id,source_filename,source_sha256)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [batchId, plan.experiment.id, plan.versionId, plan.experiment.active_version_id ?? null, plan.upload.filename, plan.upload.digest],
          );
        }
        await audit(client, request, "create_batch_update", "batch_update", batchId, { count: prepared.length, slugs });
      });
    } catch (error) {
      await Promise.all(saved.map((item) => removeSourceVersion(item.experimentId, item.versionId)));
      throw error;
    }
    return reply.code(201).send({ batchId, itemCount: prepared.length });
  });

  app.get("/api/batch-updates", { preHandler: requireAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 10) || 10, 1), 50);
    const result = await pool.query(
      `SELECT b.id,b.item_count,b.created_at,b.published_at,u.email AS created_by_email,
       count(*) FILTER (WHERE v.status='success')::int AS success_count,
       count(*) FILTER (WHERE v.status='failed')::int AS failed_count,
       count(*) FILTER (WHERE v.id IS NOT NULL AND v.status NOT IN ('success','failed'))::int AS pending_count,
       count(*) FILTER (WHERE v.id IS NULL)::int AS missing_count
       FROM batch_updates b JOIN batch_update_items i ON i.batch_id=b.id
       LEFT JOIN experiment_versions v ON v.id=i.version_id LEFT JOIN users u ON u.id=b.created_by
       GROUP BY b.id,u.email ORDER BY b.created_at DESC LIMIT $1`,
      [limit],
    );
    return { batches: result.rows.map((row) => presentBatch(row as BatchRow)) };
  });

  app.get("/api/batch-updates/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const batch = await pool.query(
      `SELECT b.id,b.item_count,b.created_at,b.published_at,u.email AS created_by_email,
       count(*) FILTER (WHERE v.status='success')::int AS success_count,
       count(*) FILTER (WHERE v.status='failed')::int AS failed_count,
       count(*) FILTER (WHERE v.id IS NOT NULL AND v.status NOT IN ('success','failed'))::int AS pending_count,
       count(*) FILTER (WHERE v.id IS NULL)::int AS missing_count
       FROM batch_updates b JOIN batch_update_items i ON i.batch_id=b.id
       LEFT JOIN experiment_versions v ON v.id=i.version_id LEFT JOIN users u ON u.id=b.created_by
       WHERE b.id=$1 GROUP BY b.id,u.email`,
      [id],
    );
    if (!batch.rowCount) throw new AppError("NOT_FOUND", "批量更新记录不存在", 404);
    const items = await pool.query(
      `SELECT i.experiment_id,i.version_id,i.previous_active_version_id,i.source_filename,i.source_sha256,
       e.slug,e.title,v.version_number,v.status,v.created_at,v.built_at,v.published_at,
       j.status AS job_status,j.error_code,j.error_message
       FROM batch_update_items i JOIN experiments e ON e.id=i.experiment_id
       LEFT JOIN experiment_versions v ON v.id=i.version_id LEFT JOIN build_jobs j ON j.version_id=v.id
       WHERE i.batch_id=$1 ORDER BY e.display_order,e.created_at`,
      [id],
    );
    return { batch: presentBatch(batch.rows[0] as BatchRow), items: items.rows };
  });

  app.post("/api/batch-updates/:id/publish", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const initial = await pool.query(
      `SELECT b.published_at,i.experiment_id,i.version_id,i.previous_active_version_id,
       e.slug,e.active_version_id,v.version_number,v.status,v.build_path,v.source_sha256
       FROM batch_updates b JOIN batch_update_items i ON i.batch_id=b.id
       JOIN experiments e ON e.id=i.experiment_id LEFT JOIN experiment_versions v ON v.id=i.version_id
       WHERE b.id=$1 ORDER BY e.id`,
      [id],
    );
    if (!initial.rowCount) throw new AppError("NOT_FOUND", "批量更新记录不存在", 404);
    if (initial.rows[0]!.published_at) return { ok: true, alreadyPublished: true };
    if (initial.rows.some((row) => row.status !== "success" || !row.build_path)) {
      throw new AppError("BATCH_NOT_READY", "只有全部版本构建成功后才能整体发布", 409);
    }
    const staged: Array<{ path: string; created: boolean }> = [];
    try {
      for (const row of initial.rows) {
        const published = await publishBuild({ slug: row.slug as string, versionNumber: row.version_number as number, buildPath: row.build_path as string, sourceSha256: row.source_sha256 as string });
        staged.push({ path: published.publishedPath, created: published.created });
      }
      await transaction(async (client) => {
        const batch = await client.query("SELECT published_at FROM batch_updates WHERE id=$1 FOR UPDATE", [id]);
        if (!batch.rowCount) throw new AppError("NOT_FOUND", "批量更新记录不存在", 404);
        if (batch.rows[0]!.published_at) return;
        const rows = await client.query(
          `SELECT i.experiment_id,i.version_id,i.previous_active_version_id,e.active_version_id,v.status
           FROM batch_update_items i JOIN experiments e ON e.id=i.experiment_id
           JOIN experiment_versions v ON v.id=i.version_id WHERE i.batch_id=$1
           ORDER BY e.id FOR UPDATE OF e,v`,
          [id],
        );
        if (rows.rows.some((row) => row.status !== "success")) throw new AppError("BATCH_NOT_READY", "批次版本状态已发生变化", 409);
        if (rows.rows.some((row) => (row.active_version_id ?? null) !== (row.previous_active_version_id ?? null))) {
          throw new AppError("BATCH_STALE", "批次创建后已有实验被单独发布，请重新建立批次", 409);
        }
        for (const row of rows.rows) {
          await client.query("UPDATE experiments SET active_version_id=$2,status='published',slug_locked=true,updated_at=now() WHERE id=$1", [row.experiment_id, row.version_id]);
          await client.query("UPDATE experiment_versions SET published_at=COALESCE(published_at,now()) WHERE id=$1", [row.version_id]);
        }
        await client.query("UPDATE batch_updates SET status='published',published_at=now() WHERE id=$1", [id]);
        await audit(client, request, "publish_batch_update", "batch_update", id, { count: rows.rowCount });
      });
    } catch (error) {
      await Promise.all(staged.filter((item) => item.created).map((item) => rm(path.join(config.publishedRoot, safeRelativePath(item.path)), { recursive: true, force: true })));
      throw error;
    }
    return { ok: true };
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

  app.get("/api/versions/cleanup-candidates", { preHandler: requireAdmin }, async () => {
    const result = await pool.query(
      `SELECT v.id,v.experiment_id,v.version_number,v.status,v.source_filename,v.created_at,v.built_at,
       e.slug,e.title,j.status AS job_status
       FROM experiment_versions v JOIN experiments e ON e.id=v.experiment_id
       LEFT JOIN build_jobs j ON j.version_id=v.id
       WHERE v.published_at IS NULL AND e.active_version_id IS DISTINCT FROM v.id
       AND v.status NOT IN ('queued','building') AND COALESCE(j.status,'failed') NOT IN ('queued','running')
       ORDER BY v.created_at LIMIT 500`,
    );
    const candidates = [];
    for (const row of result.rows) {
      const sizes = await measureVersionStorage(row.experiment_id as string, row.id as string);
      candidates.push({ ...row, source_bytes: sizes.sourceBytes, build_bytes: sizes.buildBytes, total_bytes: sizes.sourceBytes + sizes.buildBytes });
    }
    return { candidates, truncated: result.rowCount === 500 };
  });

  app.post("/api/versions/bulk-delete", { preHandler: requireAdmin }, async (request) => {
    const body = (request.body ?? {}) as { versionIds?: unknown };
    const versionIds = body.versionIds;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!Array.isArray(versionIds) || versionIds.length < 1 || versionIds.length > 500 || versionIds.some((id) => typeof id !== "string" || !uuid.test(id))) {
      throw new AppError("BULK_DELETE_INVALID", "请选择 1-500 个可清理版本");
    }
    if (new Set(versionIds).size !== versionIds.length) throw new AppError("BULK_DELETE_INVALID", "待清理版本中存在重复项");
    const deleted = await transaction(async (client) => {
      const found = await client.query(
        `SELECT v.id,v.experiment_id,v.published_at,v.status,e.active_version_id,j.status AS job_status
         FROM experiment_versions v JOIN experiments e ON e.id=v.experiment_id
         LEFT JOIN build_jobs j ON j.version_id=v.id
         WHERE v.id=ANY($1::uuid[]) ORDER BY v.id FOR UPDATE OF v,e`,
        [versionIds],
      );
      if (found.rowCount !== versionIds.length) throw new AppError("BULK_DELETE_STALE", "部分版本已不存在，请刷新候选列表", 409);
      const unsafe = found.rows.find((row) => row.active_version_id === row.id || row.published_at || ["queued", "building"].includes(row.status as string) || ["queued", "running"].includes(row.job_status as string));
      if (unsafe) throw new AppError("BULK_DELETE_UNSAFE", "所选版本中包含当前、已发布或构建中的版本", 409);
      await audit(client, request, "bulk_delete_versions", "experiment_version", undefined, { count: versionIds.length, versionIds });
      await client.query("DELETE FROM experiment_versions WHERE id=ANY($1::uuid[])", [versionIds]);
      return found.rows;
    });
    await Promise.all(deleted.flatMap((row) => [
      removeSourceVersion(row.experiment_id as string, row.id as string),
      rm(path.join(config.buildRoot, row.id as string), { recursive: true, force: true }),
    ]));
    return { ok: true, deletedCount: deleted.length };
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
