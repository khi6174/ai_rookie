import {
  InterventionCandidateSchema,
  InterventionEvaluationSchema,
  ScenarioFixtureSchema,
  type BreachPrediction,
  type InterventionCandidate,
  type InterventionEvaluation,
  type PolicyReason,
  type SafetyBudgetSnapshot,
  type ScenarioFixture,
  type WorkloadState,
} from "../contracts";
import { evaluateSafetyBudget, clamp, roundForStorage } from "../safety";
import { interventionConfig } from "./config";

type TransferAction = Extract<InterventionCandidate["actions"][number], { type: "TRANSFER_STOPS" }>;

const addMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

const minutesBetween = (later: string, earlier: string) =>
  (Date.parse(later) - Date.parse(earlier)) / 60_000;

function minimumBudget(snapshot: SafetyBudgetSnapshot) {
  if (snapshot.minimumForecastBudget === undefined) {
    throw new Error(`Snapshot ${snapshot.snapshotId} has no minimum budget`);
  }
  return snapshot.minimumForecastBudget;
}

function reason(
  code: string,
  subjectType: PolicyReason["subjectType"],
  subjectId: string | undefined,
  evidenceFields: string[],
  severity: PolicyReason["severity"] = "BLOCKING",
): PolicyReason {
  return {
    code,
    severity,
    subjectType,
    subjectId,
    messageKey: `intervention.reason.${code.toLowerCase()}`,
    evidenceFields,
  };
}

export function evaluateRiskTransferGuard(input: {
  recipientCourierId: string;
  baselineMinimumBudget: number;
  candidateMinimumBudget: number;
  breachStatus: BreachPrediction["status"];
}) {
  const reasons: PolicyReason[] = [];
  if (
    input.candidateMinimumBudget <
    interventionConfig.riskTransferGuard.recipientMinimumBudget
  ) {
    reasons.push(
      reason(
        "TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR",
        "COURIER",
        input.recipientCourierId,
        ["candidateMinimumBudget", "recipientMinimumBudget"],
      ),
    );
  }
  if (
    input.baselineMinimumBudget - input.candidateMinimumBudget >
    interventionConfig.riskTransferGuard.maximumRecipientBudgetDrop
  ) {
    reasons.push(
      reason(
        "TRANSFER_RECIPIENT_BUDGET_DROP_EXCEEDED",
        "COURIER",
        input.recipientCourierId,
        ["baselineMinimumBudget", "candidateMinimumBudget"],
      ),
    );
  }
  if (input.breachStatus !== "NO_BREACH_IN_HORIZON") {
    reasons.push(
      reason(
        "TRANSFER_RECIPIENT_BREACH_PREDICTED",
        "COURIER",
        input.recipientCourierId,
        ["breach.status"],
      ),
    );
  }
  return reasons;
}

function workloadFor(fixture: ScenarioFixture, courierId: string) {
  const workload = fixture.workloads.find((item) => item.courierId === courierId);
  if (!workload) throw new Error(`Missing workload for ${courierId}`);
  return workload;
}

function courierFor(fixture: ScenarioFixture, courierId: string) {
  const courier = fixture.couriers.find((item) => item.courierId === courierId);
  if (!courier) throw new Error(`Missing courier ${courierId}`);
  return courier;
}

function recalculateLoad(
  fixture: ScenarioFixture,
  workload: WorkloadState,
  courierId: string,
) {
  const remainingStops = fixture.stops
    .filter(
      (stop) =>
        stop.assignedCourierId === courierId &&
        stop.planId === workload.planId &&
        ["PENDING", "IN_PROGRESS"].includes(stop.status),
    )
    .sort((left, right) => left.sequence - right.sequence);
  workload.remainingStopIds = remainingStops.map((stop) => stop.stopId);
  workload.remainingLoad = {
    stopCount: remainingStops.length,
    totalWeightKg: remainingStops.reduce(
      (total, stop) => total + (stop.load.weightKg ?? 0),
      0,
    ),
    totalVolumeLiters: remainingStops.reduce(
      (total, stop) => total + (stop.load.volumeLiters ?? 0),
      0,
    ),
  };
  workload.onboardLoad = { ...workload.remainingLoad };
  workload.stairStopsRemaining = remainingStops.filter(
    (stop) =>
      stop.access.elevator === "UNAVAILABLE" && (stop.access.floor ?? 0) > 1,
  ).length;
  workload.atRiskHardTimeWindowCount = remainingStops.filter(
    (stop) => stop.sequence % 7 === 0,
  ).length;
  workload.atRiskSoftTimeWindowCount = remainingStops.filter(
    (stop) => stop.sequence % 5 === 0,
  ).length;
}

