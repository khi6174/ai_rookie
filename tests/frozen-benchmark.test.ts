import { describe, expect, it } from "vitest";
import { scenarioFixtures } from "../src/adapters/fixtures";
import { ScenarioFixtureSchema } from "../src/domain/contracts";
import { evaluateSafetyBudget } from "../src/domain/safety";
import {
  evaluateFrozenBenchmark,
  frozenBenchmarkSeed,
  frozenBenchmarkVersion,
  frozenRules,
  generateFrozenVariants,
} from "../src/evals/frozenBenchmark";

describe("frozen benchmark dataset", () => {
  it("creates 30 unique, valid, frozen Mock variants with traceable parents", () => {
    const variants = generateFrozenVariants();
    expect(variants).toHaveLength(30);
    expect(new Set(variants.map((variant) => variant.variantId))).toHaveLength(30);
    expect(new Set(variants.map((variant) => variant.seed))).toHaveLength(30);
    expect(Math.min(...variants.map((variant) => variant.seed))).toBe(frozenBenchmarkSeed);
    expect(Math.max(...variants.map((variant) => variant.seed))).toBe(frozenBenchmarkSeed + 29);
    for (const parent of scenarioFixtures) {
      expect(variants.filter((variant) => variant.parentFixtureId === parent.fixtureId)).toHaveLength(
        frozenRules.length,
      );
    }
    for (const variant of variants) {
      expect(variant).toMatchObject({
        split: "FROZEN_TEST",
        dataMode: "MOCK",
        isDemo: true,
        generatorVersion: frozenBenchmarkVersion,
      });
      expect(ScenarioFixtureSchema.safeParse(variant.fixture).success).toBe(true);
    }
  });

  it("is deterministic and never mutates the three parent fixtures", () => {
    const before = structuredClone(scenarioFixtures);
    expect(generateFrozenVariants()).toEqual(generateFrozenVariants());
    expect(scenarioFixtures).toEqual(before);
  });

  it("changes every parent once per declared mutation without mixing mutations", () => {
    const variants = generateFrozenVariants();
    for (const variant of variants) {
      const parent = scenarioFixtures.find((fixture) => fixture.fixtureId === variant.parentFixtureId);
      expect(parent).toBeDefined();
      expect(variant.fixture).not.toEqual(parent);
      expect(frozenRules.some((rule) => rule.mutationId === variant.mutationId)).toBe(true);
    }
  });

  it("does not let any adverse single-factor variant delay the predicted breach", () => {
    const parentBreachMinutes = new Map(
      scenarioFixtures.map((fixture) => [
        fixture.fixtureId,
        evaluateSafetyBudget(fixture, fixture.couriers[0].courierId).breach,
      ]),
    );
    for (const variant of generateFrozenVariants().filter(
      (item) => item.mutationCategory !== "MISSINGNESS",
    )) {
      const snapshot = evaluateSafetyBudget(
        variant.fixture,
        variant.fixture.couriers[0].courierId,
      );
      const parentBreach = parentBreachMinutes.get(variant.parentFixtureId)!;
      expect(snapshot.breach.status, variant.variantId).toBe("PREDICTED");
      expect(parentBreach.status, variant.parentFixtureId).toBe("PREDICTED");
      if (snapshot.breach.status !== "PREDICTED" || parentBreach.status !== "PREDICTED") {
        throw new Error("Frozen monotonicity requires predicted parent and variant breaches");
      }
      expect(snapshot.breach.timeToBreachMinutes, variant.variantId).toBeLessThanOrEqual(
        parentBreach.timeToBreachMinutes,
      );
    }
  });

  it("keeps optional self-check absence visible without inventing a confidence penalty", () => {
    for (const variant of generateFrozenVariants().filter(
      (item) => item.mutationId === "self-check-missing",
    )) {
      const parent = scenarioFixtures.find((fixture) => fixture.fixtureId === variant.parentFixtureId)!;
      const parentSnapshot = evaluateSafetyBudget(parent, parent.couriers[0].courierId);
      const missingSnapshot = evaluateSafetyBudget(
        variant.fixture,
        variant.fixture.couriers[0].courierId,
      );
      expect(variant.fixture.couriers[0].optionalDerivedSignals).toBeUndefined();
      expect(missingSnapshot.confidenceScore).toBe(parentSnapshot.confidenceScore);
    }
  });
});

describe("three-strategy frozen comparison", () => {
  it("evaluates the same candidate set with three selectors for all 30 variants", () => {
    const benchmark = evaluateFrozenBenchmark();
    expect(benchmark.variantCount).toBe(30);
    expect(benchmark.comparisonCount).toBe(90);
    for (const variant of benchmark.variants) {
      const rows = benchmark.comparisons.filter((row) => row.variantId === variant.variantId);
      expect(rows.map((row) => row.strategy)).toEqual([
        "FASTEST_ONLY",
        "BALANCED_ONLY",
        "SAFEROUTE",
      ]);
      expect(new Set(rows.map((row) => row.candidateSetSignature))).toHaveLength(1);
      expect(new Set(rows.map((row) => row.candidateCount))).toHaveLength(1);
    }
  });

  it("preserves unsafe baseline selections and keeps every SafeRoute selection feasible", () => {
    const benchmark = evaluateFrozenBenchmark();
    const fastest = benchmark.comparisons.filter((row) => row.strategy === "FASTEST_ONLY");
    const safeRoute = benchmark.comparisons.filter((row) => row.strategy === "SAFEROUTE");
    expect(fastest.some((row) => row.hardConstraintViolation)).toBe(true);
    expect(safeRoute).toHaveLength(30);
    expect(safeRoute.every((row) => row.selectionStatus === "SELECTED")).toBe(true);
    expect(safeRoute.every((row) => row.feasibility === "FEASIBLE")).toBe(true);
    expect(benchmark.allSafeRouteSelectionsRespectHardConstraints).toBe(true);
  });
});
