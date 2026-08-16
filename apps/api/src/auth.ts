import argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@microbio/shared";
import { pool } from "./db.js";
import { config } from "./config.js";
import { hashSessionToken, newSessionToken, SESSION_COOKIE } from "./security.js";

export async function loadUser(request: FastifyRequest): Promise<void> {
  request.user = null;
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return;
  const result = await pool.query(
    `SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true`,
    [hashSessionToken(token)],
  );
  const row = result.rows[0] as { id: string; email: string; role: "ADMIN" } | undefined;
  if (row) {
    request.user = row;
    void pool.query("UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1", [hashSessionToken(token)]);
  }
}

export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (!request.user) throw new AppError("AUTH_REQUIRED", "请先登录管理员账户", 401);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.password) throw new AppError("LOGIN_INVALID", "请输入邮箱和密码", 400);
    const found = await pool.query("SELECT id,email,password_hash,role,is_active FROM users WHERE email=$1", [email]);
    const user = found.rows[0] as { id: string; email: string; password_hash: string; role: "ADMIN"; is_active: boolean } | undefined;
    if (!user || !user.is_active || !(await argon2.verify(user.password_hash, body.password))) {
      throw new AppError("LOGIN_FAILED", "邮箱或密码不正确", 401);
    }
    const token = newSessionToken();
    const expires = new Date(Date.now() + config.sessionHours * 3600_000);
    await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES ($1,$2,$3)", [user.id, hashSessionToken(token), expires]);
    await pool.query("UPDATE users SET last_login_at=now() WHERE id=$1", [user.id]);
    await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES ($1,'login','user',$1)", [user.id]);
    reply.setCookie(SESSION_COOKIE, token, { path: "/", httpOnly: true, secure: config.sessionSecure, sameSite: "lax", expires });
    return { user: { id: user.id, email: user.email, role: user.role } };
  });

  app.post("/api/auth/logout", { preHandler: requireAdmin }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashSessionToken(token)]);
    await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES ($1,'logout','user',$1)", [request.user!.id]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => ({ user: request.user }));
}

export function clearExpiredSessions(): void {
  void pool.query("DELETE FROM sessions WHERE expires_at <= now()");
}

export function originGuard(request: FastifyRequest, _reply: FastifyReply, done: (error?: Error) => void): void {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return done();
  const origin = request.headers.origin;
  if (origin && origin !== config.platformOrigin) return done(new AppError("ORIGIN_REJECTED", "请求来源不受信任", 403));
  done();
}
