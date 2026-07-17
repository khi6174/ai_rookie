import {
  assessKmaSupplementSafetyCoverage,
  createKmaSupplementAdapter,
  KmaProviderError,
  readKmaSupplementConfig,
} from "../src/adapters/weather";

type ServerEnvironment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;

const shortForecastBaseHours = [2, 5, 8, 11, 14, 17, 20, 23] as const;

const compactKstParts = (value: Date) => ({
  date: `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`,
  time: `${String(value.getUTCHours()).padStart(2, "0")}${String(value.getUTCMinutes()).padStart(2, "0")}`,
});

const kstIso = (value: Date) => {
  const parts = compactKstParts(value);
  return `${parts.date.slice(0, 4)}-${parts.date.slice(4, 6)}-${parts.date.slice(6, 8)}T${parts.time.slice(0, 2)}:${parts.time.slice(2)}:00+09:00`;
};

export function createKmaSupplementSmokeRequests(
  nowIso: string,
  areaId = "demo-seoul-grid-60-127",
  gridX = 60,
  gridY = 127,
) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("Live smoke time must be ISO 8601");
  const availableKst = new Date(now + 9 * 60 * 60 * 1_000 - 20 * 60 * 1_000);
  const highResolutionTime = new Date(availableKst);
  highResolutionTime.setUTCMinutes(
    highResolutionTime.getUTCMinutes() < 30 ? 0 : 30,
    0,
    0,
  );
  const forecastBase = new Date(availableKst);
  const selectedHour = [...shortForecastBaseHours]
    .reverse()
    .find((hour) => hour <= forecastBase.getUTCHours());
  if (selectedHour === undefined) {
    forecastBase.setUTCDate(forecastBase.getUTCDate() - 1);
    forecastBase.setUTCHours(23, 0, 0, 0);
  } else {
    forecastBase.setUTCHours(selectedHour, 0, 0, 0);
  }
  const horizonStart = new Date(now + 9 * 60 * 60 * 1_000);
  horizonStart.setUTCMinutes(0, 0, 0);
  const highResolutionParts = compactKstParts(highResolutionTime);
  const forecastParts = compactKstParts(forecastBase);
  return {
    highResolution: {
      representativePointId: "kma-api-hub-public-example-seoul",
      timeKst: `${highResolutionParts.date}${highResolutionParts.time}`,
      longitude: 126.96579,
      latitude: 37.57141,
    },
    shortForecast: {
      areaId,
      baseDate: forecastParts.date,
      baseTime: forecastParts.time,
      gridX,
      gridY,
      horizonStartIso: kstIso(horizonStart),
      horizonMinutes: 120 as const,
    },
  };
}

export async function executeKmaSupplementLiveSmoke(
  environment: ServerEnvironment,
  {
    nowIso = new Date().toISOString(),
    fetchImplementation = fetch,
  }: { nowIso?: string; fetchImplementation?: FetchImplementation } = {},
) {
  const required = [
    "KMA_API_HUB_AUTH_KEY",
    "KMA_ALLOWED_HOST",
    "KMA_TIMEOUT_MS",
    "KMA_MAX_RESPONSE_BYTES",
    "KMA_MAX_AGE_MINUTES",
  ] as const;
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) {
    return {
      schemaVersion: "kma-weather-supplement-live-smoke-v1" as const,
      capturedAt: nowIso,
      status: "NOT_CONFIGURED" as const,
      requestSent: false as const,
      missing,
      message: "KMA supplement Live smoke was not executed.",
    };
  }
  const requests = createKmaSupplementSmokeRequests(
    nowIso,
    environment.KMA_SMOKE_AREA_ID?.trim() || "demo-seoul-grid-60-127",
    Number(environment.KMA_SMOKE_GRID_X ?? "60"),
    Number(environment.KMA_SMOKE_GRID_Y ?? "127"),
  );
  const safeRequests = {
    highResolution: {
      representativePointId: requests.highResolution.representativePointId,
      timeKst: requests.highResolution.timeKst,
      rawCoordinatesStored: false as const,
    },
    shortForecast: requests.shortForecast,
  };
  let failureStage = "HIGH_RESOLUTION_POINT_1_3" as
    | "HIGH_RESOLUTION_POINT_1_3"
    | "SHORT_FORECAST_4_3";
  try {
    const adapter = createKmaSupplementAdapter({
      config: readKmaSupplementConfig(environment),
      fetchImplementation,
      nowIso: () => nowIso,
    });
    const highResolutionCandidate = await adapter.fetchHighResolutionPoint(
      requests.highResolution,
    );
    failureStage = "SHORT_FORECAST_4_3";
    const shortForecastCandidate = await adapter.fetchShortForecast(
      requests.shortForecast,
    );
    const coverage = assessKmaSupplementSafetyCoverage({
      highResolutionCandidate,
      shortForecastCandidate,
    });
    const result = {
      schemaVersion: "kma-weather-supplement-live-smoke-v1" as const,
      capturedAt: nowIso,
      status: "COMPLETED" as const,
      requestSent: true as const,
      requests: safeRequests,
      highResolutionCandidate,
      shortForecastCandidate,
      coverage,
      assertions: {
        approvedApisOnly: true,
        responseSchemasValidated: true,
        publicDataProvenanceVerified: true,
        threeHourSnowConvertedToHourly: false,
        safetyEngineInputApproved: false,
        rawCoordinatesStored: false,
        rawResponsesStored: false,
        secretsStored: false,
      },
    };
    if (JSON.stringify(result).includes(environment.KMA_API_HUB_AUTH_KEY!)) {
      throw new Error("SECRET_SERIALIZATION_GUARD");
    }
    return result;
  } catch (error) {
    return {
      schemaVersion: "kma-weather-supplement-live-smoke-v1" as const,
      capturedAt: nowIso,
      status: "FAILED" as const,
      requestSent: true as const,
      requests: safeRequests,
      failureStage,
      failureCode:
        error instanceof KmaProviderError ? error.code : "NETWORK_ERROR",
      failureDiagnostic:
        error instanceof KmaProviderError
          ? error.diagnosticCode ?? "UNSPECIFIED"
          : "UNSPECIFIED",
      message: "KMA supplement Live smoke failed safely; no raw response was stored.",
    };
  }
}
