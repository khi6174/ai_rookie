import { describe, expect, it } from "vitest";
import {
  heatHeavyStairsFixture,
  noviceNightUnfamiliarFixture,
  rainyHillyLongShiftFixture,
  scenarioFixtures,
} from "../src/adapters/fixtures";
import {
  SafetyBudgetSnapshotSchema,
  type SafetyBudgetSnapshot,
  type ScenarioFixture,
} from "../src/domain/contracts";
import {
  clamp,
  evaluateSafetyBudget,
  recoveryForRest,
  safetyModelConfig,
} from "../src/domain/safety";

const sourceCourier = (fixture: ScenarioFixture) => fixture.couriers[0].courierId;

function withInitialBudget(fixture: ScenarioFixture, currentBudget: number) {
  const clone = structuredClone(fixture);
  const initialState = clone.initialSafetyStates?.find(
    (state) => state.courierId === sourceCourier(clone),
  );
  if (!initialState) throw new Error("Representative fixture needs an initial state");
  initialState.currentBudget = currentBudget;
  return clone;
}

function predictedBreach(snapshot: SafetyBudgetSnapshot) {
  expect(snapshot.breach.status).toBe("PREDICTED");
  if (snapshot.breach.status !== "PREDICTED") {
    throw new Error("Expected a predicted breach");
  }
  return snapshot.breach;
}

function minimumBudget(snapshot: SafetyBudgetSnapshot) {
  if (snapshot.minimumForecastBudget === undefined) {
    throw new Error("Safety evaluation must return a minimum forecast budget");
  }
  return snapshot.minimumForecastBudget;
}

const exactScenarioResults = {
  "scenario-rain-hill-longshift-v1": {
    currentBudget: 54.7,
    minimumForecastBudget: 29.914456,
    timeToBreachMinutes: 52,
    stopId: "scenario-rain-hill-longshift-v1-stop-017",
    confidenceScore: 60,
  },
  "scenario-heat-heavy-stairs-v1": {
    currentBudget: 41.95,
    minimumForecastBudget: 29.9278,
    timeToBreachMinutes: 30,
    stopId: "scenario-heat-heavy-stairs-v1-stop-010",
    confidenceScore: 65,
  },
  "scenario-night-novice-area-v1": {
    currentBudget: 36.68,
    minimumForecastBudget: 29.930294,
    timeToBreachMinutes: 24,
    stopId: "scenario-night-novice-area-v1-stop-008",
    confidenceScore: 65,
  },
} as const;

describe("Safety Budget representative scenario regression", () => {
  it("locks contract-valid exact results for all three fixtures", () => {
    for (const fixture of scenarioFixtures) {
      const snapshot = evaluateSafetyBudget(fixture, sourceCourier(fixture));
      expect(SafetyBudgetSnapshotSchema.safeParse(snapshot).success).toBe(true);
      const expected =
        exactScenarioResults[
          fixture.fixtureId as keyof typeof exactScenarioResults
        ];
      const breach = predictedBreach(snapshot);

      expect({
        currentBudget: snapshot.currentBudget,
        minimumForecastBudget: snapshot.minimumForecastBudget,
        timeToBreachMinutes: breach.timeToBreachMinutes,
        stopId: breach.stopId,
        confidenceScore: snapshot.confidenceScore,
      }).toEqual(expected);
    }
  });

  it("satisfies each fixture's documented breach assertions", () => {
    for (const fixture of scenarioFixtures) {
      const snapshot = evaluateSafetyBudget(fixture, sourceCourier(fixture));
      const expected = fixture.expectedAssertions;
      expect(snapshot.breach.status).toBe(expected.breachStatus);

      if (expected.currentBudgetRange) {
        expect(snapshot.currentBudget).toBeGreaterThanOrEqual(
          expected.currentBudgetRange.min,
        );
        expect(snapshot.currentBudget).toBeLessThanOrEqual(
          expected.currentBudgetRange.max,
        );
      }
      if (expected.timeToBreachMinutesRange) {
        const breach = predictedBreach(snapshot);
        expect(breach.timeToBreachMinutes).toBeGreaterThanOrEqual(
          expected.timeToBreachMinutesRange.min,
        );
        expect(breach.timeToBreachMinutes).toBeLessThanOrEqual(
          expected.timeToBreachMinutesRange.max,
        );
        expect(breach.stopId).toBe(expected.breachStopId);
      }
    }
  });

  it("uses the approved model and configuration versions", () => {
    const snapshot = evaluateSafetyBudget(
      rainyHillyLongShiftFixture,
      sourceCourier(rainyHillyLongShiftFixture),
    );
    expect(snapshot.versionContext.safetyModelVersion).toBe(
      safetyModelConfig.metadata.modelVersion,
    );
    expect(snapshot.versionContext.safetyConfigVersion).toBe(
      safetyModelConfig.metadata.configVersion,
    );
    expect(safetyModelConfig.metadata.status).toBe("approved");
  });
});

