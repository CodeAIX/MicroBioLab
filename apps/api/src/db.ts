import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
export const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(715202601)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const files = (await readdir(config.migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const exists = await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [file]);
      if (exists.rowCount) continue;
      const sql = await readFile(path.join(config.migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(715202601)").catch(() => undefined);
    client.release();
  }
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
