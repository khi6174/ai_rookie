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
type RestAction = Extract<InterventionCandidate["actions"][number], { type: "REST" }>;
type ReorderAction = Extract<InterventionCandidate["actions"][number], { type: "REORDER_STOPS" }>;
type SaferRouteAction = Extract<InterventionCandidate["actions"][number], { type: "SAFER_ROUTE" }>;
type SafeDelayAction = Extract<InterventionCandidate["actions"][number], { type: "SAFE_DELAY" }>;

const addMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

const minutesBetween = (later: string, earlier: string) =>
  (Date.parse(later) - Date.parse(earlier)) / 60_000;

const candidatePlanVersion = (current: string, candidateId: string) =>
  current.includes(`+${candidateId}`) ? current : `${current}+${candidateId}`;

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

const sameStringSet = (left: string[], right: string[]) =>
  left.length === right.length &&
  [...left].sort().join("|") === [...right].sort().join("|");

function rebuildSchedule(
  fixture: ScenarioFixture,
  courierId: string,
  orderedStopIds: string[],
  scheduleStartAt?: string,
) {
  const segmentByStop = new Map(
    fixture.routeSegments.map((segment) => [segment.toStopId, segment]),
  );
  const stopById = new Map(fixture.stops.map((stop) => [stop.stopId, stop]));
  const relevantStopIds = new Set(orderedStopIds);
  const inferredStartAt = fixture.routeSegments
    .filter((segment) => relevantStopIds.has(segment.toStopId))
    .map((segment) => segment.expectedStartAt)
    .sort()[0];
  const startsAt = scheduleStartAt ?? inferredStartAt ?? fixture.evaluatedAt;
  let elapsedMinutes = 0;
  for (let index = 0; index < orderedStopIds.length; index += 1) {
    const stopId = orderedStopIds[index];
    const stop = stopById.get(stopId);
    const segment = segmentByStop.get(stopId);
    if (!stop || !segment) throw new Error(`Cannot rebuild route for stop ${stopId}`);
    segment.sequence = index + 1;
    segment.fromStopId = index === 0 ? undefined : orderedStopIds[index - 1];
    segment.expectedStartAt = addMinutes(startsAt, elapsedMinutes);
    elapsedMinutes += segment.durationMinutes;
    segment.expectedEndAt = addMinutes(startsAt, elapsedMinutes);
    stop.sequence = index + 1;
    stop.expectedArrivalAt = segment.expectedEndAt;
    elapsedMinutes += stop.expectedServiceMinutes;
  }
  workloadFor(fixture, courierId).remainingStopIds = [...orderedStopIds];
  return elapsedMinutes;
}

function reorderPreflight(
  fixture: ScenarioFixture,
  action: ReorderAction,
  catalogFixture: ScenarioFixture = fixture,
): { reasons: PolicyReason[]; blockingInputs: string[] } {
  const policy = catalogFixture.interventionInputs?.reorderPolicies.find(
    (item) => item.courierId === action.courierId,
  );
  if (!policy) {
    return { reasons: [], blockingInputs: [`reorderPolicy:${action.courierId}`] };
  }
  const reasons: PolicyReason[] = [];
  const baselineOrder = workloadFor(fixture, action.courierId).remainingStopIds;
  if (!sameStringSet(action.orderedStopIds, baselineOrder)) {
    reasons.push(
      reason("REORDER_STOP_SET_MISMATCH", "COURIER", action.courierId, [
        "orderedStopIds",
        "remainingStopIds",
      ]),
    );
  }
  for (const fixedStopId of policy.fixedStopIds) {
    if (baselineOrder.indexOf(fixedStopId) !== action.orderedStopIds.indexOf(fixedStopId)) {
      reasons.push(
        reason("REORDER_FIXED_STOP_MOVED", "STOP", fixedStopId, [
          "fixedStopIds",
          "orderedStopIds",
        ]),
      );
    }
  }
  const routeStops = new Set(fixture.routeSegments.map((segment) => segment.toStopId));
  if (action.orderedStopIds.some((stopId) => !routeStops.has(stopId))) {
    reasons.push(
      reason("REORDER_ROUTE_DISCONNECTED", "ROUTE", undefined, [
        "orderedStopIds",
        "routeSegments",
      ]),
    );
  }
  return { reasons, blockingInputs: [] };
}