function transferDuration(fixture: ScenarioFixture, stopIds: Set<string>) {
  const service = fixture.stops
    .filter((stop) => stopIds.has(stop.stopId))
    .reduce((total, stop) => total + stop.expectedServiceMinutes, 0);
  const travel = fixture.routeSegments
    .filter((segment) => stopIds.has(segment.toStopId))
    .reduce((total, segment) => total + segment.durationMinutes, 0);
  return service + travel;
}

function transferPreflight(
  fixture: ScenarioFixture,
  action: TransferAction,
): PolicyReason[] {
  const reasons: PolicyReason[] = [];
  const sourceWorkload = fixture.workloads.find(
    (item) => item.courierId === action.sourceCourierId,
  );
  const recipientWorkload = fixture.workloads.find(
    (item) => item.courierId === action.recipientCourierId,
  );
  const recipient = fixture.couriers.find(
    (item) => item.courierId === action.recipientCourierId,
  );
  if (!sourceWorkload || !recipientWorkload || !recipient) {
    return [
      reason("TRANSFER_COURIER_OR_WORKLOAD_MISSING", "SYSTEM", undefined, [
        "sourceCourierId",
        "recipientCourierId",
      ]),
    ];
  }

  const selectedStops = fixture.stops.filter((stop) => action.stopIds.includes(stop.stopId));
  if (
    selectedStops.length !== action.stopIds.length ||
    selectedStops.some(
      (stop) =>
        stop.assignedCourierId !== action.sourceCourierId ||
        !sourceWorkload.remainingStopIds.includes(stop.stopId),
    )
  ) {
    reasons.push(
      reason("TRANSFER_STOP_NOT_OWNED_BY_SOURCE", "COURIER", action.sourceCourierId, [
        "stopIds",
        "remainingStopIds",
      ]),
    );
  }

  const totalStops = recipientWorkload.remainingLoad.stopCount + selectedStops.length;
  const totalWeight =
    (recipientWorkload.remainingLoad.totalWeightKg ?? 0) +
    selectedStops.reduce((total, stop) => total + (stop.load.weightKg ?? 0), 0);
  const totalVolume =
    (recipientWorkload.remainingLoad.totalVolumeLiters ?? 0) +
    selectedStops.reduce((total, stop) => total + (stop.load.volumeLiters ?? 0), 0);
  if (
    (recipient.capacity.maxStops !== undefined && totalStops > recipient.capacity.maxStops) ||
    (recipient.capacity.maxWeightKg !== undefined && totalWeight > recipient.capacity.maxWeightKg) ||
    (recipient.capacity.maxVolumeLiters !== undefined && totalVolume > recipient.capacity.maxVolumeLiters)
  ) {
    reasons.push(
      reason("TRANSFER_CAPACITY_EXCEEDED", "COURIER", recipient.courierId, [
        "remainingLoad",
        "capacity",
      ]),
    );
  }

  const segmentByStop = new Map(
    fixture.routeSegments.map((segment) => [segment.toStopId, segment]),
  );
  if (
    selectedStops.some(
      (stop) =>
        !segmentByStop.get(stop.stopId)?.legalForVehicleClasses.includes(
          recipient.vehicleClass,
        ),
    )
  ) {
    reasons.push(
      reason("TRANSFER_VEHICLE_INCOMPATIBLE", "COURIER", recipient.courierId, [
        "vehicleClass",
        "legalForVehicleClasses",
      ]),
    );
  }
  if (
    selectedStops.some(
      (stop) =>
        stop.timeWindow?.kind === "HARD" &&
        (Date.parse(stop.expectedArrivalAt) < Date.parse(stop.timeWindow.startsAt) ||
          Date.parse(stop.expectedArrivalAt) > Date.parse(stop.timeWindow.endsAt)),
    )
  ) {
    reasons.push(
      reason("TRANSFER_TIME_WINDOW_VIOLATION", "STOP", undefined, [
        "expectedArrivalAt",
        "timeWindow",
      ]),
    );
  }
  if (recipient.areaFamiliarity === "UNKNOWN") {
    reasons.push(
      reason("TRANSFER_AREA_INCOMPATIBLE", "COURIER", recipient.courierId, [
        "areaFamiliarity",
      ]),
    );
  }

  const addedMinutes = transferDuration(fixture, new Set(action.stopIds));
  if (
    Date.parse(addMinutes(recipientWorkload.projectedEndAt, addedMinutes)) >
    Date.parse(recipient.allowedShiftEndAt)
  ) {
    reasons.push(
      reason("TRANSFER_ALLOWED_END_EXCEEDED", "COURIER", recipient.courierId, [
        "projectedEndAt",
        "allowedShiftEndAt",
      ]),
    );
  }
  return reasons;
}

