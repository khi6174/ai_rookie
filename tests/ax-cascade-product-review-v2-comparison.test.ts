// @ts-nocheck -- Node evidence assembler contract.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("A.X Cascade v2 same-task product review", () => {
  it("independently assembles 12 local accepts with no escalation", async () => {
    const { stdout } = await execFileAsync(
      "node",
      [
        "scripts/assemble-ax-cascade-product-review.mjs",
        "--experiment",
        "v2",
        "--check",
      ],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain(
      "AX_CASCADE_PRODUCT_REVIEW_ASSEMBLY_PASS local=12/12 hosted=12/12 cascade=12/12 escalated=0 fallback=0 unsafe=0 recommendation=QUALIFY_LOCAL_MODEL_RETAIN_ACTIVATION_REVIEW write=false",
    );
  });

  it("records the same-task v1 to v2 improvement without approving runtime", async () => {
    const artifact = JSON.parse(
      await readFile(
        "artifacts/evals/ax-cascade-product-review-v2-latest.json",
        "utf8",
      ),
    );
    expect(artifact.status).toBe("CASCADE_COMPARISON_PASS_LOCAL_QUALIFIED");
    expect(artifact.improvementFromV1).toMatchObject({
      sameTaskSuite: true,
      priorVerifiedLocal: 7,
      currentVerifiedLocal: 12,
      verifiedLocalDelta: 5,
      priorFallback: 5,
      currentFallback: 0,
      fallbackDelta: -5,
    });
    expect(artifact.results.every((result) => !result.escalated)).toBe(true);
    expect(artifact.gates).toMatchObject({
      localGatePassed: true,
      cascadeGatePassed: true,
      frozenRecordsRead: 0,
      localEvaluationAttempts: 1,
      localRerunPermitted: false,
    });
    expect(artifact.humanReview).toMatchObject({
      recommendation: "QUALIFY_LOCAL_MODEL_RETAIN_ACTIVATION_REVIEW",
      localProductSlotQualified: true,
      runtimeActivationReady: false,
    });
    expect(artifact.productIntegrationApproved).toBe(false);
    expect(JSON.stringify(artifact)).not.toContain('"rawOutput"');
    expect(JSON.stringify(artifact)).not.toContain('"prompt"');
  });

  it("keeps Hosted faster at P95 despite local quality qualification", async () => {
    const artifact = JSON.parse(
      await readFile(
        "artifacts/evals/ax-cascade-product-review-v2-latest.json",
        "utf8",
      ),
    );
    const local = artifact.metrics.find(
      (metric) => metric.strategy === "LOCAL_ONLY",
    );
    const hosted = artifact.metrics.find(
      (metric) => metric.strategy === "HOSTED_ONLY",
    );
    expect(local.latencyMsP95).toBeGreaterThan(hosted.latencyMsP95);
  });
});
