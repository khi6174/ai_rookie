import { scenarioFixtures } from "../adapters/fixtures";
import {
  ScenarioFixtureSchema,
  type InterventionCandidate,
  type InterventionEvaluation,
  type ScenarioFixture,
} from "../domain/contracts";
import {
  createReorderCandidate,
  createRestCandidate,
  createRestReorderCandidate,
  createRestSafeDelayCandidate,
  createRestSaferRouteCandidate,
  createRestTransferCandidate,
  createSafeDelayCandidate,
  createSaferRouteCandidate,
  createTransferCandidate,
  evaluateIntervention,
  rankInterventions,
} from "../domain/interventions";
import { evaluateSafetyBudget } from "../domain/safety";

export const frozenBenchmarkVersion = "frozen-benchmark-v1.0.0";
export const frozenBenchmarkSeed = 6174;

export type FrozenStrategy = "FASTEST_ONLY" | "BALANCED_ONLY" | "SAFEROUTE";

type FrozenRule = {
  mutationId: string;
  category: "SHIFT" | "CONTINUOUS_WORK" | "WORKLOAD" | "WEATHER" | "ROUTE" | "MISSINGNESS";
  description: string;
  mutate: (fixture: ScenarioFixture) => void;
};

export type FrozenVariant = {
  variantId: string;
  parentFixtureId: string;
  split: "FROZEN_TEST";
  dataMode: "MOCK";
  isDemo: true;
  generatorVersion: typeof frozenBenchmarkVersion;
  seed: number;
  mutationId: string;
  mutationCategory: FrozenRule["category"];
  mutationDescription: string;
  fixture: ScenarioFixture;
};

type FrozenComparisonRow = {
  variantId: string;
  parentFixtureId: string;
  split: "FROZEN_TEST";
  dataMode: "MOCK";
  strategy: FrozenStrategy;
  selectionStatus: "SELECTED" | "NO_SAFE_OPTION";
  candidateSetSignature: string;
  candidateCount: number;
  selectedCandidateId: string | undefined;
  actionKinds: string | undefined;
  feasibility: InterventionEvaluation["feasibility"]["status"] | undefined;
  hardConstraintViolation: boolean;
  baselineMinimumBudget: number | undefined;
  candidateMinimumBudget: number | undefined;
  safetyGain: number | undefined;
  breachOutcome: InterventionEvaluation["breachOutcome"] | undefined;
  etaDeltaMinutes: number | undefined;
  stopCountImbalance: number | undefined;
  recipientMinimumBudget: number | undefined;
  recommendationScore: number | undefined;
  reasonCodes: string | undefined;
};

const round = (value: number) => Number(value.toFixed(6));

const earlierByMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) - minutes * 60_000).toISOString();

const laterByMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

function increaseRemainingWeight(fixture: ScenarioFixture, factor: number) {
  const workload = fixture.workloads[0];
  const remainingIds = new Set(workload.remainingStopIds);
  for (const stop of fixture.stops) {
    if (remainingIds.has(stop.stopId) && stop.load.weightKg !== undefined) {
      stop.load.weightKg = round(stop.load.weightKg * factor);
    }
  }
  const totalWeight = round(
    fixture.stops
      .filter((stop) => remainingIds.has(stop.stopId))
      .reduce((total, stop) => total + (stop.load.weightKg ?? 0), 0),
  );
  workload.remainingLoad.totalWeightKg = totalWeight;
  workload.onboardLoad.totalWeightKg = totalWeight;
}

