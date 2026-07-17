import { describe, expect, it } from "vitest";
import {
  heatHeavyStairsFixture,
  noviceNightUnfamiliarFixture,
  rainyHillyLongShiftFixture,
} from "../src/adapters/fixtures";
import {
  InterventionCandidateSchema,
  InterventionEvaluationSchema,
  type ScenarioFixture,
} from "../src/domain/contracts";
import {
  createRestReorderCandidate,
  createRestSafeDelayCandidate,
  createRestSaferRouteCandidate,
  createRestTransferCandidate,
  createSaferRouteSafeDelayCandidate,
  createTransferReorderCandidate,
  evaluateIntervention,
} from "../src/domain/interventions";

const decisionId = "decision-compatible-bundles-v1";

const addMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

function reorderedRemaining(fixture: ScenarioFixture, remainingStopIds: string[]) {
  const policy = fixture.interventionInputs?.reorderPolicies[0];
  if (!policy) throw new Error("Expected a reorder policy");
  const movableStairs = fixture.stops
    .filter(
      (stop) =>
        remainingStopIds.includes(stop.stopId) &&
        stop.access.elevator === "UNAVAILABLE" &&
        policy.reorderableStopIds.includes(stop.stopId),
    )
    .map((stop) => stop.stopId);
  const reordered = [
    ...movableStairs,
    ...remainingStopIds.filter((stopId) => !movableStairs.includes(stopId)),
  ];
  for (const fixedStopId of policy.fixedStopIds.filter((stopId) =>
    remainingStopIds.includes(stopId),
  )) {
    const targetIndex = remainingStopIds.indexOf(fixedStopId);
    reordered.splice(reordered.indexOf(fixedStopId), 1);
    reordered.splice(targetIndex, 0, fixedStopId);
  }
  return reordered;
}

function routeAlternative(fixture: ScenarioFixture) {
  const alternative = fixture.interventionInputs?.saferRouteAlternatives[0];
  if (!alternative) throw new Error("Expected a safer route alternative");
  return alternative;
}

function delayStops(fixture: ScenarioFixture) {
  const policy = fixture.interventionInputs?.safeDelayPolicies[0];
  if (!policy) throw new Error("Expected a Safe Delay policy");
  return policy.delayableStopIds.slice(0, 3);
}

function rainyTransferCluster() {
  return rainyHillyLongShiftFixture.stops.slice(-8).map((stop) => stop.stopId);
}

