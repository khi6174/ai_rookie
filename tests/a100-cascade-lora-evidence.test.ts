// @ts-nocheck -- Node evidence verifier contract; browser tsconfig excludes Node types.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("A100 Cascade LoRA recovered evidence", () => {
  it("independently verifies all 400 validation and frozen result rows", async () => {
    const { stdout } = await execFileAsync(
      "node",
      ["scripts/verify-ax-cascade-lora-evidence.mjs", "--check"],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain(
      "AX_CASCADE_LORA_EVIDENCE_VERIFY_PASS validation=200/200 frozen=200/200 unsafe=0 rerun=false write=false",
    );
  });

  it("keeps prompts and raw outputs out of recovered row evidence", async () => {
    for (const relativePath of [
      "artifacts/evals/local-model-runs/ax-cascade-lora-v1/ax-cascade-lora-v1-validation-run1/validation-results.jsonl",
      "artifacts/evals/local-model-runs/ax-cascade-lora-v1/ax-cascade-lora-v1-frozen-run1/frozen-results.jsonl",
    ]) {
      const rows = (await readFile(relativePath, "utf8"))
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
      expect(rows).toHaveLength(200);
      for (const row of rows) {
        expect(row).not.toHaveProperty("prompt");
        expect(row).not.toHaveProperty("rawOutput");
        expect(row.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
});
