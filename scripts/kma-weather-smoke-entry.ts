import { ProvenanceSchema } from "../src/domain/contracts";
import {
  createKmaLiveAdapter,
  KmaProviderError,
  missingKmaEnvironmentVariables,
  parseKmaForecastResponse,
  parseKmaObservationResponse,
  readKmaLiveConfig,
} from "../src/adapters/weather";

type ServerEnvironment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;

const mockRequest = {
  areaId: "demo-kma-grid-60-127",
  baseDate: "20260717",
  baseTime: "1200",
  gridX: 60,
  gridY: 127,
};

const mockResponse = JSON.stringify({
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
    body: {
      items: {
        item: [
          { ...mockRequest, nx: 60, ny: 127, category: "T1H", obsrValue: "28.4" },
          { ...mockRequest, nx: 60, ny: 127, category: "RN1", obsrValue: "1.0" },
          { ...mockRequest, nx: 60, ny: 127, category: "REH", obsrValue: "78" },
          { ...mockRequest, nx: 60, ny: 127, category: "WSD", obsrValue: "2.3" },
          { ...mockRequest, nx: 60, ny: 127, category: "PTY", obsrValue: "1" },
        ].map(({ areaId: _areaId, gridX: _gridX, gridY: _gridY, ...item }) => item),
      },
    },
  },
});

const mockForecastRequest = { ...mockRequest, baseTime: "1230" };
const mockForecastResponse = JSON.stringify({
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
    body: {
      items: {
        item: ["1300", "1400"].flatMap((fcstTime, index) =>
          [
            ["T1H", String(28.6 + index * 0.4)],
            ["RN1", index === 0 ? "1.0" : "0"],
            ["REH", index === 0 ? "76" : "73"],
            ["WSD", index === 0 ? "2.5" : "2.1"],
            ["PTY", index === 0 ? "1" : "0"],
            ["SKY", index === 0 ? "4" : "3"],
            ["LGT", "0"],
          ].map(([category, fcstValue]) => ({
            baseDate: mockForecastRequest.baseDate,
            baseTime: mockForecastRequest.baseTime,
            fcstDate: mockForecastRequest.baseDate,
            fcstTime,
            category,
            nx: mockForecastRequest.gridX,
            ny: mockForecastRequest.gridY,
            fcstValue,
          })),
        ),
      },
    },
  },
});

export function checkKmaLiveConfiguration(environment: ServerEnvironment) {
  const missing = missingKmaEnvironmentVariables(environment);
  if (missing.length > 0) {
    return {
      schemaVersion: "kma-weather-readiness-v1" as const,
      status: "NOT_CONFIGURED" as const,
      missing,
      requestSent: false as const,
      message: "KMA Live configuration is incomplete. No API request was sent.",
    };
  }
  const config = readKmaLiveConfig(environment);
  return {
    schemaVersion: "kma-weather-readiness-v1" as const,
    status: "READY" as const,
    requestSent: false as const,
    endpointContractVerified: true as const,
    enabledApis: [
      "KMA_API_HUB_ULTRA_SHORT_OBSERVATION_4_1",
      "KMA_API_HUB_ULTRA_SHORT_FORECAST_4_2",
    ] as const,
    allowedHost: config.allowedHost,
    timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes,
    maxAgeMinutes: config.maxAgeMinutes,
    message:
      "KMA configuration matches the approved endpoint contract. No API request was sent.",
  };
}

export async function executeKmaMockContractSmoke(
  capturedAt = new Date().toISOString(),
) {
  const parsedObservation = await parseKmaObservationResponse({
    responseText: mockResponse,
    request: mockRequest,
    receivedAt: "2026-07-17T03:30:00.000Z",
    maxAgeMinutes: 60,
  });
  const parsedForecast = await parseKmaForecastResponse({
    responseText: mockForecastResponse,
    request: mockForecastRequest,
    receivedAt: "2026-07-17T03:40:00.000Z",
    maxAgeMinutes: 60,
  });
  const observationCandidate = {
    ...parsedObservation,
    provenance: ProvenanceSchema.parse({
      kind: "MOCK",
      sourceId: "kma-observation-contract-fixture-20260717-1200",
      sourceLabel: "기상청 초단기실황 계약 검증용 합성 응답",
      collectedAt: capturedAt,
      validAt: parsedObservation.observedAt,
      transformedBy: "kma-weather-mock-smoke@1.1.0",
      isDemo: true,
    }),
  };
  const forecastCandidate = {
    ...parsedForecast,
    provenance: ProvenanceSchema.parse({
      kind: "MOCK",
      sourceId: "kma-forecast-contract-fixture-20260717-1230",
      sourceLabel: "기상청 초단기예보 계약 검증용 합성 응답",
      collectedAt: capturedAt,
      validAt: parsedForecast.issuedAt,
      transformedBy: "kma-weather-mock-smoke@1.1.0",
      isDemo: true,
    }),
  };
  return {
    schemaVersion: "kma-weather-smoke-v2" as const,
    capturedAt,
    mode: "MOCK_CONTRACT" as const,
    status: "COMPLETED" as const,
    requestSent: false as const,
    observationCandidate,
    forecastCandidate,
    assertions: {
      observationResponseSchemaValidated: true,
      forecastResponseSchemaValidated: true,
      publicDataClaimed: false,
      safetyEngineInputApproved: false,
      secretsStored: false,
    },
  };
}