describe("budget and Time-to-Breach boundaries", () => {
  it("clips values at configured numeric bounds", () => {
    expect(clamp(-1, 0, 100)).toBe(0);
    expect(clamp(30, 0, 100)).toBe(30);
    expect(clamp(101, 0, 100)).toBe(100);
  });

  it("distinguishes an existing breach from an exact-threshold start", () => {
    const alreadyBreached = evaluateSafetyBudget(
      withInitialBudget(rainyHillyLongShiftFixture, 29.99),
      sourceCourier(rainyHillyLongShiftFixture),
    );
    const exactThreshold = evaluateSafetyBudget(
      withInitialBudget(rainyHillyLongShiftFixture, 30),
      sourceCourier(rainyHillyLongShiftFixture),
    );
    expect(alreadyBreached.breach.status).toBe("ALREADY_BREACHED");
    expect(exactThreshold.breach.status).toBe("PREDICTED");
  });

  it("returns no breach when the whole route stays above the threshold", () => {
    const fixture = withInitialBudget(rainyHillyLongShiftFixture, 100);
    const snapshot = evaluateSafetyBudget(fixture, sourceCourier(fixture));
    expect(snapshot.breach.status).toBe("NO_BREACH_IN_HORIZON");
    expect(minimumBudget(snapshot)).toBe(75.214456);
  });

  it("interpolates a first crossing inside a travel interval", () => {
    const fixture = withInitialBudget(rainyHillyLongShiftFixture, 30.1);
    const breach = predictedBreach(
      evaluateSafetyBudget(fixture, sourceCourier(fixture)),
    );
    expect(breach.timeToBreachMinutes).toBeGreaterThan(0);
    expect(breach.timeToBreachMinutes).toBeLessThan(2);
    expect(breach.segmentId).toBe("scenario-rain-hill-longshift-v1-segment-001");
  });

  it("never emits a forecast interval longer than five minutes", () => {
    const fixture = withInitialBudget(rainyHillyLongShiftFixture, 100);
    const snapshot = evaluateSafetyBudget(fixture, sourceCourier(fixture));
    for (let index = 1; index < snapshot.forecast.length; index += 1) {
      const interval =
        (Date.parse(snapshot.forecast[index].at) -
          Date.parse(snapshot.forecast[index - 1].at)) /
        60_000;
      expect(interval).toBeLessThanOrEqual(
        safetyModelConfig.forecast.intervalMinutes,
      );
    }
    expect(safetyModelConfig.forecast.horizonMinutes).toBe(120);
  });
});

describe("recovery and contribution accounting", () => {
  it("matches approved high-quality rest values", () => {
    expect(recoveryForRest(5, "HIGH")).toBe(0);
    expect(recoveryForRest(10, "HIGH")).toBe(4.5);
    expect(recoveryForRest(15, "HIGH")).toBe(9);
    expect(recoveryForRest(30, "HIGH")).toBe(22.5);
  });

  it("does not reduce the minimum budget when rest increases", () => {
    const courierId = sourceCourier(heatHeavyStairsFixture);
    const tenMinutes = evaluateSafetyBudget(heatHeavyStairsFixture, courierId, {
      initialRest: { durationMinutes: 10, quality: "HIGH" },
    });
    const fifteenMinutes = evaluateSafetyBudget(heatHeavyStairsFixture, courierId, {
      initialRest: { durationMinutes: 15, quality: "HIGH" },
    });
    expect(minimumBudget(fifteenMinutes)).toBeGreaterThanOrEqual(
      minimumBudget(tenMinutes),
    );
  });

  it("accounts for deterministic exposure within storage precision", () => {
    const fixture = withInitialBudget(rainyHillyLongShiftFixture, 100);
    const snapshot = evaluateSafetyBudget(fixture, sourceCourier(fixture));
    const consumed = snapshot.contributions.reduce(
      (total, contribution) => total + contribution.budgetPointsConsumed,
      0,
    );
    const recovered = snapshot.contributions.reduce(
      (total, contribution) => total + contribution.budgetPointsRecovered,
      0,
    );
    expect(consumed - recovered).toBeCloseTo(
      snapshot.currentBudget - minimumBudget(snapshot),
      5,
    );
  });
});

