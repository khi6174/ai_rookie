import type {
  KmaForecastCandidate,
  KmaObservationCandidate,
} from "./kma";
import type {
  KmaHighResolutionCandidate,
  KmaShortForecastCandidate,
  KmaSnowfallRange,
} from "./supplement";

export const safetyRainfallNormalizationCapMmPerHour = 20;
export const safetySnowfallNormalizationCapCmPerHour = 3;

type RainfallInput = Pick<
  KmaObservationCandidate,
  "rainfallMmPerHour" | "rainfallRangeMmPerHour"
>;

export type KmaRainfallSelection =
  | {
      status: "READY";
      selectedMmPerHour: number;
      mode: "EXACT_SOURCE_VALUE" | "CONSERVATIVE_NORMALIZATION_BOUND";
      assumptionCode?: "KMA_RAIN_RANGE_CONSERVATIVE_NORMALIZATION_BOUND";
    }
  | {
      status: "BLOCKED";
      reason: "MISSING_RAINFALL" | "UNBOUNDED_BELOW_NORMALIZATION_CAP";
    };

export function selectKmaRainfallForSafety(
  input: RainfallInput,
): KmaRainfallSelection {
  if (input.rainfallMmPerHour !== undefined) {
    return {
      status: "READY",
      selectedMmPerHour: input.rainfallMmPerHour,
      mode: "EXACT_SOURCE_VALUE",
    };
  }
  const range = input.rainfallRangeMmPerHour;
  if (!range) return { status: "BLOCKED", reason: "MISSING_RAINFALL" };
  if (range.maximumExclusive !== undefined) {
    return {
      status: "READY",
      selectedMmPerHour: Math.min(
        range.maximumExclusive,
        safetyRainfallNormalizationCapMmPerHour,
      ),
      mode: "CONSERVATIVE_NORMALIZATION_BOUND",
      assumptionCode: "KMA_RAIN_RANGE_CONSERVATIVE_NORMALIZATION_BOUND",
    };
  }
  if (range.minimumInclusive >= safetyRainfallNormalizationCapMmPerHour) {
    return {
      status: "READY",
      selectedMmPerHour: safetyRainfallNormalizationCapMmPerHour,
      mode: "CONSERVATIVE_NORMALIZATION_BOUND",
      assumptionCode: "KMA_RAIN_RANGE_CONSERVATIVE_NORMALIZATION_BOUND",
    };
  }
  return {
    status: "BLOCKED",
    reason: "UNBOUNDED_BELOW_NORMALIZATION_CAP",
  };
}

export type KmaSnowfallSelection =
  | {
      status: "READY";
      selectedCmPerHour: number;
      mode: "EXACT_SOURCE_VALUE" | "CONSERVATIVE_NORMALIZATION_BOUND";
      assumptionCode?: "KMA_SNOW_RANGE_CONSERVATIVE_NORMALIZATION_BOUND";
    }
  | {
      status: "BLOCKED";
      reason: "MISSING_SNOWFALL" | "UNBOUNDED_BELOW_NORMALIZATION_CAP";
    };

export function selectKmaSnowfallForSafety(input: {
  snowfallCmPerHour?: number;
  snowfallRangeCmPerHour?: KmaSnowfallRange;
}): KmaSnowfallSelection {
  if (input.snowfallCmPerHour !== undefined) {
    return {
      status: "READY",
      selectedCmPerHour: input.snowfallCmPerHour,
      mode: "EXACT_SOURCE_VALUE",
    };
  }
  const range = input.snowfallRangeCmPerHour;
  if (!range) return { status: "BLOCKED", reason: "MISSING_SNOWFALL" };
  if (range.maximumExclusive !== undefined) {
    return {
      status: "READY",
      selectedCmPerHour: Math.min(
        range.maximumExclusive,
        safetySnowfallNormalizationCapCmPerHour,
      ),
      mode: "CONSERVATIVE_NORMALIZATION_BOUND",
      assumptionCode: "KMA_SNOW_RANGE_CONSERVATIVE_NORMALIZATION_BOUND",
    };
  }
  if (range.minimumInclusive >= safetySnowfallNormalizationCapCmPerHour) {
    return {
      status: "READY",
      selectedCmPerHour: safetySnowfallNormalizationCapCmPerHour,
      mode: "CONSERVATIVE_NORMALIZATION_BOUND",
      assumptionCode: "KMA_SNOW_RANGE_CONSERVATIVE_NORMALIZATION_BOUND",
    };
  }
  return {
    status: "BLOCKED",
    reason: "UNBOUNDED_BELOW_NORMALIZATION_CAP",
  };
}

