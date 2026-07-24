import { z } from "zod";
import { ProvenanceSchema, type Provenance } from "../../domain/contracts";

export const officialTaasPortalUri =
  "https://opendata.koroad.or.kr/api/selectOpenApi.do";
export const officialTaasTruckDatasetUri =
  "https://opendata.koroad.or.kr/api/selectTruckDataSet.do";
export const officialTaasStatsDatasetUri =
  "https://opendata.koroad.or.kr/api/selectSttDataSet.do";
export const officialTaasTruckUrl =
  "https://opendata.koroad.or.kr/data/rest/frequentzone/truck";
export const officialTaasStatsUrl =
  "https://opendata.koroad.or.kr/data/rest/stt";
export const officialTaasHost = "opendata.koroad.or.kr";

export type TaasFailureCode =
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "MALFORMED_RESPONSE"
  | "PROVIDER_ERROR";

export class TaasProviderError extends Error {
  readonly code: TaasFailureCode;
  readonly diagnosticCode?: string;

  constructor(code: TaasFailureCode, diagnosticCode?: string) {
    super(code);
    this.name = "TaasProviderError";
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}

export type TaasLiveConfig = {
  truckAuthKey: string;
  statsAuthKey: string;
  truckUrl: string;
  statsUrl: string;
  allowedHost: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type TaasTruckRequest = {
  areaId: string;
  year: number;
  sidoCode: string;
  gugunCode: string;
};

export type TaasStatsRequest = {
  areaId: string;
  year: number;
  sidoCode: string;
  gugunCode: string;
};

export type TaasPublicDataReadiness = {
  safeForSafetyEngine: false;
  allowedUse: "REGIONAL_CONTEXT_AND_EVALUATION_ONLY";
  reason:
    | "AGGREGATED_TRUCK_CRASH_HISTORY_IS_NOT_A_COURIER_RISK_LABEL"
    | "MUNICIPAL_CRASH_STATISTICS_ARE_NOT_A_COURIER_RISK_LABEL";
};

export type TaasTruckZone = {
  zoneId: string;
  legalDistrictCode: string;
  areaLabel: string;
  spotLabel: string;
  occurrenceCount: number;
  casualtyCount: number;
  deathCount: number;
  seriousInjuryCount: number;
  slightInjuryCount: number;
  reportedInjuryCount: number;
  centroid: { longitude: number; latitude: number };
};

export type TaasTruckCandidate = {
  schemaVersion: "taas-truck-frequent-zone-v1";
  status: "AVAILABLE" | "NO_DATA";
  areaId: string;
  year: number;
  areaCodes: { sido: string; gugun: string };
  zones: TaasTruckZone[];
  responseSha256: string;
  provenance: Provenance;
  domainReadiness: TaasPublicDataReadiness;
};

export type TaasMunicipalStatistic = {
  category: string;
  accidentCount: number;
  deathCount: number;
  injuredPersonCount: number;
  fatalityRate: number;
};

export type TaasStatsCandidate = {
  schemaVersion: "taas-municipal-crash-statistics-v1";
  status: "AVAILABLE" | "NO_DATA";
  areaId: string;
  year: number;
  areaCodes: { sido: string; gugun: string };
  areaLabel?: string;
  statistics: TaasMunicipalStatistic[];
  responseSha256: string;
  provenance: Provenance;
  domainReadiness: TaasPublicDataReadiness;
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

const normalizeAuthKey = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length < 10 || trimmed.includes('"') || /\s/.test(trimmed)) {
    throw new Error("TAAS API key is missing or malformed");
  }
  if (!trimmed.includes("%")) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    throw new Error("TAAS API key URL encoding is malformed");
  }
};

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
    endpoint.hostname.toLowerCase() !== officialTaasHost ||
    endpoint.hostname.toLowerCase() !== allowedHost.toLowerCase() ||
    endpoint.toString() !== expected
  ) {
    throw new Error(
      `TAAS ${label} endpoint must match the approved HTTPS contract`,
    );
  }
  return endpoint.toString();
};

