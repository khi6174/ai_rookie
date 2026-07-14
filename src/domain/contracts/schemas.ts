import { z } from "zod";

const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.min(0);
const nonNegativeInteger = z.number().int().min(0);
const unitInterval = finiteNumber.min(0).max(1);
const score = finiteNumber.min(0).max(100);
const opaqueId = z.string().min(3).max(100);

export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const IanaTimeZoneSchema = z.string().min(1).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("ko-KR", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid IANA time zone" },
);

const toMillis = (value: string) => Date.parse(value);

export const VersionContextSchema = z
  .object({
    contractsVersion: z.string().min(1),
    safetyModelVersion: z.string().min(1),
    safetyConfigVersion: z.string().min(1),
    interventionPolicyVersion: z.string().min(1),
    planVersion: z.string().min(1),
  })
  .strict();

export const ProvenanceKindSchema = z.enum([
  "LIVE",
  "PUBLIC_DATA_DERIVED",
  "USER_ENTERED",
  "MOCK",
  "DERIVED",
]);

export const ProvenanceSchema = z
  .object({
    kind: ProvenanceKindSchema,
    sourceId: opaqueId,
    sourceLabel: z.string().min(1).max(200),
    collectedAt: IsoDateTimeSchema,
    validAt: IsoDateTimeSchema,
    transformedBy: z.string().min(1).optional(),
    parentSourceIds: z.array(opaqueId).optional(),
    licenseOrPolicy: z.string().min(1).optional(),
    isDemo: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "MOCK" && !value.isDemo) {
      context.addIssue({
        code: "custom",
        path: ["isDemo"],
        message: "MOCK provenance must be marked as demo",
      });
    }
    if (value.kind === "LIVE" && value.isDemo) {
      context.addIssue({
        code: "custom",
        path: ["isDemo"],
        message: "LIVE provenance cannot be marked as demo",
      });
    }
    if (value.kind === "DERIVED" && !value.parentSourceIds?.length) {
      context.addIssue({
        code: "custom",
        path: ["parentSourceIds"],
        message: "DERIVED provenance requires a parent source",
      });
    }
  });

export const DataErrorSchema = z
  .object({
    code: z.enum([
      "NETWORK_ERROR",
      "TIMEOUT",
      "UNAUTHORIZED",
      "RATE_LIMITED",
      "MALFORMED_RESPONSE",
      "SCHEMA_VALIDATION_FAILED",
      "NOT_FOUND",
      "STALE_DATA",
      "UNKNOWN",
    ]),
    message: z.string().min(1),
    retryable: z.boolean(),
    occurredAt: IsoDateTimeSchema,
    sourceId: opaqueId.optional(),
  })
  .strict();

export function createDataResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("LOADING"),
        requestedAt: IsoDateTimeSchema,
        previous: dataSchema.optional(),
      })
      .strict(),
    z
      .object({
        status: z.literal("LIVE"),
        data: dataSchema,
        receivedAt: IsoDateTimeSchema,
        provenance: ProvenanceSchema,
      })
      .strict()
      .superRefine((value, context) => {
        if (value.provenance.kind !== "LIVE") {
          context.addIssue({
            code: "custom",
            path: ["provenance", "kind"],
            message: "LIVE result requires LIVE provenance",
          });
        }
      }),
    z
      .object({
        status: z.literal("MOCK"),
        data: dataSchema,
        fixtureId: opaqueId,
        provenance: ProvenanceSchema,
      })
      .strict()
      .superRefine((value, context) => {
        if (value.provenance.kind !== "MOCK" || !value.provenance.isDemo) {
          context.addIssue({
            code: "custom",
            path: ["provenance"],
            message: "MOCK result requires demo MOCK provenance",
          });
        }
      }),
    z
      .object({
        status: z.literal("FALLBACK"),
        data: dataSchema,
        fallbackReason: DataErrorSchema,
        fixtureId: opaqueId,
        provenance: ProvenanceSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("ERROR"),
        error: DataErrorSchema,
        lastSuccessfulAt: IsoDateTimeSchema.optional(),
      })
      .strict(),
  ]);
}

export const MissingInputSchema = z
  .object({
    field: z.string().min(1),
    category: z.enum(["BLOCKING", "REQUIRED", "OPTIONAL"]),
    reason: z.enum(["ABSENT", "STALE", "INVALID", "NOT_COLLECTED"]),
    assumptionUsed: z.string().min(1).optional(),
    confidencePenalty: score,
  })
  .strict();

export const GeoPointSchema = z
  .object({
    latitude: finiteNumber.min(-90).max(90),
    longitude: finiteNumber.min(-180).max(180),
  })
  .strict();

export const CoarseLocationSchema = z
  .object({
    geohash: z.string().min(3).max(20),
    precision: z.number().int().min(1).max(12),
    areaId: opaqueId,
  })
  .strict();

export const TimeWindowSchema = z
  .object({
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    kind: z.enum(["HARD", "SOFT"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (toMillis(value.endsAt) <= toMillis(value.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Time window must end after it starts",
      });
    }
  });

export const LoadSchema = z
  .object({
    stopCount: nonNegativeInteger,
    totalWeightKg: nonNegativeNumber.optional(),
    totalVolumeLiters: nonNegativeNumber.optional(),
  })
  .strict();

export const CapacitySchema = z
  .object({
    maxStops: nonNegativeInteger.optional(),
    maxWeightKg: nonNegativeNumber.optional(),
    maxVolumeLiters: nonNegativeNumber.optional(),
  })
  .strict();

const LastRestSchema = z
  .object({
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema,
    quality: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (toMillis(value.endedAt) <= toMillis(value.startedAt)) {
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "Rest must end after it starts",
      });
    }
  });

export const VehicleClassSchema = z.enum([
  "WALK",
  "BICYCLE",
  "MOTORCYCLE",
  "VAN",
  "TRUCK",
]);

