// @ts-nocheck -- Node evidence assembler contract.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("A.X Cascade same-task product review", () => {
  it("assembles 7 local accepts and 5 Hosted escalations without rerunning inference", async () => {
    const { stdout } = await execFileAsync(
      "node",
      ["scripts/assemble-ax-cascade-product-review.mjs", "--check"],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain(
      "AX_CASCADE_PRODUCT_REVIEW_ASSEMBLY_PASS local=7/12 hosted=12/12 cascade=12/12 escalated=5 fallback=0 unsafe=0 recommendation=DEFER_LOCAL_PRODUCT_ACTIVATION write=false",
    );
  });

  it("preserves local failures and keeps product activation deferred", async () => {
    const artifact = JSON.parse(
      await readFile(
        "artifacts/evals/ax-cascade-product-review-latest.json",
        "utf8",
      ),
    );
    expect(artifact.status).toBe(
      "CASCADE_COMPARISON_PASS_LOCAL_NOT_QUALIFIED",
    );
    expect(artifact.results.filter((result) => result.escalated)).toHaveLength(5);
    expect(artifact.metrics).toEqual([
      expect.objectContaining({
        strategy: "LOCAL_ONLY",
        verifiedLocal: 7,
        fallback: 5,
        finalVerifiedRate: 7 / 12,
      }),
      expect.objectContaining({
        strategy: "HOSTED_ONLY",
        verifiedHosted: 12,
        fallback: 0,
        finalVerifiedRate: 1,
      }),
      expect.objectContaining({
        strategy: "CASCADE",
        verifiedLocal: 7,
        verifiedHosted: 5,
        escalated: 5,
        fallback: 0,
        finalVerifiedRate: 1,
      }),
    ]);
    expect(artifact.humanReview.recommendation).toBe(
      "DEFER_LOCAL_PRODUCT_ACTIVATION",
    );
    expect(artifact.productIntegrationApproved).toBe(false);
    expect(JSON.stringify(artifact)).not.toContain('"rawOutput"');
    expect(JSON.stringify(artifact)).not.toContain('"prompt"');
  });

  it("records the sequential Cascade latency penalty", async () => {
    const artifact = JSON.parse(
      await readFile(
        "artifacts/evals/ax-cascade-product-review-latest.json",
        "utf8",
      ),
    );
    const hosted = artifact.metrics.find(
      (metric) => metric.strategy === "HOSTED_ONLY",
    );
    const cascade = artifact.metrics.find(
      (metric) => metric.strategy === "CASCADE",
    );
    expect(cascade.latencyMsP95).toBeGreaterThan(hosted.latencyMsP95);
  });
});
