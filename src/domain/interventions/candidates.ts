import {
  InterventionCandidateSchema,
  ScenarioFixtureSchema,
  type InterventionAction,
  type InterventionCandidate,
  type ScenarioFixture,
} from "../contracts";
import { interventionConfig } from "./config";

type RestMinutes = 10 | 15 | 20 | 30;

type TransferInput = {
  sourceCourierId: string;
  recipientCourierId: string;
  stopIds: string[];
  handoffLocationId?: string;
  plannedHandoffAt?: string;
};

type TransferReorderInput = TransferInput & {
  orderedStopIds: string[];
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function candidateId(decisionId: string, actions: InterventionAction[]) {
  return `candidate-${fnv1a(
    stableStringify({
      decisionId,
      actions,
      policyVersion: interventionConfig.metadata.policyVersion,
    }),
  )}`;
}

function sourcePlan(fixture: ScenarioFixture, courierId: string) {
  const workload = fixture.workloads.find((item) => item.courierId === courierId);
  if (!workload) throw new Error(`Missing workload for ${courierId}`);
  return workload;
}

function normalizeStops(fixture: ScenarioFixture, stopIds: string[]) {
  const order = new Map(fixture.stops.map((stop) => [stop.stopId, stop.sequence]));
  return [...new Set(stopIds)].sort(
    (left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

function buildCandidate(
  fixture: ScenarioFixture,
  decisionId: string,
  sourceCourierId: string,
  actions: InterventionAction[],
  affectedCourierIds: string[],
  affectedStopIds: string[],
): InterventionCandidate {
  const baseline = sourcePlan(fixture, sourceCourierId);
  return InterventionCandidateSchema.parse({
    candidateId: candidateId(decisionId, actions),
    decisionId,
    baselinePlanId: baseline.planId,
    baselinePlanVersion: baseline.planVersion,
    generatedAt: fixture.evaluatedAt,
    generatorVersion: interventionConfig.metadata.generatorVersion,
    actions,
    affectedCourierIds: [...new Set(affectedCourierIds)],
    affectedStopIds: normalizeStops(fixture, affectedStopIds),
    generationReasons: ["BASELINE_BREACH_PREDICTED"],
  });
}

export function createRestCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  courierId: string,
  restMinutes: RestMinutes,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const actions: InterventionAction[] = [
    {
      type: "REST",
      restMinutes,
      restLocationId: `${fixture.fixtureId}-rest-area`,
      plannedStartAt: fixture.evaluatedAt,
    },
  ];
  return buildCandidate(fixture, decisionId, courierId, actions, [courierId], []);
}

export function createTransferCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  input: TransferInput,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const stopIds = normalizeStops(fixture, input.stopIds);
  const actions: InterventionAction[] = [
    {
      type: "TRANSFER_STOPS",
      sourceCourierId: input.sourceCourierId,
      recipientCourierId: input.recipientCourierId,
      stopIds,
      handoffLocationId:
        input.handoffLocationId ?? `${fixture.fixtureId}-handoff-area`,
      plannedHandoffAt: input.plannedHandoffAt ?? fixture.evaluatedAt,
    },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    input.sourceCourierId,
    actions,
    [input.sourceCourierId, input.recipientCourierId],
    stopIds,
  );
}

export function createRestTransferCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  restMinutes: RestMinutes,
  input: TransferInput,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const stopIds = normalizeStops(fixture, input.stopIds);
  const actions: InterventionAction[] = [
    {
      type: "REST",
      restMinutes,
      restLocationId: `${fixture.fixtureId}-rest-area`,
      plannedStartAt: fixture.evaluatedAt,
    },
    {
      type: "TRANSFER_STOPS",
      sourceCourierId: input.sourceCourierId,
      recipientCourierId: input.recipientCourierId,
      stopIds,
      handoffLocationId:
        input.handoffLocationId ?? `${fixture.fixtureId}-handoff-area`,
      plannedHandoffAt: input.plannedHandoffAt ?? fixture.evaluatedAt,
    },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    input.sourceCourierId,
    actions,
    [input.sourceCourierId, input.recipientCourierId],
    stopIds,
  );
}

export function createRestReorderCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  restMinutes: RestMinutes,
  courierId: string,
  orderedStopIds: string[],
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const normalizedOrder = [...orderedStopIds];
  const actions: InterventionAction[] = [
    {
      type: "REST",
      restMinutes,
      restLocationId: `${fixture.fixtureId}-rest-area`,
      plannedStartAt: fixture.evaluatedAt,
    },
    { type: "REORDER_STOPS", courierId, orderedStopIds: normalizedOrder },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    courierId,
    actions,
    [courierId],
    normalizedOrder,
  );
}

export function createRestSaferRouteCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  restMinutes: RestMinutes,
  courierId: string,
  replacementRouteId: string,
  replacedSegmentIds: string[],
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const alternative = fixture.interventionInputs?.saferRouteAlternatives.find(
    (item) =>
      item.courierId === courierId &&
      item.replacementRouteId === replacementRouteId,
  );
  const affectedStopIds = alternative?.replacementSegments.map(
    (segment) => segment.toStopId,
  ) ?? [];
  const actions: InterventionAction[] = [
    {
      type: "REST",
      restMinutes,
      restLocationId: `${fixture.fixtureId}-rest-area`,
      plannedStartAt: fixture.evaluatedAt,
    },
    {
      type: "SAFER_ROUTE",
      courierId,
      replacementRouteId,
      replacedSegmentIds: [...new Set(replacedSegmentIds)].sort(),
    },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    courierId,
    actions,
    [courierId],
    affectedStopIds,
  );
}