export const frozenRules: readonly FrozenRule[] = [
  {
    mutationId: "shift-plus-30m",
    category: "SHIFT",
    description: "누적근무시간 30분 증가",
    mutate: (fixture) => {
      fixture.couriers[0].shiftStartedAt = earlierByMinutes(
        fixture.couriers[0].shiftStartedAt,
        30,
      );
    },
  },
  {
    mutationId: "shift-plus-60m",
    category: "SHIFT",
    description: "누적근무시간 60분 증가",
    mutate: (fixture) => {
      fixture.couriers[0].shiftStartedAt = earlierByMinutes(
        fixture.couriers[0].shiftStartedAt,
        60,
      );
    },
  },
  {
    mutationId: "continuous-plus-15m",
    category: "CONTINUOUS_WORK",
    description: "연속근무시간 15분 증가",
    mutate: (fixture) => {
      fixture.couriers[0].continuousWorkStartedAt = earlierByMinutes(
        fixture.couriers[0].continuousWorkStartedAt,
        15,
      );
    },
  },
  {
    mutationId: "continuous-plus-30m",
    category: "CONTINUOUS_WORK",
    description: "연속근무시간 30분 증가",
    mutate: (fixture) => {
      fixture.couriers[0].continuousWorkStartedAt = earlierByMinutes(
        fixture.couriers[0].continuousWorkStartedAt,
        30,
      );
    },
  },
  {
    mutationId: "remaining-weight-plus-10pct",
    category: "WORKLOAD",
    description: "남은 중량 10% 증가",
    mutate: (fixture) => increaseRemainingWeight(fixture, 1.1),
  },
  {
    mutationId: "rain-plus-2mmh",
    category: "WEATHER",
    description: "시간당 강수량 2mm 증가",
    mutate: (fixture) => {
      for (const weather of fixture.weatherTimeline) {
        weather.rainfallMmPerHour = round(weather.rainfallMmPerHour + 2);
      }
    },
  },
  {
    mutationId: "visibility-minus-20pct",
    category: "WEATHER",
    description: "시정 20% 감소",
    mutate: (fixture) => {
      for (const weather of fixture.weatherTimeline) {
        weather.visibilityMeters = Math.max(1, round(weather.visibilityMeters * 0.8));
      }
    },
  },
  {
    mutationId: "uphill-plus-2pct",
    category: "ROUTE",
    description: "현재 경로 경사 2%p 증가",
    mutate: (fixture) => {
      for (const segment of fixture.routeSegments) {
        segment.uphillGradePct = round(segment.uphillGradePct + 2);
      }
    },
  },
  {
    mutationId: "incident-factor-plus-005",
    category: "ROUTE",
    description: "지역 incident factor 0.05 증가",
    mutate: (fixture) => {
      for (const area of fixture.areaRiskProfiles) {
        area.incidentFactor = round(Math.min(1, area.incidentFactor + 0.05));
      }
    },
  },
  {
    mutationId: "self-check-missing",
    category: "MISSINGNESS",
    description: "선택형 자기점검 입력 결측",
    mutate: (fixture) => {
      delete fixture.couriers[0].optionalDerivedSignals;
    },
  },
] as const;

export function generateFrozenVariants(
  parents: readonly ScenarioFixture[] = scenarioFixtures,
): FrozenVariant[] {
  return parents.flatMap((parent, parentIndex) =>
    frozenRules.map((rule, ruleIndex) => {
      const fixture = structuredClone(parent);
      rule.mutate(fixture);
      return {
        variantId: `frozen-${parent.fixtureId}-${rule.mutationId}-v1`,
        parentFixtureId: parent.fixtureId,
        split: "FROZEN_TEST" as const,
        dataMode: "MOCK" as const,
        isDemo: true as const,
        generatorVersion: frozenBenchmarkVersion,
        seed: frozenBenchmarkSeed + parentIndex * frozenRules.length + ruleIndex,
        mutationId: rule.mutationId,
        mutationCategory: rule.category,
        mutationDescription: rule.description,
        fixture: ScenarioFixtureSchema.parse(fixture),
      };
    }),
  );
}

function nightReorderOrder(fixture: ScenarioFixture) {
  const policy = fixture.interventionInputs?.reorderPolicies[0];
  if (!policy) throw new Error("Night fixture has no reorder policy");
  const baselineOrder = fixture.workloads[0].remainingStopIds;
  const movableStairs = fixture.stops
    .filter(
      (stop) =>
        stop.access.elevator === "UNAVAILABLE" &&
        policy.reorderableStopIds.includes(stop.stopId),
    )
    .map((stop) => stop.stopId);
  const reordered = [
    ...movableStairs,
    ...baselineOrder.filter((stopId) => !movableStairs.includes(stopId)),
  ];
  for (const fixedStopId of policy.fixedStopIds) {
    const targetIndex = baselineOrder.indexOf(fixedStopId);
    reordered.splice(reordered.indexOf(fixedStopId), 1);
    reordered.splice(targetIndex, 0, fixedStopId);
  }
  return reordered;
}

