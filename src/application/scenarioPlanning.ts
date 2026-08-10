import { createScenarioFixture } from "../adapters/fixtures/scenarioFactory";
import type { InterventionCandidate, InterventionEvaluation } from "../domain/contracts";
import {
  createRestCandidate,
  createRestTransferCandidate,
  createSafeDelayCandidate,
  createSaferRouteCandidate,
  createTransferCandidate,
  evaluateIntervention,
  recommendIntervention,
} from "../domain/interventions";
import {
  ScenarioPlanningInputSchema,
  ScenarioPlanningResultSchema,
  type ScenarioPlanningInput,
  type ScenarioPlanningResult,
} from "../domain/scenario-planning";
import { evaluateSafetyBudget } from "../domain/safety";

export const scenarioPlanningPresets = {
  RAIN_HILL: {
    schemaVersion: "scenario-planning-input-v1",
    preset: "RAIN_HILL",
    remainingStopCount: 24,
    shiftElapsedHours: 8.5,
    continuousWorkHours: 3.1,
    currentSafetyBudget: 55,
    recipientSafetyBudget: 72,
    rainfallMmPerHour: 9,
    feelsLikeCelsius: 27,
    visibilityMeters: 2_500,
    uphillGradePct: 12,
    narrowRoadFactor: 0.82,
    parkingDifficultyFactor: 0.78,
    stairStopRatio: 0.58,
    areaFamiliarity: "FAMILIAR",
  },
  HEAT_STAIRS: {
    schemaVersion: "scenario-planning-input-v1",
    preset: "HEAT_STAIRS",
    remainingStopCount: 18,
    shiftElapsedHours: 7.5,
    continuousWorkHours: 2.8,
    currentSafetyBudget: 49,
    recipientSafetyBudget: 76,
    rainfallMmPerHour: 0,
    feelsLikeCelsius: 38,
    visibilityMeters: 12_000,
    uphillGradePct: 6,
    narrowRoadFactor: 0.52,
    parkingDifficultyFactor: 0.64,
    stairStopRatio: 0.82,
    areaFamiliarity: "PARTIAL",
  },
  NIGHT_UNFAMILIAR: {
    schemaVersion: "scenario-planning-input-v1",
    preset: "NIGHT_UNFAMILIAR",
    remainingStopCount: 14,
    shiftElapsedHours: 6.2,
    continuousWorkHours: 2.4,
    currentSafetyBudget: 48,
    recipientSafetyBudget: 74,
    rainfallMmPerHour: 0,
    feelsLikeCelsius: 18,
    visibilityMeters: 1_800,
    uphillGradePct: 5,
    narrowRoadFactor: 0.9,
    parkingDifficultyFactor: 0.86,
    stairStopRatio: 0.28,
    areaFamiliarity: "UNFAMILIAR",
  },
} as const satisfies Record<string, ScenarioPlanningInput>;

export const defaultScenarioPlanningInput: ScenarioPlanningInput =
  scenarioPlanningPresets.RAIN_HILL;

const stableStringify = (value: Record<string, unknown>) =>
  JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function actionLabel(action: InterventionCandidate["actions"][number]) {
  switch (action.type) {
    case "REST":
      return `${action.restMinutes}분 휴식`;
    case "TRANSFER_STOPS":
      return `배송 ${action.stopIds.length}건 분담`;
    case "REORDER_STOPS":
      return "배송순서 변경";
    case "SAFER_ROUTE":
      return "안전경로 전환";
    case "SAFE_DELAY":
      return `Safe Delay ${action.stopIds.length}건`;
  }
}

function projectAlternative(
  evaluation: InterventionEvaluation,
  candidate: InterventionCandidate,
  recommendedCandidateId: string | null,
) {
  const source = evaluation.courierImpacts.find((impact) => impact.role === "SOURCE");
  const recipient = evaluation.courierImpacts.find((impact) => impact.role === "RECIPIENT");
  if (!source) throw new Error(`Candidate ${evaluation.candidateId} has no source impact`);
  return {
    candidateId: evaluation.candidateId,
    label: candidate.actions.map(actionLabel).join(" + "),
    actionKinds: candidate.actions.map((action) => action.type),
    feasibility: evaluation.feasibility.status,
    candidateMinimumBudget: source.candidateMinimumBudget,
    safetyGain: evaluation.safetyGain,
    etaDeltaMinutes: evaluation.etaDeltaMinutes,
    recipientMinimumBudget: recipient?.candidateMinimumBudget,
    reasonCodes: evaluation.reasons.map((reason) => reason.code),
    recommended: evaluation.candidateId === recommendedCandidateId,
  };
}