export function createTransferReorderCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  input: TransferReorderInput,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const stopIds = normalizeStops(fixture, input.stopIds);
  const orderedStopIds = [...input.orderedStopIds];
  const actions: InterventionAction[] = [
    {
      type: "TRANSFER_STOPS",
      sourceCourierId: input.sourceCourierId,
      recipientCourierId: input.recipientCourierId,
      stopIds,
      handoffLocationId:
        input.handoffLocationId ?? `${fixture.fixtureId}-handoff-area`,
      plannedHandoffAt: input.plannedHandoffAt ?? fixture.evaluatedAt,
    },
    {
      type: "REORDER_STOPS",
      courierId: input.sourceCourierId,
      orderedStopIds,
    },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    input.sourceCourierId,
    actions,
    [input.sourceCourierId, input.recipientCourierId],
    [...stopIds, ...orderedStopIds],
  );
}

export function createRestSafeDelayCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  restMinutes: RestMinutes,
  courierId: string,
  stopIds: string[],
  delayedUntil: string,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const normalizedStops = normalizeStops(fixture, stopIds);
  const actions: InterventionAction[] = [
    {
      type: "REST",
      restMinutes,
      restLocationId: `${fixture.fixtureId}-rest-area`,
      plannedStartAt: fixture.evaluatedAt,
    },
    {
      type: "SAFE_DELAY",
      courierId,
      stopIds: normalizedStops,
      delayedUntil,
    },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    courierId,
    actions,
    [courierId],
    normalizedStops,
  );
}

export function createSaferRouteSafeDelayCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  courierId: string,
  replacementRouteId: string,
  replacedSegmentIds: string[],
  stopIds: string[],
  delayedUntil: string,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const normalizedStops = normalizeStops(fixture, stopIds);
  const alternative = fixture.interventionInputs?.saferRouteAlternatives.find(
    (item) =>
      item.courierId === courierId &&
      item.replacementRouteId === replacementRouteId,
  );
  const affectedRouteStops = alternative?.replacementSegments.map(
    (segment) => segment.toStopId,
  ) ?? [];
  const actions: InterventionAction[] = [
    {
      type: "SAFER_ROUTE",
      courierId,
      replacementRouteId,
      replacedSegmentIds: [...new Set(replacedSegmentIds)].sort(),
    },
    {
      type: "SAFE_DELAY",
      courierId,
      stopIds: normalizedStops,
      delayedUntil,
    },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    courierId,
    actions,
    [courierId],
    [...affectedRouteStops, ...normalizedStops],
  );
}

export function createReorderCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  courierId: string,
  orderedStopIds: string[],
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const normalizedOrder = orderedStopIds.map((stopId) => stopId);
  const actions: InterventionAction[] = [
    { type: "REORDER_STOPS", courierId, orderedStopIds: normalizedOrder },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    courierId,
    actions,
    [courierId],
    normalizedOrder,
  );
}

export function createSaferRouteCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  courierId: string,
  replacementRouteId: string,
  replacedSegmentIds: string[],
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const alternative = fixture.interventionInputs?.saferRouteAlternatives.find(
    (item) =>
      item.courierId === courierId &&
      item.replacementRouteId === replacementRouteId,
  );
  const affectedStopIds = alternative?.replacementSegments.map(
    (segment) => segment.toStopId,
  ) ?? [];
  const actions: InterventionAction[] = [
    {
      type: "SAFER_ROUTE",
      courierId,
      replacementRouteId,
      replacedSegmentIds: [...new Set(replacedSegmentIds)].sort(),
    },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    courierId,
    actions,
    [courierId],
    affectedStopIds,
  );
}

export function createSafeDelayCandidate(
  rawFixture: ScenarioFixture,
  decisionId: string,
  courierId: string,
  stopIds: string[],
  delayedUntil: string,
) {
  const fixture = ScenarioFixtureSchema.parse(rawFixture);
  const normalizedStops = normalizeStops(fixture, stopIds);
  const actions: InterventionAction[] = [
    { type: "SAFE_DELAY", courierId, stopIds: normalizedStops, delayedUntil },
  ];
  return buildCandidate(
    fixture,
    decisionId,
    courierId,
    actions,
    [courierId],
    normalizedStops,
  );
}

export function generateRestCandidates(
  fixture: ScenarioFixture,
  decisionId: string,
  courierId: string,
) {
  return ([10, 15, 20, 30] as const).map((minutes) =>
    createRestCandidate(fixture, decisionId, courierId, minutes),
  );
}

export function generateTransferCandidates(
  fixture: ScenarioFixture,
  decisionId: string,
  input: Omit<TransferInput, "stopIds"> & { transferClusters: string[][] },
) {
  const allowedCounts = new Set([4, 8, 12]);
  const candidates = input.transferClusters
    .filter((cluster) => allowedCounts.has(new Set(cluster).size))
    .map((stopIds) =>
      createTransferCandidate(fixture, decisionId, {
        ...input,
        stopIds,
      }),
    );
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.candidateId)) return false;
      seen.add(candidate.candidateId);
      return true;
    })
    .slice(0, 3);
}
