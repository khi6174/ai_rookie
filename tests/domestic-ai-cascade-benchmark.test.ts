import { describe, expect, it } from "vitest";
import { runDomesticAiCascadeMockBenchmark } from "../src/evals/domesticAiCascadeBenchmark";

describe("domestic AI cascade mock benchmark", () => {
  it("compares local-only, Hosted-only and Cascade without storing model output", async () => {
    const run = await runDomesticAiCascadeMockBenchmark({
      capturedAt: "2026-08-05T10:00:00.000Z",
    });
    expect(run.taskCountPerStrategy).toBe(12);
    expect(run.results).toHaveLength(36);
    expect(run.metrics).toEqual([
      expect.objectContaining({
        strategy: "LOCAL_ONLY",
        verifiedLocal: 9,
        verifiedHosted: 0,
        fallback: 3,
        escalated: 0,
        unsafeDisplayCount: 0,
      }),
      expect.objectContaining({
        strategy: "HOSTED_ONLY",
        verifiedLocal: 0,
        verifiedHosted: 12,
        fallback: 0,
        escalated: 0,
        unsafeDisplayCount: 0,
      }),
      expect.objectContaining({
        strategy: "CASCADE",
        verifiedLocal: 9,
        verifiedHosted: 3,
        fallback: 0,
        escalated: 3,
        unsafeDisplayCount: 0,
      }),
    ]);
    expect(JSON.stringify(run.results)).not.toContain('"summary"');
    expect(
      run.results
        .filter((result) => result.strategy === "CASCADE")
        .every((result) => result.attemptCount <= 2),
    ).toBe(true);
  });
});