export function requiredTaasEnvironmentVariables() {
  return [
    "TAAS_TRUCK_API_KEY or TAAS_API_KEY",
    "TAAS_STATS_API_KEY or shared TAAS_API_KEY",
  ] as const;
}

export function missingTaasEnvironmentVariables(environment: ServerEnvironment) {
  const missing: string[] = [];
  if (!(environment.TAAS_TRUCK_API_KEY ?? environment.TAAS_API_KEY)?.trim()) {
    missing.push("TAAS_TRUCK_API_KEY or TAAS_API_KEY");
  }
  if (!(environment.TAAS_STATS_API_KEY ?? environment.TAAS_API_KEY)?.trim()) {
    missing.push("TAAS_STATS_API_KEY or shared TAAS_API_KEY");
  }
  return missing;
}

export function validateTaasLiveConfig(config: TaasLiveConfig): TaasLiveConfig {
  if (!/^[a-z0-9.-]+$/i.test(config.allowedHost)) {
    throw new Error("TAAS_ALLOWED_HOST must be a hostname only");
  }
  const truckUrl = validateOfficialEndpoint(
    config.truckUrl,
    officialTaasTruckUrl,
    config.allowedHost,
    "truck",
  );
  const statsUrl = validateOfficialEndpoint(
    config.statsUrl,
    officialTaasStatsUrl,
    config.allowedHost,
    "statistics",
  );
  if (
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < 1_000 ||
    config.timeoutMs > 30_000
  ) {
    throw new Error("TAAS timeout must be between 1000 and 30000 milliseconds");
  }
  if (
    !Number.isInteger(config.maxResponseBytes) ||
    config.maxResponseBytes < 1_024 ||
    config.maxResponseBytes > 2_000_000
  ) {
    throw new Error(
      "TAAS response limit must be between 1024 and 2000000 bytes",
    );
  }
  return {
    ...config,
    truckAuthKey: normalizeAuthKey(config.truckAuthKey),
    statsAuthKey: normalizeAuthKey(config.statsAuthKey),
    truckUrl,
    statsUrl,
    allowedHost: officialTaasHost,
  };
}

export function readTaasLiveConfig(
  environment: ServerEnvironment,
): TaasLiveConfig {
  return validateTaasLiveConfig({
    truckAuthKey:
      environment.TAAS_TRUCK_API_KEY ?? environment.TAAS_API_KEY ?? "",
    statsAuthKey:
      environment.TAAS_STATS_API_KEY ?? environment.TAAS_API_KEY ?? "",
    truckUrl: environment.TAAS_TRUCK_URL ?? officialTaasTruckUrl,
    statsUrl: environment.TAAS_STATS_URL ?? officialTaasStatsUrl,
    allowedHost: environment.TAAS_ALLOWED_HOST ?? officialTaasHost,
    timeoutMs: positiveInteger(
      "TAAS_TIMEOUT_MS",
      environment.TAAS_TIMEOUT_MS ?? "10000",
      1_000,
      30_000,
    ),
    maxResponseBytes: positiveInteger(
      "TAAS_MAX_RESPONSE_BYTES",
      environment.TAAS_MAX_RESPONSE_BYTES ?? "500000",
      1_024,
      2_000_000,
    ),
  });
}

const TaasEnvelopeBaseSchema = z.object({
  resultCode: z.union([z.string(), z.number()]),
  resultMsg: z.string(),
  totalCount: z.coerce.number().int().min(0).optional(),
  numOfRows: z.coerce.number().int().min(0).optional(),
  pageNo: z.coerce.number().int().min(1).optional(),
});

