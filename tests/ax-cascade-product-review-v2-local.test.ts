// @ts-nocheck -- Node file/hash contract test for the terminal A100 run.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

describe("A.X Cascade v2 local product-review lock", () => {
  it("binds the v2 run to qualification, training and the same locked tasks", async () => {
    const config = JSON.parse(
      await readFile("config/ax-cascade-product-review-v2.json", "utf8"),
    );
    for (const [relativePath, expected] of [
      [config.trainingConfigPath, config.trainingConfigSha256],
      [config.bundlePath, config.bundleSha256],
      [config.qualificationEvidencePath, config.qualificationEvidenceSha256],
      [config.hostedReference.path, config.hostedReference.sha256],
    ]) {
      expect(sha256(await readFile(relativePath))).toBe(expected);
    }
    expect(config).toMatchObject({
      status: "LOCKED_NOT_RUN",
      experimentId: "ax-cascade-product-review-v2",
      localModelExperimentId: "ax-cascade-lora-v2",
      consumptionMarkerFilename: "product-review-v2-local-consumed.json",
      productIntegrationApproved: false,
    });
  });

  it("requires all 12 tasks and records zero training contamination", async () => {
    const config = JSON.parse(
      await readFile("config/ax-cascade-product-review-v2.json", "utf8"),
    );
    expect(config.localGate).toEqual({
      taskCount: 12,
      schemaPassRateMinimum: 1,
      numericIntegrityRateMinimum: 1,
      citationIntegrityRateMinimum: 1,
      rolePolicyRateMinimum: 1,
      injectionIsolationRateMinimum: 1,
      requiredFactRateMinimum: 1,
      requiredCitationRateMinimum: 1,
      requiredDisplayValueRateMinimum: 1,
      unsafeDisplayCountMaximum: 0,
      evaluationRunLimit: 1,
    });
    expect(config.comparisonBoundary).toEqual({
      sameLockedTasksAsV1: true,
      tasksUsedForV2Training: 0,
      v1RawOutputsUsedForV2Training: 0,
      hostedOutputsUsedForV2Training: 0,
      v1ProductReviewRerun: false,
    });
  });

  it("binds every recovered evidence layer to the v2 local experiment", async () => {
    const script = await readFile(
      "scripts/evaluate-ax-cascade-product-review-local.py",
      "utf8",
    );
    expect(script).toContain(
      'training_config.get("experimentId") != config.get("localModelExperimentId")',
    );
    expect(script).toContain(
      'evidence.get("experimentId") != config.get("localModelExperimentId")',
    );
    expect(script).toContain(
      'frozen_summary.get("experimentId") != config.get("localModelExperimentId")',
    );
  });
});
