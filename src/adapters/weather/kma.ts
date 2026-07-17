import { z } from "zod";
import { ProvenanceSchema, type Provenance } from "../../domain/contracts";

export const officialKmaApiHubDatasetUri =
  "https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=286";
export const officialKmaUltraShortObservationUrl =
  "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst";
export const officialKmaUltraShortForecastUrl =
  "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst";
export const officialKmaHost = "apihub.kma.go.kr";

export type KmaFailureCode =
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "MALFORMED_RESPONSE"
  | "PROVIDER_ERROR"
  | "STALE_DATA";

export class KmaProviderError extends Error {
  readonly code: KmaFailureCode;
  readonly diagnosticCode?: string;

  constructor(code: KmaFailureCode, diagnosticCode?: string) {
    super(code);
    this.name = "KmaProviderError";
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}

export type KmaLiveConfig = {
  authKey: string;
  observationUrl: string;
  forecastUrl: string;
  allowedHost: string;
  timeoutMs: number;
  maxResponseBytes: number;
  maxAgeMinutes: number;
};

export type KmaGridRequest = {
  areaId: string;
  baseDate: string;
  baseTime: string;
  gridX: number;
  gridY: number;
};

export type KmaObservationRequest = KmaGridRequest;
export type KmaForecastRequest = KmaGridRequest;

type KmaDomainReadiness = {
  safeForSafetyEngine: false;
  missingWeatherStateFields: [
    "snowfallCmPerHour",
    "feelsLikeCelsius",
    "visibilityMeters",
    "roadSurface",
  ];
  reason:
    | "KMA_OBSERVATION_DOES_NOT_COVER_REQUIRED_SAFETY_FIELDS"
    | "KMA_FORECAST_DOES_NOT_COVER_REQUIRED_SAFETY_FIELDS";
};

type KmaSupportedWeatherValues = {
  airTemperatureCelsius?: number;
  rainfallMmPerHour?: number;
  rainfallRangeMmPerHour?: {
    minimumInclusive: number;
    maximumExclusive?: number;
  };
  relativeHumidityPercent?: number;
  windSpeedMetersPerSecond?: number;
  precipitationTypeCode?: number;
};

export type KmaObservationCandidate = KmaSupportedWeatherValues & {
  schemaVersion: "kma-api-hub-ultra-short-observation-v1";
  areaId: string;
  observedAt: string;
  grid: { x: number; y: number };
  missingSourceCategories: string[];
  domainReadiness: KmaDomainReadiness;
  responseSha256: string;
  provenance: Provenance;
};

export type KmaForecastPoint = KmaSupportedWeatherValues & {
  forecastAt: string;
  skyConditionCode?: number;
  lightningCode?: number;
  precipitationProbabilityPercent?: number;
  missingSourceCategories: string[];
  domainReadiness: KmaDomainReadiness;
};

export type KmaForecastCandidate = {
  schemaVersion: "kma-api-hub-ultra-short-forecast-v1";
  areaId: string;
  issuedAt: string;
  grid: { x: number; y: number };
  points: KmaForecastPoint[];
  responseSha256: string;
  provenance: Provenance;
};

type ServerEnvironment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;

const missingWeatherStateFields = [
  "snowfallCmPerHour",
  "feelsLikeCelsius",
  "visibilityMeters",
  "roadSurface",
] as const;
const observationCategories = ["T1H", "RN1", "REH", "WSD", "PTY"];
const forecastCategories = [
  "T1H",
  "RN1",
  "REH",
  "WSD",
  "PTY",
  "SKY",
  "LGT",
];

const domainReadiness = (
  reason: KmaDomainReadiness["reason"],
): KmaDomainReadiness => ({
  safeForSafetyEngine: false,
  missingWeatherStateFields: [...missingWeatherStateFields],
  reason,
});

const positiveInteger = (
  name: string,
  rawValue: string | undefined,
  minimum: number,
  maximum: number,
) => {
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be explicitly configured as an integer`);
  }
  const value = Number(rawValue);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
};

export function requiredKmaEnvironmentVariables() {
  return [
    "KMA_API_HUB_AUTH_KEY",
    "KMA_ULTRA_SHORT_OBSERVATION_URL",
    "KMA_ULTRA_SHORT_FORECAST_URL",
    "KMA_ALLOWED_HOST",
    "KMA_TIMEOUT_MS",
    "KMA_MAX_RESPONSE_BYTES",
    "KMA_MAX_AGE_MINUTES",
  ] as const;
}

export function missingKmaEnvironmentVariables(environment: ServerEnvironment) {
  return requiredKmaEnvironmentVariables().filter(
    (name) => !environment[name]?.trim(),
  );
}

const validateOfficialEndpoint = (
  value: string,
  expected: string,
  allowedHost: string,
  label: string,
) => {
  const endpoint = new URL(value);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.hostname.toLowerCase() !== officialKmaHost ||
    endpoint.hostname.toLowerCase() !== allowedHost.toLowerCase() ||
    endpoint.toString() !== expected
  ) {
    throw new Error(
      `KMA ${label} endpoint must match the approved API Hub HTTPS contract`,
    );
  }
  return endpoint.toString();
};

export function validateKmaLiveConfig(config: KmaLiveConfig): KmaLiveConfig {
  if (config.authKey.trim().length < 10) {
    throw new Error("KMA_API_HUB_AUTH_KEY is missing or too short");
  }
  if (!/^[a-z0-9.-]+$/i.test(config.allowedHost)) {
    throw new Error("KMA_ALLOWED_HOST must be a hostname only");
  }
  const observationUrl = validateOfficialEndpoint(
    config.observationUrl,
    officialKmaUltraShortObservationUrl,
    config.allowedHost,
    "observation",
  );
  const forecastUrl = validateOfficialEndpoint(
    config.forecastUrl,
    officialKmaUltraShortForecastUrl,
    config.allowedHost,
    "forecast",
  );
  if (
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < 1_000 ||
    config.timeoutMs > 30_000
  ) {
    throw new Error("KMA timeout must be between 1000 and 30000 milliseconds");
  }
  if (
    !Number.isInteger(config.maxResponseBytes) ||
    config.maxResponseBytes < 1_024 ||
    config.maxResponseBytes > 1_000_000
  ) {
    throw new Error("KMA response limit must be between 1024 and 1000000 bytes");
  }
  if (
    !Number.isInteger(config.maxAgeMinutes) ||
    config.maxAgeMinutes < 30 ||
    config.maxAgeMinutes > 360
  ) {
    throw new Error("KMA max age must be between 30 and 360 minutes");
  }
  return {
    ...config,
    authKey: config.authKey.trim(),
    allowedHost: officialKmaHost,
    observationUrl,
    forecastUrl,
  };
}

export function readKmaLiveConfig(
  environment: ServerEnvironment,
): KmaLiveConfig {
  return validateKmaLiveConfig({
    authKey: environment.KMA_API_HUB_AUTH_KEY ?? "",
    observationUrl: environment.KMA_ULTRA_SHORT_OBSERVATION_URL ?? "",
    forecastUrl: environment.KMA_ULTRA_SHORT_FORECAST_URL ?? "",
    allowedHost: environment.KMA_ALLOWED_HOST ?? "",
    timeoutMs: positiveInteger(
      "KMA_TIMEOUT_MS",
      environment.KMA_TIMEOUT_MS,
      1_000,
      30_000,
    ),
    maxResponseBytes: positiveInteger(
      "KMA_MAX_RESPONSE_BYTES",
      environment.KMA_MAX_RESPONSE_BYTES,
      1_024,
      1_000_000,
    ),
    maxAgeMinutes: positiveInteger(
      "KMA_MAX_AGE_MINUTES",
      environment.KMA_MAX_AGE_MINUTES,
      30,
      360,
    ),
  });
}

const KmaItemBaseSchema = z.object({
  baseDate: z.string().regex(/^\d{8}$/),
  baseTime: z.string().regex(/^\d{4}$/),
  category: z.string().min(1).max(10),
  nx: z.coerce.number().int().min(1).max(149),
  ny: z.coerce.number().int().min(1).max(253),
});

const KmaObservationItemSchema = KmaItemBaseSchema.extend({
  obsrValue: z.union([z.string(), z.number()]),
});

const KmaForecastItemSchema = KmaItemBaseSchema.extend({
  fcstDate: z.string().regex(/^\d{8}$/),
  fcstTime: z.string().regex(/^\d{4}$/),
  fcstValue: z.union([z.string(), z.number()]),
});

const createKmaEnvelopeSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    response: z.object({
      header: z.object({
        resultCode: z.union([z.string(), z.number()]),
        resultMsg: z.string(),
      }),
      body: z
        .object({
          items: z.object({ item: z.array(itemSchema) }),
        })
        .optional(),
    }),
  });

const KmaObservationEnvelopeSchema = createKmaEnvelopeSchema(
  KmaObservationItemSchema,
);
const KmaForecastEnvelopeSchema = createKmaEnvelopeSchema(KmaForecastItemSchema);

const kmaDateTimeIso = (date: string, time: string) => {
  const value = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+09:00`;
  if (!Number.isFinite(Date.parse(value))) {
    throw new KmaProviderError("MALFORMED_RESPONSE");
  }
  return value;
};

const finiteNumber = (
  value: string | number | undefined,
  minimum: number,
  maximum: number,
  category: string,
) => {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new KmaProviderError(
      "MALFORMED_RESPONSE",
      `INVALID_NUMERIC_${category}`,
    );
  }
  return parsed;
};

