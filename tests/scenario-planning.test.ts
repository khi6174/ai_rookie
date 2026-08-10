import { describe, expect, it } from "vitest";
import {
  createScenarioPlanningResult,
  defaultScenarioPlanningInput,
  scenarioPlanningPresets,
} from "../src/application/scenarioPlanning";
import {
  ScenarioPlanningInputSchema,
  ScenarioPlanningResultSchema,
} from "../src/domain/scenario-planning";

const evaluatedAt = "2026-08-10T08:00:00.000Z";

describe("scenario-driven planning", () => {
  it("recalculates every approved preset through the strict result contract", () => {
    for (const input of Object.values(scenarioPlanningPresets)) {
      const result = createScenarioPlanningResult(input, { evaluatedAt });
      expect(ScenarioPlanningResultSchema.safeParse(result).success).toBe(true);
      expect(result.alternatives.length).toBeGreaterThanOrEqual(7);
      expect(result.sources).toEqual(
        expect.objectContaining({
          safetyInputs: ["USER_ENTERED", "DETERMINISTIC_SYNTHETIC_REFERENCE"],
          publicWeatherUsedForSafety: false,
          mapUsedForSafety: false,
          aiUsedForNumericPrediction: false,
          actualTmsConnected: false,
          actualCourierConnected: false,
          actualPersonalDataIncluded: false,
          networkWritePerformed: false,
        }),
      );
    }
  });

  it("keeps identity and numeric outputs deterministic for the same inputs", () => {
    const first = createScenarioPlanningResult(defaultScenarioPlanningInput, {
      evaluatedAt,
    });
    const second = createScenarioPlanningResult(defaultScenarioPlanningInput, {
      evaluatedAt: "2026-08-10T09:00:00.000Z",
    });
    expect(second.scenarioId).toBe(first.scenarioId);
    expect(second.baseline.currentBudget).toBe(first.baseline.currentBudget);
    expect(second.baseline.minimumForecastBudget).toBe(
      first.baseline.minimumForecastBudget,
    );
    expect(second.alternatives.map((item) => ({
      label: item.label,
      feasibility: item.feasibility,
      minimum: item.candidateMinimumBudget,
    }))).toEqual(first.alternatives.map((item) => ({
      label: item.label,
      feasibility: item.feasibility,
      minimum: item.candidateMinimumBudget,
    })));
  });

  it("does not improve the forecast when rain or remaining work increases", () => {
    const baseline = createScenarioPlanningResult(defaultScenarioPlanningInput, {
      evaluatedAt,
    });
    const wetter = createScenarioPlanningResult(
      { ...defaultScenarioPlanningInput, preset: "CUSTOM", rainfallMmPerHour: 16 },
      { evaluatedAt },
    );
    const moreWork = createScenarioPlanningResult(
      { ...defaultScenarioPlanningInput, preset: "CUSTOM", remainingStopCount: 36 },
      { evaluatedAt },
    );
    expect(wetter.baseline.minimumForecastBudget).toBeLessThanOrEqual(
      baseline.baseline.minimumForecastBudget,
    );
    expect(moreWork.baseline.minimumForecastBudget).toBeLessThanOrEqual(
      baseline.baseline.minimumForecastBudget,
    );
  });

  it("blocks transfer when the receiving courier would inherit unsafe risk", () => {
    const result = createScenarioPlanningResult(
      {
        ...defaultScenarioPlanningInput,
        preset: "CUSTOM",
        recipientSafetyBudget: 45,
      },
      { evaluatedAt },
    );
    const blockedTransfer = result.alternatives.find(
      (item) =>
        item.actionKinds.includes("TRANSFER_STOPS") &&
        item.feasibility === "INFEASIBLE",
    );
    expect(blockedTransfer).toBeDefined();
    expect(blockedTransfer?.reasonCodes).toContain(
      "TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR",
    );
  });

  it("rejects impossible work duration and unapproved fields", () => {
    expect(
      ScenarioPlanningInputSchema.safeParse({
        ...defaultScenarioPlanningInput,
        shiftElapsedHours: 2,
        continuousWorkHours: 3,
      }).success,
    ).toBe(false);
    expect(
      ScenarioPlanningInputSchema.safeParse({
        ...defaultScenarioPlanningInput,
        courierName: "실제 이름 금지",
      }).success,
    ).toBe(false);
  });
});
