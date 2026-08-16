import { closeCli, getArg } from "./admin-lib.js";
import { pool } from "../db.js";

async function main() {
  const email = getArg("email")?.trim().toLowerCase();
  if (!email) throw new Error("用法：disable-admin --email admin@example.com");
  const result = await pool.query("UPDATE users SET is_active=false,updated_at=now() WHERE email=$1 RETURNING id", [email]);
  if (!result.rowCount) throw new Error("管理员不存在");
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [result.rows[0].id]);
  console.log(`管理员已禁用：${email}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeCli);