const parseRainfall = (value: string | number | undefined) => {
  if (value === undefined || value === "") return {};
  if (typeof value === "number") {
    return { rainfallMmPerHour: finiteNumber(value, 0, 500, "RN1") };
  }
  const normalized = value.trim().replaceAll(" ", "");
  if (["-", "null", "강수없음", "0", "0.0", "0mm", "0.0mm"].includes(normalized)) {
    return { rainfallMmPerHour: 0 };
  }
  const exact = normalized.match(/^(\d+(?:\.\d+)?)mm$/i);
  if (exact) {
    return {
      rainfallMmPerHour: finiteNumber(exact[1], 0, 500, "RN1"),
    };
  }
  const belowOne = normalized.match(/^1(?:\.0)?mm미만$/i);
  if (belowOne) {
    return {
      rainfallRangeMmPerHour: {
        minimumInclusive: 0.1,
        maximumExclusive: 1,
      },
    };
  }
  const range = normalized.match(
    /^(\d+(?:\.\d+)?)[~∼-](\d+(?:\.\d+)?)mm$/i,
  );
  if (range) {
    const minimumInclusive = finiteNumber(range[1], 0, 500, "RN1_RANGE_MIN");
    const maximumExclusive = finiteNumber(range[2], 0, 500, "RN1_RANGE_MAX");
    if (
      minimumInclusive === undefined ||
      maximumExclusive === undefined ||
      maximumExclusive <= minimumInclusive
    ) {
      throw new KmaProviderError(
        "MALFORMED_RESPONSE",
        "INVALID_RAINFALL_RANGE",
      );
    }
    return { rainfallRangeMmPerHour: { minimumInclusive, maximumExclusive } };
  }
  const atLeast = normalized.match(/^(\d+(?:\.\d+)?)mm이상$/i);
  if (atLeast) {
    return {
      rainfallRangeMmPerHour: {
        minimumInclusive: finiteNumber(
          atLeast[1],
          0,
          500,
          "RN1_RANGE_MIN",
        )!,
      },
    };
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return { rainfallMmPerHour: finiteNumber(numeric, 0, 500, "RN1") };
  }
  throw new KmaProviderError(
    "MALFORMED_RESPONSE",
    "UNSUPPORTED_RAINFALL_FORMAT",
  );
};

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const providerFailureCode = (message: string): KmaFailureCode => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("service key") ||
    normalized.includes("auth") ||
    normalized.includes("인증키") ||
    normalized.includes("등록되지")
  ) {
    return "UNAUTHORIZED";
  }
  if (
    normalized.includes("traffic") ||
    normalized.includes("limit") ||
    normalized.includes("rate") ||
    normalized.includes("횟수")
  ) {
    return "RATE_LIMITED";
  }
  return "PROVIDER_ERROR";
};