function applyReorder(
  fixture: ScenarioFixture,
  action: ReorderAction,
  candidateId: string,
) {
  const clone = structuredClone(fixture);
  const scheduleStartAt = clone.routeSegments
    .filter((segment) => action.orderedStopIds.includes(segment.toStopId))
    .map((segment) => segment.expectedStartAt)
    .sort()[0];
  rebuildSchedule(
    clone,
    action.courierId,
    action.orderedStopIds,
    scheduleStartAt,
  );
  const workload = workloadFor(clone, action.courierId);
  workload.planVersion = candidatePlanVersion(workload.planVersion, candidateId);
  delete clone.interventionInputs;
  return ScenarioFixtureSchema.parse(clone);
}

function saferRoutePreflight(
  fixture: ScenarioFixture,
  action: SaferRouteAction,
  catalogFixture: ScenarioFixture = fixture,
): {
  reasons: PolicyReason[];
  blockingInputs: string[];
  alternative?: NonNullable<ScenarioFixture["interventionInputs"]>["saferRouteAlternatives"][number];
} {
  const alternative = catalogFixture.interventionInputs?.saferRouteAlternatives.find(
    (item) =>
      item.courierId === action.courierId &&
      item.replacementRouteId === action.replacementRouteId,
  );
  if (!alternative) {
    return {
      reasons: [],
      blockingInputs: [`saferRouteAlternative:${action.replacementRouteId}`],
    };
  }
  const reasons: PolicyReason[] = [];
  if (!sameStringSet(action.replacedSegmentIds, alternative.replacedSegmentIds)) {
    reasons.push(
      reason("SAFER_ROUTE_SEGMENT_SET_MISMATCH", "ROUTE", action.replacementRouteId, [
        "replacedSegmentIds",
        "replacementRouteId",
      ]),
    );
  }
  return { reasons, blockingInputs: [], alternative };
}

function applySaferRoute(
  fixture: ScenarioFixture,
  action: SaferRouteAction,
  candidateId: string,
  alternative: NonNullable<
    ReturnType<typeof saferRoutePreflight>["alternative"]
  >,
) {
  const clone = structuredClone(fixture);
  const currentStopIds = workloadFor(clone, action.courierId).remainingStopIds;
  const scheduleStartAt = clone.routeSegments
    .filter((segment) => currentStopIds.includes(segment.toStopId))
    .map((segment) => segment.expectedStartAt)
    .sort()[0];
  const replaced = new Set(action.replacedSegmentIds);
  const originalDuration = clone.routeSegments
    .filter((segment) => replaced.has(segment.segmentId))
    .reduce((total, segment) => total + segment.durationMinutes, 0);
  const replacementDuration = alternative.replacementSegments.reduce(
    (total, segment) => total + segment.durationMinutes,
    0,
  );
  clone.routeSegments = [
    ...clone.routeSegments.filter((segment) => !replaced.has(segment.segmentId)),
    ...structuredClone(alternative.replacementSegments),
  ];
  const workload = workloadFor(clone, action.courierId);
  rebuildSchedule(
    clone,
    action.courierId,
    workload.remainingStopIds,
    scheduleStartAt,
  );
  workload.projectedEndAt = addMinutes(
    workload.projectedEndAt,
    replacementDuration - originalDuration,
  );
  workload.planVersion = candidatePlanVersion(workload.planVersion, candidateId);
  delete clone.interventionInputs;
  return ScenarioFixtureSchema.parse(clone);
}

