import { z } from "zod";
import { ProvenanceSchema, type Provenance } from "../../domain/contracts";
import { KmaProviderError, officialKmaHost, type KmaFailureCode } from "./kma";

export const officialKmaHighResolutionPointUrl =
  "https://apihub.kma.go.kr/api/typ01/url/sfc_nc_var.php";
export const officialKmaHighResolutionDatasetUri =
  "https://apihub.kma.go.kr/apiList.do?seqApi=971";
export const officialKmaShortForecastUrl =
  "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst";
export const officialKmaShortForecastDatasetUri =
  "https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=286";
export const kmaShortForecastMaximumIssueAgeMinutes = 210;

export type KmaSupplementConfig = {
  authKey: string;
  allowedHost: string;
  timeoutMs: number;
  maxResponseBytes: number;
  maxAgeMinutes: number;
};

export type KmaHighResolutionRequest = {
  representativePointId: string;
  timeKst: string;
  longitude: number;
  latitude: number;
};

export type KmaShortForecastRequest = {
  areaId: string;
  baseDate: string;
  baseTime: string;
  gridX: number;
  gridY: number;
  horizonStartIso: string;
  horizonMinutes: 120;
};

export type KmaHighResolutionCandidate = {
  schemaVersion: "kma-high-resolution-point-v1";
  representativePointId: string;
  observedAt: string;
  feelsLikeCelsius?: number;
  visibilityMeters?: number;
  newSnowThreeHoursCm?: number;
  missingSourceFields: Array<"ta_chi" | "vs" | "sd_3hr">;
  domainReadiness: {
    safeForSafetyEngine: false;
    reason: "CURRENT_ONLY_AND_THREE_HOUR_SNOW_NOT_HOURLY";
  };
  responseSha256: string;
  provenance: Provenance;
};

export type KmaSnowfallRange = {
  minimumInclusive: number;
  maximumExclusive?: number;
};

export type KmaShortForecastPoint = {
  forecastAt: string;
  snowfallCmPerHour?: number;
  snowfallRangeCmPerHour?: KmaSnowfallRange;
  airTemperatureCelsius?: number;
  relativeHumidityPercent?: number;
  windSpeedMetersPerSecond?: number;
  feelsLikeCelsius?: number;
  feelsLikeDerivation?: {
    formulaVersion:
      | "KMA_SUMMER_HUMIDITY_FORMULA_2025"
      | "KMA_WINTER_WIND_FORMULA_2025";
    airTemperatureCelsius: number;
    relativeHumidityPercent?: number;
    windSpeedMetersPerSecond?: number;
  };
  missingSourceCategories: Array<"SNO" | "TMP" | "REH" | "WSD">;
};

export type KmaShortForecastCandidate = {
  schemaVersion: "kma-vilage-short-forecast-weather-v2";
  areaId: string;
  issuedAt: string;
  horizonStart: string;
  horizonMinutes: 120;
  grid: { x: number; y: number };
  points: KmaShortForecastPoint[];
  domainReadiness: {
    safeForSafetyEngine: false;
    reason: "SNOW_AND_DERIVED_FEELS_LIKE_DO_NOT_COVER_COMPLETE_WEATHER_STATE";
  };
  responseSha256: string;
  provenance: Provenance;
};

type ServerEnvironment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;

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

