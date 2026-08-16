import { closeCli } from "./admin-lib.js";
import { pool } from "../db.js";

async function main() {
  const result = await pool.query("SELECT email,is_active,created_at,last_login_at FROM users WHERE role='ADMIN' ORDER BY created_at");
  console.table(result.rows);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeCli);
