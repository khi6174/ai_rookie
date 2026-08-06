// @ts-nocheck -- Node file/hash contract test; application tsconfig is browser-only.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("A100 Cascade LoRA v2 preparation contract", () => {
  it("pins the new accepted dataset without prior evaluation outputs", async () => {
    const config = JSON.parse(
      await readFile("config/a100-cascade-lora-v2.json", "utf8"),
    );
    const manifestText = await readFile(
      "data/manifests/synthetic-cascade-explanations-v2.json",
      "utf8",
    );
    const manifest = JSON.parse(manifestText);
    expect(config).toMatchObject({
      status: "PREPARED_NOT_RUN",
      experimentId: "ax-cascade-lora-v2",
    });
    expect(sha256(manifestText)).toBe(config.dataset.manifestSha256);
    expect(manifest.validationStatus).toBe("ACCEPTED");
    expect(manifest.contaminationBoundary).toEqual({
      priorDatasetRecordsUsed: 0,
      priorFrozenRecordsUsed: 0,
      productReviewPromptsUsed: 0,
      productReviewRawOutputsUsed: 0,
      hostedApiOutputsUsed: 0,
      violationCount: 0,
    });
    expect(manifest.trainingBoundary).toMatchObject({
      safetyAuthority: "DETERMINISTIC_ENGINE_ONLY",
      hostedApiOutputUsedAsLabel: false,
      priorEvaluationOutputUsedAsLabel: false,
      frozenSplitMayTuneModel: false,
      productIntegrationApproved: false,
    });
  });

  it("locks parent-isolated 1,800/300/300 splits", async () => {
    const config = JSON.parse(
      await readFile("config/a100-cascade-lora-v2.json", "utf8"),
    );
    expect(config.dataset).toMatchObject({
      trainRecords: 1_800,
      validationRecords: 300,
      frozenRecords: 300,
      frozenMayBeReadDuringTraining: false,
      priorDatasetRecordsUsed: 0,
      priorFrozenRecordsUsed: 0,
      productReviewPromptsUsed: 0,
      productReviewRawOutputsUsed: 0,
      hostedApiOutputCount: 0,
      actualPersonalDataCount: 0,
    });
    expect(config.dataset.trainSplit).not.toBe(config.dataset.frozenSplit);
    expect(config.dataset.validationSplit).not.toBe(config.dataset.frozenSplit);
  });

  it("raises the schema gate while keeping integrity and terminal limits strict", async () => {
    const config = JSON.parse(
      await readFile("config/a100-cascade-lora-v2.json", "utf8"),
    );
    expect(config.qualificationGate).toEqual({
      validationSchemaPassRateMinimum: 0.99,
      validationNumericIntegrityRateMinimum: 1,
      validationCitationIntegrityRateMinimum: 1,
      validationInjectionIsolationRateMinimum: 1,
      unsafeDisplayCountMaximum: 0,
      frozenEvaluationRunLimit: 1,
      productIntegrationApproved: false,
    });
  });

  it("makes completeness explicit in the shared training prompt", async () => {
    const script = await readFile("scripts/train-ax-cascade-lora.py", "utf8");
    expect(script).toContain('"includeEveryFactId": True');
    expect(script).toContain('"includeEveryAllowedCitationId": True');
    expect(script).toContain('"priorEvaluationOutputUsedAsLabel", False');
    expect(script).toContain('"contaminationBoundary", {}).get("violationCount", 0)');
  });
});
