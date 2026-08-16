import os from "node:os";
import path from "node:path";
import pg from "pg";
import { buildExperiment } from "./build.js";
import { ValidationError } from "./validator.js";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://microbio:microbio@127.0.0.1:5432/microbio";
const sourceRoot = path.resolve(process.env.SOURCE_ROOT ?? "data/sources");
const buildRoot = path.resolve(process.env.BUILD_ROOT ?? "data/builds");
const builderVersion = process.env.BUILDER_VERSION ?? "dev";
const workerId = `${os.hostname()}:${process.pid}`;
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
let stopping = false;

interface Job { job_id: string; version_id: string; experiment_id: string; source_path: string; source_sha256: string }

async function claim(): Promise<Job | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<Job>(
      `SELECT j.id AS job_id,j.version_id,v.experiment_id,v.source_path,v.source_sha256
       FROM build_jobs j JOIN experiment_versions v ON v.id=j.version_id
       WHERE j.status='queued' ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
    );
    const job = result.rows[0];
    if (!job) { await client.query("COMMIT"); return null; }
    await client.query("UPDATE build_jobs SET status='running',worker_id=$2,started_at=now() WHERE id=$1", [job.job_id, workerId]);
    await client.query("UPDATE experiment_versions SET status='building' WHERE id=$1", [job.version_id]);
    await client.query("COMMIT");
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function processJob(job: Job): Promise<void> {
  try {
    const output = await buildExperiment({ ...job, versionId: job.version_id, experimentId: job.experiment_id, sourcePath: job.source_path, sourceSha256: job.source_sha256, sourceRoot, buildRoot, builderVersion });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE experiment_versions SET status='success',build_path=$2,builder_version=$3,build_warnings=$4,build_imports=$5,built_at=now() WHERE id=$1", [job.version_id, output.buildPath, builderVersion, JSON.stringify(output.warnings), JSON.stringify(output.imports)]);
      await client.query("UPDATE build_jobs SET status='success',finished_at=now() WHERE id=$1", [job.job_id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    console.log(JSON.stringify({ level: "info", action: "build_success", versionId: job.version_id, workerId }));
  } catch (error) {
    const code = error instanceof ValidationError ? error.code : "BUILD_FAILED";
    const message = (error as Error).message.slice(0, 4000);
    await pool.query("UPDATE experiment_versions SET status='failed',builder_version=$2,built_at=now() WHERE id=$1", [job.version_id, builderVersion]);
    await pool.query("UPDATE build_jobs SET status='failed',finished_at=now(),error_code=$2,error_message=$3 WHERE id=$1", [job.job_id, code, message]);
    console.error(JSON.stringify({ level: "error", action: "build_failed", versionId: job.version_id, workerId, code, message }));
  }
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ level: "info", action: "builder_started", workerId, builderVersion }));
  const recovered = await pool.query(
    `WITH recovered AS (
       UPDATE build_jobs SET status='queued',worker_id=NULL,started_at=NULL
       WHERE status='running' RETURNING version_id
     ) UPDATE experiment_versions SET status='queued' WHERE id IN (SELECT version_id FROM recovered)`,
  );
  if (recovered.rowCount) console.log(JSON.stringify({ level: "warn", action: "jobs_recovered", count: recovered.rowCount }));
  while (!stopping) {
    const job = await claim();
    if (job) await processJob(job);
    else await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await pool.end();
}
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
main().catch((error) => { console.error(error); process.exit(1); });