export function assessKmaSupplementSafetyCoverage({
  highResolutionCandidate,
  shortForecastCandidate,
}: {
  highResolutionCandidate: KmaHighResolutionCandidate;
  shortForecastCandidate: KmaShortForecastCandidate;
}) {
  const forecastSnowfall = shortForecastCandidate.points.map((point) => ({
    forecastAt: point.forecastAt,
    selection: selectKmaSnowfallForSafety(point),
  }));
  const forecastSnowfallReady =
    forecastSnowfall.length > 0 &&
    forecastSnowfall.every((item) => item.selection.status === "READY");
  const forecastFeelsLike = shortForecastCandidate.points.map((point) => ({
    forecastAt: point.forecastAt,
    feelsLikeCelsius: point.feelsLikeCelsius,
    formulaVersion: point.feelsLikeDerivation?.formulaVersion,
    ready: point.feelsLikeCelsius !== undefined,
  }));
  const forecastFeelsLikeReady =
    forecastFeelsLike.length > 0 &&
    forecastFeelsLike.every((item) => item.ready);
  const currentFeelsLikeReady =
    highResolutionCandidate.feelsLikeCelsius !== undefined;
  const currentVisibilityReady =
    highResolutionCandidate.visibilityMeters !== undefined;
  const blockingFields = [
    {
      weatherStateField: "snowfallCmPerHour" as const,
      timeScope: "CURRENT" as const,
      reason: "THREE_HOUR_SNOW_CANNOT_BE_DIVIDED_INTO_HOURLY_VALUES" as const,
    },
    ...(!forecastSnowfallReady
      ? [
          {
            weatherStateField: "snowfallCmPerHour" as const,
            timeScope: "FORECAST_120_MINUTES" as const,
            reason: "FORECAST_SNOW_NOT_SAFELY_RESOLVABLE" as const,
          },
        ]
      : []),
    ...(!currentFeelsLikeReady
      ? [
          {
            weatherStateField: "feelsLikeCelsius" as const,
            timeScope: "CURRENT" as const,
            reason: "HIGH_RESOLUTION_FIELD_MISSING" as const,
          },
        ]
      : []),
    ...(!forecastFeelsLikeReady
      ? [
          {
            weatherStateField: "feelsLikeCelsius" as const,
            timeScope: "FORECAST_120_MINUTES" as const,
            reason: "OFFICIAL_FORMULA_INPUT_OR_APPLICABILITY_MISSING" as const,
          },
        ]
      : []),
    ...(!currentVisibilityReady
      ? [
          {
            weatherStateField: "visibilityMeters" as const,
            timeScope: "CURRENT" as const,
            reason: "HIGH_RESOLUTION_FIELD_MISSING" as const,
          },
        ]
      : []),
    {
      weatherStateField: "visibilityMeters" as const,
      timeScope: "FORECAST_120_MINUTES" as const,
      reason: "NO_APPROVED_FORECAST_SOURCE_OR_POLICY" as const,
    },
  ];
  return {
    schemaVersion: "kma-weather-supplement-coverage-v1" as const,
    status: "BLOCKED" as const,
    safeForSafetyEngine: false as const,
    evaluatedAreaId: shortForecastCandidate.areaId,
    current: {
      observedAt: highResolutionCandidate.observedAt,
      feelsLikeCelsiusReady: currentFeelsLikeReady,
      visibilityMetersReady: currentVisibilityReady,
      threeHourSnowPreservedButNotUsed:
        highResolutionCandidate.newSnowThreeHoursCm !== undefined,
    },
    forecast: {
      horizonStart: shortForecastCandidate.horizonStart,
      horizonMinutes: shortForecastCandidate.horizonMinutes,
      pointCount: shortForecastCandidate.points.length,
      snowfall: forecastSnowfall,
      allSnowfallPointsReady: forecastSnowfallReady,
      feelsLike: forecastFeelsLike,
      allFeelsLikePointsReady: forecastFeelsLikeReady,
    },
    blockingFields,
    prohibitedTransformations: [
      "DO_NOT_DIVIDE_THREE_HOUR_SNOW_BY_THREE",
      "DO_NOT_USE_SNOW_RANGE_MIDPOINT",
      "DO_NOT_COPY_CURRENT_FEELS_LIKE_OR_VISIBILITY_ACROSS_FORECAST",
      "DO_NOT_FILL_MISSING_WEATHER_WITH_ZERO",
    ] as const,
  };
}

