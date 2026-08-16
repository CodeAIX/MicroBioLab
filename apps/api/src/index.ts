import { existsSync } from "node:fs";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { AppError } from "@microbio/shared";
import { config } from "./config.js";
import { loadUser, originGuard, registerAuthRoutes, clearExpiredSessions } from "./auth.js";
import { migrate, pool } from "./db.js";
import { registerRoutes } from "./routes.js";
import { ensureStorage } from "./storage.js";

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.cookie", "req.headers.authorization", "password"] }, trustProxy: true });
  app.decorateRequest("user", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { files: 2, fileSize: 2 * 1024 * 1024, fields: 10, parts: 12 } });
  app.addHook("onRequest", loadUser);
  app.addHook("preHandler", originGuard);
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", request.url.startsWith("/preview/") ? "SAMEORIGIN" : "DENY");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    const appError = error instanceof AppError ? error : null;
    request.log.error({ err: error, code: appError?.code }, "request failed");
    const statusCode = appError?.statusCode ?? ((error as { statusCode?: number }).statusCode && (error as { statusCode: number }).statusCode < 500 ? (error as { statusCode: number }).statusCode : 500);
    reply.code(statusCode).send({ error: { code: appError?.code ?? "INTERNAL_ERROR", message: appError?.message ?? "服务器内部错误", requestId: request.id, ...(appError?.details === undefined ? {} : { details: appError.details }) } });
  });
  await registerAuthRoutes(app);
  await registerRoutes(app);
  if (existsSync(config.webRoot)) {
    await app.register(fastifyStatic, { root: config.webRoot, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/preview/")) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "资源不存在", requestId: request.id } });
      return reply.sendFile("index.html");
    });
  }
  return app;
}

async function main(): Promise<void> {
  await ensureStorage();
  await migrate();
  clearExpiredSessions();
  const app = await buildApp();
  const shutdown = async () => { await app.close(); await pool.end(); };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
  await app.listen({ host: config.host, port: config.port });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
