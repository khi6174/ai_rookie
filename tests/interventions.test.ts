import { describe, expect, it } from "vitest";
import { rainyHillyLongShiftFixture } from "../src/adapters/fixtures";
import {
  InterventionCandidateSchema,
  InterventionEvaluationSchema,
} from "../src/domain/contracts";
import {
  createRestCandidate,
  createRestTransferCandidate,
  createTransferCandidate,
  evaluateIntervention,
  evaluateRiskTransferGuard,
  generateRestCandidates,
  generateTransferCandidates,
  rankInterventions,
  recommendIntervention,
} from "../src/domain/interventions";

const fixture = rainyHillyLongShiftFixture;
const sourceCourierId = fixture.couriers[0].courierId;
const recipientCourierId = fixture.couriers[1].courierId;
const decisionId = "decision-scenario-a-v1";
const tailCluster = (count: number) =>
  fixture.stops.slice(-count).map((stop) => stop.stopId);

const transferCandidate = (count: number) =>
  createTransferCandidate(fixture, decisionId, {
    sourceCourierId,
    recipientCourierId,
    stopIds: tailCluster(count),
  });

const reasonCodes = (evaluation: ReturnType<typeof evaluateIntervention>) =>
  evaluation.reasons.map((reason) => reason.code);

describe("deterministic intervention candidates", () => {
  it("creates the same ID for the same normalized transfer cluster", () => {
    const forward = transferCandidate(8);
    const reversed = createTransferCandidate(fixture, decisionId, {
      sourceCourierId,
      recipientCourierId,
      stopIds: [...tailCluster(8)].reverse(),
    });
    expect(reversed.candidateId).toBe(forward.candidateId);
    expect(reversed.actions).toEqual(forward.actions);
  });

  it("generates the four approved rest durations deterministically", () => {
    const candidates = generateRestCandidates(
      fixture,
      decisionId,
      sourceCourierId,
    );
    expect(candidates.map((candidate) => candidate.actions[0])).toEqual(
      [10, 15, 20, 30].map((restMinutes) =>
        expect.objectContaining({ type: "REST", restMinutes }),
      ),
    );
    expect(new Set(candidates.map((candidate) => candidate.candidateId)).size).toBe(4);
  });

  it("accepts only the approved explicit 4, 8, and 12-stop clusters", () => {
    const candidates = generateTransferCandidates(fixture, decisionId, {
      sourceCourierId,
      recipientCourierId,
      transferClusters: [
        tailCluster(3),
        tailCluster(4),
        [...tailCluster(4)].reverse(),
        tailCluster(8),
        tailCluster(12),
      ],
    });
    expect(
      candidates.map(
        (candidate) =>
          candidate.actions.find((action) => action.type === "TRANSFER_STOPS")
            ?.stopIds.length,
      ),
    ).toEqual([4, 8, 12]);
  });

  it("rejects candidates whose affected IDs omit an action subject", () => {
    const candidate = structuredClone(transferCandidate(8));
    candidate.affectedCourierIds = [sourceCourierId];
    expect(InterventionCandidateSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("scenario A full-plan recalculation", () => {
  it("allows the explicit 8-stop cluster without transferring risk", () => {
    const evaluation = evaluateIntervention(fixture, transferCandidate(8));
    expect(InterventionEvaluationSchema.safeParse(evaluation).success).toBe(true);
    expect(evaluation.feasibility.status).toBe("FEASIBLE");
    expect(evaluation.breachOutcome).toBe("AVOIDED");
    expect(evaluation.safetyGain).toBe(11.903419);
    expect(evaluation.recommendationScore).toBe(3.14591);
    expect(evaluation.courierImpacts).toEqual([
      expect.objectContaining({
        role: "SOURCE",
        baselineMinimumBudget: 29.914456,
        candidateMinimumBudget: 41.817875,
        stopCountDelta: -8,
        breach: expect.objectContaining({ status: "NO_BREACH_IN_HORIZON" }),
      }),
      expect.objectContaining({
        role: "RECIPIENT",
        baselineMinimumBudget: 52.5,
        candidateMinimumBudget: 45.012761,
        stopCountDelta: 8,
        breach: expect.objectContaining({ status: "NO_BREACH_IN_HORIZON" }),
      }),
    ]);
    expect(evaluation.consentRequirements).toEqual([
      expect.objectContaining({ courierId: sourceCourierId, required: true }),
      expect.objectContaining({ courierId: recipientCourierId, required: true }),
    ]);
  });

  it("blocks 12 stops because the recipient falls below the 45 floor", () => {
    const evaluation = evaluateIntervention(fixture, transferCandidate(12));
    expect(evaluation.feasibility.status).toBe("INFEASIBLE");
    expect(evaluation.recommendationScore).toBeUndefined();
    expect(reasonCodes(evaluation)).toContain(
      "TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR",
    );
    expect(evaluation.courierImpacts).toEqual([
      expect.objectContaining({
        role: "SOURCE",
        candidateMinimumBudget: 47.750764,
      }),
      expect.objectContaining({
        role: "RECIPIENT",
        candidateMinimumBudget: 40.566386,
      }),
    ]);
  });

  it("recalculates rest and rest-plus-transfer instead of adding effects", () => {
    const rest = evaluateIntervention(
      fixture,
      createRestCandidate(fixture, decisionId, sourceCourierId, 10),
    );
    const bundle = evaluateIntervention(
      fixture,
      createRestTransferCandidate(fixture, decisionId, 10, {
        sourceCourierId,
        recipientCourierId,
        stopIds: tailCluster(8),
      }),
    );
    expect(rest.feasibility.status).toBe("FEASIBLE");
    expect(rest.safetyGain).toBe(6.505555);
    expect(bundle.feasibility.status).toBe("FEASIBLE");
    expect(bundle.safetyGain).toBe(17.271961);
    expect(bundle.safetyGain).not.toBeCloseTo(
      rest.safetyGain + 11.903419,
      5,
    );
    expect(bundle.courierImpacts[1]).toEqual(
      expect.objectContaining({ candidateMinimumBudget: 45.012761 }),
    );
  });

  it("does not mutate the baseline fixture while evaluating", () => {
    const before = structuredClone(fixture);
    evaluateIntervention(fixture, transferCandidate(8));
    expect(fixture).toEqual(before);
  });
});

describe("Risk Transfer Guard boundaries", () => {
  it("allows exact floor 45 and exact maximum drop 15", () => {
    expect(
      evaluateRiskTransferGuard({
        recipientCourierId,
        baselineMinimumBudget: 60,
        candidateMinimumBudget: 45,
        breachStatus: "NO_BREACH_IN_HORIZON",
      }),
    ).toEqual([]);
  });

  it("blocks values immediately outside either boundary", () => {
    expect(
      evaluateRiskTransferGuard({
        recipientCourierId,
        baselineMinimumBudget: 60,
        candidateMinimumBudget: 44.999999,
        breachStatus: "NO_BREACH_IN_HORIZON",
      }).map((reason) => reason.code),
    ).toContain("TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR");
    expect(
      evaluateRiskTransferGuard({
        recipientCourierId,
        baselineMinimumBudget: 60.000001,
        candidateMinimumBudget: 45,
        breachStatus: "NO_BREACH_IN_HORIZON",
      }).map((reason) => reason.code),
    ).toContain("TRANSFER_RECIPIENT_BUDGET_DROP_EXCEEDED");
  });

  it("blocks a recipient breach even when numeric floors pass", () => {
    expect(
      evaluateRiskTransferGuard({
        recipientCourierId,
        baselineMinimumBudget: 60,
        candidateMinimumBudget: 50,
        breachStatus: "PREDICTED",
      }).map((reason) => reason.code),
    ).toContain("TRANSFER_RECIPIENT_BREACH_PREDICTED");
  });

  it("blocks capacity, time-window, vehicle, area, and allowed-end incompatibilities", () => {
    const capacityFixture = structuredClone(fixture);
    capacityFixture.couriers[1].capacity.maxStops = 7;
    const capacityEvaluation = evaluateIntervention(
      capacityFixture,
      createTransferCandidate(capacityFixture, decisionId, {
        sourceCourierId,
        recipientCourierId,
        stopIds: tailCluster(8),
      }),
    );
    expect(reasonCodes(capacityEvaluation)).toContain("TRANSFER_CAPACITY_EXCEEDED");

    const timeWindowFixture = structuredClone(fixture);
    const hardStop = timeWindowFixture.stops.find(
      (stop) => tailCluster(8).includes(stop.stopId) && stop.timeWindow?.kind === "HARD",
    );
    if (!hardStop?.timeWindow) throw new Error("Expected a hard-window stop");
    hardStop.timeWindow.startsAt = "2026-07-14T00:00:00.000Z";
    hardStop.timeWindow.endsAt = "2026-07-14T00:01:00.000Z";
    const timeWindowEvaluation = evaluateIntervention(
      timeWindowFixture,
      createTransferCandidate(timeWindowFixture, decisionId, {
        sourceCourierId,
        recipientCourierId,
        stopIds: tailCluster(8),
      }),
    );
    expect(reasonCodes(timeWindowEvaluation)).toContain(
      "TRANSFER_TIME_WINDOW_VIOLATION",
    );

    const vehicleFixture = structuredClone(fixture);
    vehicleFixture.couriers[1].vehicleClass = "WALK";
    const vehicleEvaluation = evaluateIntervention(
      vehicleFixture,
      createTransferCandidate(vehicleFixture, decisionId, {
        sourceCourierId,
        recipientCourierId,
        stopIds: tailCluster(8),
      }),
    );
    expect(reasonCodes(vehicleEvaluation)).toContain(
      "TRANSFER_VEHICLE_INCOMPATIBLE",
    );

    const areaFixture = structuredClone(fixture);
    areaFixture.couriers[1].areaFamiliarity = "UNKNOWN";
    const areaEvaluation = evaluateIntervention(
      areaFixture,
      createTransferCandidate(areaFixture, decisionId, {
        sourceCourierId,
        recipientCourierId,
        stopIds: tailCluster(8),
      }),
    );
    expect(reasonCodes(areaEvaluation)).toContain("TRANSFER_AREA_INCOMPATIBLE");

    const endFixture = structuredClone(fixture);
    endFixture.couriers[1].allowedShiftEndAt = "2026-07-14T00:31:00.000Z";
    const endEvaluation = evaluateIntervention(
      endFixture,
      createTransferCandidate(endFixture, decisionId, {
        sourceCourierId,
        recipientCourierId,
        stopIds: tailCluster(8),
      }),
    );
    expect(reasonCodes(endEvaluation)).toContain("TRANSFER_ALLOWED_END_EXCEEDED");
  });
});

describe("safe-only ranking", () => {
  it("ranks the approved bundle first and never ranks the blocked 12-stop option", () => {
    const rest = evaluateIntervention(
      fixture,
      createRestCandidate(fixture, decisionId, sourceCourierId, 10),
    );
    const transfer8 = evaluateIntervention(fixture, transferCandidate(8));
    const transfer12 = evaluateIntervention(fixture, transferCandidate(12));
    const bundle = evaluateIntervention(
      fixture,
      createRestTransferCandidate(fixture, decisionId, 10, {
        sourceCourierId,
        recipientCourierId,
        stopIds: tailCluster(8),
      }),
    );
    const ranked = rankInterventions([transfer12, rest, transfer8, bundle]);
    expect(
      ranked.filter((evaluation) => evaluation.rank).map((evaluation) => [
        evaluation.rank,
        evaluation.candidateId,
      ]),
    ).toEqual([
      [1, bundle.candidateId],
      [2, transfer8.candidateId],
      [3, rest.candidateId],
    ]);
    expect(ranked.find((item) => item.candidateId === transfer12.candidateId)?.rank).toBeUndefined();
  });

  it("returns NO_SAFE_OPTION instead of recommending an infeasible candidate", () => {
    const transfer12 = evaluateIntervention(fixture, transferCandidate(12));
    const result = recommendIntervention([transfer12]);
    expect(result.status).toBe("NO_SAFE_OPTION");
    expect(result.evaluations[0].rank).toBeUndefined();
  });

  it("uses candidate ID as the final deterministic tie-break", () => {
    const baseline = evaluateIntervention(
      fixture,
      createRestCandidate(fixture, decisionId, sourceCourierId, 10),
    );
    const left = structuredClone(baseline);
    left.candidateId = "candidate-aaaa0000";
    left.evaluationId = "evaluation-aaaa0000";
    left.consentRequirements = left.consentRequirements.map((requirement) => ({
      ...requirement,
      candidateId: left.candidateId,
    }));
    const right = structuredClone(left);
    right.candidateId = "candidate-bbbb0000";
    right.evaluationId = "evaluation-bbbb0000";
    right.consentRequirements = right.consentRequirements.map((requirement) => ({
      ...requirement,
      candidateId: right.candidateId,
    }));
    const ranked = rankInterventions([right, left]);
    expect(ranked.map((evaluation) => evaluation.candidateId)).toEqual([
      left.candidateId,
      right.candidateId,
    ]);
  });
});