function compatibleCandidates() {
  const nightCourierId = noviceNightUnfamiliarFixture.couriers[0].courierId;
  const nightOrder = reorderedRemaining(
    noviceNightUnfamiliarFixture,
    noviceNightUnfamiliarFixture.workloads[0].remainingStopIds,
  );
  const nightRoute = routeAlternative(noviceNightUnfamiliarFixture);
  const heatCourierId = heatHeavyStairsFixture.couriers[0].courierId;
  const heatRoute = routeAlternative(heatHeavyStairsFixture);
  const heatDelayedStops = delayStops(heatHeavyStairsFixture);
  const sourceCourierId = rainyHillyLongShiftFixture.couriers[0].courierId;
  const recipientCourierId = rainyHillyLongShiftFixture.couriers[1].courierId;
  const transferredStopIds = rainyTransferCluster();
  const postTransferStopIds = rainyHillyLongShiftFixture.workloads[0].remainingStopIds.filter(
    (stopId) => !transferredStopIds.includes(stopId),
  );

  return [
    {
      name: "REST+TRANSFER_STOPS",
      fixture: rainyHillyLongShiftFixture,
      candidate: createRestTransferCandidate(
        rainyHillyLongShiftFixture,
        decisionId,
        10,
        { sourceCourierId, recipientCourierId, stopIds: transferredStopIds },
      ),
      expected: {
        safetyGain: 17.271961,
        sourceMinimum: 47.186417,
        etaDeltaMinutes: -15,
        maxCustomerEtaDeltaMinutes: 10,
        operationalComplexity: 65,
        recommendationScore: 10.09348,
      },
    },
    {
      name: "REST+REORDER_STOPS",
      fixture: noviceNightUnfamiliarFixture,
      candidate: createRestReorderCandidate(
        noviceNightUnfamiliarFixture,
        decisionId,
        10,
        nightCourierId,
        nightOrder,
      ),
      expected: {
        safetyGain: 4.73215,
        sourceMinimum: 34.703044,
        etaDeltaMinutes: 10,
        maxCustomerEtaDeltaMinutes: 16,
        operationalComplexity: 35,
        recommendationScore: -8.113083,
      },
    },
    {
      name: "REST+SAFER_ROUTE",
      fixture: noviceNightUnfamiliarFixture,
      candidate: createRestSaferRouteCandidate(
        noviceNightUnfamiliarFixture,
        decisionId,
        10,
        nightCourierId,
        nightRoute.replacementRouteId,
        nightRoute.replacedSegmentIds,
      ),
      expected: {
        safetyGain: 4.92851,
        sourceMinimum: 34.899404,
        etaDeltaMinutes: 12,
        maxCustomerEtaDeltaMinutes: 12,
        operationalComplexity: 35,
        recommendationScore: -8.285817,
      },
    },
    {
      name: "TRANSFER_STOPS+REORDER_STOPS",
      fixture: rainyHillyLongShiftFixture,
      candidate: createTransferReorderCandidate(
        rainyHillyLongShiftFixture,
        decisionId,
        {
          sourceCourierId,
          recipientCourierId,
          stopIds: transferredStopIds,
          orderedStopIds: reorderedRemaining(
            rainyHillyLongShiftFixture,
            postTransferStopIds,
          ),
        },
      ),
      expected: {
        safetyGain: 11.903419,
        sourceMinimum: 41.817875,
        etaDeltaMinutes: -25,
        maxCustomerEtaDeltaMinutes: 0,
        operationalComplexity: 70,
        recommendationScore: -4.648207,
      },
    },
    {
      name: "REST+SAFE_DELAY",
      fixture: heatHeavyStairsFixture,
      candidate: createRestSafeDelayCandidate(
        heatHeavyStairsFixture,
        decisionId,
        10,
        heatCourierId,
        heatDelayedStops,
        "2026-07-14T04:45:00.000Z",
      ),
      expected: {
        safetyGain: 8.888967,
        sourceMinimum: 38.816767,
        etaDeltaMinutes: 10,
        maxCustomerEtaDeltaMinutes: 43,
        operationalComplexity: 40,
        recommendationScore: 5.314945,
      },
    },
    {
      name: "SAFER_ROUTE+SAFE_DELAY",
      fixture: heatHeavyStairsFixture,
      candidate: createSaferRouteSafeDelayCandidate(
        heatHeavyStairsFixture,
        decisionId,
        heatCourierId,
        heatRoute.replacementRouteId,
        heatRoute.replacedSegmentIds,
        heatDelayedStops,
        "2026-07-14T04:45:00.000Z",
      ),
      expected: {
        safetyGain: 3.88711,
        sourceMinimum: 33.81491,
        etaDeltaMinutes: 9.75,
        maxCustomerEtaDeltaMinutes: 43,
        operationalComplexity: 45,
        recommendationScore: -10.458983,
      },
    },
  ];
}

const reasonCodes = (evaluation: ReturnType<typeof evaluateIntervention>) =>
  evaluation.reasons.map((reason) => reason.code);

describe("compatible intervention bundle contract", () => {
  it("accepts exactly the six canonical two-action kinds", () => {
    const candidates = compatibleCandidates();
    expect(
      candidates.map(({ candidate }) =>
        candidate.actions.map((action) => action.type).join("+"),
      ),
    ).toEqual(candidates.map(({ name }) => name));
    for (const { candidate } of candidates) {
      expect(InterventionCandidateSchema.safeParse(candidate).success).toBe(true);
    }
  });

  it("rejects reverse order, an unapproved pair, and cross-courier subjects", () => {
    const [restTransfer, , , transferReorder] = compatibleCandidates();
    const reversed = structuredClone(restTransfer.candidate);
    reversed.actions.reverse();
    expect(InterventionCandidateSchema.safeParse(reversed).success).toBe(false);

    const unapproved = structuredClone(restTransfer.candidate);
    unapproved.actions[1] = {
      type: "SAFE_DELAY",
      courierId: rainyHillyLongShiftFixture.couriers[0].courierId,
      stopIds: delayStops(rainyHillyLongShiftFixture),
      delayedUntil: "2026-07-14T00:45:00.000Z",
    };
    expect(InterventionCandidateSchema.safeParse(unapproved).success).toBe(false);

    const crossCourier = structuredClone(transferReorder.candidate);
    const reorder = crossCourier.actions.find(
      (action) => action.type === "REORDER_STOPS",
    );
    if (!reorder || reorder.type !== "REORDER_STOPS") {
      throw new Error("Expected reorder action");
    }
    reorder.courierId = rainyHillyLongShiftFixture.couriers[1].courierId;
    expect(InterventionCandidateSchema.safeParse(crossCourier).success).toBe(false);
  });
});

