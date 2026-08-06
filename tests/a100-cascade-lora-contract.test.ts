// @ts-nocheck -- Node file/hash contract test; application tsconfig is browser-only.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("A100 Cascade LoRA preparation contract", () => {
  it("pins the base model, accepted dataset and non-product status", async () => {
    const config = JSON.parse(
      await readFile("config/a100-cascade-lora-v1.json", "utf8"),
    );
    const manifestText = await readFile(
      "data/manifests/synthetic-cascade-explanations-v1.json",
      "utf8",
    );
    const manifest = JSON.parse(manifestText);
    expect(config.status).toBe("PREPARED_NOT_RUN");
    expect(config.baseModel).toMatchObject({
      repoId: "skt/A.X-4.0-Light",
      revision: "ba21c20ea1b31ded1ec3e2fb432335077dc4be98",
      dtype: "bfloat16",
      quantization: "none",
    });
    expect(sha256(manifestText)).toBe(config.dataset.manifestSha256);
    expect(manifest.validationStatus).toBe("ACCEPTED");
    expect(manifest.trainingBoundary).toMatchObject({
      safetyAuthority: "DETERMINISTIC_ENGINE_ONLY",
      hostedApiOutputUsedAsLabel: false,
      frozenSplitMayTuneModel: false,
      productIntegrationApproved: false,
    });
    expect(config.qualificationGate.productIntegrationApproved).toBe(false);
  });

  it("keeps frozen data outside training and validation inputs", async () => {
    const config = JSON.parse(
      await readFile("config/a100-cascade-lora-v1.json", "utf8"),
    );
    expect(config.dataset.frozenMayBeReadDuringTraining).toBe(false);
    expect(config.dataset.trainSplit).not.toBe(config.dataset.frozenSplit);
    expect(config.dataset.validationSplit).not.toBe(config.dataset.frozenSplit);
    expect(config.dataset).toMatchObject({
      trainRecords: 1_200,
      validationRecords: 200,
      frozenRecords: 200,
      hostedApiOutputCount: 0,
      actualPersonalDataCount: 0,
    });
  });

  it("requires a single frozen evaluation and zero unsafe displays", async () => {
    const config = JSON.parse(
      await readFile("config/a100-cascade-lora-v1.json", "utf8"),
    );
    expect(config.qualificationGate).toMatchObject({
      validationSchemaPassRateMinimum: 0.98,
      validationNumericIntegrityRateMinimum: 1,
      validationCitationIntegrityRateMinimum: 1,
      validationInjectionIsolationRateMinimum: 1,
      unsafeDisplayCountMaximum: 0,
      frozenEvaluationRunLimit: 1,
    });
  });

  it("pins the required PEFT runtime and rejects non-A100 80GB execution", async () => {
    const requirements = await readFile("requirements-gpu-runtime.txt", "utf8");
    const trainingScript = await readFile(
      "scripts/train-ax-cascade-lora.py",
      "utf8",
    );
    expect(requirements).toContain("peft==0.16.0");
    expect(trainingScript).toContain('"A100_80GB_REQUIRED "');
    expect(trainingScript).toContain('"trainingDevice"');
  });
});