function applyTransfer(
  fixture: ScenarioFixture,
  action: TransferAction,
  candidateId: string,
) {
  const clone = structuredClone(fixture);
  const sourceWorkload = workloadFor(clone, action.sourceCourierId);
  const recipientWorkload = workloadFor(clone, action.recipientCourierId);
  const transferred = new Set(action.stopIds);
  const duration = transferDuration(clone, transferred);

  for (const stop of clone.stops.filter((item) => transferred.has(item.stopId))) {
    stop.assignedCourierId = action.recipientCourierId;
    stop.planId = recipientWorkload.planId;
  }
  recalculateLoad(clone, sourceWorkload, action.sourceCourierId);
  recalculateLoad(clone, recipientWorkload, action.recipientCourierId);
  sourceWorkload.projectedEndAt = addMinutes(sourceWorkload.projectedEndAt, -duration);
  recipientWorkload.projectedEndAt = addMinutes(
    recipientWorkload.projectedEndAt,
    duration,
  );
  sourceWorkload.planVersion = `${sourceWorkload.planVersion}+${candidateId}`;
  recipientWorkload.planVersion = `${recipientWorkload.planVersion}+${candidateId}`;
  return ScenarioFixtureSchema.parse(clone);
}

function snapshotFor(
  fixture: ScenarioFixture,
  courierId: string,
  candidateId: string,
  restMinutes?: number,
) {
  return evaluateSafetyBudget(fixture, courierId, {
    initialRest:
      restMinutes === undefined
        ? undefined
        : { durationMinutes: restMinutes, quality: "HIGH" },
    snapshotIdSuffix: candidateId,
  });
}

function breachOutcome(
  baseline: BreachPrediction,
  candidate: BreachPrediction,
): InterventionEvaluation["breachOutcome"] {
  const baselineBreaches = ["PREDICTED", "ALREADY_BREACHED"].includes(baseline.status);
  const candidateBreaches = ["PREDICTED", "ALREADY_BREACHED"].includes(candidate.status);
  if (baselineBreaches && !candidateBreaches) return "AVOIDED";
  if (!baselineBreaches && candidateBreaches) return "INTRODUCED";
  if (
    baseline.status === "PREDICTED" &&
    candidate.status === "PREDICTED" &&
    candidate.timeToBreachMinutes > baseline.timeToBreachMinutes
  ) {
    return "DELAYED";
  }
  return "UNCHANGED";
}

function complexity(candidate: InterventionCandidate) {
  let value = 0;
  for (const action of candidate.actions) {
    if (action.type === "REST") value += interventionConfig.complexity.rest;
    if (action.type === "TRANSFER_STOPS") {
      value +=
        interventionConfig.complexity.transferHandoff +
        interventionConfig.complexity.additionalCourier;
    }
  }
  if (candidate.actions.length > 1) value += interventionConfig.complexity.bundle;
  return clamp(value, 0, 100);
}