function scenarioKind(input: ScenarioPlanningInput) {
  if (input.preset === "RAIN_HILL") return "RAINY_HILLY_LONG_SHIFT" as const;
  if (input.preset === "HEAT_STAIRS") return "HEAT_HEAVY_STAIRS" as const;
  if (input.preset === "NIGHT_UNFAMILIAR") return "NOVICE_NIGHT_UNFAMILIAR" as const;
  return "DAILY_MULTI_COURIER_OPERATIONS" as const;
}

export function createScenarioPlanningResult(
  rawInput: ScenarioPlanningInput,
  options: { evaluatedAt?: string } = {},
): ScenarioPlanningResult {
  const input = ScenarioPlanningInputSchema.parse(rawInput);
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const scenarioId = `scenario-user-${fnv1a(stableStringify(input))}`;
  const enteredProvenance = {
    kind: "USER_ENTERED" as const,
    sourceId: `${scenarioId}-inputs`,
    sourceLabel: "사용자 입력 운영상황",
    collectedAt: evaluatedAt,
    validAt: evaluatedAt,
    transformedBy: "scenarioPlanning@1.0.0",
    licenseOrPolicy: "Session-only operational simulation input; no personal data",
    isDemo: true,
  };
  const fixture = createScenarioFixture({
    fixtureId: scenarioId,
    evaluatedAt,
    title: "사용자 입력 운영상황",
    scenario: scenarioKind(input),
    description: "사용자 입력 운영조건과 결정론적 합성 기준계획을 결합한 실행 전 시뮬레이션",
    stopCount: input.remainingStopCount,
    shiftStartedHoursAgo: input.shiftElapsedHours,
    continuousWorkHoursAgo: input.continuousWorkHours,
    areaFamiliarity: input.areaFamiliarity,
    rainfall: input.rainfallMmPerHour,
    feelsLike: input.feelsLikeCelsius,
    visibility: input.visibilityMeters,
    roadSurface: input.rainfallMmPerHour > 0 ? "WET" : "DRY",
    uphillGrade: input.uphillGradePct,
    narrowRoadFactor: input.narrowRoadFactor,
    parkingDifficultyFactor: input.parkingDifficultyFactor,
    incidentFactor: Math.min(1, (input.narrowRoadFactor + input.parkingDifficultyFactor) / 2),
    stairStopRatio: input.stairStopRatio,
    stairStopsAtEnd: input.preset === "HEAT_STAIRS",
    initialSourceBudget: input.currentSafetyBudget,
    initialRecipientBudget: input.recipientSafetyBudget,
    expectedAssertions: {
      breachStatus: "INSUFFICIENT_DATA",
      feasibleCandidateKinds: [],
      infeasibleReasonCodes: [],
      recommendedActionKinds: [],
    },
    inputProvenance: enteredProvenance,
  });
  const sourceCourierId = fixture.couriers[0].courierId;
  const recipientCourierId = fixture.couriers[1].courierId;
  const baseline = evaluateSafetyBudget(fixture, sourceCourierId);
  fixture.expectedAssertions = {
    currentBudgetRange: { min: baseline.currentBudget, max: baseline.currentBudget },
    breachStatus: baseline.breach.status,
    ...(baseline.breach.status === "PREDICTED"
      ? {
          timeToBreachMinutesRange: {
            min: baseline.breach.timeToBreachMinutes,
            max: baseline.breach.timeToBreachMinutes,
          },
          breachStopId: baseline.breach.stopId,
        }
      : {}),
    feasibleCandidateKinds: [],
    infeasibleReasonCodes: [],
    recommendedActionKinds: [],
  };
  const decisionId = `decision-${scenarioId}`;
  const candidates: InterventionCandidate[] = [10, 15, 20, 30].map((minutes) =>
    createRestCandidate(fixture, decisionId, sourceCourierId, minutes as 10 | 15 | 20 | 30),
  );
  const transferCounts = [4, 8, 12].filter((count) => count <= fixture.stops.length);
  for (const count of transferCounts) {
    candidates.push(
      createTransferCandidate(fixture, decisionId, {
        sourceCourierId,
        recipientCourierId,
        stopIds: fixture.stops.slice(-count).map((stop) => stop.stopId),
      }),
    );
  }
  const bundleCount = fixture.stops.length >= 8 ? 8 : 4;
  candidates.push(
    createRestTransferCandidate(fixture, decisionId, 10, {
      sourceCourierId,
      recipientCourierId,
      stopIds: fixture.stops.slice(-bundleCount).map((stop) => stop.stopId),
    }),
  );
  const saferRoute = fixture.interventionInputs?.saferRouteAlternatives[0];
  if (saferRoute) {
    candidates.push(
      createSaferRouteCandidate(
        fixture,
        decisionId,
        sourceCourierId,
        saferRoute.replacementRouteId,
        saferRoute.replacedSegmentIds,
      ),
    );
  }
  const safeDelay = fixture.interventionInputs?.safeDelayPolicies[0];
  const delayStops = safeDelay?.delayableStopIds.slice(-4) ?? [];
  if (delayStops.length > 0) {
    candidates.push(
      createSafeDelayCandidate(
        fixture,
        decisionId,
        sourceCourierId,
        delayStops,
        new Date(Date.parse(evaluatedAt) + 30 * 60_000).toISOString(),
      ),
    );
  }
  const recommendation = recommendIntervention(
    candidates.map((candidate) => evaluateIntervention(fixture, candidate)),
  );
  const recommendedCandidateId = recommendation.status === "RECOMMENDED"
    ? recommendation.recommendation.candidateId
    : null;
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const contributions = [...baseline.contributions]
    .sort(
      (left, right) =>
        right.budgetPointsConsumed - left.budgetPointsConsumed ||
        left.category.localeCompare(right.category),
    )
    .slice(0, 5)
    .map((item) => ({
      category: item.category,
      consumed: item.budgetPointsConsumed,
      recovered: item.budgetPointsRecovered,
    }));

  return ScenarioPlanningResultSchema.parse({
    schemaVersion: "scenario-planning-result-v1",
    scenarioId,
    dataMode: "USER_ENTERED_SIMULATION",
    evaluatedAt,
    baseline: {
      currentBudget: baseline.currentBudget,
      minimumForecastBudget: baseline.minimumForecastBudget ?? baseline.currentBudget,
      currentBand: baseline.currentBand,
      breachStatus: baseline.breach.status,
      timeToBreachMinutes:
        baseline.breach.status === "PREDICTED" ? baseline.breach.timeToBreachMinutes : null,
      breachStopOrdinal:
        baseline.breach.status === "PREDICTED" ? baseline.breach.stopIndex + 1 : null,
      confidenceScore: baseline.confidenceScore,
      confidence: baseline.confidence,
      contributions,
    },
    alternatives: recommendation.evaluations.map((evaluation) => {
      const candidate = candidatesById.get(evaluation.candidateId);
      if (!candidate) throw new Error(`Missing candidate ${evaluation.candidateId}`);
      return projectAlternative(evaluation, candidate, recommendedCandidateId);
    }),
    recommendationStatus: recommendation.status,
    recommendedCandidateId,
    sources: {
      safetyInputs: ["USER_ENTERED", "DETERMINISTIC_SYNTHETIC_REFERENCE"],
      publicWeatherEvidence: "PARTIAL_CONTEXT_ONLY",
      publicWeatherEvidenceCapturedAt: "2026-07-17T13:06:28.598Z",
      publicWeatherReadyFieldCount: 8,
      publicWeatherBlockingFieldCount: 2,
      publicWeatherUsedForSafety: false,
      mapUsedForSafety: false,
      aiUsedForNumericPrediction: false,
      actualTmsConnected: false,
      actualCourierConnected: false,
      actualPersonalDataIncluded: false,
      networkWritePerformed: false,
    },
  });
}
