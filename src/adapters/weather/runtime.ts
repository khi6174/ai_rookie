import {
  WeatherStateSchema,
  createDataResultSchema,
  type WeatherState,
} from "../../domain/contracts";

export type WeatherRuntimeFieldEvidence = {
  timeScope: "CURRENT" | "FORECAST_120_MINUTES";
  field:
    | "rainfallMmPerHour"
    | "snowfallCmPerHour"
    | "feelsLikeCelsius"
    | "visibilityMeters"
    | "windSpeedMetersPerSecond";
};

export type WeatherRuntimeBlockingField = WeatherRuntimeFieldEvidence & {
  reason: string;
};

export type WeatherRuntimeLiveEvidence = {
  status: "PARTIAL";
  capturedAt: string;
  sourceIds: string[];
  responseHashes: string[];
  readyFields: WeatherRuntimeFieldEvidence[];
  blockingFields: WeatherRuntimeBlockingField[];
  rawResponsesStored: false;
  credentialsStored: false;
};

const WeatherTimelineResultSchema = createDataResultSchema(
  WeatherStateSchema.array().min(1),
);

export function resolveWeatherRuntimeFallback({
  liveEvidence,
  safeForSafetyEngine,
  fallbackTimeline,
  fallbackFixtureId,
}: {
  liveEvidence: WeatherRuntimeLiveEvidence;
  safeForSafetyEngine: boolean;
  fallbackTimeline: WeatherState[];
  fallbackFixtureId: string;
}) {
  if (safeForSafetyEngine || !liveEvidence.blockingFields.length) {
    throw new Error(
      "A complete Live weather candidate requires the separate Live converter",
    );
  }
  if (
    !Number.isFinite(Date.parse(liveEvidence.capturedAt)) ||
    !liveEvidence.sourceIds.length ||
    !liveEvidence.responseHashes.length ||
    liveEvidence.responseHashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
  ) {
    throw new Error("Live weather evidence is incomplete");
  }
  const parsedTimeline = WeatherStateSchema.array().min(1).parse(fallbackTimeline);
  if (
    parsedTimeline.some(
      (weather) =>
        weather.provenance.kind !== "MOCK" || !weather.provenance.isDemo,
    )
  ) {
    throw new Error("Weather Fallback requires an all-MOCK Demo timeline");
  }
  const data = structuredClone(parsedTimeline);
  const active = WeatherTimelineResultSchema.parse({
    status: "FALLBACK",
    data,
    fallbackReason: {
      code: "INCOMPLETE_COVERAGE",
      message:
        "현재 시간당 적설과 미래 시정이 없어 전체 Demo 날씨 타임라인을 사용합니다.",
      retryable: false,
      occurredAt: liveEvidence.capturedAt,
      sourceId: "kma-weather-coverage-gate",
    },
    fixtureId: fallbackFixtureId,
    provenance: data[0].provenance,
  });
  if (active.status !== "FALLBACK") {
    throw new Error("Weather Runtime must select an explicit Fallback state");
  }
  return {
    schemaVersion: "weather-runtime-selection-v1" as const,
    displayLabel: "Demo fixture · Weather Fallback" as const,
    active,
    liveEvidence: structuredClone(liveEvidence),
    audit: {
      liveEvidenceUsedForSafety: false as const,
      fallbackTimelineUsedForSafety: true as const,
      mixedLiveAndDemoFields: false as const,
    },
  };
}

export type WeatherRuntimeSelection = ReturnType<
  typeof resolveWeatherRuntimeFallback
>;
