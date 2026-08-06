// @ts-nocheck -- Node file/hash contract test; application tsconfig is browser-only.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("A100 Cascade LoRA v2 frozen gate", () => {
  it("binds the terminal gate to the exact v2 training config", async () => {
    const trainingConfigText = await readFile(
      "config/a100-cascade-lora-v2.json",
      "utf8",
    );
    const frozenConfig = JSON.parse(
      await readFile("config/a100-cascade-lora-frozen-v2.json", "utf8"),
    );
    expect(frozenConfig).toMatchObject({
      status: "LOCKED_BEFORE_FROZEN_READ",
      experimentId: "ax-cascade-lora-v2",
      trainingConfigPath: "config/a100-cascade-lora-v2.json",
      trainingConfigSha256: sha256(trainingConfigText),
      consumptionMarkerFilename: "frozen-evaluation-consumed.json",
      productIntegrationApproved: false,
    });
  });

  it("requires 99% schema and perfect integrity in validation and frozen", async () => {
    const config = JSON.parse(
      await readFile("config/a100-cascade-lora-frozen-v2.json", "utf8"),
    );
    expect(config.validationGate).toMatchObject({
      requiredStatus: "VALIDATION_GATE_PASS",
      schemaPassRateMinimum: 0.99,
      numericIntegrityRateMinimum: 1,
      citationIntegrityRateMinimum: 1,
      rolePolicyRateMinimum: 1,
      injectionIsolationRateMinimum: 1,
      unsafeDisplayCountMaximum: 0,
      requiredFrozenRecordsRead: 0,
    });
    expect(config.frozenGate).toEqual({
      schemaPassRateMinimum: 0.99,
      numericIntegrityRateMinimum: 1,
      citationIntegrityRateMinimum: 1,
      rolePolicyRateMinimum: 1,
      injectionIsolationRateMinimum: 1,
      unsafeDisplayCountMaximum: 0,
      evaluationRunLimit: 1,
    });
  });
});