const TaasTruckItemSchema = z.object({
  afos_fid: z.union([z.string(), z.number()]),
  afos_id: z.union([z.string(), z.number()]),
  bjd_cd: z.string().regex(/^\d{10}$/),
  spot_cd: z.union([z.string(), z.number()]),
  sido_sgg_nm: z.string().min(1).max(100),
  spot_nm: z.string().min(1).max(300),
  occrrnc_cnt: z.coerce.number().int().min(0),
  caslt_cnt: z.coerce.number().int().min(0),
  dth_dnv_cnt: z.coerce.number().int().min(0),
  se_dnv_cnt: z.coerce.number().int().min(0),
  sl_dnv_cnt: z.coerce.number().int().min(0),
  wnd_dnv_cnt: z.coerce.number().int().min(0),
  geom_json: z.string().min(2).max(200_000),
  lo_crd: z.coerce.number().min(124).max(132),
  la_crd: z.coerce.number().min(33).max(39.5),
});

const TaasStatsItemSchema = z
  .object({
    std_year: z.coerce.string().regex(/^\d{4}$/),
    sido_sgg_nm: z.string().min(1).max(100),
    acc_cl_nm: z.string().min(1).max(100),
    acc_cnt: z.coerce.number().int().min(0),
    dth_dnv_cnt: z.coerce.number().int().min(0),
    ftlt_rate: z.coerce.number().min(0).max(100),
    injpsn_cnt: z.coerce.number().int().min(0),
  })
  .passthrough();

const createEnvelopeSchema = <T extends z.ZodType>(itemSchema: T) =>
  TaasEnvelopeBaseSchema.extend({
    items: z
      .object({
        item: z.array(itemSchema),
      })
      .optional(),
  });

const TaasTruckEnvelopeSchema = createEnvelopeSchema(TaasTruckItemSchema);
const TaasStatsEnvelopeSchema = createEnvelopeSchema(TaasStatsItemSchema);

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const publicProvenance = async ({
  responseText,
  receivedAt,
  year,
  sourceId,
  sourceLabel,
  sourceUri,
  transformedBy,
}: {
  responseText: string;
  receivedAt: string;
  year: number;
  sourceId: string;
  sourceLabel: string;
  sourceUri: string;
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
      validAt: `${year}-01-01T00:00:00+09:00`,
      transformedBy,
      licenseOrPolicy:
        "한국도로교통공단 TAAS OpenAPI 이용조건 · 출처 및 자료링크 표시",
      sourceUri,
      sourceVersion: `taas-openapi:${year}`,
      contentHashSha256: responseSha256,
      isDemo: true,
    }),
  };
};

