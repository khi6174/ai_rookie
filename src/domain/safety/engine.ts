import type {
  AreaRiskProfile,
  CourierState,
  DeliveryStop,
  RiskContribution,
  SafetyBudgetPoint,
  SafetyBudgetSnapshot,
  ScenarioFixture,
  WeatherState,
  WorkloadState,
} from "../contracts";
import {
  ScenarioFixtureSchema,
  confidenceForScore,
  riskBandForBudget,
} from "../contracts";
import { safetyModelConfig } from "./config";
import {
  clamp,
  continuousWorkFactor,
  recoveryForRest,
  roundForStorage,
  shiftDurationFactor,
} from "./math";

type InitialRest = {
  durationMinutes: number;
  quality: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
};

export type SafetyEvaluationOptions = {
  horizonMinutes?: number;
  initialRest?: InitialRest;
  snapshotIdSuffix?: string;
};

type ExposureBreakdown = {
  DRIVER: number;
  TASK: number;
  ROUTE: number;
  WEATHER: number;
  INTERACTION: number;
  RECOVERY: number;
};

type DynamicWorkload = {
  remainingStops: number;
  remainingWeightKg: number;
  stairStopsRemaining: number;
  atRiskTimeWindows: number;
};

const emptyBreakdown = (): ExposureBreakdown => ({
  DRIVER: 0,
  TASK: 0,
  ROUTE: 0,
  WEATHER: 0,
  INTERACTION: 0,
  RECOVERY: 0,
});

const minutesBetween = (later: string, earlier: string) =>
  (Date.parse(later) - Date.parse(earlier)) / 60_000;

const addMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