describe("sequential full-plan bundle evaluation", () => {
  it("materializes all six allowed bundles as valid deterministic evaluations", () => {
    const cases = compatibleCandidates();
    const before = cases.map(({ fixture }) => structuredClone(fixture));
    const results = cases.map(({ fixture, candidate, expected }) => ({
      candidate,
      expected,
      evaluation: evaluateIntervention(fixture, candidate),
    }));
    for (const { candidate, expected, evaluation } of results) {
      expect(InterventionEvaluationSchema.safeParse(evaluation).success).toBe(true);
      expect(evaluation.feasibility.status).toBe("FEASIBLE");
      expect(evaluation.breachOutcome).toBe("AVOIDED");
      expect(evaluation.versionContext.planVersion).toBe(
        `1.0.0+${candidate.candidateId}`,
      );
      expect({
        safetyGain: evaluation.safetyGain,
        sourceMinimum: evaluation.courierImpacts[0].candidateMinimumBudget,
        etaDeltaMinutes: evaluation.etaDeltaMinutes,
        maxCustomerEtaDeltaMinutes: evaluation.maxCustomerEtaDeltaMinutes,
        operationalComplexity: evaluation.operationalComplexity,
        recommendationScore: evaluation.recommendationScore,
      }).toEqual(expected);
    }
    expect(cases.map(({ fixture }) => fixture)).toEqual(before);
  });

  it("checks reorder against the post-transfer stop set", () => {
    const sourceCourierId = rainyHillyLongShiftFixture.couriers[0].courierId;
    const recipientCourierId = rainyHillyLongShiftFixture.couriers[1].courierId;
    const evaluation = evaluateIntervention(
      rainyHillyLongShiftFixture,
      createTransferReorderCandidate(
        rainyHillyLongShiftFixture,
        decisionId,
        {
          sourceCourierId,
          recipientCourierId,
          stopIds: rainyTransferCluster(),
          orderedStopIds: rainyHillyLongShiftFixture.workloads[0].remainingStopIds,
        },
      ),
    );
    expect(evaluation.feasibility.status).toBe("INFEASIBLE");
    expect(reasonCodes(evaluation)).toContain("REORDER_STOP_SET_MISMATCH");
  });

  it("checks Safe Delay against route-adjusted ETA", () => {
    const fixture = heatHeavyStairsFixture;
    const courierId = fixture.couriers[0].courierId;
    const alternative = routeAlternative(fixture);
    const stopIds = delayStops(fixture);
    const latestBaselineArrival = fixture.stops
      .filter((stop) => stopIds.includes(stop.stopId))
      .map((stop) => stop.expectedArrivalAt)
      .sort()
      .at(-1);
    if (!latestBaselineArrival) throw new Error("Expected selected stop arrival");
    const evaluation = evaluateIntervention(
      fixture,
      createSaferRouteSafeDelayCandidate(
        fixture,
        decisionId,
        courierId,
        alternative.replacementRouteId,
        alternative.replacedSegmentIds,
        stopIds,
        addMinutes(latestBaselineArrival, 0.01),
      ),
    );
    expect(evaluation.feasibility.status).toBe("INFEASIBLE");
    expect(reasonCodes(evaluation)).toContain("SAFE_DELAY_MUST_MOVE_ETA_LATER");
  });

  it("returns NEEDS_DATA for the whole bundle when a later catalog is absent", () => {
    const fixture = structuredClone(heatHeavyStairsFixture);
    const courierId = fixture.couriers[0].courierId;
    const stopIds = delayStops(fixture);
    const candidate = createRestSafeDelayCandidate(
      fixture,
      decisionId,
      10,
      courierId,
      stopIds,
      "2026-07-14T04:45:00.000Z",
    );
    delete fixture.interventionInputs;
    const evaluation = evaluateIntervention(fixture, candidate);
    expect(evaluation.feasibility).toEqual({
      status: "NEEDS_DATA",
      blockingInputs: [`safeDelayPolicy:${courierId}`],
    });
    expect(evaluation.recommendationScore).toBeUndefined();
  });
});
