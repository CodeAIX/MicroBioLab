import { closeCli, getArg, hiddenPrompt, passwordHash } from "./admin-lib.js";
import { pool } from "../db.js";

async function main() {
  const email = getArg("email")?.trim().toLowerCase();
  if (!email) throw new Error("用法：change-password --email admin@example.com");
  const password = await hiddenPrompt("New password: ");
  const hash = await passwordHash(password);
  const result = await pool.query("UPDATE users SET password_hash=$2,updated_at=now() WHERE email=$1 RETURNING id", [email, hash]);
  if (!result.rowCount) throw new Error("管理员不存在");
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [result.rows[0].id]);
  console.log("密码已修改，现有会话已注销");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeCli);