function score(
  safetyGain: number,
  etaDeltaMinutes: number,
  customerImpactScore: number,
  fairnessPenaltyScore: number,
  operationalComplexity: number,
) {
  const weights = interventionConfig.scoring;
  const safetyGainScore = clamp(safetyGain / 30) * 100;
  const delayCostScore = clamp(Math.max(etaDeltaMinutes, 0) / 60) * 100;
  return roundForStorage(
    weights.safetyGain * safetyGainScore -
      weights.delayCost * delayCostScore -
      weights.customerImpact * customerImpactScore -
      weights.fairnessPenalty * fairnessPenaltyScore -
      weights.operationalComplexity * operationalComplexity,
  );
}

export function evaluateIntervention(
  rawFixture: ScenarioFixture,
  rawCandidate: InterventionCandidate,
): InterventionEvaluation {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const candidate = InterventionCandidateSchema.parse(rawCandidate);
  const transfer = candidate.actions.find(
    (action): action is TransferAction => action.type === "TRANSFER_STOPS",
  );
  const rest = candidate.actions.find((action) => action.type === "REST");
  const sourceCourierId = transfer?.sourceCourierId ?? candidate.affectedCourierIds[0];
  if (!sourceCourierId) throw new Error("Candidate has no source courier");
  const sourceWorkload = workloadFor(fixture, sourceCourierId);
  const reasons: PolicyReason[] = [];

  if (
    candidate.baselinePlanId !== sourceWorkload.planId ||
    candidate.baselinePlanVersion !== sourceWorkload.planVersion
  ) {
    reasons.push(
      reason("BASELINE_PLAN_VERSION_MISMATCH", "SYSTEM", undefined, [
        "baselinePlanId",
        "baselinePlanVersion",
      ]),
    );
  }
  const preflightReasons = transfer ? transferPreflight(fixture, transfer) : [];
  reasons.push(...preflightReasons);

  const baselineSource = snapshotFor(
    fixture,
    sourceCourierId,
    `${candidate.candidateId}-baseline`,
  );
  const baselineRecipient = transfer
    ? snapshotFor(
        fixture,
        transfer.recipientCourierId,
        `${candidate.candidateId}-recipient-baseline`,
      )
    : undefined;

  const cannotMaterialize = preflightReasons.some((item) =>
    [
      "TRANSFER_COURIER_OR_WORKLOAD_MISSING",
      "TRANSFER_STOP_NOT_OWNED_BY_SOURCE",
      "TRANSFER_VEHICLE_INCOMPATIBLE",
    ].includes(item.code),
  );
  const candidateFixture = transfer && !cannotMaterialize
    ? applyTransfer(fixture, transfer, candidate.candidateId)
    : structuredClone(fixture);
  if (rest) {
    const workload = workloadFor(candidateFixture, sourceCourierId);
    workload.projectedEndAt = addMinutes(workload.projectedEndAt, rest.restMinutes);
    workload.planVersion = `${workload.planVersion}+${candidate.candidateId}`;
  }
  const candidateSource = snapshotFor(
    candidateFixture,
    sourceCourierId,
    candidate.candidateId,
    rest?.restMinutes,
  );
  const candidateRecipient = transfer
    ? snapshotFor(
        candidateFixture,
        transfer.recipientCourierId,
        candidate.candidateId,
      )
    : undefined;

  for (const [role, snapshot] of [
    ["SOURCE", candidateSource],
    ["RECIPIENT", candidateRecipient],
  ] as const) {
    if (!snapshot) continue;
    if (snapshot.breach.status === "PREDICTED" && role === "SOURCE") {
      reasons.push(
        reason(
          "BREACH_REMAINS_PREDICTED",
          "COURIER",
          snapshot.courierId,
          ["breach.status", "minimumForecastBudget"],
        ),
      );
    }
    if (snapshot.breach.status === "ALREADY_BREACHED") {
      reasons.push(
        reason("CANDIDATE_COURIER_ALREADY_BREACHED", "COURIER", snapshot.courierId, [
          "breach.status",
        ]),
      );
    }
  }

  if (transfer && baselineRecipient && candidateRecipient) {
    const recipientMinimum = minimumBudget(candidateRecipient);
    reasons.push(
      ...evaluateRiskTransferGuard({
        recipientCourierId: transfer.recipientCourierId,
        baselineMinimumBudget: minimumBudget(baselineRecipient),
        candidateMinimumBudget: recipientMinimum,
        breachStatus: candidateRecipient.breach.status,
      }),
    );
  }

  const unsupported = candidate.actions.filter(
    (action) => !["REST", "TRANSFER_STOPS"].includes(action.type),
  );
  if (unsupported.length) {
    reasons.push(
      reason("INTERVENTION_INPUT_NOT_IMPLEMENTED", "SYSTEM", undefined, [
        ...unsupported.map((action) => action.type),
      ]),
    );
  }

  const sourceBaselineWorkload = workloadFor(fixture, sourceCourierId);
  const sourceCandidateWorkload = workloadFor(candidateFixture, sourceCourierId);
  const sourceSafetyGain =
    minimumBudget(candidateSource) - minimumBudget(baselineSource);
  const etaDeltaMinutes = minutesBetween(
    sourceCandidateWorkload.projectedEndAt,
    sourceBaselineWorkload.projectedEndAt,
  );
  const operationalComplexity = complexity(candidate);
  const recipientDrop =
    baselineRecipient && candidateRecipient
      ? Math.max(0, minimumBudget(baselineRecipient) - minimumBudget(candidateRecipient))
      : 0;
  const fairnessPenaltyScore = clamp(
    recipientDrop / interventionConfig.riskTransferGuard.maximumRecipientBudgetDrop,
  ) * 100;
  const affectedCustomerCount = candidate.affectedStopIds.length ||
    (rest ? sourceWorkload.remainingStopIds.length : 0);
  const customerImpactScore = clamp(
    affectedCustomerCount / Math.max(fixture.stops.length, 1),
  ) * 100;
  const blocking = reasons.filter((item) => item.severity === "BLOCKING");
  const warnings = reasons.filter((item) => item.severity !== "BLOCKING");
  if (!blocking.length) {
    warnings.push(
      reason(
        "CONSENT_REQUIRED_BEFORE_APPLY",
        "COURIER",
        sourceCourierId,
        ["consentRequirements"],
        "INFO",
      ),
    );
  }
  const feasible = blocking.length === 0;
  const recommendationScore = feasible
    ? score(
        sourceSafetyGain,
        etaDeltaMinutes,
        customerImpactScore,
        fairnessPenaltyScore,
        operationalComplexity,
      )
    : undefined;
  const candidateSnapshots = [candidateSource, candidateRecipient].filter(
    (item): item is SafetyBudgetSnapshot => item !== undefined,
  );

  const impacts: InterventionEvaluation["courierImpacts"] = [
    {
      courierId: sourceCourierId,
      role: "SOURCE",
      baselineMinimumBudget: minimumBudget(baselineSource),
      candidateMinimumBudget: minimumBudget(candidateSource),
      budgetDelta: roundForStorage(sourceSafetyGain),
      workMinutesDelta: roundForStorage(etaDeltaMinutes),
      stopCountDelta: transfer ? -transfer.stopIds.length : 0,
      projectedEndAt: sourceCandidateWorkload.projectedEndAt,
      breach: candidateSource.breach,
    },
  ];
  if (transfer && baselineRecipient && candidateRecipient) {
    const recipientBaselineWorkload = workloadFor(fixture, transfer.recipientCourierId);
    const recipientCandidateWorkload = workloadFor(
      candidateFixture,
      transfer.recipientCourierId,
    );
    impacts.push({
      courierId: transfer.recipientCourierId,
      role: "RECIPIENT",
      baselineMinimumBudget: minimumBudget(baselineRecipient),
      candidateMinimumBudget: minimumBudget(candidateRecipient),
      budgetDelta: roundForStorage(
        minimumBudget(candidateRecipient) - minimumBudget(baselineRecipient),
      ),
      workMinutesDelta: roundForStorage(
        minutesBetween(
          recipientCandidateWorkload.projectedEndAt,
          recipientBaselineWorkload.projectedEndAt,
        ),
      ),
      stopCountDelta: transfer.stopIds.length,
      projectedEndAt: recipientCandidateWorkload.projectedEndAt,
      breach: candidateRecipient.breach,
    });
  }

  return InterventionEvaluationSchema.parse({
    evaluationId: `evaluation-${candidate.candidateId.replace("candidate-", "")}`,
    candidateId: candidate.candidateId,
    decisionId: candidate.decisionId,
    evaluatedAt: fixture.evaluatedAt,
    versionContext: {
      contractsVersion: "contracts-v1.0.0",
      safetyModelVersion: baselineSource.versionContext.safetyModelVersion,
      safetyConfigVersion: baselineSource.versionContext.safetyConfigVersion,
      interventionPolicyVersion: interventionConfig.metadata.policyVersion,
      planVersion: sourceCandidateWorkload.planVersion,
    },
    feasibility: feasible
      ? { status: "FEASIBLE", warnings }
      : { status: "INFEASIBLE", reasons: blocking },
    baselineSnapshotId: baselineSource.snapshotId,
    candidateSnapshotIds: candidateSnapshots.map((snapshot) => snapshot.snapshotId),
    safetyGain: roundForStorage(sourceSafetyGain),
    breachOutcome: breachOutcome(baselineSource.breach, candidateSource.breach),
    breachDelayMinutes:
      baselineSource.breach.status === "PREDICTED" &&
      candidateSource.breach.status === "PREDICTED"
        ? roundForStorage(
            candidateSource.breach.timeToBreachMinutes -
              baselineSource.breach.timeToBreachMinutes,
          )
        : undefined,
    etaDeltaMinutes: roundForStorage(etaDeltaMinutes),
    maxCustomerEtaDeltaMinutes: Math.max(0, rest?.restMinutes ?? 0),
    affectedCustomerCount,
    operationalComplexity,
    fairnessPenaltyScore: roundForStorage(fairnessPenaltyScore),
    customerImpactScore: roundForStorage(customerImpactScore),
    recommendationScore,
    courierImpacts: impacts,
    consentRequirements: candidate.affectedCourierIds.map((courierId) => ({
      courierId,
      required: true,
      status: "NOT_REQUESTED" as const,
      candidateId: candidate.candidateId,
    })),
    reasons: [...blocking, ...warnings],
  });
}

