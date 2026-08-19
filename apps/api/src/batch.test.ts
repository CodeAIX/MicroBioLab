import { describe, expect, it } from "vitest";
import { batchFilenameCandidates, deriveBatchStatus, matchBatchFilename } from "./batch.js";

describe("batch JSX matching", () => {
  const slugs = new Set(["biosafety", "biosafety-vsim", "pyogenic-cocci"]);

  it("maps the experiment package suffix to the platform slug", () => {
    expect(batchFilenameCandidates("nested/pyogenic-cocci-vsim.jsx")).toEqual(["pyogenic-cocci", "pyogenic-cocci-vsim"]);
    expect(matchBatchFilename("pyogenic-cocci-vsim.jsx", slugs)).toEqual({ status: "matched", slug: "pyogenic-cocci" });
  });

  it("accepts a direct slug filename and rejects unsafe names", () => {
    expect(matchBatchFilename("pyogenic-cocci.jsx", slugs)).toEqual({ status: "matched", slug: "pyogenic-cocci" });
    expect(matchBatchFilename("../中文.jsx", slugs).status).toBe("invalid_name");
  });

  it("does not guess when both suffix interpretations exist", () => {
    expect(matchBatchFilename("biosafety-vsim.jsx", slugs).status).toBe("ambiguous_slug");
    expect(matchBatchFilename("missing-vsim.jsx", slugs).status).toBe("unknown_slug");
  });
});

describe("batch status", () => {
  it("only becomes ready when every version succeeds", () => {
    expect(deriveBatchStatus({ statuses: ["success", "building"] })).toBe("building");
    expect(deriveBatchStatus({ statuses: ["success", "success"] })).toBe("ready");
    expect(deriveBatchStatus({ statuses: ["success", "failed"] })).toBe("failed");
    expect(deriveBatchStatus({ statuses: ["success"], publishedAt: "now" })).toBe("published");
  });
});