export function createFrozenCandidateCatalog(variant: FrozenVariant): InterventionCandidate[] {
  const fixture = variant.fixture;
  const sourceCourierId = fixture.couriers[0].courierId;
  const decisionId = `decision-${variant.variantId}`;
  if (fixture.scenario === "RAINY_HILLY_LONG_SHIFT") {
    const recipientCourierId = fixture.couriers[1].courierId;
    const transfer = (count: number) => ({
      sourceCourierId,
      recipientCourierId,
      stopIds: fixture.stops.slice(-count).map((stop) => stop.stopId),
    });
    return [
      createRestCandidate(fixture, decisionId, sourceCourierId, 10),
      createTransferCandidate(fixture, decisionId, transfer(4)),
      createTransferCandidate(fixture, decisionId, transfer(8)),
      createTransferCandidate(fixture, decisionId, transfer(12)),
      createRestTransferCandidate(fixture, decisionId, 10, transfer(8)),
    ];
  }
  if (fixture.scenario === "HEAT_HEAVY_STAIRS") {
    const policy = fixture.interventionInputs?.safeDelayPolicies[0];
    if (!policy) throw new Error("Heat fixture has no Safe Delay policy");
    const stopIds = policy.delayableStopIds.slice(0, 3);
    const delayedUntil = laterByMinutes(fixture.evaluatedAt, 45);
    return [
      createRestCandidate(fixture, decisionId, sourceCourierId, 10),
      createRestCandidate(fixture, decisionId, sourceCourierId, 15),
      createRestCandidate(fixture, decisionId, sourceCourierId, 20),
      createSafeDelayCandidate(fixture, decisionId, sourceCourierId, stopIds, delayedUntil),
      createRestSafeDelayCandidate(
        fixture,
        decisionId,
        10,
        sourceCourierId,
        stopIds,
        delayedUntil,
      ),
    ];
  }
  const alternative = fixture.interventionInputs?.saferRouteAlternatives[0];
  if (!alternative) throw new Error("Night fixture has no safer-route alternative");
  const order = nightReorderOrder(fixture);
  return [
    createReorderCandidate(fixture, decisionId, sourceCourierId, order),
    createSaferRouteCandidate(
      fixture,
      decisionId,
      sourceCourierId,
      alternative.replacementRouteId,
      alternative.replacedSegmentIds,
    ),
    createRestCandidate(fixture, decisionId, sourceCourierId, 10),
    createRestReorderCandidate(fixture, decisionId, 10, sourceCourierId, order),
    createRestSaferRouteCandidate(
      fixture,
      decisionId,
      10,
      sourceCourierId,
      alternative.replacementRouteId,
      alternative.replacedSegmentIds,
    ),
  ];
}

