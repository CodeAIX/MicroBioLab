export type BatchFilenameMatch =
  | { status: "matched"; slug: string }
  | { status: "invalid_name" | "unknown_slug" | "ambiguous_slug"; candidates: string[] };

export function batchFilenameCandidates(filename: string): string[] {
  const basename = filename.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!basename.endsWith(".jsx")) return [];
  const stem = basename.slice(0, -4);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem) || stem.length > 85) return [];
  const candidates = stem.endsWith("-vsim") ? [stem.slice(0, -5), stem] : [stem];
  return [...new Set(candidates.filter((candidate) => candidate.length > 0 && candidate.length <= 80))];
}

export function matchBatchFilename(filename: string, knownSlugs: ReadonlySet<string>): BatchFilenameMatch {
  const candidates = batchFilenameCandidates(filename);
  if (!candidates.length) return { status: "invalid_name", candidates };
  const matches = candidates.filter((candidate) => knownSlugs.has(candidate));
  if (!matches.length) return { status: "unknown_slug", candidates };
  if (matches.length > 1) return { status: "ambiguous_slug", candidates: matches };
  return { status: "matched", slug: matches[0]! };
}

export function deriveBatchStatus(input: { publishedAt?: unknown; statuses: Array<string | null> }): "building" | "ready" | "failed" | "published" {
  if (input.publishedAt) return "published";
  if (input.statuses.some((status) => status === null || status === "failed")) return "failed";
  if (input.statuses.length > 0 && input.statuses.every((status) => status === "success")) return "ready";
  return "building";
}
