// @ts-nocheck -- Python evaluator contract test; application tsconfig is browser-only.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("A100 Cascade LoRA validation evaluator", () => {
  it("passes its schema, numeric, injection and wrapper self-tests", async () => {
    const { stdout } = await execFileAsync(
      "python",
      ["scripts/evaluate-ax-cascade-lora.py", "--self-test"],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain(
      "A100_CASCADE_LORA_VALIDATION_SELF_TEST_PASS cases=4",
    );
  });

  it("does not accept or open a frozen split argument", async () => {
    const script = await readFile(
      "scripts/evaluate-ax-cascade-lora.py",
      "utf8",
    );
    expect(script).not.toContain('parser.add_argument("--frozen');
    expect(script).not.toContain('config["dataset"]["frozenSplit"]');
    expect(script).toContain('config["dataset"]["validationSplit"]');
    expect(script).toContain('"frozenRecordsRead": 0');
    expect(script).toContain('"rawOutputStored": False');
  });

  it("keeps the approved validation thresholds and non-product result", async () => {
    const script = await readFile(
      "scripts/evaluate-ax-cascade-lora.py",
      "utf8",
    );
    expect(script).toContain('gate["validationSchemaPassRateMinimum"]');
    expect(script).toContain('gate["validationNumericIntegrityRateMinimum"]');
    expect(script).toContain('gate["validationCitationIntegrityRateMinimum"]');
    expect(script).toContain('gate["validationInjectionIsolationRateMinimum"]');
    expect(script).toContain('"productIntegrationApproved": False');
  });
});