export function readKmaSupplementConfig(
  environment: ServerEnvironment,
): KmaSupplementConfig {
  return validateKmaSupplementConfig({
    authKey: environment.KMA_API_HUB_AUTH_KEY ?? "",
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

export function validateKmaSupplementConfig(
  config: KmaSupplementConfig,
): KmaSupplementConfig {
  if (config.authKey.trim().length < 10) {
    throw new Error("KMA_API_HUB_AUTH_KEY is missing or too short");
  }
  if (config.allowedHost.toLowerCase() !== officialKmaHost) {
    throw new Error("KMA supplement host must match the approved API Hub host");
  }
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
  return { ...config, authKey: config.authKey.trim(), allowedHost: officialKmaHost };
}

const dateTimeIso = (date: string, time: string) => {
  const value = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+09:00`;
  if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time) || !Number.isFinite(Date.parse(value))) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_KST_TIMESTAMP");
  }
  return value;
};

const compactTimeIso = (timeKst: string) => {
  if (!/^\d{12}$/.test(timeKst)) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_KST_TIMESTAMP");
  }
  return dateTimeIso(timeKst.slice(0, 8), timeKst.slice(8));
};

const sha256Bytes = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const publicProvenance = ({
  responseSha256,
  receivedAt,
  validAt,
  sourceId,
  sourceLabel,
  sourceUri,
  sourceVersion,
  transformedBy,
}: {
  responseSha256: string;
  receivedAt: string;
  validAt: string;
  sourceId: string;
  sourceLabel: string;
  sourceUri: string;
  sourceVersion: string;
  transformedBy: string;
}) =>
  ProvenanceSchema.parse({
    kind: "PUBLIC_DATA_DERIVED",
    sourceId,
    sourceLabel,
    collectedAt: receivedAt,
    validAt,
    transformedBy,
    licenseOrPolicy: "기상청 API허브 이용정책·API별 제공조건",
    sourceUri,
    sourceVersion,
    contentHashSha256: responseSha256,
    isDemo: true,
  });

const assertFresh = (validAt: string, receivedAt: string, maxAgeMinutes: number) => {
  const ageMinutes = (Date.parse(receivedAt) - Date.parse(validAt)) / 60_000;
  if (ageMinutes < -5 || ageMinutes > maxAgeMinutes) {
    throw new KmaProviderError("STALE_DATA");
  }
};

const optionalNumber = (
  raw: string,
  minimum: number,
  maximum: number,
  field: string,
  missing: (value: number) => boolean,
) => {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new KmaProviderError("MALFORMED_RESPONSE", `INVALID_NUMERIC_${field}`);
  }
  if (missing(value)) return undefined;
  if (value < minimum || value > maximum) {
    throw new KmaProviderError("MALFORMED_RESPONSE", `OUT_OF_RANGE_${field}`);
  }
  return value;
};

export async function parseKmaHighResolutionResponse({
  responseBytes,
  request,
  receivedAt,
  maxAgeMinutes,
}: {
  responseBytes: Uint8Array;
  request: KmaHighResolutionRequest;
  receivedAt: string;
  maxAgeMinutes: number;
}): Promise<KmaHighResolutionCandidate> {
  const responseText = new TextDecoder("euc-kr").decode(responseBytes);
  const lines = responseText
    .split(/\r?\n/)
    .map((line) => line.trim());
  const fieldHeader = lines.find((line) => /^#\s*tm\s*,/i.test(line));
  const fieldOrder = fieldHeader
    ?.replace(/^#\s*/, "")
    .split(",")
    .map((field) => field.trim().toLowerCase());
  if (fieldOrder?.join(",") !== "tm,ta_chi,vs,sd_3hr") {
    throw new KmaProviderError("MALFORMED_RESPONSE", "UNVERIFIED_FIELD_ORDER");
  }
  const dataLines = lines.filter((line) => /^\d{12}(?:\s|,)/.test(line));
  if (dataLines.length !== 1) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "EXPECTED_ONE_DATA_ROW");
  }
  const tokens = dataLines[0].split(/[\s,]+/).filter(Boolean);
  if (tokens.length !== 4 || tokens[0] !== request.timeKst) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "UNEXPECTED_DATA_SHAPE");
  }
  const observedAt = compactTimeIso(tokens[0]);
  assertFresh(observedAt, receivedAt, maxAgeMinutes);
  const feelsLikeCelsius = optionalNumber(
    tokens[1],
    -60,
    60,
    "TA_CHI",
    (value) => Math.abs(value) >= 90,
  );
  const visibilityKm = optionalNumber(
    tokens[2],
    0,
    100,
    "VS",
    (value) => value < 0 || value >= 900,
  );
  const newSnowThreeHoursCm = optionalNumber(
    tokens[3],
    0,
    300,
    "SD_3HR",
    (value) => value < 0 || value >= 900,
  );
  const responseSha256 = await sha256Bytes(responseBytes);
  const missingSourceFields = [
    ...(feelsLikeCelsius === undefined ? (["ta_chi"] as const) : []),
    ...(visibilityKm === undefined ? (["vs"] as const) : []),
    ...(newSnowThreeHoursCm === undefined ? (["sd_3hr"] as const) : []),
  ];
  return {
    schemaVersion: "kma-high-resolution-point-v1",
    representativePointId: request.representativePointId,
    observedAt,
    ...(feelsLikeCelsius === undefined ? {} : { feelsLikeCelsius }),
    ...(visibilityKm === undefined ? {} : { visibilityMeters: visibilityKm * 1_000 }),
    ...(newSnowThreeHoursCm === undefined ? {} : { newSnowThreeHoursCm }),
    missingSourceFields,
    domainReadiness: {
      safeForSafetyEngine: false,
      reason: "CURRENT_ONLY_AND_THREE_HOUR_SNOW_NOT_HOURLY",
    },
    responseSha256,
    provenance: publicProvenance({
      responseSha256,
      receivedAt,
      validAt: observedAt,
      sourceId: "kma-api-hub-high-resolution-point",
      sourceLabel: "기상청 API허브 · 고해상도 격자 특정지점 다중요소",
      sourceUri: officialKmaHighResolutionDatasetUri,
      sourceVersion: "kma-api-hub:seqApi=971:1.3:2026-07-17",
      transformedBy: "kma-high-resolution-point-adapter@1.0.0",
    }),
  };
}

const KmaShortForecastItemSchema = z.object({
  baseDate: z.string().regex(/^\d{8}$/),
  baseTime: z.string().regex(/^\d{4}$/),
  fcstDate: z.string().regex(/^\d{8}$/),
  fcstTime: z.string().regex(/^\d{4}$/),
  category: z.string().min(1).max(10),
  nx: z.coerce.number().int().min(1).max(149),
  ny: z.coerce.number().int().min(1).max(253),
  fcstValue: z.union([z.string(), z.number(), z.null()]),
});

const KmaShortForecastEnvelopeSchema = z.object({
  response: z.object({
    header: z.object({
      resultCode: z.union([z.string(), z.number()]),
      resultMsg: z.string(),
    }),
    body: z.object({ items: z.object({ item: z.array(KmaShortForecastItemSchema) }) }).optional(),
  }),
});

const providerFailureCode = (message: string): KmaFailureCode => {
  const normalized = message.toLowerCase();
  if (normalized.includes("service key") || normalized.includes("auth") || normalized.includes("인증키")) {
    return "UNAUTHORIZED";
  }
  if (normalized.includes("limit") || normalized.includes("traffic") || normalized.includes("횟수")) {
    return "RATE_LIMITED";
  }
  return "PROVIDER_ERROR";
};

export function parseKmaSnowfall(value: string | number | null) {
  if (value === null) return { snowfallCmPerHour: 0 };
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 300) {
      throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_SNO");
    }
    return { snowfallCmPerHour: value };
  }
  const normalized = value.trim().replaceAll(" ", "");
  if (["", "-", "null", "적설없음", "0", "0.0", "0cm", "0.0cm"].includes(normalized)) {
    return { snowfallCmPerHour: 0 };
  }
  if (/^0\.5cm미만$/i.test(normalized)) {
    return {
      snowfallRangeCmPerHour: { minimumInclusive: 0.1, maximumExclusive: 0.5 },
    };
  }
  const exact = normalized.match(/^(\d+(?:\.\d+)?)cm$/i);
  if (exact) {
    const parsed = Number(exact[1]);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 5) {
      throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_SNO_EXACT");
    }
    return { snowfallCmPerHour: parsed };
  }
  const atLeast = normalized.match(/^5(?:\.0)?cm이상$/i);
  if (atLeast) {
    return { snowfallRangeCmPerHour: { minimumInclusive: 5 } };
  }
  throw new KmaProviderError("MALFORMED_RESPONSE", "UNSUPPORTED_SNO_FORMAT");
}

const forecastNumber = (
  value: string | number | null | undefined,
  minimum: number,
  maximum: number,
  category: string,
) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new KmaProviderError(
      "MALFORMED_RESPONSE",
      `INVALID_NUMERIC_${category}`,
    );
  }
  return parsed;
};

export function deriveKmaFeelsLike({
  forecastAt,
  airTemperatureCelsius,
  relativeHumidityPercent,
  windSpeedMetersPerSecond,
}: {
  forecastAt: string;
  airTemperatureCelsius?: number;
  relativeHumidityPercent?: number;
  windSpeedMetersPerSecond?: number;
}) {
  const month = Number(forecastAt.slice(5, 7));
  let feelsLikeCelsius: number | undefined;
  let formulaVersion:
    | "KMA_SUMMER_HUMIDITY_FORMULA_2025"
    | "KMA_WINTER_WIND_FORMULA_2025"
    | undefined;
  if (
    month >= 5 &&
    month <= 9 &&
    airTemperatureCelsius !== undefined &&
    relativeHumidityPercent !== undefined
  ) {
    const ta = airTemperatureCelsius;
    const rh = relativeHumidityPercent;
    const wetBulbCelsius =
      ta * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(ta + rh) -
      Math.atan(rh - 1.67633) +
      0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) -
      4.686035;
    feelsLikeCelsius =
      -0.2442 +
      0.55399 * wetBulbCelsius +
      0.45535 * ta -
      0.0022 * wetBulbCelsius ** 2 +
      0.00278 * wetBulbCelsius * ta +
      3.0;
    formulaVersion = "KMA_SUMMER_HUMIDITY_FORMULA_2025";
  } else if (
    (month >= 10 || month <= 4) &&
    airTemperatureCelsius !== undefined &&
    airTemperatureCelsius <= 10 &&
    windSpeedMetersPerSecond !== undefined &&
    windSpeedMetersPerSecond >= 1.3
  ) {
    const ta = airTemperatureCelsius;
    const windKilometersPerHour = windSpeedMetersPerSecond * 3.6;
    const windPower = windKilometersPerHour ** 0.16;
    feelsLikeCelsius =
      13.12 + 0.6215 * ta - 11.37 * windPower + 0.3965 * windPower * ta;
    formulaVersion = "KMA_WINTER_WIND_FORMULA_2025";
  }
  if (feelsLikeCelsius === undefined || formulaVersion === undefined) return {};
  if (
    !Number.isFinite(feelsLikeCelsius) ||
    feelsLikeCelsius < -40 ||
    feelsLikeCelsius > 60
  ) {
    throw new KmaProviderError(
      "MALFORMED_RESPONSE",
      "DERIVED_FEELS_LIKE_OUT_OF_RANGE",
    );
  }
  return {
    feelsLikeCelsius,
    feelsLikeDerivation: {
      formulaVersion,
      airTemperatureCelsius: airTemperatureCelsius!,
      ...(formulaVersion === "KMA_SUMMER_HUMIDITY_FORMULA_2025"
        ? { relativeHumidityPercent }
        : { windSpeedMetersPerSecond }),
    },
  };
}

export async function parseKmaShortForecastResponse({
  responseText,
  request,
  receivedAt,
  maxAgeMinutes,
}: {
  responseText: string;
  request: KmaShortForecastRequest;
  receivedAt: string;
  maxAgeMinutes: number;
}): Promise<KmaShortForecastCandidate> {
  let raw: unknown;
  try {
    raw = JSON.parse(responseText);
  } catch {
    throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_JSON_RESPONSE");
  }
  const parsed = KmaShortForecastEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "SCHEMA_MISMATCH");
  }
  const resultCode = String(parsed.data.response.header.resultCode).padStart(2, "0");
  if (resultCode !== "00") {
    throw new KmaProviderError(providerFailureCode(parsed.data.response.header.resultMsg));
  }
  const items = parsed.data.response.body?.items.item;
  if (!items?.length) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "EMPTY_ITEMS");
  }
  const issuedAt = dateTimeIso(request.baseDate, request.baseTime);
  assertFresh(issuedAt, receivedAt, maxAgeMinutes);
  const horizonStartMs = Date.parse(request.horizonStartIso);
  if (!Number.isFinite(horizonStartMs)) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_HORIZON");
  }
  const horizonEndMs = horizonStartMs + request.horizonMinutes * 60_000;
  const relevantCategories = ["SNO", "TMP", "REH", "WSD"] as const;
  const valuesByTime = new Map<
    string,
    Map<(typeof relevantCategories)[number], string | number | null>
  >();
  for (const item of items) {
    if (
      item.baseDate !== request.baseDate ||
      item.baseTime !== request.baseTime ||
      item.nx !== request.gridX ||
      item.ny !== request.gridY
    ) {
      throw new KmaProviderError("MALFORMED_RESPONSE", "REQUEST_MISMATCH");
    }
    if (!relevantCategories.includes(item.category as (typeof relevantCategories)[number])) {
      continue;
    }
    const forecastAt = dateTimeIso(item.fcstDate, item.fcstTime);
    const forecastMs = Date.parse(forecastAt);
    if (forecastMs < horizonStartMs || forecastMs > horizonEndMs) continue;
    const category = item.category as (typeof relevantCategories)[number];
    const values = valuesByTime.get(forecastAt) ?? new Map();
    if (values.has(category)) {
      throw new KmaProviderError(
        "MALFORMED_RESPONSE",
        `DUPLICATE_${category}`,
      );
    }
    values.set(category, item.fcstValue);
    valuesByTime.set(forecastAt, values);
  }
  const points = [...valuesByTime.entries()]
    .sort(([left], [right]) => Date.parse(left) - Date.parse(right))
    .map(([forecastAt, values]) => {
      const airTemperatureCelsius = forecastNumber(
        values.get("TMP"),
        -60,
        60,
        "TMP",
      );
      const relativeHumidityPercent = forecastNumber(
        values.get("REH"),
        0,
        100,
        "REH",
      );
      const windSpeedMetersPerSecond = forecastNumber(
        values.get("WSD"),
        0,
        100,
        "WSD",
      );
      return {
        forecastAt,
        ...(values.has("SNO") ? parseKmaSnowfall(values.get("SNO")!) : {}),
        ...(airTemperatureCelsius === undefined ? {} : { airTemperatureCelsius }),
        ...(relativeHumidityPercent === undefined ? {} : { relativeHumidityPercent }),
        ...(windSpeedMetersPerSecond === undefined
          ? {}
          : { windSpeedMetersPerSecond }),
        ...deriveKmaFeelsLike({
          forecastAt,
          airTemperatureCelsius,
          relativeHumidityPercent,
          windSpeedMetersPerSecond,
        }),
        missingSourceCategories: relevantCategories.filter(
          (category) => !values.has(category),
        ),
      };
    });
  if (!points.length) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "NO_WEATHER_IN_HORIZON");
  }
  const responseSha256 = await sha256Bytes(new TextEncoder().encode(responseText));
  return {
    schemaVersion: "kma-vilage-short-forecast-weather-v2",
    areaId: request.areaId,
    issuedAt,
    horizonStart: request.horizonStartIso,
    horizonMinutes: 120,
    grid: { x: request.gridX, y: request.gridY },
    points,
    domainReadiness: {
      safeForSafetyEngine: false,
      reason:
        "SNOW_AND_DERIVED_FEELS_LIKE_DO_NOT_COVER_COMPLETE_WEATHER_STATE",
    },
    responseSha256,
    provenance: publicProvenance({
      responseSha256,
      receivedAt,
      validAt: issuedAt,
      sourceId: "kma-api-hub-vilage-short-forecast-weather",
      sourceLabel: "기상청 API허브 · 동네예보 단기예보 적설·체감온도 입력",
      sourceUri: officialKmaShortForecastDatasetUri,
      sourceVersion: "kma-api-hub:seqApi=10:seqApiSub=286:4.3:2026-07-17",
      transformedBy: "kma-short-forecast-weather-adapter@2.0.0",
    }),
  };
}

const validateHighResolutionRequest = (request: KmaHighResolutionRequest) => {
  compactTimeIso(request.timeKst);
  if (
    !request.representativePointId.trim() ||
    !Number.isFinite(request.longitude) ||
    request.longitude < 124 ||
    request.longitude > 132 ||
    !Number.isFinite(request.latitude) ||
    request.latitude < 33 ||
    request.latitude > 39
  ) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_POINT_REQUEST");
  }
};

const validateShortForecastRequest = (request: KmaShortForecastRequest) => {
  dateTimeIso(request.baseDate, request.baseTime);
  if (
    !request.areaId.trim() ||
    !Number.isInteger(request.gridX) ||
    request.gridX < 1 ||
    request.gridX > 149 ||
    !Number.isInteger(request.gridY) ||
    request.gridY < 1 ||
    request.gridY > 253 ||
    request.horizonMinutes !== 120 ||
    !Number.isFinite(Date.parse(request.horizonStartIso))
  ) {
    throw new KmaProviderError("MALFORMED_RESPONSE", "INVALID_FORECAST_REQUEST");
  }
};

export function createKmaSupplementAdapter({
  config: rawConfig,
  fetchImplementation = fetch,
  nowIso = () => new Date().toISOString(),
}: {
  config: KmaSupplementConfig;
  fetchImplementation?: FetchImplementation;
  nowIso?: () => string;
}) {
  const config = validateKmaSupplementConfig(rawConfig);
  const requestBytes = async (endpoint: URL, accept: string) => {
    if (typeof window !== "undefined") throw new KmaProviderError("UNAUTHORIZED");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImplementation(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: accept },
      });
      if (response.status === 401 || response.status === 403) throw new KmaProviderError("UNAUTHORIZED");
      if (response.status === 429) throw new KmaProviderError("RATE_LIMITED");
      if (!response.ok) throw new KmaProviderError("NETWORK_ERROR");
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > config.maxResponseBytes) {
        throw new KmaProviderError("MALFORMED_RESPONSE", "RESPONSE_TOO_LARGE");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > config.maxResponseBytes) {
        throw new KmaProviderError("MALFORMED_RESPONSE", "RESPONSE_TOO_LARGE");
      }
      return bytes;
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
    fetchHighResolutionPoint: async (request: KmaHighResolutionRequest) => {
      validateHighResolutionRequest(request);
      const endpoint = new URL(officialKmaHighResolutionPointUrl);
      endpoint.searchParams.set("tm1", request.timeKst);
      endpoint.searchParams.set("tm2", request.timeKst);
      endpoint.searchParams.set("obs", "ta_chi,vs,sd_3hr");
      endpoint.searchParams.set("itv", "10");
      endpoint.searchParams.set("lon", String(request.longitude));
      endpoint.searchParams.set("lat", String(request.latitude));
      endpoint.searchParams.set("help", "1");
      endpoint.searchParams.set("authKey", config.authKey);
      return parseKmaHighResolutionResponse({
        responseBytes: await requestBytes(endpoint, "text/plain"),
        request,
        receivedAt: nowIso(),
        maxAgeMinutes: config.maxAgeMinutes,
      });
    },
    fetchShortForecast: async (request: KmaShortForecastRequest) => {
      validateShortForecastRequest(request);
      const endpoint = new URL(officialKmaShortForecastUrl);
      endpoint.searchParams.set("authKey", config.authKey);
      endpoint.searchParams.set("pageNo", "1");
      endpoint.searchParams.set("numOfRows", "1000");
      endpoint.searchParams.set("dataType", "JSON");
      endpoint.searchParams.set("base_date", request.baseDate);
      endpoint.searchParams.set("base_time", request.baseTime);
      endpoint.searchParams.set("nx", String(request.gridX));
      endpoint.searchParams.set("ny", String(request.gridY));
      const bytes = await requestBytes(endpoint, "application/json");
      return parseKmaShortForecastResponse({
        responseText: new TextDecoder().decode(bytes),
        request,
        receivedAt: nowIso(),
        maxAgeMinutes: kmaShortForecastMaximumIssueAgeMinutes,
      });
    },
  };
}
