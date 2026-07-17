import type {
  AreaRiskProfile,
  CourierState,
  DeliveryStop,
  Provenance,
  RouteSegment,
  ScenarioFixture,
  WeatherState,
  WorkloadState,
} from "../../domain/contracts";

type ScenarioConfig = {
  fixtureId: string;
  evaluatedAt: string;
  title: string;
  scenario: ScenarioFixture["scenario"];
  description: string;
  stopCount: number;
  shiftStartedHoursAgo: number;
  continuousWorkHoursAgo: number;
  areaFamiliarity: CourierState["areaFamiliarity"];
  rainfall: number;
  feelsLike: number;
  visibility: number;
  roadSurface: WeatherState["roadSurface"];
  uphillGrade: number;
  narrowRoadFactor: number;
  parkingDifficultyFactor: number;
  incidentFactor: number;
  stairStopRatio: number;
  stairStopsAtEnd?: boolean;
  finalServiceMinutes?: number;
  initialSourceBudget: number;
  initialRecipientBudget: number;
  expectedAssertions: ScenarioFixture["expectedAssertions"];
};

function mockProvenance(
  fixtureId: string,
  sourceSuffix: string,
  evaluatedAt: string,
): Provenance {
  return {
    kind: "MOCK",
    sourceId: `${fixtureId}-${sourceSuffix}`,
    sourceLabel: `SafeRoute deterministic fixture · ${sourceSuffix}`,
    collectedAt: evaluatedAt,
    validAt: evaluatedAt,
    transformedBy: "scenarioFactory@1.0.0",
    isDemo: true,
  };
}

function syntheticFeatureProvenance(
  fixtureId: string,
  sourceSuffix: string,
  evaluatedAt: string,
): Provenance {
  return {
    kind: "MOCK",
    sourceId: `${fixtureId}-${sourceSuffix}`,
    sourceLabel: `SafeRoute deterministic synthetic feature · ${sourceSuffix}`,
    collectedAt: evaluatedAt,
    validAt: evaluatedAt,
    transformedBy: "scenarioFactory@1.0.0",
    licenseOrPolicy: "Demo-only synthetic feature; no public dataset ingested",
    isDemo: true,
  };
}