export const CourierStateSchema = z
  .object({
    courierId: opaqueId,
    stateVersion: z.string().min(1),
    evaluatedAt: IsoDateTimeSchema,
    timeZone: IanaTimeZoneSchema,
    shiftStartedAt: IsoDateTimeSchema,
    allowedShiftEndAt: IsoDateTimeSchema,
    continuousWorkStartedAt: IsoDateTimeSchema,
    lastConfirmedRest: LastRestSchema.optional(),
    areaFamiliarity: z.enum([
      "FAMILIAR",
      "PARTIAL",
      "UNFAMILIAR",
      "UNKNOWN",
    ]),
    vehicleClass: VehicleClassSchema,
    capacity: CapacitySchema,
    optionalDerivedSignals: z
      .object({
        selfCheckFactor: unitInterval.optional(),
        dmsEventFactor: unitInterval.optional(),
        wearableStateFactor: unitInterval.optional(),
      })
      .strict()
      .optional(),
    consentCapabilities: z
      .object({
        canReceivePrompt: z.boolean(),
        isStopped: z.boolean(),
        offline: z.boolean(),
      })
      .strict(),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const shift = toMillis(value.shiftStartedAt);
    const continuous = toMillis(value.continuousWorkStartedAt);
    const evaluated = toMillis(value.evaluatedAt);
    if (!(shift <= continuous && continuous <= evaluated)) {
      context.addIssue({
        code: "custom",
        path: ["continuousWorkStartedAt"],
        message: "Shift, continuous work, and evaluation times are inconsistent",
      });
    }
    if (toMillis(value.allowedShiftEndAt) <= shift) {
      context.addIssue({
        code: "custom",
        path: ["allowedShiftEndAt"],
        message: "Allowed shift end must follow shift start",
      });
    }
    if (
      value.lastConfirmedRest &&
      toMillis(value.lastConfirmedRest.endedAt) > evaluated
    ) {
      context.addIssue({
        code: "custom",
        path: ["lastConfirmedRest", "endedAt"],
        message: "Rest cannot end after evaluation time",
      });
    }
  });

export const WorkloadStateSchema = z
  .object({
    courierId: opaqueId,
    planId: opaqueId,
    planVersion: z.string().min(1),
    evaluatedAt: IsoDateTimeSchema,
    remainingStopIds: z.array(opaqueId),
    completedStopCount: nonNegativeInteger,
    failedStopCount: nonNegativeInteger,
    remainingLoad: LoadSchema,
    onboardLoad: LoadSchema,
    stairStopsRemaining: nonNegativeInteger.optional(),
    atRiskHardTimeWindowCount: nonNegativeInteger,
    atRiskSoftTimeWindowCount: nonNegativeInteger,
    projectedEndAt: IsoDateTimeSchema,
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.remainingStopIds).size !== value.remainingStopIds.length) {
      context.addIssue({
        code: "custom",
        path: ["remainingStopIds"],
        message: "Remaining stop IDs must be unique",
      });
    }
    if (value.remainingLoad.stopCount !== value.remainingStopIds.length) {
      context.addIssue({
        code: "custom",
        path: ["remainingLoad", "stopCount"],
        message: "Remaining stop count must match remaining stop IDs",
      });
    }
    if (
      value.stairStopsRemaining !== undefined &&
      value.stairStopsRemaining > value.remainingStopIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["stairStopsRemaining"],
        message: "Stair stops cannot exceed remaining stops",
      });
    }
    if (toMillis(value.projectedEndAt) < toMillis(value.evaluatedAt)) {
      context.addIssue({
        code: "custom",
        path: ["projectedEndAt"],
        message: "Projected end cannot precede evaluation time",
      });
    }
  });

export const WeatherStateSchema = z
  .object({
    areaId: opaqueId,
    observedOrForecastAt: IsoDateTimeSchema,
    kind: z.enum(["OBSERVATION", "FORECAST"]),
    rainfallMmPerHour: nonNegativeNumber,
    snowfallCmPerHour: nonNegativeNumber,
    feelsLikeCelsius: finiteNumber.min(-40).max(60),
    visibilityMeters: nonNegativeNumber.max(100_000),
    windSpeedMetersPerSecond: nonNegativeNumber.optional(),
    roadSurface: z.enum(["DRY", "WET", "SNOW", "ICE", "UNKNOWN"]),
    provenance: ProvenanceSchema,
  })
  .strict();

export const AreaRiskProfileSchema = z
  .object({
    areaId: opaqueId,
    profileVersion: z.string().min(1),
    validFrom: IsoDateTimeSchema,
    validUntil: IsoDateTimeSchema.optional(),
    narrowRoadFactor: unitInterval,
    parkingDifficultyFactor: unitInterval,
    incidentFactor: unitInterval,
    backwardManeuverFactor: unitInterval.optional(),
    nearMissMemory: z
      .object({
        validatedReportCount: nonNegativeInteger,
        decayedRiskFactor: unitInterval,
        lastValidatedAt: IsoDateTimeSchema.optional(),
        weatherInteractionTags: z.array(z.enum(["RAIN", "SNOW", "HEAT", "NIGHT"])),
      })
      .strict()
      .optional(),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.validUntil &&
      toMillis(value.validUntil) <= toMillis(value.validFrom)
    ) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Risk profile validity must end after it starts",
      });
    }
  });

