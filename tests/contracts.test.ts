import { describe, expect, it } from "vitest";
import {
  CourierStateSchema,
  createDataResultSchema,
  DecisionRecordSchema,
  InterventionActionSchema,
  InterventionEvaluationSchema,
  ProvenanceSchema,
  SafetyBudgetSnapshotSchema,
  ScenarioFixtureSchema,
  WeatherStateSchema,
  WorkloadStateSchema,
  confidenceForScore,
  riskBandForBudget,
} from "../src/domain/contracts";
import {
  rainyHillyLongShiftFixture,
  scenarioFixtures,
} from "../src/adapters/fixtures";

const clone = <T>(value: T): T => structuredClone(value);

describe("representative scenario fixtures", () => {
  it("validates all three deterministic fixtures", () => {
    expect(scenarioFixtures).toHaveLength(3);
    for (const fixture of scenarioFixtures) {
      expect(ScenarioFixtureSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it("locks the rainy scenario semantic assertions", () => {
    expect(rainyHillyLongShiftFixture.stops).toHaveLength(17);
    expect(rainyHillyLongShiftFixture.expectedAssertions).toMatchObject({
      breachStatus: "PREDICTED",
      timeToBreachMinutesRange: { min: 50, max: 54 },
      breachStopId: "scenario-rain-hill-longshift-v1-stop-017",
      recommendedActionKinds: ["REST", "TRANSFER_STOPS"],
    });
  });

  it("rejects a missing cross-object stop reference", () => {
    const fixture = clone(rainyHillyLongShiftFixture);
    fixture.workloads[0].remainingStopIds[0] = "unknown-stop";
    expect(ScenarioFixtureSchema.safeParse(fixture).success).toBe(false);
  });

  it("rejects duplicate stop IDs", () => {
    const fixture = clone(rainyHillyLongShiftFixture);
    fixture.stops[1].stopId = fixture.stops[0].stopId;
    expect(ScenarioFixtureSchema.safeParse(fixture).success).toBe(false);
  });

  it("rejects LIVE provenance inside a demo fixture", () => {
    const fixture = clone(rainyHillyLongShiftFixture);
    fixture.provenance[0] = {
      ...fixture.provenance[0],
      kind: "LIVE",
      isDemo: false,
    };
    expect(ScenarioFixtureSchema.safeParse(fixture).success).toBe(false);
  });

  it("marks every current fixture provenance record as Demo MOCK", () => {
    const provenanceRecords: Array<Record<string, unknown>> = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== "object" || value === null) return;
      const record = value as Record<string, unknown>;
      if (
        typeof record.kind === "string" &&
        typeof record.sourceId === "string" &&
        typeof record.isDemo === "boolean"
      ) {
        provenanceRecords.push(record);
      }
      Object.values(record).forEach(visit);
    };
    scenarioFixtures.forEach(visit);
    expect(provenanceRecords.length).toBeGreaterThan(0);
    expect(
      provenanceRecords.every(
        (record) => record.kind === "MOCK" && record.isDemo === true,
      ),
    ).toBe(true);
  });
});

describe("provenance and explicit data states", () => {
  const mockProvenance = rainyHillyLongShiftFixture.provenance.find(
    (item) => item.kind === "MOCK",
  );

  it("rejects MOCK provenance that is presented as non-demo", () => {
    expect(mockProvenance).toBeDefined();
    expect(
      ProvenanceSchema.safeParse({ ...mockProvenance, isDemo: false }).success,
    ).toBe(false);
  });

  it("rejects a LIVE result backed by MOCK provenance", () => {
    expect(mockProvenance).toBeDefined();
    const schema = createDataResultSchema(WeatherStateSchema);
    const weather = rainyHillyLongShiftFixture.weatherTimeline[0];
    expect(
      schema.safeParse({
        status: "LIVE",
        data: weather,
        receivedAt: rainyHillyLongShiftFixture.evaluatedAt,
        provenance: mockProvenance,
      }).success,
    ).toBe(false);
  });

  it("requires reproducible source evidence for public-derived data", () => {
    expect(
      ProvenanceSchema.safeParse({
        ...mockProvenance,
        kind: "PUBLIC_DATA_DERIVED",
      }).success,
    ).toBe(false);
    expect(
      ProvenanceSchema.safeParse({
        ...mockProvenance,
        kind: "PUBLIC_DATA_DERIVED",
        sourceUri: "https://example.go.kr/datasets/safe-route-source",
        sourceVersion: "2026-07-17",
        licenseOrPolicy: "Public data license reference",
        contentHashSha256: "a".repeat(64),
        transformedBy: "public-feature-transform@1.0.0",
      }).success,
    ).toBe(true);
  });
});

describe("courier and workload boundaries", () => {
  it("rejects raw biometric fields", () => {
    const courier = clone(rainyHillyLongShiftFixture.couriers[0]);
    const withRawBiometric = {
      ...courier,
      heartRateBpm: 142,
    };
    expect(CourierStateSchema.safeParse(withRawBiometric).success).toBe(false);
  });

  it("rejects impossible shift timestamps", () => {
    const courier = clone(rainyHillyLongShiftFixture.couriers[0]);
    courier.continuousWorkStartedAt = "2026-07-14T01:00:00.000Z";
    expect(CourierStateSchema.safeParse(courier).success).toBe(false);
  });

  it("rejects negative workload", () => {
    const workload = clone(rainyHillyLongShiftFixture.workloads[0]);
    workload.remainingLoad.totalWeightKg = -1;
    expect(WorkloadStateSchema.safeParse(workload).success).toBe(false);
  });

  it("rejects a stop count that disagrees with IDs", () => {
    const workload = clone(rainyHillyLongShiftFixture.workloads[0]);
    workload.remainingLoad.stopCount -= 1;
    expect(WorkloadStateSchema.safeParse(workload).success).toBe(false);
  });
});

describe("safety result invariants", () => {
  it("uses the approved budget and confidence boundaries", () => {
    expect([29.99, 30, 44.99, 45, 59.99, 60].map(riskBandForBudget)).toEqual([
      "BREACHED",
      "SUPPORT_NEEDED",
      "SUPPORT_NEEDED",
      "CAUTION",
      "CAUTION",
      "STABLE",
    ]);
    expect([59, 60, 79, 80].map(confidenceForScore)).toEqual([
      "LOW",
      "MEDIUM",
      "MEDIUM",
      "HIGH",
    ]);
  });

  it("rejects a no-breach result containing a breached point", () => {
    const evaluatedAt = rainyHillyLongShiftFixture.evaluatedAt;
    const result = SafetyBudgetSnapshotSchema.safeParse({
      snapshotId: "snapshot-invalid",
      courierId: rainyHillyLongShiftFixture.couriers[0].courierId,
      planId: rainyHillyLongShiftFixture.workloads[0].planId,
      evaluatedAt,
      versionContext: {
        contractsVersion: "1.0.0",
        safetyModelVersion: "1.0.0",
        safetyConfigVersion: "1.0.0",
        interventionPolicyVersion: "1.0.0",
        planVersion: "1.0.0",
      },
      currentBudget: 62,
      currentBand: "STABLE",
      minimumForecastBudget: 29,
      forecast: [
        { at: evaluatedAt, budget: 62, band: "STABLE", eventType: "CURRENT" },
        {
          at: "2026-07-14T00:30:00.000Z",
          budget: 29,
          band: "BREACHED",
          eventType: "TRAVEL",
          stopId: rainyHillyLongShiftFixture.stops[0].stopId,
        },
      ],
      breach: {
        status: "NO_BREACH_IN_HORIZON",
        forecastEndAt: "2026-07-14T02:00:00.000Z",
        minimumForecastBudget: 30,
      },
      contributions: [],
      confidenceScore: 75,
      confidence: "MEDIUM",
      missingInputs: [],
      assumptions: [],
      provenance: rainyHillyLongShiftFixture.provenance,
    });
    expect(result.success).toBe(false);
  });
});

describe("intervention safety guard", () => {
  it("rejects a transfer to the same courier", () => {
    const courierId = rainyHillyLongShiftFixture.couriers[0].courierId;
    expect(
      InterventionActionSchema.safeParse({
        type: "TRANSFER_STOPS",
        sourceCourierId: courierId,
        recipientCourierId: courierId,
        stopIds: [rainyHillyLongShiftFixture.stops[0].stopId],
        handoffLocationId: "handoff-safe-01",
        plannedHandoffAt: "2026-07-14T00:20:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects a feasible transfer below the recipient support threshold", () => {
    const recipientId = rainyHillyLongShiftFixture.couriers[1].courierId;
    const candidateId = "candidate-transfer-8";
    const evaluation = {
      evaluationId: "evaluation-transfer-8",
      candidateId,
      decisionId: "decision-rain-001",
      evaluatedAt: rainyHillyLongShiftFixture.evaluatedAt,
      versionContext: {
        contractsVersion: "1.0.0",
        safetyModelVersion: "1.0.0",
        safetyConfigVersion: "1.0.0",
        interventionPolicyVersion: "1.0.0",
        planVersion: "1.0.0",
      },
      feasibility: { status: "FEASIBLE", warnings: [] },
      baselineSnapshotId: "snapshot-baseline",
      candidateSnapshotIds: ["snapshot-candidate"],
      safetyGain: 14,
      breachOutcome: "AVOIDED",
      etaDeltaMinutes: 10,
      maxCustomerEtaDeltaMinutes: 18,
      affectedCustomerCount: 8,
      operationalComplexity: 45,
      fairnessPenaltyScore: 35,
      customerImpactScore: 20,
      recommendationScore: 12,
      rank: 1,
      courierImpacts: [
        {
          courierId: recipientId,
          role: "RECIPIENT",
          baselineMinimumBudget: 60,
          candidateMinimumBudget: 44,
          budgetDelta: -16,
          workMinutesDelta: 35,
          stopCountDelta: 8,
          projectedEndAt: "2026-07-14T02:20:00.000Z",
          breach: {
            status: "NO_BREACH_IN_HORIZON",
            forecastEndAt: "2026-07-14T02:00:00.000Z",
            minimumForecastBudget: 44,
          },
        },
      ],
      consentRequirements: [
        {
          courierId: recipientId,
          required: true,
          status: "PENDING",
          candidateId,
        },
      ],
      reasons: [],
    };
    expect(InterventionEvaluationSchema.safeParse(evaluation).success).toBe(false);
  });
});

describe("decision state machine", () => {
  it("rejects a state transition that skips candidate generation", () => {
    const decision = {
      decisionId: "decision-invalid-transition",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:01:00.000Z",
      status: "CANDIDATES_EVALUATED",
      dataMode: "MOCK",
      baselinePlanId: rainyHillyLongShiftFixture.workloads[0].planId,
      baselinePlanVersion: "1.0.0",
      baselineSnapshotIds: ["snapshot-baseline"],
      candidateIds: [],
      evaluationIds: [],
      consentRequirements: [],
      customerNoticeIds: [],
      versionContext: {
        contractsVersion: "1.0.0",
        safetyModelVersion: "1.0.0",
        safetyConfigVersion: "1.0.0",
        interventionPolicyVersion: "1.0.0",
        planVersion: "1.0.0",
      },
      events: [
        {
          eventId: "event-baseline",
          at: "2026-07-14T00:00:00.000Z",
          actor: "SYSTEM",
          toStatus: "BASELINE_EVALUATED",
          reasonCode: "BASELINE_READY",
          evidenceIds: ["snapshot-baseline"],
        },
        {
          eventId: "event-skipped",
          at: "2026-07-14T00:01:00.000Z",
          actor: "SYSTEM",
          fromStatus: "BASELINE_EVALUATED",
          toStatus: "CANDIDATES_EVALUATED",
          reasonCode: "INVALID_SKIP",
          evidenceIds: [],
        },
      ],
    };
    expect(DecisionRecordSchema.safeParse(decision).success).toBe(false);
  });
});