const parseEnvelope = <T>(
  responseText: string,
  schema: z.ZodType<T>,
): T => {
  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(responseText);
  } catch {
    throw new KmaProviderError(
      "MALFORMED_RESPONSE",
      responseText.trimStart().startsWith("<")
        ? "NON_JSON_XML_RESPONSE"
        : "INVALID_JSON_RESPONSE",
    );
  }
  const parsed = schema.safeParse(rawEnvelope);
  if (!parsed.success) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "SCHEMA_MISMATCH");
  }
  const envelope = parsed.data as {
    response: {
      header: { resultCode: string | number; resultMsg: string };
    };
  };
  if (String(envelope.response.header.resultCode).padStart(2, "0") !== "00") {
    throw new KmaProviderError(
      providerFailureCode(envelope.response.header.resultMsg),
    );
  }
  return parsed.data;
};

const assertRequestMatches = (
  item: z.infer<typeof KmaItemBaseSchema>,
  request: KmaGridRequest,
) => {
  if (
    item.baseDate !== request.baseDate ||
    item.baseTime !== request.baseTime ||
    item.nx !== request.gridX ||
    item.ny !== request.gridY
  ) {
    throw new KmaProviderError("MALFORMED_RESPONSE");
  }
};

const assertFresh = (
  issuedAt: string,
  receivedAt: string,
  maxAgeMinutes: number,
) => {
  const ageMinutes = (Date.parse(receivedAt) - Date.parse(issuedAt)) / 60_000;
  if (ageMinutes < -5 || ageMinutes > maxAgeMinutes) {
    throw new KmaProviderError("STALE_DATA");
  }
};

