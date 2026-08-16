import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildExperiment } from "./build.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("sample experiment build", () => {
  it("builds the real enterobacteria JSX without executing it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "microbio-builder-")); temporary.push(root);
    const sourceRoot = path.join(root, "sources"); const buildRoot = path.join(root, "builds");
    await mkdir(path.join(sourceRoot, "experiment", "version"), { recursive: true }); await mkdir(buildRoot);
    const fixture = await readFile(path.resolve(process.cwd(), "../../samples/enterobacteria/App.jsx"));
    await writeFile(path.join(sourceRoot, "experiment", "version", "App.jsx"), fixture);
    const sourceSha256 = createHash("sha256").update(fixture).digest("hex");
    const result = await buildExperiment({ experimentId: "experiment", versionId: "version", sourcePath: "experiment/version/App.jsx", sourceSha256, sourceRoot, buildRoot, builderVersion: "test" });
    expect(result.imports).toEqual(["react"]);
    const html = await readFile(path.join(buildRoot, "version", "index.html"), "utf8");
    expect(html).toContain("assets/app-");
    const manifest = JSON.parse(await readFile(path.join(buildRoot, "version", "manifest.json"), "utf8")) as { sourceSha256: string; files: unknown[] };
    expect(manifest.sourceSha256).toBe(sourceSha256); expect(manifest.files.length).toBeGreaterThan(1);
  }, 30_000);
});