export const RouteSegmentSchema = z
  .object({
    segmentId: opaqueId,
    routeId: opaqueId,
    sequence: nonNegativeInteger,
    fromStopId: opaqueId.optional(),
    toStopId: opaqueId,
    expectedStartAt: IsoDateTimeSchema,
    expectedEndAt: IsoDateTimeSchema,
    durationMinutes: finiteNumber.gt(0),
    distanceMeters: nonNegativeNumber,
    uphillGradePct: finiteNumber.min(-30).max(30),
    roadWidthClass: z.enum(["WIDE", "NORMAL", "NARROW", "VERY_NARROW"]),
    areaRiskProfileId: opaqueId,
    legalForVehicleClasses: z.array(VehicleClassSchema).min(1),
    routeAlternativeKind: z.enum(["FASTEST", "SAFER", "CURRENT"]),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const actualMinutes =
      (toMillis(value.expectedEndAt) - toMillis(value.expectedStartAt)) / 60_000;
    if (actualMinutes <= 0) {
      context.addIssue({
        code: "custom",
        path: ["expectedEndAt"],
        message: "Route segment must end after it starts",
      });
    } else if (Math.abs(actualMinutes - value.durationMinutes) > 1) {
      context.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "Duration must match route timestamps within one minute",
      });
    }
  });

export const DeliveryStopSchema = z
  .object({
    stopId: opaqueId,
    planId: opaqueId,
    assignedCourierId: opaqueId,
    sequence: nonNegativeInteger,
    areaId: opaqueId,
    coarseLocation: CoarseLocationSchema,
    expectedArrivalAt: IsoDateTimeSchema,
    expectedServiceMinutes: z.number().int().min(1).max(180),
    timeWindow: TimeWindowSchema.optional(),
    load: z
      .object({
        weightKg: nonNegativeNumber.optional(),
        volumeLiters: nonNegativeNumber.optional(),
      })
      .strict(),
    access: z
      .object({
        floor: z.number().int().min(-5).max(100).optional(),
        elevator: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
        parkingDifficultyFactor: unitInterval,
      })
      .strict(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "NON_DELAYABLE"]),
    status: z.enum([
      "PENDING",
      "IN_PROGRESS",
      "COMPLETED",
      "FAILED",
      "DELAYED",
      "TRANSFERRED",
    ]),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict();

export const RiskBandSchema = z.enum([
  "STABLE",
  "CAUTION",
  "SUPPORT_NEEDED",
  "BREACHED",
]);
export const ConfidenceLevelSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export function riskBandForBudget(budget: number) {
  if (budget < 30) return "BREACHED" as const;
  if (budget < 45) return "SUPPORT_NEEDED" as const;
  if (budget < 60) return "CAUTION" as const;
  return "STABLE" as const;
}

export function confidenceForScore(value: number) {
  if (value < 60) return "LOW" as const;
  if (value < 80) return "MEDIUM" as const;
  return "HIGH" as const;
}

export const RiskContributionSchema = z
  .object({
    contributionId: opaqueId,
    category: z.enum([
      "DRIVER",
      "TASK",
      "ROUTE",
      "WEATHER",
      "INTERACTION",
      "RECOVERY",
    ]),
    code: z.string().min(1),
    labelKey: z.string().min(1),
    interval: z.enum(["CURRENT", "FORECAST", "INTERVENTION_DELTA"]),
    budgetPointsConsumed: nonNegativeNumber,
    budgetPointsRecovered: nonNegativeNumber,
    rawInputs: z.array(
      z
        .object({
          field: z.string().min(1),
          value: z.union([finiteNumber, z.string(), z.boolean()]),
          unit: z.string().min(1).optional(),
        })
        .strict(),
    ),
    rationale: z.string().min(1),
    provenanceIds: z.array(opaqueId),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.budgetPointsConsumed > 0 && value.budgetPointsRecovered > 0) {
      context.addIssue({
        code: "custom",
        path: ["budgetPointsRecovered"],
        message: "A contribution cannot consume and recover budget together",
      });
    }
    if (value.category === "RECOVERY" && value.budgetPointsConsumed !== 0) {
      context.addIssue({
        code: "custom",
        path: ["budgetPointsConsumed"],
        message: "Recovery contributions cannot consume budget",
      });
    }
    if (value.category !== "RECOVERY" && value.budgetPointsRecovered !== 0) {
      context.addIssue({
        code: "custom",
        path: ["budgetPointsRecovered"],
        message: "Only recovery contributions may recover budget",
      });
    }
  });

export const SafetyBudgetPointSchema = z
  .object({
    at: IsoDateTimeSchema,
    budget: score,
    band: RiskBandSchema,
    eventType: z.enum(["CURRENT", "TRAVEL", "SERVICE", "REST", "PLAN_END"]),
    stopId: opaqueId.optional(),
    segmentId: opaqueId.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.band !== riskBandForBudget(value.budget)) {
      context.addIssue({
        code: "custom",
        path: ["band"],
        message: "Risk band does not match budget",
      });
    }
  });

export const BreachPredictionSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("PREDICTED"),
      timeToBreachMinutes: nonNegativeNumber,
      predictedAt: IsoDateTimeSchema,
      stopIndex: nonNegativeInteger,
      stopId: opaqueId,
      segmentId: opaqueId.optional(),
      budgetAtBreach: score.max(29.999_999),
    })
    .strict(),
  z
    .object({
      status: z.literal("NO_BREACH_IN_HORIZON"),
      forecastEndAt: IsoDateTimeSchema,
      minimumForecastBudget: score.min(30),
    })
    .strict(),
  z
    .object({
      status: z.literal("ALREADY_BREACHED"),
      detectedAt: IsoDateTimeSchema,
      currentBudget: score.max(29.999_999),
    })
    .strict(),
  z
    .object({
      status: z.literal("INSUFFICIENT_DATA"),
      blockingInputs: z.array(z.string().min(1)).min(1),
    })
    .strict(),
]);