const parseEnvelope = <T>(
  responseText: string,
  schema: z.ZodType<T>,
) => {
  let raw: unknown;
  try {
    raw = JSON.parse(responseText);
  } catch {
    throw new TaasProviderError(
      "MALFORMED_RESPONSE",
      responseText.trimStart().startsWith("<")
        ? "NON_JSON_RESPONSE"
        : "INVALID_JSON_RESPONSE",
    );
  }
  const base = TaasEnvelopeBaseSchema.safeParse(raw);
  if (!base.success) {
    throw new TaasProviderError("MALFORMED_RESPONSE", "ENVELOPE_MISMATCH");
  }
  const resultCode = String(base.data.resultCode).padStart(2, "0");
  if (resultCode === "03") {
    return {
      status: "NO_DATA" as const,
      data: base.data,
    };
  }
  if (resultCode !== "00") {
    throw new TaasProviderError(
      resultCode === "30" ? "UNAUTHORIZED" : "PROVIDER_ERROR",
      resultCode === "10" ? "PARAMETER_ERROR" : `RESULT_${resultCode}`,
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new TaasProviderError("MALFORMED_RESPONSE", "SCHEMA_MISMATCH");
  }
  return {
    status: "AVAILABLE" as const,
    data: parsed.data,
  };
};

const validateRequest = ({
  areaId,
  year,
  sidoCode,
  gugunCode,
}: TaasTruckRequest | TaasStatsRequest) => {
  if (
    !areaId.trim() ||
    !Number.isInteger(year) ||
    year < 2019 ||
    year > 2100 ||
    !/^\d{2,4}$/.test(sidoCode) ||
    !/^\d{3,4}$/.test(gugunCode)
  ) {
    throw new TaasProviderError("MALFORMED_RESPONSE", "INVALID_REQUEST");
  }
};

export async function parseTaasTruckResponse({
  responseText,
  request,
  receivedAt,
}: {
  responseText: string;
  request: TaasTruckRequest;
  receivedAt: string;
}): Promise<TaasTruckCandidate> {
  validateRequest(request);
  const parsed = parseEnvelope(responseText, TaasTruckEnvelopeSchema);
  const items =
    parsed.status === "AVAILABLE" ? parsed.data.items?.item ?? [] : [];
  const zones = items.map((item) => {
    let geometry: unknown;
    try {
      geometry = JSON.parse(item.geom_json);
    } catch {
      throw new TaasProviderError(
        "MALFORMED_RESPONSE",
        "INVALID_GEOMETRY_JSON",
      );
    }
    if (
      !geometry ||
      typeof geometry !== "object" ||
      !("type" in geometry) ||
      geometry.type !== "Polygon"
    ) {
      throw new TaasProviderError(
        "MALFORMED_RESPONSE",
        "INVALID_GEOMETRY_TYPE",
      );
    }
    const casualtySum =
      item.dth_dnv_cnt +
      item.se_dnv_cnt +
      item.sl_dnv_cnt +
      item.wnd_dnv_cnt;
    if (casualtySum !== item.caslt_cnt) {
      throw new TaasProviderError(
        "MALFORMED_RESPONSE",
        "CASUALTY_TOTAL_MISMATCH",
      );
    }
    return {
      zoneId: String(item.afos_fid),
      legalDistrictCode: item.bjd_cd,
      areaLabel: item.sido_sgg_nm,
      spotLabel: item.spot_nm,
      occurrenceCount: item.occrrnc_cnt,
      casualtyCount: item.caslt_cnt,
      deathCount: item.dth_dnv_cnt,
      seriousInjuryCount: item.se_dnv_cnt,
      slightInjuryCount: item.sl_dnv_cnt,
      reportedInjuryCount: item.wnd_dnv_cnt,
      centroid: {
        longitude: item.lo_crd,
        latitude: item.la_crd,
      },
    };
  });
  const evidence = await publicProvenance({
    responseText,
    receivedAt,
    year: request.year,
    sourceId: "taas-truck-frequent-zone",
    sourceLabel: "TAAS · 화물차 교통사고 다발지역",
    sourceUri: officialTaasTruckDatasetUri,
    transformedBy: "taas-truck-adapter@1.0.0",
  });
  return {
    schemaVersion: "taas-truck-frequent-zone-v1",
    status: zones.length ? "AVAILABLE" : "NO_DATA",
    areaId: request.areaId,
    year: request.year,
    areaCodes: { sido: request.sidoCode, gugun: request.gugunCode },
    zones,
    ...evidence,
    domainReadiness: {
      safeForSafetyEngine: false,
      allowedUse: "REGIONAL_CONTEXT_AND_EVALUATION_ONLY",
      reason: "AGGREGATED_TRUCK_CRASH_HISTORY_IS_NOT_A_COURIER_RISK_LABEL",
    },
  };
}

export async function parseTaasStatsResponse({
  responseText,
  request,
  receivedAt,
}: {
  responseText: string;
  request: TaasStatsRequest;
  receivedAt: string;
}): Promise<TaasStatsCandidate> {
  validateRequest(request);
  const parsed = parseEnvelope(responseText, TaasStatsEnvelopeSchema);
  const items =
    parsed.status === "AVAILABLE" ? parsed.data.items?.item ?? [] : [];
  for (const item of items) {
    if (Number(item.std_year) !== request.year) {
      throw new TaasProviderError(
        "MALFORMED_RESPONSE",
        "YEAR_MISMATCH",
      );
    }
  }
  const labels = new Set(items.map((item) => item.sido_sgg_nm));
  if (labels.size > 1) {
    throw new TaasProviderError(
      "MALFORMED_RESPONSE",
      "MIXED_MUNICIPALITY",
    );
  }
  const evidence = await publicProvenance({
    responseText,
    receivedAt,
    year: request.year,
    sourceId: "taas-municipal-crash-statistics",
    sourceLabel: "TAAS · 지자체별 대상 교통사고 통계",
    sourceUri: officialTaasStatsDatasetUri,
    transformedBy: "taas-municipal-stats-adapter@1.0.0",
  });
  return {
    schemaVersion: "taas-municipal-crash-statistics-v1",
    status: items.length ? "AVAILABLE" : "NO_DATA",
    areaId: request.areaId,
    year: request.year,
    areaCodes: { sido: request.sidoCode, gugun: request.gugunCode },
    areaLabel: items[0]?.sido_sgg_nm,
    statistics: items.map((item) => ({
      category: item.acc_cl_nm,
      accidentCount: item.acc_cnt,
      deathCount: item.dth_dnv_cnt,
      injuredPersonCount: item.injpsn_cnt,
      fatalityRate: item.ftlt_rate,
    })),
    ...evidence,
    domainReadiness: {
      safeForSafetyEngine: false,
      allowedUse: "REGIONAL_CONTEXT_AND_EVALUATION_ONLY",
      reason: "MUNICIPAL_CRASH_STATISTICS_ARE_NOT_A_COURIER_RISK_LABEL",
    },
  };
}

const mapHttpFailure = (status: number) => {
  if (status === 401 || status === 403) return "UNAUTHORIZED" as const;
  if (status === 429) return "RATE_LIMITED" as const;
  return "NETWORK_ERROR" as const;
};

export function createTaasLiveAdapter({
  config: rawConfig,
  fetchImplementation = fetch,
  nowIso = () => new Date().toISOString(),
}: {
  config: TaasLiveConfig;
  fetchImplementation?: FetchImplementation;
  nowIso?: () => string;
}) {
  const config = validateTaasLiveConfig(rawConfig);
  const requestJson = async (
    url: string,
    authKey: string,
    request: TaasTruckRequest | TaasStatsRequest,
  ) => {
    if (typeof window !== "undefined") {
      throw new TaasProviderError("UNAUTHORIZED");
    }
    validateRequest(request);
    const endpoint = new URL(url);
    endpoint.searchParams.set("authKey", authKey);
    endpoint.searchParams.set("searchYearCd", String(request.year));
    endpoint.searchParams.set("siDo", request.sidoCode);
    endpoint.searchParams.set("guGun", request.gugunCode);
    endpoint.searchParams.set("type", "json");
    endpoint.searchParams.set("numOfRows", "100");
    endpoint.searchParams.set("pageNo", "1");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImplementation(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "SafeRouteAI/1.0 public-data-validation",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new TaasProviderError(mapHttpFailure(response.status));
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > config.maxResponseBytes) {
        throw new TaasProviderError(
          "MALFORMED_RESPONSE",
          "RESPONSE_TOO_LARGE",
        );
      }
      return text;
    } catch (error) {
      if (error instanceof TaasProviderError) throw error;
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        throw new TaasProviderError("TIMEOUT");
      }
      throw new TaasProviderError("NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    async fetchTruckZones(request: TaasTruckRequest) {
      const responseText = await requestJson(
        config.truckUrl,
        config.truckAuthKey,
        request,
      );
      return parseTaasTruckResponse({
        responseText,
        request,
        receivedAt: nowIso(),
      });
    },
    async fetchMunicipalStats(request: TaasStatsRequest) {
      const responseText = await requestJson(
        config.statsUrl,
        config.statsAuthKey,
        request,
      );
      return parseTaasStatsResponse({
        responseText,
        request,
        receivedAt: nowIso(),
      });
    },
  };
}
