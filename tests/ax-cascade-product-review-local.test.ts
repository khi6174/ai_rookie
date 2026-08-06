// @ts-nocheck -- Python A100 evaluator contract test.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("A.X Cascade local product-review evaluator", () => {
  it("passes required fact, citation and display-value self-tests", async () => {
    const { stdout } = await execFileAsync(
      "python",
      ["scripts/evaluate-ax-cascade-product-review-local.py", "--self-test"],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain(
      "AX_CASCADE_PRODUCT_REVIEW_LOCAL_SELF_TEST_PASS cases=4",
    );
  });

  it("locks the bundle and qualification evidence hashes", async () => {
    const config = JSON.parse(
      await readFile("config/ax-cascade-product-review-v1.json", "utf8"),
    );
    for (const [path, expected] of [
      [config.bundlePath, config.bundleSha256],
      [config.qualificationEvidencePath, config.qualificationEvidenceSha256],
      [config.hostedReference.path, config.hostedReference.sha256],
    ]) {
      expect(
        createHash("sha256").update(await readFile(path)).digest("hex"),
      ).toBe(expected);
    }
  });

  it("does not read frozen data or store prompts and raw outputs", async () => {
    const script = await readFile(
      "scripts/evaluate-ax-cascade-product-review-local.py",
      "utf8",
    );
    expect(script).not.toContain('training_config["dataset"]["frozenSplit"]');
    expect(script).toContain('"frozenRecordsRead": 0');
    expect(script).toContain('"promptStored": False');
    expect(script).toContain('"rawOutputStored": False');
    expect(script).toContain('marker_path.open("x"');
    expect(script).not.toContain("--allow-rerun");
  });

  it("keeps product integration unapproved and requires all 12 tasks", async () => {
    const config = JSON.parse(
      await readFile("config/ax-cascade-product-review-v1.json", "utf8"),
    );
    expect(config.localGate.taskCount).toBe(12);
    expect(config.localGate.evaluationRunLimit).toBe(1);
    expect(config.productIntegrationApproved).toBe(false);
  });
});