export const SafetyBudgetSnapshotSchema = z
  .object({
    snapshotId: opaqueId,
    courierId: opaqueId,
    planId: opaqueId,
    evaluatedAt: IsoDateTimeSchema,
    versionContext: VersionContextSchema,
    currentBudget: score,
    currentBand: RiskBandSchema,
    minimumForecastBudget: score.optional(),
    forecast: z.array(SafetyBudgetPointSchema),
    breach: BreachPredictionSchema,
    contributions: z.array(RiskContributionSchema),
    confidenceScore: score,
    confidence: ConfidenceLevelSchema,
    missingInputs: z.array(MissingInputSchema),
    assumptions: z.array(z.string().min(1)),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.currentBand !== riskBandForBudget(value.currentBudget)) {
      context.addIssue({
        code: "custom",
        path: ["currentBand"],
        message: "Current risk band does not match budget",
      });
    }
    if (value.confidence !== confidenceForScore(value.confidenceScore)) {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Confidence label does not match score",
      });
    }
    for (let index = 1; index < value.forecast.length; index += 1) {
      if (toMillis(value.forecast[index].at) < toMillis(value.forecast[index - 1].at)) {
        context.addIssue({
          code: "custom",
          path: ["forecast", index, "at"],
          message: "Forecast points must be chronological",
        });
      }
    }
    const budgets = value.forecast.map((point) => point.budget);
    const minimum = budgets.length ? Math.min(...budgets) : undefined;
    if (
      value.minimumForecastBudget !== undefined &&
      (minimum === undefined || Math.abs(value.minimumForecastBudget - minimum) > 0.001)
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumForecastBudget"],
        message: "Minimum forecast budget does not match forecast",
      });
    }
    if (
      value.breach.status === "NO_BREACH_IN_HORIZON" &&
      budgets.some((budget) => budget < 30)
    ) {
      context.addIssue({
        code: "custom",
        path: ["breach"],
        message: "No-breach result cannot contain breached forecast points",
      });
    }
    if (value.breach.status === "ALREADY_BREACHED" && value.currentBudget >= 30) {
      context.addIssue({
        code: "custom",
        path: ["breach"],
        message: "Already-breached result requires current budget below 30",
      });
    }
  });

const RestActionSchema = z
  .object({
    type: z.literal("REST"),
    restMinutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
    restLocationId: opaqueId,
    plannedStartAt: IsoDateTimeSchema,
  })
  .strict();

const TransferStopsActionSchema = z
  .object({
    type: z.literal("TRANSFER_STOPS"),
    sourceCourierId: opaqueId,
    recipientCourierId: opaqueId,
    stopIds: z.array(opaqueId).min(1),
    handoffLocationId: opaqueId,
    plannedHandoffAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceCourierId === value.recipientCourierId) {
      context.addIssue({
        code: "custom",
        path: ["recipientCourierId"],
        message: "Transfer recipient must differ from source courier",
      });
    }
    if (new Set(value.stopIds).size !== value.stopIds.length) {
      context.addIssue({
        code: "custom",
        path: ["stopIds"],
        message: "Transferred stop IDs must be unique",
      });
    }
  });

const ReorderStopsActionSchema = z
  .object({
    type: z.literal("REORDER_STOPS"),
    courierId: opaqueId,
    orderedStopIds: z.array(opaqueId).min(1),
  })
  .strict();

const SaferRouteActionSchema = z
  .object({
    type: z.literal("SAFER_ROUTE"),
    courierId: opaqueId,
    replacementRouteId: opaqueId,
    replacedSegmentIds: z.array(opaqueId).min(1),
  })
  .strict();

const SafeDelayActionSchema = z
  .object({
    type: z.literal("SAFE_DELAY"),
    courierId: opaqueId,
    stopIds: z.array(opaqueId).min(1),
    delayedUntil: IsoDateTimeSchema,
  })
  .strict();

export const InterventionActionSchema = z.discriminatedUnion("type", [
  RestActionSchema,
  TransferStopsActionSchema,
  ReorderStopsActionSchema,
  SaferRouteActionSchema,
  SafeDelayActionSchema,
]);

export const InterventionCandidateSchema = z
  .object({
    candidateId: opaqueId,
    decisionId: opaqueId,
    baselinePlanId: opaqueId,
    baselinePlanVersion: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    generatorVersion: z.string().min(1),
    actions: z.array(InterventionActionSchema).min(1).max(2),
    affectedCourierIds: z.array(opaqueId).min(1),
    affectedStopIds: z.array(opaqueId),
    generationReasons: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const actionTypes = value.actions.map((action) => action.type);
    if (new Set(actionTypes).size !== actionTypes.length) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Candidate cannot repeat an action type",
      });
    }
    if (new Set(value.affectedCourierIds).size !== value.affectedCourierIds.length) {
      context.addIssue({
        code: "custom",
        path: ["affectedCourierIds"],
        message: "Affected courier IDs must be unique",
      });
    }
    if (new Set(value.affectedStopIds).size !== value.affectedStopIds.length) {
      context.addIssue({
        code: "custom",
        path: ["affectedStopIds"],
        message: "Affected stop IDs must be unique",
      });
    }
    const affectedCouriers = new Set(value.affectedCourierIds);
    const affectedStops = new Set(value.affectedStopIds);
    for (const action of value.actions) {
      const courierIds =
        action.type === "TRANSFER_STOPS"
          ? [action.sourceCourierId, action.recipientCourierId]
          : action.type === "REST"
            ? []
            : [action.courierId];
      const stopIds =
        action.type === "TRANSFER_STOPS"
          ? action.stopIds
          : action.type === "REORDER_STOPS"
            ? action.orderedStopIds
            : action.type === "SAFE_DELAY"
              ? action.stopIds
              : [];
      if (courierIds.some((courierId) => !affectedCouriers.has(courierId))) {
        context.addIssue({
          code: "custom",
          path: ["affectedCourierIds"],
          message: "Affected couriers must include every action courier",
        });
      }
      if (stopIds.some((stopId) => !affectedStops.has(stopId))) {
        context.addIssue({
          code: "custom",
          path: ["affectedStopIds"],
          message: "Affected stops must include every action stop",
        });
      }
    }
  });

