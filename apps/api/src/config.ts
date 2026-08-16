import path from "node:path";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const production = process.env.NODE_ENV === "production";
const sessionSecret = required("SESSION_SECRET", production ? undefined : "development-only-secret-change-me");
if (production && sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");

export const config = {
  production,
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL", "postgresql://microbio:microbio@127.0.0.1:5432/microbio"),
  sessionSecret,
  sessionSecure: (process.env.SESSION_SECURE ?? String(production)) === "true",
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  platformOrigin: required("PLATFORM_ORIGIN", "http://localhost:5173"),
  experimentOrigin: required("EXPERIMENT_ORIGIN", "http://localhost:18081"),
  sourceRoot: path.resolve(process.env.SOURCE_ROOT ?? "data/sources"),
  buildRoot: path.resolve(process.env.BUILD_ROOT ?? "data/builds"),
  publishedRoot: path.resolve(process.env.PUBLISHED_ROOT ?? "data/published"),
  coverRoot: path.resolve(process.env.COVER_ROOT ?? "data/covers"),
  webRoot: path.resolve(process.env.WEB_ROOT ?? "apps/web/dist"),
  migrationsDir: path.resolve(process.env.MIGRATIONS_DIR ?? "db/migrations"),
};
