import { describe, expect, it } from "vitest";
import {
  heatHeavyStairsFixture,
  noviceNightUnfamiliarFixture,
} from "../src/adapters/fixtures";
import {
  InterventionCandidateSchema,
  InterventionEvaluationSchema,
  ScenarioFixtureSchema,
  type ScenarioFixture,
} from "../src/domain/contracts";
import {
  createReorderCandidate,
  createSafeDelayCandidate,
  createSaferRouteCandidate,
  evaluateIntervention,
  rankInterventions,
} from "../src/domain/interventions";

const decisionId = "decision-remaining-actions-v1";

function nightReorderOrder(fixture: ScenarioFixture) {
  const policy = fixture.interventionInputs?.reorderPolicies[0];
  if (!policy) throw new Error("Expected a reorder policy");
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

function reorderCandidate(fixture = noviceNightUnfamiliarFixture) {
  return createReorderCandidate(
    fixture,
    decisionId,
    fixture.couriers[0].courierId,
    nightReorderOrder(fixture),
  );
}

function saferRouteCandidate(fixture = noviceNightUnfamiliarFixture) {
  const alternative = fixture.interventionInputs?.saferRouteAlternatives[0];
  if (!alternative) throw new Error("Expected a safer route alternative");
  return createSaferRouteCandidate(
    fixture,
    decisionId,
    fixture.couriers[0].courierId,
    alternative.replacementRouteId,
    alternative.replacedSegmentIds,
  );
}

function safeDelayCandidate(
  fixture = heatHeavyStairsFixture,
  delayedUntil = "2026-07-14T04:45:00.000Z",
) {
  const policy = fixture.interventionInputs?.safeDelayPolicies[0];
  if (!policy) throw new Error("Expected a Safe Delay policy");
  return createSafeDelayCandidate(
    fixture,
    decisionId,
    fixture.couriers[0].courierId,
    policy.delayableStopIds.slice(0, 3),
    delayedUntil,
  );
}

const reasonCodes = (evaluation: ReturnType<typeof evaluateIntervention>) =>
  evaluation.reasons.map((reason) => reason.code);

describe("remaining intervention regression", () => {
  it("locks exact full-plan results for reorder, safer route, and Safe Delay", () => {
    const cases = [
      {
        fixture: noviceNightUnfamiliarFixture,
        candidate: reorderCandidate(),
        expected: {
          safetyGain: 0.05215,
          candidateMinimumBudget: 30.023044,
          etaDeltaMinutes: 0,
          maxCustomerEtaDeltaMinutes: 6,
          operationalComplexity: 15,
          recommendationScore: -11.413083,
        },
      },
      {
        fixture: noviceNightUnfamiliarFixture,
        candidate: saferRouteCandidate(),
        expected: {
          safetyGain: 0.222677,
          candidateMinimumBudget: 30.193571,
          etaDeltaMinutes: 2,
          maxCustomerEtaDeltaMinutes: 2,
          operationalComplexity: 15,
          recommendationScore: -11.628872,
        },
      },
      {
        fixture: heatHeavyStairsFixture,
        candidate: safeDelayCandidate(),
        expected: {
          safetyGain: 3.935425,
          candidateMinimumBudget: 33.863225,
          etaDeltaMinutes: 9,
          maxCustomerEtaDeltaMinutes: 43,
          operationalComplexity: 20,
          recommendationScore: -0.690958,
        },
      },
    ];

    for (const { fixture, candidate, expected } of cases) {
      const evaluation = evaluateIntervention(fixture, candidate);
      expect(InterventionCandidateSchema.safeParse(candidate).success).toBe(true);
      expect(InterventionEvaluationSchema.safeParse(evaluation).success).toBe(true);
      expect(evaluation.feasibility.status).toBe("FEASIBLE");
      expect(evaluation.breachOutcome).toBe("AVOIDED");
      expect({
        safetyGain: evaluation.safetyGain,
        candidateMinimumBudget:
          evaluation.courierImpacts[0].candidateMinimumBudget,
        etaDeltaMinutes: evaluation.etaDeltaMinutes,
        maxCustomerEtaDeltaMinutes: evaluation.maxCustomerEtaDeltaMinutes,
        operationalComplexity: evaluation.operationalComplexity,
        recommendationScore: evaluation.recommendationScore,
      }).toEqual(expected);
      expect(evaluation.courierImpacts[0].breach.status).toBe(
        "NO_BREACH_IN_HORIZON",
      );
      expect(evaluation.consentRequirements).toEqual([
        expect.objectContaining({ required: true, status: "NOT_REQUESTED" }),
      ]);
    }
  });

  it("normalizes safer-route and Safe Delay IDs deterministically", () => {
    const alternative =
      noviceNightUnfamiliarFixture.interventionInputs?.saferRouteAlternatives[0];
    const delayPolicy =
      heatHeavyStairsFixture.interventionInputs?.safeDelayPolicies[0];
    if (!alternative || !delayPolicy) throw new Error("Expected Demo inputs");
    const reversedRoute = createSaferRouteCandidate(
      noviceNightUnfamiliarFixture,
      decisionId,
      noviceNightUnfamiliarFixture.couriers[0].courierId,
      alternative.replacementRouteId,
      [...alternative.replacedSegmentIds].reverse(),
    );
    const reversedDelay = createSafeDelayCandidate(
      heatHeavyStairsFixture,
      decisionId,
      heatHeavyStairsFixture.couriers[0].courierId,
      [...delayPolicy.delayableStopIds.slice(0, 3)].reverse(),
      "2026-07-14T04:45:00.000Z",
    );
    expect(reversedRoute.candidateId).toBe(saferRouteCandidate().candidateId);
    expect(reversedDelay.candidateId).toBe(safeDelayCandidate().candidateId);
    expect(reorderCandidate().candidateId).toBe(reorderCandidate().candidateId);
  });

  it("ranks only feasible remaining actions deterministically", () => {
    const reorder = evaluateIntervention(
      noviceNightUnfamiliarFixture,
      reorderCandidate(),
    );
    const saferRoute = evaluateIntervention(
      noviceNightUnfamiliarFixture,
      saferRouteCandidate(),
    );
    const ranked = rankInterventions([saferRoute, reorder]);
    expect(ranked.map((evaluation) => evaluation.candidateId)).toEqual([
      saferRoute.candidateId,
      reorder.candidateId,
    ]);
    expect(ranked.map((evaluation) => evaluation.rank)).toEqual([1, 2]);
  });

  it("does not mutate any baseline fixture", () => {
    const nightBefore = structuredClone(noviceNightUnfamiliarFixture);
    const heatBefore = structuredClone(heatHeavyStairsFixture);
    evaluateIntervention(noviceNightUnfamiliarFixture, reorderCandidate());
    evaluateIntervention(noviceNightUnfamiliarFixture, saferRouteCandidate());
    evaluateIntervention(heatHeavyStairsFixture, safeDelayCandidate());
    expect(noviceNightUnfamiliarFixture).toEqual(nightBefore);
    expect(heatHeavyStairsFixture).toEqual(heatBefore);
  });
});

describe("Demo intervention input contracts", () => {
  it("rejects an incomplete reorder classification", () => {
    const fixture = structuredClone(noviceNightUnfamiliarFixture);
    fixture.interventionInputs?.reorderPolicies[0].reorderableStopIds.pop();
    expect(ScenarioFixtureSchema.safeParse(fixture).success).toBe(false);
  });

  it("rejects a safer route with a different destination set", () => {
    const fixture = structuredClone(noviceNightUnfamiliarFixture);
    fixture.interventionInputs?.saferRouteAlternatives[0].replacementSegments.pop();
    expect(ScenarioFixtureSchema.safeParse(fixture).success).toBe(false);
  });

  it("rejects a Safe Delay policy that references an unknown stop", () => {
    const fixture = structuredClone(heatHeavyStairsFixture);
    fixture.interventionInputs?.safeDelayPolicies[0].delayableStopIds.push(
      "unknown-delay-stop",
    );
    expect(ScenarioFixtureSchema.safeParse(fixture).success).toBe(false);
  });
});

describe("reorder hard constraints", () => {
  it("blocks a changed stop set", () => {
    const fixture = noviceNightUnfamiliarFixture;
    const candidate = createReorderCandidate(
      fixture,
      decisionId,
      fixture.couriers[0].courierId,
      nightReorderOrder(fixture).slice(1),
    );
    const evaluation = evaluateIntervention(fixture, candidate);
    expect(evaluation.feasibility.status).toBe("INFEASIBLE");
    expect(reasonCodes(evaluation)).toContain("REORDER_STOP_SET_MISMATCH");
  });

  it("blocks movement of a fixed hard-window stop", () => {
    const fixture = noviceNightUnfamiliarFixture;
    const policy = fixture.interventionInputs?.reorderPolicies[0];
    if (!policy?.fixedStopIds[0]) throw new Error("Expected a fixed stop");
    const order = [...fixture.workloads[0].remainingStopIds];
    const fixedIndex = order.indexOf(policy.fixedStopIds[0]);
    [order[fixedIndex - 1], order[fixedIndex]] = [
      order[fixedIndex],
      order[fixedIndex - 1],
    ];
    const evaluation = evaluateIntervention(
      fixture,
      createReorderCandidate(
        fixture,
        decisionId,
        fixture.couriers[0].courierId,
        order,
      ),
    );
    expect(reasonCodes(evaluation)).toContain("REORDER_FIXED_STOP_MOVED");
  });
});

describe("safer-route hard constraints", () => {
  it("returns NEEDS_DATA when the explicit route catalog is absent", () => {
    const fixture = structuredClone(noviceNightUnfamiliarFixture);
    const alternative = fixture.interventionInputs?.saferRouteAlternatives[0];
    if (!alternative) throw new Error("Expected a safer route alternative");
    delete fixture.interventionInputs;
    const candidate = createSaferRouteCandidate(
      fixture,
      decisionId,
      fixture.couriers[0].courierId,
      alternative.replacementRouteId,
      alternative.replacedSegmentIds,
    );
    const evaluation = evaluateIntervention(fixture, candidate);
    expect(evaluation.feasibility).toEqual({
      status: "NEEDS_DATA",
      blockingInputs: [`saferRouteAlternative:${alternative.replacementRouteId}`],
    });
  });

  it("blocks a segment set that differs from the catalog", () => {
    const fixture = noviceNightUnfamiliarFixture;
    const alternative = fixture.interventionInputs?.saferRouteAlternatives[0];
    if (!alternative) throw new Error("Expected a safer route alternative");
    const evaluation = evaluateIntervention(
      fixture,
      createSaferRouteCandidate(
        fixture,
        decisionId,
        fixture.couriers[0].courierId,
        alternative.replacementRouteId,
        alternative.replacedSegmentIds.slice(1),
      ),
    );
    expect(reasonCodes(evaluation)).toContain("SAFER_ROUTE_SEGMENT_SET_MISMATCH");
  });

  it("blocks allowed-end violations and routes that worsen a safe baseline", () => {
    const lateFixture = structuredClone(noviceNightUnfamiliarFixture);
    lateFixture.couriers[0].allowedShiftEndAt = "2026-07-14T12:40:00.000Z";
    const lateEvaluation = evaluateIntervention(
      lateFixture,
      saferRouteCandidate(lateFixture),
    );
    expect(reasonCodes(lateEvaluation)).toContain("CANDIDATE_ALLOWED_END_EXCEEDED");

    const worseFixture = structuredClone(noviceNightUnfamiliarFixture);
    const initial = worseFixture.initialSafetyStates?.find(
      (state) => state.courierId === worseFixture.couriers[0].courierId,
    );
    const alternative = worseFixture.interventionInputs?.saferRouteAlternatives[0];
    if (!initial || !alternative) throw new Error("Expected Demo safety inputs");
    initial.currentBudget = 100;
    for (const segment of alternative.replacementSegments) {
      segment.uphillGradePct = 30;
      segment.roadWidthClass = "VERY_NARROW";
    }
    expect(ScenarioFixtureSchema.safeParse(worseFixture).success).toBe(true);
    const worseEvaluation = evaluateIntervention(
      worseFixture,
      saferRouteCandidate(worseFixture),
    );
    expect(reasonCodes(worseEvaluation)).toContain("SAFETY_NOT_IMPROVED");
  });
});

describe("Safe Delay hard constraints", () => {
  it("allows the exact maximum-delay boundary", () => {
    const boundary = evaluateIntervention(
      heatHeavyStairsFixture,
      safeDelayCandidate(heatHeavyStairsFixture, "2026-07-14T05:02:00.000Z"),
    );
    expect(boundary.feasibility.status).toBe("FEASIBLE");
  });

  it("blocks maximum-delay and customer-notice violations", () => {
    const tooLate = evaluateIntervention(
      heatHeavyStairsFixture,
      safeDelayCandidate(heatHeavyStairsFixture, "2026-07-14T05:30:00.000Z"),
    );
    expect(reasonCodes(tooLate)).toContain("SAFE_DELAY_MAXIMUM_EXCEEDED");

    const noNoticeFixture = structuredClone(heatHeavyStairsFixture);
    const policy = noNoticeFixture.interventionInputs?.safeDelayPolicies[0];
    if (!policy) throw new Error("Expected a Safe Delay policy");
    policy.customerNoticeAvailable = false;
    const noNotice = evaluateIntervention(
      noNoticeFixture,
      safeDelayCandidate(noNoticeFixture),
    );
    expect(reasonCodes(noNotice)).toContain(
      "SAFE_DELAY_CUSTOMER_NOTICE_UNAVAILABLE",
    );
  });

  it("blocks NON_DELAYABLE stops and unsupported stop counts", () => {
    const fixture = structuredClone(heatHeavyStairsFixture);
    const policy = fixture.interventionInputs?.safeDelayPolicies[0];
    if (!policy) throw new Error("Expected a Safe Delay policy");
    const nonDelayableId = policy.delayableStopIds[0];
    const stop = fixture.stops.find((item) => item.stopId === nonDelayableId);
    if (!stop) throw new Error("Expected a delayable stop");
    stop.priority = "NON_DELAYABLE";
    const nonDelayable = evaluateIntervention(fixture, safeDelayCandidate(fixture));
    expect(reasonCodes(nonDelayable)).toContain("SAFE_DELAY_NON_DELAYABLE_STOP");

    const twoStops = createSafeDelayCandidate(
      heatHeavyStairsFixture,
      decisionId,
      heatHeavyStairsFixture.couriers[0].courierId,
      heatHeavyStairsFixture.interventionInputs?.safeDelayPolicies[0].delayableStopIds.slice(
        0,
        2,
      ) ?? [],
      "2026-07-14T04:45:00.000Z",
    );
    expect(reasonCodes(evaluateIntervention(heatHeavyStairsFixture, twoStops))).toContain(
      "SAFE_DELAY_STOP_COUNT_NOT_ALLOWED",
    );
  });

  it("returns NEEDS_DATA when the Safe Delay policy is absent", () => {
    const fixture = structuredClone(heatHeavyStairsFixture);
    const stopIds = fixture.interventionInputs?.safeDelayPolicies[0].delayableStopIds.slice(
      0,
      3,
    );
    if (!stopIds) throw new Error("Expected delayable stops");
    delete fixture.interventionInputs;
    const candidate = createSafeDelayCandidate(
      fixture,
      decisionId,
      fixture.couriers[0].courierId,
      stopIds,
      "2026-07-14T04:45:00.000Z",
    );
    const evaluation = evaluateIntervention(fixture, candidate);
    expect(evaluation.feasibility).toEqual({
      status: "NEEDS_DATA",
      blockingInputs: [`safeDelayPolicy:${fixture.couriers[0].courierId}`],
    });
  });
});
