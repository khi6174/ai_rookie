import { describe, expect, it } from "vitest";
import { createUpstageMockProvider } from "../src/adapters/upstage";
import { createTemplateExplanation } from "../src/application/explanations";
import { ExplanationInputSchema } from "../src/domain/contracts";
import {
  runUpstageSmokeSuite,
  upstageSmokeTasks,
} from "../src/evals/upstageSmoke";
import {
  executeUpstageMockSmoke,
  executeUpstageSmoke,
} from "../scripts/upstage-smoke-entry";

describe("Upstage smoke task catalog", () => {
  it("contains twelve unique contract-valid synthetic tasks", () => {
    expect(upstageSmokeTasks).toHaveLength(12);
    expect(new Set(upstageSmokeTasks.map((task) => task.taskId)).size).toBe(12);
    expect(
      upstageSmokeTasks.every(
        (task) => ExplanationInputSchema.safeParse(task.input).success,
      ),
    ).toBe(true);
  });

  it("covers every product explanation role without storing PII fields", () => {
    expect(new Set(upstageSmokeTasks.map((task) => task.input.role))).toEqual(
      new Set(["ADMIN", "COURIER", "CUSTOMER", "REPORT"]),
    );
    const serialized = JSON.stringify(upstageSmokeTasks);
    expect(serialized).not.toContain("courierName");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("heartRate");
  });
});

describe("Upstage smoke evaluation harness", () => {
  it("passes the deterministic Mock baseline for every task", async () => {
    let time = 0;
    const run = await runUpstageSmokeSuite({
      provider: createUpstageMockProvider(),
      nowMs: () => {
        time += 10;
        return time;
      },
      nowIso: () => "2026-07-16T00:00:00.000Z",
    });
    expect(run.taskCount).toBe(12);
    expect(run.metrics).toMatchObject({
      passed: 12,
      failed: 0,
      fallback: 0,
      averageLatencyMs: 10,
      p95LatencyMs: 10,
    });
    expect(run.results.every((result) => result.status === "MOCK")).toBe(true);
  });

  it("records only failure codes when one provider response is invalid", async () => {
    const provider = createUpstageMockProvider((input) => {
      if (input.requestId.includes("admin-blocked")) {
        return { summary: "malformed" };
      }
      return createTemplateExplanation(input);
    });
    const run = await runUpstageSmokeSuite({
      provider,
      nowMs: () => 100,
      nowIso: () => "2026-07-16T00:00:00.000Z",
    });
    expect(run.metrics.failed).toBe(1);
    expect(run.metrics.fallback).toBe(1);
    expect(run.metrics.fallbackCodes).toEqual({
      SCHEMA_VALIDATION_FAILED: 1,
    });
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain("malformed");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("Authorization");
    expect(run.results.every((result) => !("data" in result))).toBe(true);
  });

  it("does not attempt Live execution when server variables are absent", async () => {
    const result = await executeUpstageSmoke({});
    expect(result.status).toBe("NOT_CONFIGURED");
    if (result.status !== "NOT_CONFIGURED") {
      throw new Error("Expected readiness result");
    }
    expect(result.missing).toContain("UPSTAGE_API_KEY");
    expect(result.missing).toContain("UPSTAGE_MODEL");
  });

  it("exposes the same twelve-task Mock baseline through the CLI entry", async () => {
    const result = await executeUpstageMockSmoke();
    expect(result.status).toBe("COMPLETED");
    expect(result.run.metrics.passed).toBe(12);
    expect(result.run.metrics.failed).toBe(0);
  });
});
