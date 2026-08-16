import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as esbuild from "esbuild";
import { validateJsx } from "./validator.js";

const digest = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

async function listFiles(root: string, current = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, current), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = current ? `${current}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

export async function buildExperiment(input: {
  experimentId: string;
  versionId: string;
  sourcePath: string;
  sourceSha256: string;
  sourceRoot: string;
  buildRoot: string;
  builderVersion: string;
}): Promise<{ buildPath: string; imports: string[]; warnings: string[] }> {
  const sourceFile = path.resolve(input.sourceRoot, input.sourcePath);
  if (!sourceFile.startsWith(`${path.resolve(input.sourceRoot)}${path.sep}`)) throw new Error("Source path escaped SOURCE_ROOT");
  const source = await readFile(sourceFile, "utf8");
  if (digest(source) !== input.sourceSha256) throw new Error("Source SHA256 does not match database");
  const validation = validateJsx(source);
  const tempDir = path.join(input.buildRoot, `.tmp-${input.versionId}-${randomUUID()}`);
  const destination = path.join(input.buildRoot, input.versionId);
  try {
    const existing = JSON.parse(await readFile(path.join(destination, "manifest.json"), "utf8")) as { sourceSha256?: string; imports?: string[]; warnings?: string[] };
    if (existing.sourceSha256 !== input.sourceSha256) throw new Error("Existing immutable build has a different source SHA256");
    return { buildPath: input.versionId, imports: existing.imports ?? [], warnings: existing.warnings ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(tempDir, { recursive: true });
  const wrapper = path.join(tempDir, "entry.jsx");
  await writeFile(wrapper, `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from ${JSON.stringify(sourceFile)};\ncreateRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);\n`);
  try {
    const result = await esbuild.build({
      entryPoints: [wrapper], bundle: true, format: "esm", platform: "browser", target: ["es2022"],
      outdir: tempDir, entryNames: "assets/app-[hash]", chunkNames: "assets/chunk-[hash]", assetNames: "assets/[name]-[hash]",
      jsx: "automatic", metafile: true, minify: true, sourcemap: false, logLevel: "silent", legalComments: "none",
      loader: { ".jsx": "jsx" }, absWorkingDir: process.cwd(),
      nodePaths: process.env.BUILDER_NODE_MODULES
        ? [process.env.BUILDER_NODE_MODULES]
        : [path.resolve(process.cwd(), "node_modules"), path.resolve(process.cwd(), "../../node_modules")],
    });
    const entryOutput = Object.entries(result.metafile.outputs).find(([, value]) => value.entryPoint?.endsWith("entry.jsx"))?.[0];
    if (!entryOutput) throw new Error("esbuild did not emit an entry file");
    const scriptPath = path.relative(tempDir, path.resolve(entryOutput)).split(path.sep).join("/");
    await rm(wrapper, { force: true });
    await writeFile(path.join(tempDir, "index.html"), `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>虚拟仿真实验</title></head><body><div id="root"></div><script type="module" src="./${scriptPath}"></script></body></html>\n`);
    const fileNames = (await listFiles(tempDir)).filter((file) => file !== "manifest.json");
    const files = await Promise.all(fileNames.map(async (file) => ({ path: file, sha256: digest(await readFile(path.join(tempDir, file))) })));
    const manifest = {
      schemaVersion: 1, experimentId: input.experimentId, versionId: input.versionId, sourceSha256: input.sourceSha256,
      builderVersion: input.builderVersion, builtAt: new Date().toISOString(), imports: validation.imports, warnings: validation.warnings, files,
    };
    await writeFile(path.join(tempDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    await rename(tempDir, destination);
    return { buildPath: input.versionId, imports: validation.imports, warnings: validation.warnings };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}