export const PolicyReasonSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["BLOCKING", "WARNING", "INFO"]),
    subjectType: z.enum(["COURIER", "STOP", "ROUTE", "CUSTOMER", "SYSTEM"]),
    subjectId: opaqueId.optional(),
    messageKey: z.string().min(1),
    evidenceFields: z.array(z.string().min(1)),
  })
  .strict();

export const FeasibilitySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("FEASIBLE"), warnings: z.array(PolicyReasonSchema) }).strict(),
  z
    .object({ status: z.literal("INFEASIBLE"), reasons: z.array(PolicyReasonSchema).min(1) })
    .strict()
    .superRefine((value, context) => {
      if (!value.reasons.some((reason) => reason.severity === "BLOCKING")) {
        context.addIssue({
          code: "custom",
          path: ["reasons"],
          message: "Infeasible evaluations require a blocking reason",
        });
      }
    }),
  z
    .object({ status: z.literal("NEEDS_DATA"), blockingInputs: z.array(z.string().min(1)).min(1) })
    .strict(),
]);

export const CourierImpactSchema = z
  .object({
    courierId: opaqueId,
    role: z.enum(["SOURCE", "RECIPIENT", "AFFECTED"]),
    baselineMinimumBudget: score,
    candidateMinimumBudget: score,
    budgetDelta: finiteNumber,
    workMinutesDelta: finiteNumber,
    stopCountDelta: z.number().int(),
    projectedEndAt: IsoDateTimeSchema,
    breach: BreachPredictionSchema,
  })
  .strict();

export const ConsentRequirementSchema = z
  .object({
    courierId: opaqueId,
    required: z.boolean(),
    status: z.enum([
      "NOT_REQUESTED",
      "PENDING",
      "CONSENTED",
      "MODIFICATION_REQUESTED",
      "DECLINED",
      "EXPIRED",
    ]),
    respondedAt: IsoDateTimeSchema.optional(),
    candidateId: opaqueId,
  })
  .strict();

export const InterventionEvaluationSchema = z
  .object({
    evaluationId: opaqueId,
    candidateId: opaqueId,
    decisionId: opaqueId,
    evaluatedAt: IsoDateTimeSchema,
    versionContext: VersionContextSchema,
    feasibility: FeasibilitySchema,
    baselineSnapshotId: opaqueId,
    candidateSnapshotIds: z.array(opaqueId).min(1),
    safetyGain: finiteNumber,
    breachOutcome: z.enum(["UNCHANGED", "DELAYED", "AVOIDED", "INTRODUCED"]),
    breachDelayMinutes: nonNegativeNumber.optional(),
    etaDeltaMinutes: finiteNumber,
    maxCustomerEtaDeltaMinutes: finiteNumber,
    affectedCustomerCount: nonNegativeInteger,
    operationalComplexity: score,
    fairnessPenaltyScore: score,
    customerImpactScore: score,
    recommendationScore: finiteNumber.optional(),
    rank: z.number().int().min(1).optional(),
    courierImpacts: z.array(CourierImpactSchema).min(1),
    consentRequirements: z.array(ConsentRequirementSchema),
    reasons: z.array(PolicyReasonSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.feasibility.status !== "FEASIBLE" && (value.rank || value.recommendationScore)) {
      context.addIssue({
        code: "custom",
        path: ["recommendationScore"],
        message: "Only feasible evaluations may be ranked",
      });
    }
    const impactIds = value.courierImpacts.map((impact) => impact.courierId);
    if (new Set(impactIds).size !== impactIds.length) {
      context.addIssue({
        code: "custom",
        path: ["courierImpacts"],
        message: "Each impacted courier must appear once",
      });
    }
    for (const impact of value.courierImpacts.filter((item) => item.role === "RECIPIENT")) {
      if (
        value.feasibility.status === "FEASIBLE" &&
        (impact.candidateMinimumBudget < 45 ||
          impact.baselineMinimumBudget - impact.candidateMinimumBudget > 15 ||
          impact.breach.status !== "NO_BREACH_IN_HORIZON")
      ) {
        context.addIssue({
          code: "custom",
          path: ["courierImpacts"],
          message: "Feasible transfer violates recipient safety guard",
        });
      }
    }
  });

export const DecisionStatusSchema = z.enum([
  "BASELINE_EVALUATED",
  "CANDIDATES_GENERATED",
  "CANDIDATES_EVALUATED",
  "RIDER_REVIEW_REQUIRED",
  "RIDER_RESPONSE_PENDING",
  "RIDER_CONSENTED",
  "MODIFICATION_REQUESTED",
  "RIDER_DECLINED",
  "ADMIN_APPROVAL_REQUIRED",
  "ADMIN_HELD",
  "ADMIN_MODIFICATION_REQUESTED",
  "APPROVED",
  "REVALIDATING",
  "REVALIDATION_REQUIRED",
  "APPLYING_PLAN",
  "APPLIED",
  "APPLY_FAILED",
  "NOTICE_RECORDED",
  "CANCELLED",
  "CLOSED",
]);

export const DecisionEventSchema = z
  .object({
    eventId: opaqueId,
    at: IsoDateTimeSchema,
    actor: z.enum(["SYSTEM", "COURIER", "ADMIN"]),
    actorId: opaqueId.optional(),
    fromStatus: DecisionStatusSchema.optional(),
    toStatus: DecisionStatusSchema,
    reasonCode: z.string().min(1),
    evidenceIds: z.array(opaqueId),
  })
  .strict();

const approvalReadyStatuses = new Set([
  "APPROVED",
  "REVALIDATING",
  "REVALIDATION_REQUIRED",
  "APPLYING_PLAN",
  "APPLIED",
  "APPLY_FAILED",
  "NOTICE_RECORDED",
  "CLOSED",
]);