export function assessKmaWeatherSafetyCoverage({
  observationCandidate,
  forecastCandidate,
}: {
  observationCandidate: KmaObservationCandidate;
  forecastCandidate: KmaForecastCandidate;
}) {
  const observationRainfall = selectKmaRainfallForSafety(observationCandidate);
  const forecastRainfall = forecastCandidate.points.map((point) => ({
    forecastAt: point.forecastAt,
    selection: selectKmaRainfallForSafety(point),
  }));
  const rainfallBlocked =
    observationRainfall.status === "BLOCKED" ||
    forecastRainfall.some((item) => item.selection.status === "BLOCKED");
  const blockingFields = [
    ...(rainfallBlocked
      ? [
          {
            weatherStateField: "rainfallMmPerHour" as const,
            reason: "KMA_RAINFALL_NOT_SAFELY_RESOLVABLE" as const,
          },
        ]
      : []),
    {
      weatherStateField: "snowfallCmPerHour" as const,
      reason: "NO_HOURLY_SNOWFALL_SOURCE" as const,
    },
    {
      weatherStateField: "feelsLikeCelsius" as const,
      reason: "NO_APPROVED_CURRENT_AND_FORECAST_SOURCE" as const,
    },
    {
      weatherStateField: "visibilityMeters" as const,
      reason: "NO_APPROVED_CURRENT_AND_FORECAST_SOURCE" as const,
    },
  ];
  return {
    schemaVersion: "kma-weather-safety-coverage-v1" as const,
    status: "BLOCKED" as const,
    safeForSafetyEngine: false as const,
    evaluatedAreaId: observationCandidate.areaId,
    observationAt: observationCandidate.observedAt,
    forecastPointCount: forecastCandidate.points.length,
    rainfall: {
      observation: observationRainfall,
      forecast: forecastRainfall,
      allPointsReady: !rainfallBlocked,
    },
    blockingFields,
    explicitUnknownFields: [
      {
        weatherStateField: "roadSurface" as const,
        selectedValue: "UNKNOWN" as const,
        usedBySafetyModelV1: false as const,
      },
    ],
    prohibitedTransformations: [
      "DO_NOT_USE_RAIN_RANGE_MIDPOINT",
      "DO_NOT_FILL_MISSING_WEATHER_WITH_ZERO",
      "DO_NOT_COPY_CURRENT_VALUES_ACROSS_FORECAST_WITHOUT_POLICY",
      "DO_NOT_INFER_ROAD_SURFACE_FROM_PRECIPITATION_TYPE",
    ] as const,
    candidateNextSources: [
      {
        sourceId: "DS-005",
        api: "KMA_HIGH_RESOLUTION_GRID_POINT_MULTI_ELEMENT_1_3",
        candidateFields: ["feelsLikeCelsius", "visibilityMeters"],
        approvalStatus: "APPROVED_IMPLEMENTATION_IN_PROGRESS",
      },
      {
        sourceId: "DS-006",
        api: "KMA_VILAGE_SHORT_FORECAST_4_3",
        candidateFields: ["snowfallCmPerHour"],
        approvalStatus: "APPROVED_IMPLEMENTATION_IN_PROGRESS",
      },
    ] as const,
  };
}
