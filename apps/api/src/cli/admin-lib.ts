import argon2 from "argon2";
import { pool } from "../db.js";

export function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8").trimEnd();
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (key: string) => {
      if (key === "\u0003") { cleanup(); reject(new Error("Cancelled")); return; }
      if (key === "\r" || key === "\n") { cleanup(); process.stdout.write("\n"); resolve(value); return; }
      if (key === "\u007f") { value = value.slice(0, -1); return; }
      value += key;
    };
    const cleanup = () => { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); };
    process.stdin.on("data", onData);
  });
}

export async function passwordHash(password: string): Promise<string> {
  if (password.length < 12) throw new Error("密码至少需要 12 个字符");
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 3, parallelism: 1 });
}

export async function closeCli(): Promise<void> { await pool.end(); }