const allowedDecisionTransitions = new Map<string, Set<string>>([
  ["BASELINE_EVALUATED", new Set(["CANDIDATES_GENERATED", "CANCELLED"])],
  ["CANDIDATES_GENERATED", new Set(["CANDIDATES_EVALUATED", "CANCELLED"])],
  ["CANDIDATES_EVALUATED", new Set(["RIDER_REVIEW_REQUIRED", "CANCELLED"])],
  [
    "RIDER_REVIEW_REQUIRED",
    new Set([
      "RIDER_RESPONSE_PENDING",
      "RIDER_CONSENTED",
      "MODIFICATION_REQUESTED",
      "RIDER_DECLINED",
      "CANCELLED",
    ]),
  ],
  [
    "RIDER_RESPONSE_PENDING",
    new Set(["RIDER_CONSENTED", "MODIFICATION_REQUESTED", "RIDER_DECLINED", "CANCELLED"]),
  ],
  ["RIDER_CONSENTED", new Set(["ADMIN_APPROVAL_REQUIRED", "CANCELLED"])],
  ["MODIFICATION_REQUESTED", new Set(["CANDIDATES_GENERATED", "CANCELLED"])],
  ["RIDER_DECLINED", new Set(["CANDIDATES_GENERATED", "CANCELLED"])],
  [
    "ADMIN_APPROVAL_REQUIRED",
    new Set(["APPROVED", "ADMIN_HELD", "ADMIN_MODIFICATION_REQUESTED", "CANCELLED"]),
  ],
  ["ADMIN_HELD", new Set(["ADMIN_APPROVAL_REQUIRED", "ADMIN_MODIFICATION_REQUESTED", "CANCELLED"])],
  ["ADMIN_MODIFICATION_REQUESTED", new Set(["CANDIDATES_GENERATED", "CANCELLED"])],
  ["APPROVED", new Set(["REVALIDATING", "CANCELLED"])],
  ["REVALIDATING", new Set(["APPLYING_PLAN", "REVALIDATION_REQUIRED", "CANCELLED"])],
  ["REVALIDATION_REQUIRED", new Set(["CANDIDATES_GENERATED", "CANCELLED"])],
  ["APPLYING_PLAN", new Set(["APPLIED", "APPLY_FAILED"])],
  ["APPLIED", new Set(["NOTICE_RECORDED", "CLOSED"])],
  ["APPLY_FAILED", new Set(["REVALIDATING", "CANCELLED"])],
  ["NOTICE_RECORDED", new Set(["CLOSED"])],
  ["CANCELLED", new Set()],
  ["CLOSED", new Set()],
]);

export const DecisionRecordSchema = z
  .object({
    decisionId: opaqueId,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    status: DecisionStatusSchema,
    dataMode: z.enum(["LIVE", "MOCK", "FALLBACK"]),
    baselinePlanId: opaqueId,
    baselinePlanVersion: z.string().min(1),
    baselineSnapshotIds: z.array(opaqueId).min(1),
    candidateIds: z.array(opaqueId),
    evaluationIds: z.array(opaqueId),
    selectedCandidateId: opaqueId.optional(),
    consentRequirements: z.array(ConsentRequirementSchema),
    approvedByAdminId: opaqueId.optional(),
    approvedAt: IsoDateTimeSchema.optional(),
    appliedPlanVersion: z.string().min(1).optional(),
    customerNoticeIds: z.array(opaqueId),
    versionContext: VersionContextSchema,
    events: z.array(DecisionEventSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (toMillis(value.updatedAt) < toMillis(value.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "Decision update cannot precede creation",
      });
    }
    for (let index = 0; index < value.events.length; index += 1) {
      const event = value.events[index];
      if (index === 0) {
        if (event.fromStatus !== undefined || event.toStatus !== "BASELINE_EVALUATED") {
          context.addIssue({
            code: "custom",
            path: ["events", index],
            message: "Decision event log must start at BASELINE_EVALUATED",
          });
        }
      }
      if (index > 0) {
        const previous = value.events[index - 1];
        if (toMillis(event.at) < toMillis(previous.at)) {
          context.addIssue({
            code: "custom",
            path: ["events", index, "at"],
            message: "Decision events must be chronological",
          });
        }
        if (event.fromStatus !== previous.toStatus) {
          context.addIssue({
            code: "custom",
            path: ["events", index, "fromStatus"],
            message: "Decision event chain is broken",
          });
        }
        if (!allowedDecisionTransitions.get(previous.toStatus)?.has(event.toStatus)) {
          context.addIssue({
            code: "custom",
            path: ["events", index, "toStatus"],
            message: `Transition ${previous.toStatus} -> ${event.toStatus} is not allowed`,
          });
        }
      }
    }
    if (value.events.at(-1)?.toStatus !== value.status) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Decision status must match its latest event",
      });
    }
    if (value.selectedCandidateId && !value.candidateIds.includes(value.selectedCandidateId)) {
      context.addIssue({
        code: "custom",
        path: ["selectedCandidateId"],
        message: "Selected candidate must belong to the decision",
      });
    }
    if (approvalReadyStatuses.has(value.status)) {
      if (!value.selectedCandidateId || !value.approvedByAdminId || !value.approvedAt) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "Approved flow requires candidate and administrator approval",
        });
      }
      if (
        value.consentRequirements.some(
          (requirement) => requirement.required && requirement.status !== "CONSENTED",
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["consentRequirements"],
          message: "Approved flow requires all mandatory consent",
        });
      }
    }
    if (["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(value.status) && !value.appliedPlanVersion) {
      context.addIssue({
        code: "custom",
        path: ["appliedPlanVersion"],
        message: "Applied flow requires an applied plan version",
      });
    }
    if (["NOTICE_RECORDED", "CLOSED"].includes(value.status) && !value.customerNoticeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["customerNoticeIds"],
        message: "Notice-recorded flow requires a customer notice",
      });
    }
  });

