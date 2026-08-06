// @ts-nocheck -- generated Node evaluation bundle contract.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("A.X Cascade product review bundle", () => {
  it(
    "is deterministic and remains locked to the 12 domestic AI tasks",
    async () => {
      const { stdout } = await execFileAsync(
        "node",
        ["scripts/prepare-ax-cascade-product-review.mjs", "--check"],
        { cwd: process.cwd() },
      );
      expect(stdout).toContain(
        "AX_CASCADE_PRODUCT_REVIEW_BUNDLE_PASS tasks=12 injections=1",
      );
    },
    15_000,
  );

  it("uses synthetic inputs, unique task IDs and all four roles", async () => {
    const bundle = JSON.parse(
      await readFile(
        "artifacts/evals/ax-cascade-product-review-v1.json",
        "utf8",
      ),
    );
    expect(bundle.status).toBe("LOCKED_NOT_RUN");
    expect(bundle.dataMode).toBe("SYNTHETIC_DEMO");
    expect(bundle.taskCount).toBe(12);
    expect(new Set(bundle.records.map((record) => record.recordId)).size).toBe(12);
    expect(new Set(bundle.records.map((record) => record.role))).toEqual(
      new Set(["ADMIN", "COURIER", "CUSTOMER", "REPORT"]),
    );
    expect(bundle.records.every((record) => record.split === "product-review")).toBe(true);
    expect(bundle.privacy).toEqual({
      actualPersonalDataCount: 0,
      preciseLocationCount: 0,
      biometricDataCount: 0,
    });
  });
});