const kmaParts = (value: Date) => ({
  baseDate: `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`,
  baseTime: `${String(value.getUTCHours()).padStart(2, "0")}${String(value.getUTCMinutes()).padStart(2, "0")}`,
});

export function createKmaLiveSmokeRequests(
  nowIso: string,
  areaId = "demo-seoul-grid-60-127",
  gridX = 60,
  gridY = 127,
) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("Live smoke time must be ISO 8601");
  const kstNow = new Date(now + 9 * 60 * 60 * 1_000);
  const observationBase = new Date(kstNow.getTime() - 60 * 60 * 1_000);
  observationBase.setUTCMinutes(0, 0, 0);
  const forecastBase = new Date(kstNow.getTime() - 60 * 60 * 1_000);
  if (forecastBase.getUTCMinutes() < 30) {
    forecastBase.setUTCHours(forecastBase.getUTCHours() - 1);
  }
  forecastBase.setUTCMinutes(30, 0, 0);
  return {
    observation: {
      areaId,
      ...kmaParts(observationBase),
      gridX,
      gridY,
    },
    forecast: {
      areaId,
      ...kmaParts(forecastBase),
      gridX,
      gridY,
    },
  };
}

export async function executeKmaLiveSmoke(
  environment: ServerEnvironment,
  {
    nowIso = new Date().toISOString(),
    fetchImplementation = fetch,
  }: { nowIso?: string; fetchImplementation?: FetchImplementation } = {},
) {
  const missing = missingKmaEnvironmentVariables(environment);
  if (missing.length > 0) {
    return {
      schemaVersion: "kma-weather-live-smoke-v1" as const,
      capturedAt: nowIso,
      mode: "LIVE" as const,
      status: "NOT_CONFIGURED" as const,
      requestSent: false as const,
      missing,
      message: "KMA API Hub Live smoke was not executed.",
    };
  }
  const gridX = Number(environment.KMA_SMOKE_GRID_X ?? "60");
  const gridY = Number(environment.KMA_SMOKE_GRID_Y ?? "127");
  const areaId = environment.KMA_SMOKE_AREA_ID?.trim() || "demo-seoul-grid-60-127";
  const requests = createKmaLiveSmokeRequests(nowIso, areaId, gridX, gridY);
  let failureStage = "OBSERVATION_4_1" as
    | "OBSERVATION_4_1"
    | "FORECAST_4_2";
  try {
    const adapter = createKmaLiveAdapter({
      config: readKmaLiveConfig(environment),
      fetchImplementation,
      nowIso: () => nowIso,
    });
    const observationCandidate = await adapter.fetchObservation(
      requests.observation,
    );
    failureStage = "FORECAST_4_2";
    const forecastCandidate = await adapter.fetchForecast(requests.forecast);
    return {
      schemaVersion: "kma-weather-live-smoke-v1" as const,
      capturedAt: nowIso,
      mode: "LIVE" as const,
      status: "COMPLETED" as const,
      requestSent: true as const,
      requests,
      observationCandidate,
      forecastCandidate,
      assertions: {
        publicDataProvenanceVerified: true,
        safetyEngineInputApproved: false,
        secretsStored: false,
      },
    };
  } catch (error) {
    return {
      schemaVersion: "kma-weather-live-smoke-v1" as const,
      capturedAt: nowIso,
      mode: "LIVE" as const,
      status: "FAILED" as const,
      requestSent: true as const,
      requests,
      failureStage,
      failureCode:
        error instanceof KmaProviderError ? error.code : "NETWORK_ERROR",
      failureDiagnostic:
        error instanceof KmaProviderError
          ? error.diagnosticCode ?? "UNSPECIFIED"
          : "UNSPECIFIED",
      message: "KMA API Hub Live smoke failed safely; no raw response was stored.",
    };
  }
}