const publicProvenance = async ({
  responseText,
  receivedAt,
  validAt,
  sourceId,
  sourceLabel,
  transformedBy,
}: {
  responseText: string;
  receivedAt: string;
  validAt: string;
  sourceId: string;
  sourceLabel: string;
  transformedBy: string;
}) => {
  const responseSha256 = await sha256(responseText);
  return {
    responseSha256,
    provenance: ProvenanceSchema.parse({
      kind: "PUBLIC_DATA_DERIVED",
      sourceId,
      sourceLabel,
      collectedAt: receivedAt,
      validAt,
      transformedBy,
      licenseOrPolicy: "기상청 API허브 이용정책·API별 제공조건",
      sourceUri: officialKmaApiHubDatasetUri,
      sourceVersion: "kma-api-hub:seqApi=10:seqApiSub=286:2026-07-17",
      contentHashSha256: responseSha256,
      isDemo: true,
    }),
  };
};

const supportedWeatherValues = (values: Map<string, string | number>) => ({
  airTemperatureCelsius: finiteNumber(values.get("T1H"), -60, 60, "T1H"),
  ...parseRainfall(values.get("RN1")),
  relativeHumidityPercent: finiteNumber(values.get("REH"), 0, 100, "REH"),
  windSpeedMetersPerSecond: finiteNumber(values.get("WSD"), 0, 100, "WSD"),
  precipitationTypeCode: finiteNumber(values.get("PTY"), 0, 99, "PTY"),
});

export async function parseKmaObservationResponse({
  responseText,
  request,
  receivedAt,
  maxAgeMinutes,
}: {
  responseText: string;
  request: KmaObservationRequest;
  receivedAt: string;
  maxAgeMinutes: number;
}): Promise<KmaObservationCandidate> {
  const parsed = parseEnvelope(responseText, KmaObservationEnvelopeSchema);
  const items = parsed.response.body?.items.item;
  if (!items?.length) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "EMPTY_ITEMS");
  }
  const values = new Map<string, string | number>();
  for (const item of items) {
    assertRequestMatches(item, request);
    if (values.has(item.category)) {
      throw new KmaProviderError("MALFORMED_RESPONSE");
    }
    values.set(item.category, item.obsrValue);
  }
  const observedAt = kmaDateTimeIso(request.baseDate, request.baseTime);
  assertFresh(observedAt, receivedAt, maxAgeMinutes);
  const evidence = await publicProvenance({
    responseText,
    receivedAt,
    validAt: observedAt,
    sourceId: "kma-api-hub-ultra-short-observation",
    sourceLabel: "기상청 API허브 · 초단기실황조회",
    transformedBy: "kma-api-hub-observation-adapter@1.1.0",
  });
  return {
    schemaVersion: "kma-api-hub-ultra-short-observation-v1",
    areaId: request.areaId,
    observedAt,
    grid: { x: request.gridX, y: request.gridY },
    ...supportedWeatherValues(values),
    missingSourceCategories: observationCategories.filter(
      (category) => !values.has(category),
    ),
    domainReadiness: domainReadiness(
      "KMA_OBSERVATION_DOES_NOT_COVER_REQUIRED_SAFETY_FIELDS",
    ),
    ...evidence,
  };
}