export const NearMissReportSchema = z
  .object({
    reportId: opaqueId,
    reportedAt: IsoDateTimeSchema,
    reporterCourierId: opaqueId,
    decisionId: opaqueId.optional(),
    category: z.enum([
      "SLIP",
      "NARROW_ROAD",
      "BACKWARD_MANEUVER",
      "PARKING_CONFLICT",
      "STAIRS",
      "VISIBILITY",
      "VEHICLE_CONFLICT",
      "OTHER",
    ]),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    note: z.string().max(300).optional(),
    location: CoarseLocationSchema,
    weatherTag: z.enum(["RAIN", "SNOW", "HEAT", "NIGHT", "NONE"]).optional(),
    submittedWhileStopped: z.boolean(),
    offlineCreated: z.boolean(),
    syncedAt: IsoDateTimeSchema.optional(),
    moderationStatus: z.enum([
      "PENDING",
      "VALIDATED",
      "DUPLICATE",
      "REJECTED",
      "LOW_CONFIDENCE",
    ]),
    moderatedAt: IsoDateTimeSchema.optional(),
    moderationReasonCode: z.string().min(1).optional(),
    provenance: ProvenanceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.submittedWhileStopped && value.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Long-form report text requires the courier to be stopped",
      });
    }
    if (value.offlineCreated && value.syncedAt && toMillis(value.syncedAt) < toMillis(value.reportedAt)) {
      context.addIssue({
        code: "custom",
        path: ["syncedAt"],
        message: "Offline report cannot sync before it was created",
      });
    }
    if (value.moderationStatus !== "PENDING" && !value.moderatedAt) {
      context.addIssue({
        code: "custom",
        path: ["moderatedAt"],
        message: "Moderated report requires a moderation time",
      });
    }
  });

export const CustomerNoticeSchema = z
  .object({
    noticeId: opaqueId,
    decisionId: opaqueId,
    stopId: opaqueId,
    appliedPlanVersion: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    channel: z.enum(["SMS_PREVIEW", "ALIMTALK_PREVIEW", "IN_APP_PREVIEW"]),
    previousEta: IsoDateTimeSchema.optional(),
    updatedEta: IsoDateTimeSchema,
    reasonCode: z.literal("SAFE_OPERATION_ADJUSTMENT"),
    message: z.string().min(1).max(500),
    generationMode: z.enum(["TEMPLATE", "UPSTAGE_LIVE", "UPSTAGE_FALLBACK"]),
    citationIds: z.array(opaqueId),
    deliveryStatus: z.enum(["PREVIEW_ONLY", "QUEUED", "SENT", "FAILED"]),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict();

const ExpectedAssertionsSchema = z
  .object({
    currentBudgetRange: z.object({ min: score, max: score }).strict().optional(),
    breachStatus: z.enum([
      "PREDICTED",
      "NO_BREACH_IN_HORIZON",
      "ALREADY_BREACHED",
      "INSUFFICIENT_DATA",
    ]),
    timeToBreachMinutesRange: z
      .object({ min: nonNegativeNumber, max: nonNegativeNumber })
      .strict()
      .optional(),
    breachStopId: opaqueId.optional(),
    feasibleCandidateKinds: z.array(z.string().min(1)),
    infeasibleReasonCodes: z.array(z.string().min(1)),
    recommendedActionKinds: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.currentBudgetRange && value.currentBudgetRange.min > value.currentBudgetRange.max) {
      context.addIssue({
        code: "custom",
        path: ["currentBudgetRange"],
        message: "Current budget range is inverted",
      });
    }
    if (
      value.timeToBreachMinutesRange &&
      value.timeToBreachMinutesRange.min > value.timeToBreachMinutesRange.max
    ) {
      context.addIssue({
        code: "custom",
        path: ["timeToBreachMinutesRange"],
        message: "Time-to-breach range is inverted",
      });
    }
  });

const InitialSafetyStateSchema = z
  .object({
    courierId: opaqueId,
    currentBudget: score,
    derivedFromHistory: z.literal(false),
    rationale: z.string().min(1),
    provenance: ProvenanceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.provenance.kind !== "MOCK" || !value.provenance.isDemo) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "Initial safety state requires demo MOCK provenance",
      });
    }
  });

const ScenarioFixtureBaseSchema = z
  .object({
    fixtureId: opaqueId,
    fixtureVersion: z.string().min(1),
    title: z.string().min(1),
    scenario: z.enum([
      "RAINY_HILLY_LONG_SHIFT",
      "HEAT_HEAVY_STAIRS",
      "NOVICE_NIGHT_UNFAMILIAR",
    ]),
    description: z.string().min(1),
    timeZone: IanaTimeZoneSchema,
    evaluatedAt: IsoDateTimeSchema,
    couriers: z.array(CourierStateSchema).min(1),
    workloads: z.array(WorkloadStateSchema).min(1),
    weatherTimeline: z.array(WeatherStateSchema).min(1),
    areaRiskProfiles: z.array(AreaRiskProfileSchema).min(1),
    routeSegments: z.array(RouteSegmentSchema).min(1),
    stops: z.array(DeliveryStopSchema).min(1),
    initialSafetyStates: z.array(InitialSafetyStateSchema).optional(),
    expectedAssertions: ExpectedAssertionsSchema,
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict();

function addDuplicateIssues(
  values: string[],
  context: z.RefinementCtx,
  path: (string | number)[],
  label: string,
) {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message: `${label} must be unique` });
  }
}