function otherCourierDrop(evaluation: InterventionEvaluation) {
  return Math.max(
    0,
    ...evaluation.courierImpacts
      .filter((impact) => impact.role !== "SOURCE")
      .map((impact) => -impact.budgetDelta),
  );
}

export function rankInterventions(evaluations: InterventionEvaluation[]) {
  const feasible = evaluations
    .filter((evaluation) => evaluation.feasibility.status === "FEASIBLE")
    .sort((left, right) => {
      const scoreDelta =
        (right.recommendationScore ?? Number.NEGATIVE_INFINITY) -
        (left.recommendationScore ?? Number.NEGATIVE_INFINITY);
      if (Math.abs(scoreDelta) > interventionConfig.scoring.tieTolerance) {
        return scoreDelta;
      }
      const leftMinimum = Math.min(
        ...left.courierImpacts.map((impact) => impact.candidateMinimumBudget),
      );
      const rightMinimum = Math.min(
        ...right.courierImpacts.map((impact) => impact.candidateMinimumBudget),
      );
      return (
        rightMinimum - leftMinimum ||
        otherCourierDrop(left) - otherCourierDrop(right) ||
        left.maxCustomerEtaDeltaMinutes - right.maxCustomerEtaDeltaMinutes ||
        left.operationalComplexity - right.operationalComplexity ||
        left.consentRequirements.length - right.consentRequirements.length ||
        left.candidateId.localeCompare(right.candidateId)
      );
    })
    .map((evaluation, index) =>
      InterventionEvaluationSchema.parse({ ...evaluation, rank: index + 1 }),
    );
  const infeasible = evaluations.filter(
    (evaluation) => evaluation.feasibility.status !== "FEASIBLE",
  );
  return [...feasible, ...infeasible];
}

export function recommendIntervention(evaluations: InterventionEvaluation[]) {
  const ranked = rankInterventions(evaluations);
  const recommendation = ranked.find(
    (evaluation) => evaluation.feasibility.status === "FEASIBLE",
  );
  return recommendation
    ? { status: "RECOMMENDED" as const, recommendation, evaluations: ranked }
    : { status: "NO_SAFE_OPTION" as const, evaluations: ranked };
}