export function createScenarioFixture(config: ScenarioConfig): ScenarioFixture {
  const evaluatedAt = config.evaluatedAt;
  const evaluationMillis = Date.parse(evaluatedAt);
  const atMinutes = (minutes: number) =>
    new Date(evaluationMillis + minutes * 60_000).toISOString();
  const hoursBefore = (hours: number) =>
    new Date(evaluationMillis - hours * 3_600_000).toISOString();
  const areaId = `${config.fixtureId}-area`;
  const planId = `${config.fixtureId}-plan`;
  const routeId = `${config.fixtureId}-route-current`;
  const sourceCourierId = `${config.fixtureId}-courier-source`;
  const recipientCourierId = `${config.fixtureId}-courier-recipient`;
  const mock = mockProvenance(config.fixtureId, "operations", evaluatedAt);
  const syntheticFeature = syntheticFeatureProvenance(
    config.fixtureId,
    "area-weather",
    evaluatedAt,
  );

  const stops: DeliveryStop[] = Array.from({ length: config.stopCount }, (_, index) => {
    const sequence = index + 1;
    const stopId = `${config.fixtureId}-stop-${String(sequence).padStart(3, "0")}`;
    const stairStopCount = Math.ceil(config.stopCount * config.stairStopRatio);
    const isStairStop = config.stairStopsAtEnd
      ? sequence > config.stopCount - stairStopCount
      : sequence <= stairStopCount;
    return {
      stopId,
      planId,
      assignedCourierId: sourceCourierId,
      sequence,
      areaId,
      coarseLocation: {
        geohash: `wydm${String(sequence).padStart(2, "0")}`,
        precision: 6,
        areaId,
      },
      expectedArrivalAt: atMinutes(sequence * 3 - 1),
      expectedServiceMinutes:
        sequence === config.stopCount ? (config.finalServiceMinutes ?? 1) : 1,
      timeWindow: {
        startsAt: atMinutes(Math.max(0, sequence * 3 - 15)),
        endsAt: atMinutes(sequence * 3 + 45),
        kind: sequence % 7 === 0 ? "HARD" : "SOFT",
      },
      load: {
        weightKg: isStairStop ? 5 : 2,
        volumeLiters: isStairStop ? 14 : 8,
      },
      access: {
        floor: isStairStop ? 4 : 1,
        elevator: isStairStop ? "UNAVAILABLE" : "AVAILABLE",
        parkingDifficultyFactor: config.parkingDifficultyFactor,
      },
      priority: sequence % 9 === 0 ? "HIGH" : "NORMAL",
      status: "PENDING",
      provenance: [mock],
    };
  });

  const routeSegments: RouteSegment[] = stops.map((stop, index) => ({
    segmentId: `${config.fixtureId}-segment-${String(index + 1).padStart(3, "0")}`,
    routeId,
    sequence: index + 1,
    fromStopId: index === 0 ? undefined : stops[index - 1].stopId,
    toStopId: stop.stopId,
    expectedStartAt: atMinutes(index * 3),
    expectedEndAt: atMinutes(index * 3 + 2),
    durationMinutes: 2,
    distanceMeters: 420 + index * 15,
    uphillGradePct: config.uphillGrade,
    roadWidthClass: config.narrowRoadFactor >= 0.75 ? "VERY_NARROW" : "NARROW",
    areaRiskProfileId: areaId,
    legalForVehicleClasses: ["VAN", "MOTORCYCLE", "BICYCLE"],
    routeAlternativeKind: "CURRENT",
    provenance: [mock, syntheticFeature],
  }));

  const saferRouteId = `${config.fixtureId}-route-safer`;
  const saferRouteSegments: RouteSegment[] = routeSegments.map((segment, index) => ({
    ...segment,
    segmentId: `${config.fixtureId}-safer-segment-${String(index + 1).padStart(3, "0")}`,
    routeId: saferRouteId,
    expectedEndAt: atMinutes(index * 3 + 2.25),
    durationMinutes: 2.25,
    distanceMeters: segment.distanceMeters + 90,
    uphillGradePct: Math.max(0, segment.uphillGradePct * 0.35),
    roadWidthClass: "NORMAL",
    routeAlternativeKind: "SAFER",
  }));

  const couriers: CourierState[] = [
    {
      courierId: sourceCourierId,
      stateVersion: "1.0.0",
      evaluatedAt,
      timeZone: "Asia/Seoul",
      shiftStartedAt: hoursBefore(config.shiftStartedHoursAgo),
      allowedShiftEndAt: atMinutes(180),
      continuousWorkStartedAt: hoursBefore(config.continuousWorkHoursAgo),
      lastConfirmedRest: {
        startedAt: hoursBefore(config.continuousWorkHoursAgo + 0.5),
        endedAt: hoursBefore(config.continuousWorkHoursAgo),
        quality: "MEDIUM",
      },
      areaFamiliarity: config.areaFamiliarity,
      vehicleClass: "VAN",
      capacity: {
        maxStops: 60,
        maxWeightKg: 220,
        maxVolumeLiters: 1_300,
      },
      optionalDerivedSignals: {
        selfCheckFactor: config.continuousWorkHoursAgo >= 3 ? 0.62 : 0.35,
      },
      consentCapabilities: {
        canReceivePrompt: true,
        isStopped: true,
        offline: false,
      },
      provenance: [mock],
    },
    {
      courierId: recipientCourierId,
      stateVersion: "1.0.0",
      evaluatedAt,
      timeZone: "Asia/Seoul",
      shiftStartedAt: hoursBefore(5.5),
      allowedShiftEndAt: atMinutes(240),
      continuousWorkStartedAt: hoursBefore(1.5),
      lastConfirmedRest: {
        startedAt: hoursBefore(2),
        endedAt: hoursBefore(1.5),
        quality: "HIGH",
      },
      areaFamiliarity: "FAMILIAR",
      vehicleClass: "VAN",
      capacity: {
        maxStops: 30,
        maxWeightKg: 180,
        maxVolumeLiters: 1_000,
      },
      consentCapabilities: {
        canReceivePrompt: true,
        isStopped: true,
        offline: false,
      },
      provenance: [mock],
    },
  ];

  const remainingWeight = stops.reduce((total, stop) => total + (stop.load.weightKg ?? 0), 0);
  const remainingVolume = stops.reduce(
    (total, stop) => total + (stop.load.volumeLiters ?? 0),
    0,
  );

  const workloads: WorkloadState[] = [
    {
      courierId: sourceCourierId,
      planId,
      planVersion: "1.0.0",
      evaluatedAt,
      remainingStopIds: stops.map((stop) => stop.stopId),
      completedStopCount: 18,
      failedStopCount: 0,
      remainingLoad: {
        stopCount: stops.length,
        totalWeightKg: remainingWeight,
        totalVolumeLiters: remainingVolume,
      },
      onboardLoad: {
        stopCount: stops.length,
        totalWeightKg: remainingWeight,
        totalVolumeLiters: remainingVolume,
      },
      stairStopsRemaining: Math.ceil(stops.length * config.stairStopRatio),
      atRiskHardTimeWindowCount: Math.floor(stops.length / 7),
      atRiskSoftTimeWindowCount: Math.floor(stops.length / 5),
      projectedEndAt: atMinutes(stops.length * 3 + 15),
      provenance: [mock],
    },
    {
      courierId: recipientCourierId,
      planId: `${config.fixtureId}-recipient-plan`,
      planVersion: "1.0.0",
      evaluatedAt,
      remainingStopIds: [],
      completedStopCount: 24,
      failedStopCount: 0,
      remainingLoad: { stopCount: 0, totalWeightKg: 0, totalVolumeLiters: 0 },
      onboardLoad: { stopCount: 0, totalWeightKg: 0, totalVolumeLiters: 0 },
      stairStopsRemaining: 0,
      atRiskHardTimeWindowCount: 0,
      atRiskSoftTimeWindowCount: 0,
      projectedEndAt: atMinutes(30),
      provenance: [mock],
    },
  ];

  const weatherTimeline: WeatherState[] = [0, 30, 60, 90, 120].map((minute, index) => ({
    areaId,
    observedOrForecastAt: atMinutes(minute),
    kind: index === 0 ? "OBSERVATION" : "FORECAST",
    rainfallMmPerHour: config.rainfall + index * (config.rainfall > 0 ? 0.5 : 0),
    snowfallCmPerHour: 0,
    feelsLikeCelsius: config.feelsLike,
    visibilityMeters: Math.max(500, config.visibility - index * 100),
    windSpeedMetersPerSecond: 3.2,
    roadSurface: config.roadSurface,
    provenance: syntheticFeature,
  }));

  const areaRiskProfiles: AreaRiskProfile[] = [
    {
      areaId,
      profileVersion: "1.0.0",
      validFrom: hoursBefore(24),
      validUntil: atMinutes(24 * 60),
      narrowRoadFactor: config.narrowRoadFactor,
      parkingDifficultyFactor: config.parkingDifficultyFactor,
      incidentFactor: config.incidentFactor,
      backwardManeuverFactor: 0.55,
      nearMissMemory: {
        validatedReportCount: 4,
        decayedRiskFactor: 0.28,
        lastValidatedAt: hoursBefore(12),
        weatherInteractionTags: config.rainfall > 0 ? ["RAIN"] : ["NIGHT"],
      },
      provenance: [syntheticFeature],
    },
  ];

  return {
    fixtureId: config.fixtureId,
    fixtureVersion: "1.0.0",
    title: config.title,
    scenario: config.scenario,
    description: config.description,
    timeZone: "Asia/Seoul",
    evaluatedAt,
    couriers,
    workloads,
    weatherTimeline,
    areaRiskProfiles,
    routeSegments,
    stops,
    initialSafetyStates: [
      {
        courierId: sourceCourierId,
        currentBudget: config.initialSourceBudget,
        derivedFromHistory: false,
        rationale: "Deterministic demo starting state; not derived from live shift history",
        provenance: mock,
      },
      {
        courierId: recipientCourierId,
        currentBudget: config.initialRecipientBudget,
        derivedFromHistory: false,
        rationale: "Deterministic recipient guard starting state for transfer simulation",
        provenance: mock,
      },
    ],
    interventionInputs: {
      reorderPolicies: [
        {
          courierId: sourceCourierId,
          reorderableStopIds: stops
            .filter(
              (stop) =>
                !["HIGH", "NON_DELAYABLE"].includes(stop.priority) &&
                stop.timeWindow?.kind !== "HARD",
            )
            .map((stop) => stop.stopId),
          fixedStopIds: stops
            .filter(
              (stop) =>
                ["HIGH", "NON_DELAYABLE"].includes(stop.priority) ||
                stop.timeWindow?.kind === "HARD",
            )
            .map((stop) => stop.stopId),
          maxCandidates: 3,
          provenance: mock,
        },
      ],
      saferRouteAlternatives: [
        {
          courierId: sourceCourierId,
          replacementRouteId: saferRouteId,
          replacedSegmentIds: routeSegments.map((segment) => segment.segmentId),
          replacementSegments: saferRouteSegments,
          provenance: mock,
        },
      ],
      safeDelayPolicies: [
        {
          courierId: sourceCourierId,
          delayableStopIds: stops
            .filter(
              (stop) =>
                stop.priority === "NORMAL" && stop.timeWindow?.kind === "SOFT",
            )
            .map((stop) => stop.stopId),
          maximumDelayMinutes: 60,
          customerNoticeAvailable: true,
          provenance: mock,
        },
      ],
    },
    expectedAssertions: config.expectedAssertions,
    provenance: [mock, syntheticFeature],
  };
}
