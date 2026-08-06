// @ts-nocheck -- Node submission allowlist contract.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("submission package A.X Local v2 evidence", () => {
  it("allowlists reproducible aggregate evidence and its approved decision", async () => {
    const builder = await readFile(
      "scripts/build-submission-package.mjs",
      "utf8",
    );
    for (const expectedPath of [
      "config/a100-cascade-lora-v2.json",
      "config/a100-cascade-lora-frozen-v2.json",
      "config/ax-cascade-product-review-v2.json",
      "data/seed-specs/synthetic-cascade-explanations-v2.json",
      "data/manifests/synthetic-cascade-explanations-v2.json",
      "artifacts/evals/synthetic-cascade-training-dataset-v2-latest.json",
      "artifacts/evals/ax-cascade-lora-v2-evidence-latest.json",
      "artifacts/evals/ax-cascade-product-review-latest.json",
      "artifacts/evals/ax-cascade-product-review-v1.json",
      "artifacts/evals/ax-cascade-product-review-v2-latest.json",
      "docs/ax-cascade-product-review.md",
    ]) {
      expect(builder).toContain(`"${expectedPath}"`);
    }
  });

  it("keeps raw runs, model weights, and remote GPU paths out of the allowlist", async () => {
    const builder = await readFile(
      "scripts/build-submission-package.mjs",
      "utf8",
    );
    expect(builder).not.toContain('"artifacts/evals/local-model-runs/');
    expect(builder).not.toContain('"adapter_model.safetensors"');
    expect(builder).not.toContain('"docs/gpu-benchmark-runbook.md"');
    const remoteGpuHome = `"/${["home", "tta"].join("/")}`;
    expect(builder).not.toContain(remoteGpuHome);
  });
});