export async function parseKmaForecastResponse({
  responseText,
  request,
  receivedAt,
  maxAgeMinutes,
}: {
  responseText: string;
  request: KmaForecastRequest;
  receivedAt: string;
  maxAgeMinutes: number;
}): Promise<KmaForecastCandidate> {
  const parsed = parseEnvelope(responseText, KmaForecastEnvelopeSchema);
  const items = parsed.response.body?.items.item;
  if (!items?.length) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "EMPTY_ITEMS");
  }
  const issuedAt = kmaDateTimeIso(request.baseDate, request.baseTime);
  assertFresh(issuedAt, receivedAt, maxAgeMinutes);
  const grouped = new Map<string, Map<string, string | number>>();
  for (const item of items) {
    assertRequestMatches(item, request);
    const forecastAt = kmaDateTimeIso(item.fcstDate, item.fcstTime);
    const horizonMinutes = (Date.parse(forecastAt) - Date.parse(issuedAt)) / 60_000;
    if (horizonMinutes < 0 || horizonMinutes > 360) {
      throw new KmaProviderError("MALFORMED_RESPONSE");
    }
    const values = grouped.get(forecastAt) ?? new Map<string, string | number>();
    if (values.has(item.category)) {
      throw new KmaProviderError("MALFORMED_RESPONSE");
    }
    values.set(item.category, item.fcstValue);
    grouped.set(forecastAt, values);
  }
  const points = [...grouped.entries()]
    .sort(([left], [right]) => Date.parse(left) - Date.parse(right))
    .map(([forecastAt, values]) => ({
      forecastAt,
      ...supportedWeatherValues(values),
      skyConditionCode: finiteNumber(values.get("SKY"), 0, 99, "SKY"),
      lightningCode: finiteNumber(values.get("LGT"), 0, 999, "LGT"),
      precipitationProbabilityPercent: finiteNumber(
        values.get("POP"),
        0,
        100,
        "POP",
      ),
      missingSourceCategories: forecastCategories.filter(
        (category) => !values.has(category),
      ),
      domainReadiness: domainReadiness(
        "KMA_FORECAST_DOES_NOT_COVER_REQUIRED_SAFETY_FIELDS",
      ),
    }));
  const evidence = await publicProvenance({
    responseText,
    receivedAt,
    validAt: issuedAt,
    sourceId: "kma-api-hub-ultra-short-forecast",
    sourceLabel: "기상청 API허브 · 초단기예보조회",
    transformedBy: "kma-api-hub-forecast-adapter@1.1.0",
  });
  return {
    schemaVersion: "kma-api-hub-ultra-short-forecast-v1",
    areaId: request.areaId,
    issuedAt,
    grid: { x: request.gridX, y: request.gridY },
    points,
    ...evidence,
  };
}

const validateRequest = (request: KmaGridRequest) => {
  if (
    !/^\d{8}$/.test(request.baseDate) ||
    !/^\d{4}$/.test(request.baseTime) ||
    !Number.isInteger(request.gridX) ||
    request.gridX < 1 ||
    request.gridX > 149 ||
    !Number.isInteger(request.gridY) ||
    request.gridY < 1 ||
    request.gridY > 253 ||
    !request.areaId.trim()
  ) {
    throw new KmaProviderError("MALFORMED_RESPONSE");
  }
};

export function createKmaLiveAdapter({
  config: rawConfig,
  fetchImplementation = fetch,
  nowIso = () => new Date().toISOString(),
}: {
  config: KmaLiveConfig;
  fetchImplementation?: FetchImplementation;
  nowIso?: () => string;
}) {
  const config = validateKmaLiveConfig(rawConfig);
  const requestJson = async (url: string, request: KmaGridRequest) => {
    if (typeof window !== "undefined") {
      throw new KmaProviderError("UNAUTHORIZED");
    }
    validateRequest(request);
    const endpoint = new URL(url);
    endpoint.searchParams.set("authKey", config.authKey);
    endpoint.searchParams.set("pageNo", "1");
    endpoint.searchParams.set("numOfRows", "1000");
    endpoint.searchParams.set("dataType", "JSON");
    endpoint.searchParams.set("base_date", request.baseDate);
    endpoint.searchParams.set("base_time", request.baseTime);
    endpoint.searchParams.set("nx", String(request.gridX));
    endpoint.searchParams.set("ny", String(request.gridY));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImplementation(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        throw new KmaProviderError("UNAUTHORIZED");
      }
      if (response.status === 429) throw new KmaProviderError("RATE_LIMITED");
      if (!response.ok) throw new KmaProviderError("NETWORK_ERROR");
      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > config.maxResponseBytes
      ) {
        throw new KmaProviderError("MALFORMED_RESPONSE");
      }
      const responseText = await response.text();
      if (
        new TextEncoder().encode(responseText).byteLength >
        config.maxResponseBytes
      ) {
        throw new KmaProviderError("MALFORMED_RESPONSE");
      }
      return responseText;
    } catch (error) {
      if (error instanceof KmaProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new KmaProviderError("TIMEOUT");
      }
      throw new KmaProviderError("NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    fetchObservation: async (request: KmaObservationRequest) =>
      parseKmaObservationResponse({
        responseText: await requestJson(config.observationUrl, request),
        request,
        receivedAt: nowIso(),
        maxAgeMinutes: config.maxAgeMinutes,
      }),
    fetchForecast: async (request: KmaForecastRequest) =>
      parseKmaForecastResponse({
        responseText: await requestJson(config.forecastUrl, request),
        request,
        receivedAt: nowIso(),
        maxAgeMinutes: config.maxAgeMinutes,
      }),
  };
}
