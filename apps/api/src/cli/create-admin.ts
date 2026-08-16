import { closeCli, getArg, hiddenPrompt, passwordHash } from "./admin-lib.js";
import { pool } from "../db.js";

async function main() {
  const email = getArg("email")?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("用法：create-admin --email admin@example.com");
  const password = await hiddenPrompt("Password: ");
  const confirm = process.stdin.isTTY ? await hiddenPrompt("Confirm password: ") : password;
  if (password !== confirm) throw new Error("两次密码不一致");
  const hash = await passwordHash(password);
  const result = await pool.query("INSERT INTO users(email,password_hash,role) VALUES ($1,$2,'ADMIN') RETURNING id,email", [email, hash]);
  await pool.query("INSERT INTO audit_logs(action,entity_type,entity_id,metadata) VALUES ('create_admin','user',$1,$2)", [result.rows[0].id, JSON.stringify({ email })]);
  console.log(`管理员已创建：${email}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeCli);