function safeDelayPreflight(
  fixture: ScenarioFixture,
  action: SafeDelayAction,
  catalogFixture: ScenarioFixture = fixture,
): { reasons: PolicyReason[]; blockingInputs: string[] } {
  const policy = catalogFixture.interventionInputs?.safeDelayPolicies.find(
    (item) => item.courierId === action.courierId,
  );
  if (!policy) {
    return { reasons: [], blockingInputs: [`safeDelayPolicy:${action.courierId}`] };
  }
  const reasons: PolicyReason[] = [];
  if (![3, 5, 8].includes(action.stopIds.length)) {
    reasons.push(
      reason("SAFE_DELAY_STOP_COUNT_NOT_ALLOWED", "COURIER", action.courierId, [
        "stopIds",
      ]),
    );
  }
  const selectedStops = fixture.stops.filter((stop) => action.stopIds.includes(stop.stopId));
  if (
    selectedStops.length !== action.stopIds.length ||
    action.stopIds.some((stopId) => !policy.delayableStopIds.includes(stopId))
  ) {
    reasons.push(
      reason("SAFE_DELAY_STOP_NOT_DELAYABLE", "STOP", undefined, [
        "delayableStopIds",
        "stopIds",
      ]),
    );
  }
  if (selectedStops.some((stop) => stop.priority === "NON_DELAYABLE")) {
    reasons.push(
      reason("SAFE_DELAY_NON_DELAYABLE_STOP", "STOP", undefined, ["priority"]),
    );
  }
  const delayMinutes = selectedStops.map((stop) =>
    minutesBetween(action.delayedUntil, stop.expectedArrivalAt),
  );
  if (delayMinutes.some((minutes) => minutes <= 0)) {
    reasons.push(
      reason("SAFE_DELAY_MUST_MOVE_ETA_LATER", "STOP", undefined, [
        "delayedUntil",
        "expectedArrivalAt",
      ]),
    );
  }
  if (delayMinutes.some((minutes) => minutes > policy.maximumDelayMinutes)) {
    reasons.push(
      reason("SAFE_DELAY_MAXIMUM_EXCEEDED", "CUSTOMER", undefined, [
        "delayedUntil",
        "maximumDelayMinutes",
      ]),
    );
  }
  if (!policy.customerNoticeAvailable) {
    reasons.push(
      reason("SAFE_DELAY_CUSTOMER_NOTICE_UNAVAILABLE", "CUSTOMER", undefined, [
        "customerNoticeAvailable",
      ]),
    );
  }
  return { reasons, blockingInputs: [] };
}

function applyRest(
  fixture: ScenarioFixture,
  courierId: string,
  action: RestAction,
  candidateId: string,
) {
  const clone = structuredClone(fixture);
  const workload = workloadFor(clone, courierId);
  const remainingStopIds = new Set(workload.remainingStopIds);
  for (const stop of clone.stops.filter((item) => remainingStopIds.has(item.stopId))) {
    stop.expectedArrivalAt = addMinutes(stop.expectedArrivalAt, action.restMinutes);
  }
  for (const segment of clone.routeSegments.filter((item) =>
    remainingStopIds.has(item.toStopId),
  )) {
    segment.expectedStartAt = addMinutes(
      segment.expectedStartAt,
      action.restMinutes,
    );
    segment.expectedEndAt = addMinutes(segment.expectedEndAt, action.restMinutes);
  }
  workload.projectedEndAt = addMinutes(
    workload.projectedEndAt,
    action.restMinutes,
  );
  workload.planVersion = candidatePlanVersion(
    workload.planVersion,
    candidateId,
  );
  return ScenarioFixtureSchema.parse(clone);
}

function applySafeDelay(
  fixture: ScenarioFixture,
  action: SafeDelayAction,
  candidateId: string,
) {
  const clone = structuredClone(fixture);
  const delayed = new Set(action.stopIds);
  const workload = workloadFor(clone, action.courierId);
  const delayedDuration = transferDuration(clone, delayed);
  for (const stop of clone.stops.filter((item) => delayed.has(item.stopId))) {
    stop.status = "DELAYED";
    stop.expectedArrivalAt = action.delayedUntil;
  }
  recalculateLoad(clone, workload, action.courierId);
  const delayedCompletion = addMinutes(action.delayedUntil, delayedDuration);
  if (Date.parse(delayedCompletion) > Date.parse(workload.projectedEndAt)) {
    workload.projectedEndAt = delayedCompletion;
  }
  workload.planVersion = candidatePlanVersion(workload.planVersion, candidateId);
  delete clone.interventionInputs;
  return ScenarioFixtureSchema.parse(clone);
}