function stopCountImbalance(fixture: ScenarioFixture, evaluation: InterventionEvaluation) {
  const counts = new Map(
    fixture.workloads.map((workload) => [workload.courierId, workload.remainingStopIds.length]),
  );
  for (const impact of evaluation.courierImpacts) {
    counts.set(impact.courierId, (counts.get(impact.courierId) ?? 0) + impact.stopCountDelta);
  }
  const values = [...counts.values()];
  return Math.max(...values) - Math.min(...values);
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function chooseEvaluation(
  strategy: FrozenStrategy,
  fixture: ScenarioFixture,
  evaluations: InterventionEvaluation[],
) {
  if (strategy === "SAFEROUTE") {
    return rankInterventions(evaluations).find(
      (evaluation) => evaluation.feasibility.status === "FEASIBLE",
    );
  }
  return [...evaluations].sort((left, right) => {
    if (strategy === "BALANCED_ONLY") {
      const imbalance =
        stopCountImbalance(fixture, left) - stopCountImbalance(fixture, right);
      if (imbalance !== 0) return imbalance;
    }
    return (
      left.etaDeltaMinutes - right.etaDeltaMinutes ||
      left.candidateId.localeCompare(right.candidateId)
    );
  })[0];
}

export function evaluateFrozenBenchmark(
  parents: readonly ScenarioFixture[] = scenarioFixtures,
) {
  const variants = generateFrozenVariants(parents);
  const variantResults = [];
  const comparisons: FrozenComparisonRow[] = [];
  for (const variant of variants) {
    const sourceCourierId = variant.fixture.couriers[0].courierId;
    const baseline = evaluateSafetyBudget(variant.fixture, sourceCourierId, {
      snapshotIdSuffix: variant.variantId,
    });
    variantResults.push({
      variantId: variant.variantId,
      parentFixtureId: variant.parentFixtureId,
      split: variant.split,
      dataMode: variant.dataMode,
      isDemo: variant.isDemo,
      generatorVersion: variant.generatorVersion,
      seed: variant.seed,
      mutationId: variant.mutationId,
      mutationCategory: variant.mutationCategory,
      mutationDescription: variant.mutationDescription,
      currentBudget: baseline.currentBudget,
      minimumForecastBudget: baseline.minimumForecastBudget,
      breachStatus: baseline.breach.status,
      timeToBreachMinutes: baseline.breach.status === "PREDICTED"
        ? baseline.breach.timeToBreachMinutes
        : undefined,
      breachStopId: baseline.breach.status === "PREDICTED" ? baseline.breach.stopId : undefined,
      confidenceScore: baseline.confidenceScore,
    });
    const candidates = createFrozenCandidateCatalog(variant);
    const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
    const evaluations = candidates.map((candidate) =>
      evaluateIntervention(variant.fixture, candidate),
    );
    const candidateSetSignature = fnv1a(
      candidates.map((candidate) => candidate.candidateId).sort().join("|"),
    );
    for (const strategy of ["FASTEST_ONLY", "BALANCED_ONLY", "SAFEROUTE"] as const) {
      const selected = chooseEvaluation(strategy, variant.fixture, evaluations);
      const candidate = selected ? candidateById.get(selected.candidateId) : undefined;
      const source = selected?.courierImpacts.find((impact) => impact.role === "SOURCE");
      const recipient = selected?.courierImpacts.find((impact) => impact.role === "RECIPIENT");
      comparisons.push({
        variantId: variant.variantId,
        parentFixtureId: variant.parentFixtureId,
        split: variant.split,
        dataMode: variant.dataMode,
        strategy,
        selectionStatus: selected ? "SELECTED" : "NO_SAFE_OPTION",
        candidateSetSignature,
        candidateCount: candidates.length,
        selectedCandidateId: selected?.candidateId,
        actionKinds: candidate?.actions.map((action) => action.type).join("|"),
        feasibility: selected?.feasibility.status,
        hardConstraintViolation:
          selected !== undefined && selected.feasibility.status !== "FEASIBLE",
        baselineMinimumBudget: source?.baselineMinimumBudget,
        candidateMinimumBudget: source?.candidateMinimumBudget,
        safetyGain: selected?.safetyGain,
        breachOutcome: selected?.breachOutcome,
        etaDeltaMinutes: selected?.etaDeltaMinutes,
        stopCountImbalance: selected
          ? stopCountImbalance(variant.fixture, selected)
          : undefined,
        recipientMinimumBudget: recipient?.candidateMinimumBudget,
        recommendationScore: selected?.recommendationScore,
        reasonCodes: selected?.reasons.map((reason) => reason.code).join("|"),
      });
    }
  }

  const strategySummary = (["FASTEST_ONLY", "BALANCED_ONLY", "SAFEROUTE"] as const)
    .map((strategy) => {
      const rows = comparisons.filter((row) => row.strategy === strategy);
      const selected = rows.filter((row) => row.selectionStatus === "SELECTED");
      const numericAverage = (field: "candidateMinimumBudget" | "etaDeltaMinutes" | "stopCountImbalance") =>
        round(
          selected.reduce((total, row) => total + Number(row[field] ?? 0), 0) /
            Math.max(selected.length, 1),
        );
      return {
        strategy,
        variantCount: rows.length,
        selectedCount: selected.length,
        noSafeOptionCount: rows.length - selected.length,
        hardConstraintViolationCount: selected.filter((row) => row.hardConstraintViolation).length,
        breachAvoidedCount: selected.filter((row) => row.breachOutcome === "AVOIDED").length,
        averageCandidateMinimumBudget: numericAverage("candidateMinimumBudget"),
        averageEtaDeltaMinutes: numericAverage("etaDeltaMinutes"),
        averageStopCountImbalance: numericAverage("stopCountImbalance"),
      };
    });

  return {
    schemaVersion: "frozen-benchmark-v1",
    generatorVersion: frozenBenchmarkVersion,
    seedStart: frozenBenchmarkSeed,
    split: "FROZEN_TEST" as const,
    dataMode: "MOCK" as const,
    isDemo: true as const,
    parentCount: parents.length,
    mutationCountPerParent: frozenRules.length,
    variantCount: variants.length,
    comparisonCount: comparisons.length,
    strategies: strategySummary,
    allSafeRouteSelectionsRespectHardConstraints: comparisons
      .filter((row) => row.strategy === "SAFEROUTE")
      .every((row) => !row.hardConstraintViolation),
    variants,
    variantResults,
    comparisons,
  };
}
