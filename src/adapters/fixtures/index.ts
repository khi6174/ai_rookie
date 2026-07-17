import { ScenarioFixtureSchema } from "../../domain/contracts";
import { createScenarioFixture } from "./scenarioFactory";

export const rainyHillyLongShiftFixture = createScenarioFixture({
  fixtureId: "scenario-rain-hill-longshift-v1",
  evaluatedAt: "2026-07-14T00:00:00.000Z",
  title: "우천·경사 빌라·장시간 작업",
  scenario: "RAINY_HILLY_LONG_SHIFT",
  description:
    "관악구를 모사한 합성 권역에서 누적 9.4시간 근무와 강수 증가가 겹치는 대표 시나리오",
  stopCount: 17,
  shiftStartedHoursAgo: 9.4,
  continuousWorkHoursAgo: 3.2,
  areaFamiliarity: "FAMILIAR",
  rainfall: 8.5,
  feelsLike: 27,
  visibility: 2_500,
  roadSurface: "WET",
  uphillGrade: 11,
  narrowRoadFactor: 0.82,
  parkingDifficultyFactor: 0.78,
  incidentFactor: 0.64,
  stairStopRatio: 0.65,
  finalServiceMinutes: 2,
  initialSourceBudget: 54.7,
  initialRecipientBudget: 52.5,
  expectedAssertions: {
    currentBudgetRange: { min: 45, max: 60 },
    breachStatus: "PREDICTED",
    timeToBreachMinutesRange: { min: 50, max: 54 },
    breachStopId: "scenario-rain-hill-longshift-v1-stop-017",
    feasibleCandidateKinds: ["REST", "TRANSFER_STOPS", "REORDER_STOPS", "SAFER_ROUTE"],
    infeasibleReasonCodes: ["RECIPIENT_BUDGET_BELOW_SUPPORT_THRESHOLD"],
    recommendedActionKinds: ["REST", "TRANSFER_STOPS"],
  },
});

export const heatHeavyStairsFixture = createScenarioFixture({
  fixtureId: "scenario-heat-heavy-stairs-v1",
  evaluatedAt: "2026-07-14T04:00:00.000Z",
  title: "폭염·중량물·계단 배송",
  scenario: "HEAT_HEAVY_STAIRS",
  description: "높은 체감온도와 중량·계단 작업이 집중된 회복 검증 시나리오",
  stopCount: 10,
  shiftStartedHoursAgo: 7.8,
  continuousWorkHoursAgo: 2.8,
  areaFamiliarity: "PARTIAL",
  rainfall: 0,
  feelsLike: 38,
  visibility: 12_000,
  roadSurface: "DRY",
  uphillGrade: 6,
  narrowRoadFactor: 0.52,
  parkingDifficultyFactor: 0.61,
  incidentFactor: 0.48,
  stairStopRatio: 0.8,
  initialSourceBudget: 41.95,
  initialRecipientBudget: 75,
  expectedAssertions: {
    currentBudgetRange: { min: 40, max: 45 },
    breachStatus: "PREDICTED",
    timeToBreachMinutesRange: { min: 29, max: 31 },
    breachStopId: "scenario-heat-heavy-stairs-v1-stop-010",
    feasibleCandidateKinds: ["REST", "SAFE_DELAY"],
    infeasibleReasonCodes: ["BREACH_REMAINS_PREDICTED"],
    recommendedActionKinds: ["REST"],
  },
});

export const noviceNightUnfamiliarFixture = createScenarioFixture({
  fixtureId: "scenario-night-novice-area-v1",
  evaluatedAt: "2026-07-14T12:00:00.000Z",
  title: "초보 기사·낯선 권역·야간",
  scenario: "NOVICE_NIGHT_UNFAMILIAR",
  description: "낯선 권역의 야간 골목과 시간창이 겹치는 경로 호환성 검증 시나리오",
  stopCount: 8,
  shiftStartedHoursAgo: 5.2,
  continuousWorkHoursAgo: 2.1,
  areaFamiliarity: "UNFAMILIAR",
  rainfall: 0,
  feelsLike: 19,
  visibility: 1_800,
  roadSurface: "DRY",
  uphillGrade: 4,
  narrowRoadFactor: 0.9,
  parkingDifficultyFactor: 0.86,
  incidentFactor: 0.58,
  stairStopRatio: 0.25,
  stairStopsAtEnd: true,
  initialSourceBudget: 36.81,
  initialRecipientBudget: 72,
  expectedAssertions: {
    currentBudgetRange: { min: 35, max: 40 },
    breachStatus: "PREDICTED",
    timeToBreachMinutesRange: { min: 23, max: 25 },
    breachStopId: "scenario-night-novice-area-v1-stop-008",
    feasibleCandidateKinds: ["REORDER_STOPS", "SAFER_ROUTE"],
    infeasibleReasonCodes: ["AREA_INCOMPATIBLE"],
    recommendedActionKinds: ["REORDER_STOPS", "SAFER_ROUTE"],
  },
});

export const scenarioFixtures = [
  rainyHillyLongShiftFixture,
  heatHeavyStairsFixture,
  noviceNightUnfamiliarFixture,
] as const;

for (const fixture of scenarioFixtures) {
  ScenarioFixtureSchema.parse(fixture);
}