function scheduleConstraintReasons(
  fixture: ScenarioFixture,
  courierId: string,
): PolicyReason[] {
  const workload = workloadFor(fixture, courierId);
  const courier = courierFor(fixture, courierId);
  const remaining = new Set(workload.remainingStopIds);
  const reasons: PolicyReason[] = [];
  for (const stop of fixture.stops.filter((item) => remaining.has(item.stopId))) {
    if (
      stop.timeWindow?.kind === "HARD" &&
      (Date.parse(stop.expectedArrivalAt) < Date.parse(stop.timeWindow.startsAt) ||
        Date.parse(stop.expectedArrivalAt) > Date.parse(stop.timeWindow.endsAt))
    ) {
      reasons.push(
        reason("CANDIDATE_TIME_WINDOW_VIOLATION", "STOP", stop.stopId, [
          "expectedArrivalAt",
          "timeWindow",
        ]),
      );
    }
  }
  if (Date.parse(workload.projectedEndAt) > Date.parse(courier.allowedShiftEndAt)) {
    reasons.push(
      reason("CANDIDATE_ALLOWED_END_EXCEEDED", "COURIER", courierId, [
        "projectedEndAt",
        "allowedShiftEndAt",
      ]),
    );
  }
  return reasons;
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
  sourceWorkload.planVersion = candidatePlanVersion(
    sourceWorkload.planVersion,
    candidateId,
  );
  recipientWorkload.planVersion = candidatePlanVersion(
    recipientWorkload.planVersion,
    candidateId,
  );
  delete clone.interventionInputs;
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
    if (action.type === "REORDER_STOPS") {
      value += interventionConfig.complexity.reorder;
    }
    if (action.type === "SAFER_ROUTE") {
      value += interventionConfig.complexity.saferRoute;
    }
    if (action.type === "SAFE_DELAY") {
      value += interventionConfig.complexity.safeDelay;
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

function maximumCustomerEtaDelta(
  baseline: ScenarioFixture,
  candidate: ScenarioFixture,
  affectedStopIds: string[],
  restMinutes = 0,
) {
  const candidateStops = new Map(candidate.stops.map((stop) => [stop.stopId, stop]));
  const deltas = affectedStopIds.map((stopId) => {
    const before = baseline.stops.find((stop) => stop.stopId === stopId);
    const after = candidateStops.get(stopId);
    return before && after
      ? Math.max(0, minutesBetween(after.expectedArrivalAt, before.expectedArrivalAt))
      : 0;
  });
  return Math.max(restMinutes, 0, ...deltas);
}

const materializationBlockingCodes = new Set([
  "TRANSFER_COURIER_OR_WORKLOAD_MISSING",
  "TRANSFER_STOP_NOT_OWNED_BY_SOURCE",
  "TRANSFER_VEHICLE_INCOMPATIBLE",
  "REORDER_STOP_SET_MISMATCH",
  "REORDER_FIXED_STOP_MOVED",
  "REORDER_ROUTE_DISCONNECTED",
  "SAFER_ROUTE_SEGMENT_SET_MISMATCH",
  "SAFE_DELAY_STOP_NOT_DELAYABLE",
  "SAFE_DELAY_NON_DELAYABLE_STOP",
]);

const hasMaterializationBlocker = (reasons: PolicyReason[]) =>
  reasons.some((item) => materializationBlockingCodes.has(item.code));

function sourceCourierIdForCandidate(candidate: InterventionCandidate) {
  for (const action of candidate.actions) {
    if (action.type === "TRANSFER_STOPS") return action.sourceCourierId;
    if (action.type !== "REST") return action.courierId;
  }
  return candidate.affectedCourierIds[0];
}

function materializeCandidatePlan(
  fixture: ScenarioFixture,
  candidate: InterventionCandidate,
  sourceCourierId: string,
) {
  const reasons: PolicyReason[] = [];
  const blockingInputs: string[] = [];
  let candidateFixture = structuredClone(fixture);
  let cannotMaterialize = false;
  for (const action of candidate.actions) {
    if (cannotMaterialize) break;
    if (action.type === "REST") {
      candidateFixture = applyRest(
        candidateFixture,
        sourceCourierId,
        action,
        candidate.candidateId,
      );
      continue;
    }
    if (action.type === "TRANSFER_STOPS") {
      const actionReasons = transferPreflight(candidateFixture, action);
      reasons.push(...actionReasons);
      cannotMaterialize = hasMaterializationBlocker(actionReasons);
      if (!cannotMaterialize) {
        candidateFixture = applyTransfer(
          candidateFixture,
          action,
          candidate.candidateId,
        );
      }
      continue;
    }
    if (action.type === "REORDER_STOPS") {
      const check = reorderPreflight(candidateFixture, action, fixture);
      reasons.push(...check.reasons);
      blockingInputs.push(...check.blockingInputs);
      cannotMaterialize =
        check.blockingInputs.length > 0 ||
        hasMaterializationBlocker(check.reasons);
      if (!cannotMaterialize) {
        candidateFixture = applyReorder(
          candidateFixture,
          action,
          candidate.candidateId,
        );
      }
      continue;
    }
    if (action.type === "SAFER_ROUTE") {
      const check = saferRoutePreflight(candidateFixture, action, fixture);
      reasons.push(...check.reasons);
      blockingInputs.push(...check.blockingInputs);
      cannotMaterialize =
        check.blockingInputs.length > 0 ||
        hasMaterializationBlocker(check.reasons);
      if (!cannotMaterialize && check.alternative) {
        candidateFixture = applySaferRoute(
          candidateFixture,
          action,
          candidate.candidateId,
          check.alternative,
        );
      }
      continue;
    }
    if (action.type === "SAFE_DELAY") {
      const check = safeDelayPreflight(candidateFixture, action, fixture);
      reasons.push(...check.reasons);
      blockingInputs.push(...check.blockingInputs);
      cannotMaterialize =
        check.blockingInputs.length > 0 ||
        hasMaterializationBlocker(check.reasons);
      if (!cannotMaterialize) {
        candidateFixture = applySafeDelay(
          candidateFixture,
          action,
          candidate.candidateId,
        );
      }
    }
  }
  return { candidateFixture, reasons, blockingInputs, cannotMaterialize };
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
  const safeDelay = candidate.actions.find(
    (action): action is SafeDelayAction => action.type === "SAFE_DELAY",
  );
  const sourceCourierId = sourceCourierIdForCandidate(candidate);
  if (!sourceCourierId) throw new Error("Candidate has no source courier");
  const sourceWorkload = workloadFor(fixture, sourceCourierId);
  const reasons: PolicyReason[] = [];
  const blockingInputs: string[] = [];

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

  const materialized = materializeCandidatePlan(
    fixture,
    candidate,
    sourceCourierId,
  );
  const { candidateFixture, cannotMaterialize } = materialized;
  reasons.push(...materialized.reasons);
  blockingInputs.push(...materialized.blockingInputs);
  if (!cannotMaterialize) {
    reasons.push(...scheduleConstraintReasons(candidateFixture, sourceCourierId));
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

  if (!cannotMaterialize) {
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
  }

  if (
    !cannotMaterialize &&
    baselineSource.breach.status === "NO_BREACH_IN_HORIZON" &&
    minimumBudget(candidateSource) < minimumBudget(baselineSource)
  ) {
    reasons.push(
      reason("SAFETY_NOT_IMPROVED", "COURIER", sourceCourierId, [
        "baselineMinimumBudget",
        "candidateMinimumBudget",
      ]),
    );
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
  const uniqueBlockingInputs = [...new Set(blockingInputs)];
  if (!blocking.length && !uniqueBlockingInputs.length) {
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
  const feasible = blocking.length === 0 && uniqueBlockingInputs.length === 0;
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
      stopCountDelta: transfer
        ? -transfer.stopIds.length
        : safeDelay
          ? -safeDelay.stopIds.length
          : 0,
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
    feasibility: uniqueBlockingInputs.length
      ? { status: "NEEDS_DATA", blockingInputs: uniqueBlockingInputs }
      : feasible
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
    maxCustomerEtaDeltaMinutes: roundForStorage(
      maximumCustomerEtaDelta(
        fixture,
        candidateFixture,
        candidate.affectedStopIds,
        rest?.restMinutes,
      ),
    ),
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

export function materializeInterventionPlan(
  rawFixture: ScenarioFixture,
  rawCandidate: InterventionCandidate,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const candidate = InterventionCandidateSchema.parse(rawCandidate);
  const evaluation = evaluateIntervention(fixture, candidate);
  if (evaluation.feasibility.status !== "FEASIBLE") {
    return {
      status: "NOT_MATERIALIZED" as const,
      evaluation,
    };
  }
  const sourceCourierId = sourceCourierIdForCandidate(candidate);
  if (!sourceCourierId) throw new Error("Candidate has no source courier");
  const result = materializeCandidatePlan(fixture, candidate, sourceCourierId);
  if (
    result.cannotMaterialize ||
    result.blockingInputs.length ||
    hasMaterializationBlocker(result.reasons)
  ) {
    throw new Error("Feasible evaluation could not be materialized");
  }
  const plan = structuredClone(result.candidateFixture);
  delete plan.interventionInputs;
  return {
    status: "MATERIALIZED" as const,
    evaluation,
    plan: ScenarioFixtureSchema.parse(plan),
  };
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