describe("monotonic exposure", () => {
  const minimumAfterFullRoute = (fixture: ScenarioFixture) => {
    const highBudgetFixture = withInitialBudget(fixture, 100);
    return minimumBudget(
      evaluateSafetyBudget(highBudgetFixture, sourceCourier(highBudgetFixture)),
    );
  };

  it("does not improve the forecast when continuous work increases", () => {
    const increased = structuredClone(rainyHillyLongShiftFixture);
    increased.couriers[0].continuousWorkStartedAt = "2026-07-13T19:48:00.000Z";
    expect(minimumAfterFullRoute(increased)).toBeLessThanOrEqual(
      minimumAfterFullRoute(rainyHillyLongShiftFixture),
    );
  });

  it("does not improve the forecast when shift duration increases", () => {
    const increased = structuredClone(rainyHillyLongShiftFixture);
    increased.couriers[0].shiftStartedAt = "2026-07-13T12:00:00.000Z";
    expect(minimumAfterFullRoute(increased)).toBeLessThanOrEqual(
      minimumAfterFullRoute(rainyHillyLongShiftFixture),
    );
  });

  it("does not improve the forecast when remaining load increases", () => {
    const increased = structuredClone(heatHeavyStairsFixture);
    increased.workloads[0].remainingLoad.totalWeightKg = 250;
    expect(minimumAfterFullRoute(increased)).toBeLessThanOrEqual(
      minimumAfterFullRoute(heatHeavyStairsFixture),
    );
  });

  it("does not improve the forecast when rainfall increases", () => {
    const increased = structuredClone(rainyHillyLongShiftFixture);
    for (const weather of increased.weatherTimeline) {
      weather.rainfallMmPerHour = Math.min(20, weather.rainfallMmPerHour + 5);
    }
    expect(minimumAfterFullRoute(increased)).toBeLessThanOrEqual(
      minimumAfterFullRoute(rainyHillyLongShiftFixture),
    );
  });

  it("does not improve the forecast when route slope increases", () => {
    const increased = structuredClone(rainyHillyLongShiftFixture);
    for (const segment of increased.routeSegments) segment.uphillGradePct = 12;
    expect(minimumAfterFullRoute(increased)).toBeLessThanOrEqual(
      minimumAfterFullRoute(rainyHillyLongShiftFixture),
    );
  });

  it("does not improve the novice night forecast when familiarity worsens", () => {
    const familiar = structuredClone(noviceNightUnfamiliarFixture);
    familiar.couriers[0].areaFamiliarity = "FAMILIAR";
    expect(minimumAfterFullRoute(noviceNightUnfamiliarFixture)).toBeLessThanOrEqual(
      minimumAfterFullRoute(familiar),
    );
  });
});

describe("confidence and optional inputs", () => {
  it("does not penalize confidence when an optional signal is absent", () => {
    const withoutOptionalSignal = structuredClone(rainyHillyLongShiftFixture);
    delete withoutOptionalSignal.couriers[0].optionalDerivedSignals;
    const baseline = evaluateSafetyBudget(
      rainyHillyLongShiftFixture,
      sourceCourier(rainyHillyLongShiftFixture),
    );
    const withoutOptional = evaluateSafetyBudget(
      withoutOptionalSignal,
      sourceCourier(withoutOptionalSignal),
    );
    expect(withoutOptional.confidenceScore).toBe(baseline.confidenceScore);
  });

  it("applies the documented confidence penalty to a direct demo budget", () => {
    const withDirectBudget = evaluateSafetyBudget(
      rainyHillyLongShiftFixture,
      sourceCourier(rainyHillyLongShiftFixture),
    );
    const derivedFromDefault = structuredClone(rainyHillyLongShiftFixture);
    derivedFromDefault.initialSafetyStates = derivedFromDefault.initialSafetyStates?.filter(
      (state) => state.courierId !== sourceCourier(derivedFromDefault),
    );
    const withoutDirectBudget = evaluateSafetyBudget(
      derivedFromDefault,
      sourceCourier(derivedFromDefault),
    );
    expect(withDirectBudget.missingInputs).toContainEqual(
      expect.objectContaining({ field: "shiftHistory", confidencePenalty: 10 }),
    );
    expect(withDirectBudget.confidenceScore).toBeLessThan(
      withoutDirectBudget.confidenceScore,
    );
  });
});
