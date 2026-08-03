import {
  ScenarioFixtureSchema,
  type AreaRiskProfile,
  type CourierState,
  type DeliveryStop,
  type Provenance,
  type RouteSegment,
  type ScenarioFixture,
  type WeatherState,
  type WorkloadState,
} from "../../domain/contracts";
import {
  DailyOperationsSnapshotSchema,
  hashDailyOperationsPackage,
  validateDailyOperationsPackage,
  type DailyOperationsPackage,
  type DailyOperationsSnapshot,
  type OperationsValidationIssue,
  type SyntheticOperationsParentRecord,
} from "../../domain/operations";
import {
  findSyntheticCourierDirectoryEntry,
  syntheticCourierDirectoryVersion,
} from "../../../server/synthetic-courier-directory.mjs";

const minute = 60_000;

function atOffset(value: string, milliseconds: number) {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}
function alignToPackageEvaluation(
  value: string,
  record: SyntheticOperationsParentRecord,
  operationsPackage: DailyOperationsPackage,
) {
  const offset =
    Date.parse(operationsPackage.evaluatedAt) -
    Date.parse(record.shift.evaluatedAt);
  return atOffset(value, offset);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sourceBudget(record: SyntheticOperationsParentRecord) {
  const conditions = record.operatingConditions;
  const heatLoad = Math.max(0, conditions.apparentTemperatureC - 30) * 1.1;
  const visibilityLoad =
    conditions.visibilityMeters >= 3_000
      ? 0
      : ((3_000 - conditions.visibilityMeters) / 3_000) * 8;
  const packageDerivedBudget =
    76 -
    record.shift.continuousWorkMinutes * 0.08 -
    conditions.rainfallMmPerHour * 0.45 -
    conditions.maxSlopePercent * 0.35 -
    conditions.stairsStopCount * 0.7 -
    heatLoad -
    visibilityLoad;
  const distributionAnchor = findSyntheticCourierDirectoryEntry(
    record.courier.courierId,
  )?.initialSafetyBudget;
  const anchoredBudget = distributionAnchor === undefined
    ? packageDerivedBudget
    : packageDerivedBudget + (distributionAnchor - 57) * 0.8;
  return Number(
    clamp(anchoredBudget, 31, 90).toFixed(2),
  );
}

function riskFactors(record: SyntheticOperationsParentRecord) {
  const conditions = record.operatingConditions;
  return {
    narrowRoadFactor:
      record.scenario === "LOW_VISIBILITY"
        ? 0.78
        : record.scenario === "RAIN_SLOPE"
          ? 0.68
          : 0.48,
    parkingDifficultyFactor: clamp(
      0.42 + conditions.stairsStopCount * 0.04,
      0,
      0.86,
    ),
    incidentFactor: clamp(
      0.25 +
        conditions.rainfallMmPerHour * 0.02 +
        (conditions.visibilityMeters < 2_000 ? 0.22 : 0) +
        Math.max(0, conditions.apparentTemperatureC - 32) * 0.025,
      0,
      0.9,
    ),
  };
}

function provenanceForPackage(
  operationsPackage: DailyOperationsPackage,
  packageHash?: string,
): Provenance {
  return {
    kind: "MOCK",
    sourceId: operationsPackage.packageId,
    sourceLabel: "SafeRoute 합성 일일 운영 패키지",
    collectedAt: operationsPackage.evaluatedAt,
    validAt: operationsPackage.evaluatedAt,
    transformedBy: "daily-operations-snapshot-service@1.0.0",
    licenseOrPolicy: "Synthetic operations only; no personal or live route data",
    contentHashSha256: packageHash,
    isDemo: true,
  };
}

export class OperationsPackageValidationError extends Error {
  readonly issues: OperationsValidationIssue[];

  constructor(issues: OperationsValidationIssue[]) {
    super("Daily operations package validation failed");
    this.name = "OperationsPackageValidationError";
    this.issues = issues;
  }
}

export function createScenarioFixtureFromOperationsPackage(
  operationsPackage: DailyOperationsPackage,
): ScenarioFixture {
  const validation = validateDailyOperationsPackage(operationsPackage);
  if (validation.status !== "VALID") {
    throw new OperationsPackageValidationError(validation.issues);
  }

  const provenance = provenanceForPackage(operationsPackage);
  const couriers: CourierState[] = [];
  const workloads: WorkloadState[] = [];
  const weatherTimeline: WeatherState[] = [];
  const areaRiskProfiles: AreaRiskProfile[] = [];
  const routeSegments: RouteSegment[] = [];
  const stops: DeliveryStop[] = [];
  const initialSafetyStates: NonNullable<
    ScenarioFixture["initialSafetyStates"]
  > = [];
  const reorderPolicies: NonNullable<
    ScenarioFixture["interventionInputs"]
  >["reorderPolicies"] = [];
  const saferRouteAlternatives: NonNullable<
    ScenarioFixture["interventionInputs"]
  >["saferRouteAlternatives"] = [];
  const safeDelayPolicies: NonNullable<
    ScenarioFixture["interventionInputs"]
  >["safeDelayPolicies"] = [];

  for (const record of operationsPackage.records) {
    const courierId = record.courier.courierId;
    const planId = record.plan.planId;
    const routeId = `${planId}-current-route`;
    const saferRouteId = `${planId}-safer-route`;
    const areaId = `${record.hub.hubId}-${courierId}-area`;
    const continuousWorkStartedAt = atOffset(
      operationsPackage.evaluatedAt,
      -record.shift.continuousWorkMinutes * minute,
    );
    const lastRestEndedAt = continuousWorkStartedAt;
    const lastRestStartedAt = atOffset(lastRestEndedAt, -30 * minute);
    const factors = riskFactors(record);

    couriers.push({
      courierId,
      stateVersion: "operations-state-v1",
      evaluatedAt: operationsPackage.evaluatedAt,
      timeZone: operationsPackage.timeZone,
      shiftStartedAt: alignToPackageEvaluation(
        record.shift.startAt,
        record,
        operationsPackage,
      ),
      allowedShiftEndAt: alignToPackageEvaluation(
        record.shift.endAt,
        record,
        operationsPackage,
      ),
      continuousWorkStartedAt,
      lastConfirmedRest: {
        startedAt: lastRestStartedAt,
        endedAt: lastRestEndedAt,
        quality:
          record.shift.plannedBreakMinutes >= 20
            ? "HIGH"
            : record.shift.plannedBreakMinutes >= 10
              ? "MEDIUM"
              : "LOW",
      },
      areaFamiliarity:
        record.scenario === "LOW_VISIBILITY"
          ? "UNFAMILIAR"
          : record.scenario === "HEAT_STAIRS"
            ? "PARTIAL"
            : "FAMILIAR",
      vehicleClass: "VAN",
      capacity: {
        maxStops: Math.max(30, record.plan.totalStopCount + 12),
        maxWeightKg: record.vehicle.capacityKg,
        maxVolumeLiters: record.vehicle.capacityKg * 5,
      },
      optionalDerivedSignals: {
        selfCheckFactor: Number(
          clamp(
            0.25 + Math.max(0, record.shift.continuousWorkMinutes - 90) / 300,
            0,
            0.8,
          ).toFixed(3),
        ),
      },
      consentCapabilities: {
        canReceivePrompt: true,
        isStopped: true,
        offline: false,
      },
      provenance: [provenance],
    });

    const recordStops: DeliveryStop[] = record.plan.stops.map(
      (sourceStop, index) => {
        const expectedArrivalAt = alignToPackageEvaluation(
          sourceStop.eta,
          record,
          operationsPackage,
        );
        const isStairStop = index < record.operatingConditions.stairsStopCount;
        return {
          stopId: sourceStop.stopId,
          planId,
          assignedCourierId: courierId,
          sequence: sourceStop.sequence,
          areaId,
          coarseLocation: {
            geohash: `wyd${String(record.seed + index).slice(-4).padStart(4, "0")}`,
            precision: 6,
            areaId,
          },
          expectedArrivalAt,
          expectedServiceMinutes: isStairStop ? 4 : 2,
          timeWindow: {
            startsAt: atOffset(expectedArrivalAt, -15 * minute),
            endsAt: atOffset(expectedArrivalAt, 45 * minute),
            kind: sourceStop.sequence % 7 === 0 ? "HARD" : "SOFT",
          },
          load: {
            weightKg: sourceStop.weightKg,
            volumeLiters: sourceStop.weightKg * 3,
          },
          access: {
            floor: isStairStop ? 4 : 1,
            elevator: isStairStop ? "UNAVAILABLE" : "AVAILABLE",
            parkingDifficultyFactor: factors.parkingDifficultyFactor,
          },
          priority: sourceStop.sequence % 7 === 0 ? "HIGH" : "NORMAL",
          status: "PENDING",
          provenance: [provenance],
        };
      },
    );
    stops.push(...recordStops);

    const recordSegments: RouteSegment[] = recordStops.map((stop, index) => ({
      segmentId: `${planId}-segment-${String(index + 1).padStart(3, "0")}`,
      routeId,
      sequence: index + 1,
      fromStopId: index === 0 ? undefined : recordStops[index - 1].stopId,
      toStopId: stop.stopId,
      expectedStartAt: atOffset(stop.expectedArrivalAt, -2 * minute),
      expectedEndAt: stop.expectedArrivalAt,
      durationMinutes: 2,
      distanceMeters: 360 + index * 45,
      uphillGradePct: record.operatingConditions.maxSlopePercent,
      roadWidthClass:
        factors.narrowRoadFactor >= 0.75
          ? "VERY_NARROW"
          : factors.narrowRoadFactor >= 0.6
            ? "NARROW"
            : "NORMAL",
      areaRiskProfileId: areaId,
      legalForVehicleClasses: ["VAN", "MOTORCYCLE", "BICYCLE"],
      routeAlternativeKind: "CURRENT",
      provenance: [provenance],
    }));
    routeSegments.push(...recordSegments);

    const saferSegments: RouteSegment[] = recordSegments.map(
      (segment, index) => ({
        ...segment,
        segmentId: `${planId}-safer-segment-${String(index + 1).padStart(3, "0")}`,
        routeId: saferRouteId,
        expectedStartAt: atOffset(segment.expectedStartAt, index * 15_000),
        expectedEndAt: atOffset(segment.expectedEndAt, index * 15_000),
        distanceMeters: segment.distanceMeters + 80,
        uphillGradePct: Number(
          Math.max(0, segment.uphillGradePct * 0.45).toFixed(2),
        ),
        roadWidthClass: "NORMAL",
        routeAlternativeKind: "SAFER",
      }),
    );

    const remainingWeightKg = recordStops.reduce(
      (total, stop) => total + (stop.load.weightKg ?? 0),
      0,
    );
    const remainingVolumeLiters = recordStops.reduce(
      (total, stop) => total + (stop.load.volumeLiters ?? 0),
      0,
    );
    const projectedEndAt = atOffset(
      recordStops.at(-1)?.expectedArrivalAt ??
        operationsPackage.evaluatedAt,
      15 * minute,
    );
    workloads.push({
      courierId,
      planId,
      planVersion: record.plan.planVersion,
      evaluatedAt: operationsPackage.evaluatedAt,
      remainingStopIds: recordStops.map((stop) => stop.stopId),
      completedStopCount: record.plan.completedStopCount,
      failedStopCount: 0,
      remainingLoad: {
        stopCount: recordStops.length,
        totalWeightKg: remainingWeightKg,
        totalVolumeLiters: remainingVolumeLiters,
      },
      onboardLoad: {
        stopCount: recordStops.length,
        totalWeightKg: remainingWeightKg,
        totalVolumeLiters: remainingVolumeLiters,
      },
      stairStopsRemaining: record.operatingConditions.stairsStopCount,
      atRiskHardTimeWindowCount: recordStops.filter(
        (stop) => stop.timeWindow?.kind === "HARD",
      ).length,
      atRiskSoftTimeWindowCount: recordStops.filter(
        (stop) => stop.timeWindow?.kind === "SOFT",
      ).length,
      projectedEndAt,
      provenance: [provenance],
    });

    [0, 30, 60, 90, 120].forEach((minutes, index) => {
      weatherTimeline.push({
        areaId,
        observedOrForecastAt: atOffset(
          operationsPackage.evaluatedAt,
          minutes * minute,
        ),
        kind: index === 0 ? "OBSERVATION" : "FORECAST",
        rainfallMmPerHour:
          record.operatingConditions.rainfallMmPerHour +
          (record.scenario === "RAIN_SLOPE" ? index * 0.4 : 0),
        snowfallCmPerHour: 0,
        feelsLikeCelsius:
          record.operatingConditions.apparentTemperatureC,
        visibilityMeters: Math.max(
          500,
          record.operatingConditions.visibilityMeters - index * 80,
        ),
        windSpeedMetersPerSecond: 3,
        roadSurface:
          record.operatingConditions.rainfallMmPerHour > 0 ? "WET" : "DRY",
        provenance,
      });
    });

    areaRiskProfiles.push({
      areaId,
      profileVersion: "operations-area-v1",
      validFrom: atOffset(operationsPackage.evaluatedAt, -24 * 60 * minute),
      validUntil: atOffset(operationsPackage.evaluatedAt, 24 * 60 * minute),
      narrowRoadFactor: factors.narrowRoadFactor,
      parkingDifficultyFactor: factors.parkingDifficultyFactor,
      incidentFactor: factors.incidentFactor,
      backwardManeuverFactor: 0.4,
      nearMissMemory: {
        validatedReportCount: 0,
        decayedRiskFactor: 0,
        weatherInteractionTags:
          record.scenario === "RAIN_SLOPE"
            ? ["RAIN"]
            : record.scenario === "HEAT_STAIRS"
              ? ["HEAT"]
              : ["NIGHT"],
      },
      provenance: [provenance],
    });

    initialSafetyStates.push({
      courierId,
      currentBudget: sourceBudget(record),
      derivedFromHistory: false,
      rationale:
        `Deterministic synthetic starting state from validated package inputs and ${syntheticCourierDirectoryVersion}`,
      provenance,
    });

    reorderPolicies.push({
      courierId,
      reorderableStopIds: recordStops
        .filter((stop) => stop.timeWindow?.kind !== "HARD")
        .map((stop) => stop.stopId),
      fixedStopIds: recordStops
        .filter((stop) => stop.timeWindow?.kind === "HARD")
        .map((stop) => stop.stopId),
      maxCandidates: 3,
      provenance,
    });
    saferRouteAlternatives.push({
      courierId,
      replacementRouteId: saferRouteId,
      replacedSegmentIds: recordSegments.map(
        (segment) => segment.segmentId,
      ),
      replacementSegments: saferSegments,
      provenance,
    });
    safeDelayPolicies.push({
      courierId,
      delayableStopIds: recordStops
        .filter(
          (stop) =>
            stop.priority === "NORMAL" && stop.timeWindow?.kind === "SOFT",
        )
        .map((stop) => stop.stopId),
      maximumDelayMinutes: 60,
      customerNoticeAvailable: true,
      provenance,
    });
  }

  return ScenarioFixtureSchema.parse({
    fixtureId: `${operationsPackage.packageId}-fixture`,
    fixtureVersion: "daily-operations-fixture-v1",
    title: `${operationsPackage.operationDate} 합성 운영일`,
    scenario: "DAILY_MULTI_COURIER_OPERATIONS",
    description:
      "검증된 합성 운영 패키지에서 생성한 전체 활성 기사 일일 운영 스냅샷",
    timeZone: operationsPackage.timeZone,
    evaluatedAt: operationsPackage.evaluatedAt,
    couriers,
    workloads,
    weatherTimeline,
    areaRiskProfiles,
    routeSegments,
    stops,
    initialSafetyStates,
    interventionInputs: {
      reorderPolicies,
      saferRouteAlternatives,
      safeDelayPolicies,
    },
    expectedAssertions: {
      breachStatus: "NO_BREACH_IN_HORIZON",
      feasibleCandidateKinds: [],
      infeasibleReasonCodes: [],
    },
    provenance: [provenance],
  });
}

export async function createDailyOperationsSnapshot(
  input: unknown,
  options: {
    snapshotVersion?: string;
    createdAt?: string;
  } = {},
): Promise<DailyOperationsSnapshot> {
  const validation = validateDailyOperationsPackage(input);
  if (validation.status !== "VALID") {
    throw new OperationsPackageValidationError(validation.issues);
  }

  const operationsPackage = validation.package;
  const packageHash = await hashDailyOperationsPackage(operationsPackage);
  const fixture = createScenarioFixtureFromOperationsPackage(
    operationsPackage,
  );
  const snapshotVersion = options.snapshotVersion ?? "snapshot-v1";
  return DailyOperationsSnapshotSchema.parse({
    schemaVersion: "daily-operations-snapshot-v1",
    snapshotId: `${operationsPackage.packageId}-${packageHash.slice(0, 16)}`,
    snapshotVersion,
    packageId: operationsPackage.packageId,
    packageHash,
    operationDate: operationsPackage.operationDate,
    evaluatedAt: operationsPackage.evaluatedAt,
    timeZone: operationsPackage.timeZone,
    dataMode: "SYNTHETIC",
    status: "ACTIVE",
    courierIds: fixture.couriers.map((courier) => courier.courierId),
    planIds: fixture.workloads.map((workload) => workload.planId),
    fixture,
    createdAt: options.createdAt ?? new Date().toISOString(),
    provenance: [provenanceForPackage(operationsPackage, packageHash)],
  });
}