export const ScenarioFixtureSchema = ScenarioFixtureBaseSchema.superRefine(
  (value, context) => {
    const courierIds = value.couriers.map((courier) => courier.courierId);
    const stopIds = value.stops.map((stop) => stop.stopId);
    const areaIds = value.areaRiskProfiles.map((profile) => profile.areaId);
    const segmentIds = value.routeSegments.map((segment) => segment.segmentId);
    addDuplicateIssues(courierIds, context, ["couriers"], "Courier IDs");
    addDuplicateIssues(stopIds, context, ["stops"], "Stop IDs");
    addDuplicateIssues(areaIds, context, ["areaRiskProfiles"], "Area IDs");
    addDuplicateIssues(segmentIds, context, ["routeSegments"], "Segment IDs");

    const courierSet = new Set(courierIds);
    const stopSet = new Set(stopIds);
    const areaSet = new Set(areaIds);
    const workloadCourierIds = value.workloads.map((workload) => workload.courierId);
    for (const courierId of courierIds) {
      if (workloadCourierIds.filter((id) => id === courierId).length !== 1) {
        context.addIssue({
          code: "custom",
          path: ["workloads"],
          message: `Courier ${courierId} must have exactly one workload`,
        });
      }
    }
    if (value.initialSafetyStates) {
      const initialCourierIds = value.initialSafetyStates.map((state) => state.courierId);
      addDuplicateIssues(
        initialCourierIds,
        context,
        ["initialSafetyStates"],
        "Initial safety state courier IDs",
      );
      for (const courierId of initialCourierIds) {
        if (!courierSet.has(courierId)) {
          context.addIssue({
            code: "custom",
            path: ["initialSafetyStates"],
            message: `Unknown initial safety state courier ${courierId}`,
          });
        }
      }
    }
    for (const workload of value.workloads) {
      if (!courierSet.has(workload.courierId)) {
        context.addIssue({
          code: "custom",
          path: ["workloads"],
          message: `Unknown workload courier ${workload.courierId}`,
        });
      }
      for (const stopId of workload.remainingStopIds) {
        if (!stopSet.has(stopId)) {
          context.addIssue({
            code: "custom",
            path: ["workloads"],
            message: `Unknown remaining stop ${stopId}`,
          });
        }
      }
      const expected = value.stops
        .filter(
          (stop) =>
            stop.assignedCourierId === workload.courierId &&
            stop.planId === workload.planId &&
            ["PENDING", "IN_PROGRESS"].includes(stop.status),
        )
        .map((stop) => stop.stopId)
        .sort();
      const actual = [...workload.remainingStopIds].sort();
      if (expected.join("|") !== actual.join("|")) {
        context.addIssue({
          code: "custom",
          path: ["workloads"],
          message: `Remaining stops do not match pending plan stops for ${workload.courierId}`,
        });
      }
    }
    const stopById = new Map(value.stops.map((stop) => [stop.stopId, stop]));
    for (const stop of value.stops) {
      if (!courierSet.has(stop.assignedCourierId)) {
        context.addIssue({
          code: "custom",
          path: ["stops"],
          message: `Unknown assigned courier ${stop.assignedCourierId}`,
        });
      }
      if (!areaSet.has(stop.areaId) || !areaSet.has(stop.coarseLocation.areaId)) {
        context.addIssue({
          code: "custom",
          path: ["stops"],
          message: `Unknown stop area ${stop.areaId}`,
        });
      }
    }
    for (const segment of value.routeSegments) {
      if (!stopSet.has(segment.toStopId) || (segment.fromStopId && !stopSet.has(segment.fromStopId))) {
        context.addIssue({
          code: "custom",
          path: ["routeSegments"],
          message: `Segment ${segment.segmentId} references an unknown stop`,
        });
      }
      if (!areaSet.has(segment.areaRiskProfileId)) {
        context.addIssue({
          code: "custom",
          path: ["routeSegments"],
          message: `Segment ${segment.segmentId} references an unknown area profile`,
        });
      }
      const assignedCourier = value.couriers.find(
        (courier) => courier.courierId === stopById.get(segment.toStopId)?.assignedCourierId,
      );
      if (assignedCourier && !segment.legalForVehicleClasses.includes(assignedCourier.vehicleClass)) {
        context.addIssue({
          code: "custom",
          path: ["routeSegments"],
          message: `Segment ${segment.segmentId} is incompatible with its courier vehicle`,
        });
      }
    }
    const routeSequences = new Set<string>();
    for (const segment of value.routeSegments) {
      const key = `${segment.routeId}:${segment.sequence}`;
      if (routeSequences.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["routeSegments"],
          message: `Duplicate route sequence ${key}`,
        });
      }
      routeSequences.add(key);
    }
    if (
      value.expectedAssertions.breachStopId &&
      !stopSet.has(value.expectedAssertions.breachStopId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedAssertions", "breachStopId"],
        message: "Expected breach stop must exist in the fixture",
      });
    }
    if (value.provenance.some((item) => item.kind === "LIVE")) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "Demo fixtures cannot contain LIVE provenance",
      });
    }
  },
);

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type CourierState = z.infer<typeof CourierStateSchema>;
export type WorkloadState = z.infer<typeof WorkloadStateSchema>;
export type WeatherState = z.infer<typeof WeatherStateSchema>;
export type AreaRiskProfile = z.infer<typeof AreaRiskProfileSchema>;
export type RouteSegment = z.infer<typeof RouteSegmentSchema>;
export type DeliveryStop = z.infer<typeof DeliveryStopSchema>;
export type ScenarioFixture = z.infer<typeof ScenarioFixtureSchema>;
export type SafetyBudgetSnapshot = z.infer<typeof SafetyBudgetSnapshotSchema>;
export type SafetyBudgetPoint = z.infer<typeof SafetyBudgetPointSchema>;
export type BreachPrediction = z.infer<typeof BreachPredictionSchema>;
export type RiskContribution = z.infer<typeof RiskContributionSchema>;
export type PolicyReason = z.infer<typeof PolicyReasonSchema>;
export type InterventionAction = z.infer<typeof InterventionActionSchema>;
export type InterventionCandidate = z.infer<typeof InterventionCandidateSchema>;
export type InterventionEvaluation = z.infer<typeof InterventionEvaluationSchema>;
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
