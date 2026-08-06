// @ts-nocheck -- Node evidence verifier contract; browser tsconfig excludes Node types.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("A100 Cascade LoRA v2 recovered evidence", () => {
  it("independently verifies all 600 validation and frozen result rows", async () => {
    const { stdout } = await execFileAsync(
      "node",
      [
        "scripts/verify-ax-cascade-lora-evidence.mjs",
        "--experiment",
        "v2",
        "--check",
      ],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain(
      "AX_CASCADE_LORA_EVIDENCE_VERIFY_PASS experiment=ax-cascade-lora-v2 validation=300/300 frozen=300/300 unsafe=0 rerun=false write=false",
    );
  });

  it("stores only hashes and verification metadata for generated outputs", async () => {
    for (const relativePath of [
      "artifacts/evals/local-model-runs/ax-cascade-lora-v2/ax-cascade-lora-v2-validation-run1/validation-results.jsonl",
      "artifacts/evals/local-model-runs/ax-cascade-lora-v2/ax-cascade-lora-v2-frozen-run1/frozen-results.jsonl",
    ]) {
      const rows = (await readFile(relativePath, "utf8"))
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
      expect(rows).toHaveLength(300);
      for (const row of rows) {
        expect(row).not.toHaveProperty("prompt");
        expect(row).not.toHaveProperty("rawOutput");
        expect(row.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
});