function compactSnapshotId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `safety-snapshot-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function localHour(at: string, timeZone: string) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at)).find((part) => part.type === "hour")?.value;
  return Number(hour ?? 12);
}

function isNight(at: string, timeZone: string) {
  const hour = localHour(at, timeZone);
  return (
    hour >= safetyModelConfig.nightWindow.startsAtHour ||
    hour < safetyModelConfig.nightWindow.endsAtHour
  );
}

function optionalStateFactor(courier: CourierState) {
  const signals = courier.optionalDerivedSignals;
  return Math.max(
    signals?.selfCheckFactor ?? 0,
    signals?.dmsEventFactor ?? 0,
    signals?.wearableStateFactor ?? 0,
  );
}

function driverRate(
  courier: CourierState,
  continuousMinutes: number,
  shiftElapsedMinutes: number,
) {
  const weights = safetyModelConfig.weights.driver;
  return (
    weights.base +
    weights.continuousWork * continuousWorkFactor(continuousMinutes) +
    weights.shiftDuration * shiftDurationFactor(shiftElapsedMinutes) +
    weights.optionalState * optionalStateFactor(courier)
  );
}

function taskFactors(workload: DynamicWorkload) {
  const normalization = safetyModelConfig.normalization;
  return {
    remainingStops: clamp(workload.remainingStops / normalization.remainingStops),
    remainingWeight: clamp(workload.remainingWeightKg / normalization.remainingWeightKg),
    stairs: clamp(workload.stairStopsRemaining / normalization.stairStops),
    timePressure: clamp(workload.atRiskTimeWindows / normalization.atRiskTimeWindows),
  };
}

function taskRate(workload: DynamicWorkload) {
  const factors = taskFactors(workload);
  const weights = safetyModelConfig.weights.task;
  return (
    weights.base +
    weights.remainingStops * factors.remainingStops +
    weights.remainingWeight * factors.remainingWeight +
    weights.stairs * factors.stairs +
    weights.timePressure * factors.timePressure
  );
}

function weatherFactors(weather: WeatherState) {
  const normalization = safetyModelConfig.normalization;
  return {
    rain: clamp(weather.rainfallMmPerHour / normalization.rainfallMmPerHour),
    snow: clamp(weather.snowfallCmPerHour / normalization.snowfallCmPerHour),
    heat: clamp(
      (weather.feelsLikeCelsius - normalization.heatStartCelsius) /
        normalization.heatRangeCelsius,
    ),
    cold: clamp(
      (normalization.coldStartCelsius - weather.feelsLikeCelsius) /
        normalization.coldRangeCelsius,
    ),
    lowVisibility: clamp(
      (normalization.visibilityStartMeters - weather.visibilityMeters) /
        normalization.visibilityRangeMeters,
    ),
  };
}

function weatherRate(weather: WeatherState) {
  const factors = weatherFactors(weather);
  const weights = safetyModelConfig.weights.weather;
  return (
    weights.rain * factors.rain +
    weights.snow * factors.snow +
    weights.heat * factors.heat +
    weights.cold * factors.cold +
    weights.lowVisibility * factors.lowVisibility
  );
}

const roadWidthFactor = {
  WIDE: 0,
  NORMAL: 0.25,
  NARROW: 0.7,
  VERY_NARROW: 1,
} as const;

const familiarityFactor = {
  FAMILIAR: 0,
  PARTIAL: 0.5,
  UNFAMILIAR: 1,
  UNKNOWN: 0.5,
} as const;

function routeFactors(
  segment: ScenarioFixture["routeSegments"][number],
  area: AreaRiskProfile,
  courier: CourierState,
  at: string,
) {
  return {
    slope: clamp(
      Math.max(segment.uphillGradePct, 0) /
        safetyModelConfig.normalization.uphillGradePct,
    ),
    narrow: roadWidthFactor[segment.roadWidthClass],
    incident: area.incidentFactor,
    unfamiliar: familiarityFactor[courier.areaFamiliarity],
    night: isNight(at, courier.timeZone) ? 1 : 0,
  };
}

function travelRouteRate(factors: ReturnType<typeof routeFactors>) {
  const weights = safetyModelConfig.weights.route;
  return (
    weights.base +
    weights.slope * factors.slope +
    weights.narrowRoad * factors.narrow +
    weights.incident * factors.incident +
    weights.unfamiliar * factors.unfamiliar +
    weights.night * factors.night
  );
}

function interactionRate(
  weather: ReturnType<typeof weatherFactors>,
  route: ReturnType<typeof routeFactors>,
  workload: DynamicWorkload,
) {
  const weights = safetyModelConfig.weights.interaction;
  const stairs = taskFactors(workload).stairs;
  return (
    weights.rainSlope * weather.rain * route.slope +
    weights.rainNarrow * weather.rain * route.narrow +
    weights.heatStairs * weather.heat * stairs +
    weights.nightUnfamiliar * route.night * route.unfamiliar
  );
}

export function stopEventExposure(stop: DeliveryStop) {
  const normalization = safetyModelConfig.normalization;
  const weights = safetyModelConfig.weights.stopEvent;
  const normalizedWeight = clamp((stop.load.weightKg ?? 0) / normalization.stopWeightKg);
  const floorWithoutElevator =
    stop.access.elevator === "UNAVAILABLE"
      ? clamp(Math.max((stop.access.floor ?? 1) - 1, 0) / normalization.floorWithoutElevator)
      : 0;
  return (
    weights.base +
    weights.weight * normalizedWeight +
    weights.floorWithoutElevator * floorWithoutElevator +
    weights.parking * stop.access.parkingDifficultyFactor
  );
}

function weatherAt(
  timeline: WeatherState[],
  at: string,
  areaId: string,
) {
  const target = Date.parse(at);
  const localized = timeline.filter(
    (weather) => weather.areaId === areaId,
  );
  return (
    localized
      .sort((left, right) => Date.parse(left.observedOrForecastAt) - Date.parse(right.observedOrForecastAt))
      .filter((weather) => Date.parse(weather.observedOrForecastAt) <= target)
      .at(-1) ?? localized[0]
  );
}

function contributionList(
  breakdown: ExposureBreakdown,
  provenanceIds: string[],
): RiskContribution[] {
  const order: Array<keyof ExposureBreakdown> = [
    "DRIVER",
    "TASK",
    "ROUTE",
    "WEATHER",
    "INTERACTION",
    "RECOVERY",
  ];
  return order
    .filter((category) => breakdown[category] > 0)
    .map((category) => ({
      contributionId: `forecast-${category.toLowerCase()}`,
      category,
      code: `DSE_V1_${category}`,
      labelKey: `safety.contribution.${category.toLowerCase()}`,
      interval: "FORECAST",
      budgetPointsConsumed:
        category === "RECOVERY" ? 0 : roundForStorage(breakdown[category]),
      budgetPointsRecovered:
        category === "RECOVERY" ? roundForStorage(breakdown[category]) : 0,
      rawInputs: [
        {
          field: "aggregatedBudgetPoints",
          value: roundForStorage(breakdown[category]),
          unit: "budget_points",
        },
      ],
      rationale: `Deterministic ${category.toLowerCase()} contribution from safety-config-v1.0.0`,
      provenanceIds,
    }));
}

function horizonPenalty(minutes: number) {
  return (
    safetyModelConfig.confidence.horizonPenalties.find(
      (item) => minutes > item.afterMinutes,
    )?.penalty ?? 0
  );
}

function evaluateSafetyBudgetFromFixture(
  fixture: ScenarioFixture,
  courierId: string,
  options: SafetyEvaluationOptions = {},
): SafetyBudgetSnapshot {
  const courier = fixture.couriers.find((item) => item.courierId === courierId);
  const workload = fixture.workloads.find((item) => item.courierId === courierId);
  if (!courier || !workload) {
    throw new Error(`Fixture does not contain courier and workload ${courierId}`);
  }

  const initialState = fixture.initialSafetyStates?.find((item) => item.courierId === courierId);
  const currentBudget = initialState?.currentBudget ?? safetyModelConfig.budget.initial;
  const provenance = fixture.provenance;
  const provenanceIds = [...new Set(provenance.map((item) => item.sourceId))];
  const assumptions: string[] = [];
  const missingInputs: SafetyBudgetSnapshot["missingInputs"] = [];
  if (initialState) {
    assumptions.push("CURRENT_BUDGET_FROM_DEMO_FIXTURE");
    missingInputs.push({
      field: "shiftHistory",
      category: "REQUIRED",
      reason: "ABSENT",
      assumptionUsed: initialState.rationale,
      confidencePenalty: safetyModelConfig.confidence.directInitialBudgetPenalty,
    });
  }

  const horizon = Math.min(
    options.horizonMinutes ?? safetyModelConfig.forecast.horizonMinutes,
    safetyModelConfig.forecast.horizonMinutes,
  );
  const forecast: SafetyBudgetPoint[] = [
    {
      at: fixture.evaluatedAt,
      budget: currentBudget,
      band: riskBandForBudget(currentBudget),
      eventType: "CURRENT",
    },
  ];
  const breakdown = emptyBreakdown();
  let budget = currentBudget;
  let elapsedMinutes = 0;
  let continuousMinutes = Math.max(
    0,
    minutesBetween(fixture.evaluatedAt, courier.continuousWorkStartedAt),
  );
  const baseShiftMinutes = Math.max(
    0,
    minutesBetween(fixture.evaluatedAt, courier.shiftStartedAt),
  );
  const dynamicWorkload: DynamicWorkload = {
    remainingStops: workload.remainingStopIds.length,
    remainingWeightKg: workload.remainingLoad.totalWeightKg ?? 0,
    stairStopsRemaining: workload.stairStopsRemaining ?? 0,
    atRiskTimeWindows:
      workload.atRiskHardTimeWindowCount + workload.atRiskSoftTimeWindowCount,
  };

  let breach: SafetyBudgetSnapshot["breach"] | undefined;

  const recordCrossing = (
    before: number,
    after: number,
    intervalStartMinutes: number,
    intervalMinutes: number,
    stop: DeliveryStop,
    segmentId?: string,
  ) => {
    if (before >= safetyModelConfig.budget.breachThreshold && after < safetyModelConfig.budget.breachThreshold) {
      const fraction = clamp(
        (before - safetyModelConfig.budget.breachThreshold) / (before - after),
      );
      const crossingMinutes = intervalStartMinutes + intervalMinutes * fraction;
      breach = {
        status: "PREDICTED",
        timeToBreachMinutes: roundForStorage(crossingMinutes),
        predictedAt: addMinutes(fixture.evaluatedAt, crossingMinutes),
        stopIndex: stop.sequence,
        stopId: stop.stopId,
        segmentId,
        budgetAtBreach: roundForStorage(after),
      };
    }
  };

  if (currentBudget < safetyModelConfig.budget.breachThreshold) {
    breach = {
      status: "ALREADY_BREACHED",
      detectedAt: fixture.evaluatedAt,
      currentBudget,
    };
  }

  if (!breach && options.initialRest && elapsedMinutes < horizon) {
    const restMinutes = Math.min(options.initialRest.durationMinutes, horizon);
    const recovered = recoveryForRest(restMinutes, options.initialRest.quality);
    breakdown.RECOVERY += recovered;
    budget = clamp(budget + recovered, 0, 100);
    elapsedMinutes += restMinutes;
    continuousMinutes = 0;
    forecast.push({
      at: addMinutes(fixture.evaluatedAt, elapsedMinutes),
      budget: roundForStorage(budget),
      band: riskBandForBudget(budget),
      eventType: "REST",
    });
  }

  const stopById = new Map(fixture.stops.map((stop) => [stop.stopId, stop]));
  const remainingStopIds = new Set(workload.remainingStopIds);
  const areaById = new Map(
    fixture.areaRiskProfiles.map((profile) => [profile.areaId, profile]),
  );
  const segments = fixture.routeSegments
    .filter((segment) => remainingStopIds.has(segment.toStopId))
    .sort((left, right) => left.sequence - right.sequence);

  const applyTimedExposure = (
    totalMinutes: number,
    eventType: "TRAVEL" | "SERVICE",
    stop: DeliveryStop,
    segment: (typeof segments)[number],
  ) => {
    let remaining = Math.min(totalMinutes, horizon - elapsedMinutes);
    while (remaining > 0 && !breach) {
      const interval = Math.min(safetyModelConfig.forecast.intervalMinutes, remaining);
      const intervalStart = elapsedMinutes;
      const at = addMinutes(fixture.evaluatedAt, elapsedMinutes + interval / 2);
      const weather = weatherAt(
        fixture.weatherTimeline,
        at,
        segment.areaRiskProfileId,
      );
      const area = areaById.get(segment.areaRiskProfileId);
      if (!weather || !area) {
        throw new Error(`Missing weather or area risk for segment ${segment.segmentId}`);
      }
      const route = routeFactors(segment, area, courier, at);
      const weatherFeature = weatherFactors(weather);
      const rates = {
        DRIVER: driverRate(
          courier,
          continuousMinutes + interval / 2,
          baseShiftMinutes + elapsedMinutes + interval / 2,
        ),
        TASK: taskRate(dynamicWorkload),
        ROUTE:
          eventType === "TRAVEL"
            ? travelRouteRate(route)
            : safetyModelConfig.weights.route.base +
              safetyModelConfig.weights.route.serviceParking *
                stop.access.parkingDifficultyFactor,
        WEATHER: weatherRate(weather),
        INTERACTION: interactionRate(weatherFeature, route, dynamicWorkload),
      };
      const intervalFactor = interval / 60;
      const exposures = {
        DRIVER: rates.DRIVER * intervalFactor,
        TASK: rates.TASK * intervalFactor,
        ROUTE: rates.ROUTE * intervalFactor,
        WEATHER: rates.WEATHER * intervalFactor,
        INTERACTION: rates.INTERACTION * intervalFactor,
      };
      const totalExposure = Object.values(exposures).reduce((total, value) => total + value, 0);
      const before = budget;
      budget = clamp(budget - totalExposure, 0, 100);
      for (const category of ["DRIVER", "TASK", "ROUTE", "WEATHER", "INTERACTION"] as const) {
        breakdown[category] += exposures[category];
      }
      elapsedMinutes += interval;
      continuousMinutes += interval;
      remaining -= interval;
      forecast.push({
        at: addMinutes(fixture.evaluatedAt, elapsedMinutes),
        budget: roundForStorage(budget),
        band: riskBandForBudget(budget),
        eventType,
        stopId: stop.stopId,
        segmentId: eventType === "TRAVEL" ? segment.segmentId : undefined,
      });
      recordCrossing(
        before,
        budget,
        intervalStart,
        interval,
        stop,
        eventType === "TRAVEL" ? segment.segmentId : undefined,
      );
    }
  };

  for (const segment of segments) {
    if (elapsedMinutes >= horizon || breach) break;
    const stop = stopById.get(segment.toStopId);
    if (!stop) continue;
    applyTimedExposure(segment.durationMinutes, "TRAVEL", stop, segment);
    if (elapsedMinutes >= horizon || breach) break;
    applyTimedExposure(stop.expectedServiceMinutes, "SERVICE", stop, segment);
    if (breach) break;
    const eventExposure = stopEventExposure(stop);
    const beforeEvent = budget;
    breakdown.TASK += eventExposure;
    budget = clamp(budget - eventExposure, 0, 100);
    forecast.push({
      at: addMinutes(fixture.evaluatedAt, elapsedMinutes),
      budget: roundForStorage(budget),
      band: riskBandForBudget(budget),
      eventType: "SERVICE",
      stopId: stop.stopId,
    });
    recordCrossing(beforeEvent, budget, elapsedMinutes, 0, stop);
    dynamicWorkload.remainingStops = Math.max(0, dynamicWorkload.remainingStops - 1);
    dynamicWorkload.remainingWeightKg = Math.max(
      0,
      dynamicWorkload.remainingWeightKg - (stop.load.weightKg ?? 0),
    );
    if (
      stop.access.elevator === "UNAVAILABLE" &&
      (stop.access.floor ?? 0) > 1
    ) {
      dynamicWorkload.stairStopsRemaining = Math.max(
        0,
        dynamicWorkload.stairStopsRemaining - 1,
      );
    }
  }

  if (!breach) {
    const minimumForecastBudget = Math.min(...forecast.map((point) => point.budget));
    breach = {
      status: "NO_BREACH_IN_HORIZON",
      forecastEndAt: forecast.at(-1)?.at ?? fixture.evaluatedAt,
      minimumForecastBudget: roundForStorage(minimumForecastBudget),
    };
  }

  const confidenceHorizon =
    breach.status === "PREDICTED" ? breach.timeToBreachMinutes : elapsedMinutes;
  const confidenceScore = clamp(
    100 -
      safetyModelConfig.confidence.demoPenalty -
      missingInputs.reduce((total, input) => total + input.confidencePenalty, 0) -
      horizonPenalty(confidenceHorizon),
    0,
    100,
  );
  const minimumForecastBudget = Math.min(...forecast.map((point) => point.budget));

  return {
    snapshotId: compactSnapshotId(
      `${fixture.fixtureId}|${courierId}|${options.snapshotIdSuffix ?? "baseline"}`,
    ),
    courierId,
    planId: workload.planId,
    evaluatedAt: fixture.evaluatedAt,
    versionContext: {
      contractsVersion: "contracts-v1.0.0",
      safetyModelVersion: safetyModelConfig.metadata.modelVersion,
      safetyConfigVersion: safetyModelConfig.metadata.configVersion,
      interventionPolicyVersion: "intervention-v1.0.0",
      planVersion: workload.planVersion,
    },
    currentBudget: roundForStorage(currentBudget),
    currentBand: riskBandForBudget(currentBudget),
    minimumForecastBudget: roundForStorage(minimumForecastBudget),
    forecast,
    breach,
    contributions: contributionList(breakdown, provenanceIds),
    confidenceScore: roundForStorage(confidenceScore),
    confidence: confidenceForScore(confidenceScore),
    missingInputs,
    assumptions,
    provenance,
  };
}

export function evaluateSafetyBudget(
  rawFixture: ScenarioFixture,
  courierId: string,
  options: SafetyEvaluationOptions = {},
): SafetyBudgetSnapshot {
  return evaluateSafetyBudgetFromFixture(
    ScenarioFixtureSchema.parse(rawFixture),
    courierId,
    options,
  );
}

/**
 * Evaluates a fixture that already crossed the strict ScenarioFixture schema
 * boundary. This avoids reparsing the full fleet once per courier.
 */
export function evaluateValidatedSafetyBudget(
  fixture: ScenarioFixture,
  courierId: string,
  options: SafetyEvaluationOptions = {},
): SafetyBudgetSnapshot {
  return evaluateSafetyBudgetFromFixture(fixture, courierId, options);
}
