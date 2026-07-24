import {
  createTaasLiveAdapter,
  missingTaasEnvironmentVariables,
  officialTaasStatsUrl,
  officialTaasTruckUrl,
  parseTaasStatsResponse,
  parseTaasTruckResponse,
  readTaasLiveConfig,
  TaasProviderError,
  type TaasStatsRequest,
  type TaasTruckRequest,
} from "../src/adapters/traffic";

type ServerEnvironment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;

export const taasTruckSmokeRequest: TaasTruckRequest = {
  areaId: "taas-seoul-yeongdeungpo-public-sample",
  year: 2024,
  sidoCode: "11",
  gugunCode: "560",
};

export const taasStatsSmokeRequest: TaasStatsRequest = {
  areaId: "taas-seoul-jungnang-public-statistics",
  year: 2024,
  sidoCode: "1100",
  gugunCode: "1121",
};

const mockTruckResponse = JSON.stringify({
  resultCode: "00",
  resultMsg: "NORMAL_CODE",
  items: {
    item: [
      {
        afos_fid: 7000001,
        afos_id: "mock-truck-zone-001",
        bjd_cd: "1156010100",
        spot_cd: "mock-spot-001",
        sido_sgg_nm: "합성 서울 영등포구",
        spot_nm: "합성 교차로 부근",
        occrrnc_cnt: 4,
        caslt_cnt: 5,
        dth_dnv_cnt: 0,
        se_dnv_cnt: 2,
        sl_dnv_cnt: 2,
        wnd_dnv_cnt: 1,
        geom_json: JSON.stringify({
          type: "Polygon",
          coordinates: [
            [
              [126.9, 37.5],
              [126.901, 37.5],
              [126.901, 37.501],
              [126.9, 37.5],
            ],
          ],
        }),
        lo_crd: "126.9005",
        la_crd: "37.5005",
      },
    ],
  },
  totalCount: 1,
  numOfRows: 1,
  pageNo: 1,
});

const mockStatsResponse = JSON.stringify({
  resultCode: "00",
  resultMsg: "NORMAL_CODE",
  items: {
    item: [
      {
        std_year: "2024",
        sido_sgg_nm: "합성 서울특별시 관악구",
        acc_cl_nm: "전체사고",
        acc_cnt: "720",
        dth_dnv_cnt: "4",
        ftlt_rate: "0.56",
        injpsn_cnt: "910",
      },
      {
        std_year: "2024",
        sido_sgg_nm: "합성 서울특별시 관악구",
        acc_cl_nm: "화물차사고",
        acc_cnt: "41",
        dth_dnv_cnt: "1",
        ftlt_rate: "2.44",
        injpsn_cnt: "52",
      },
    ],
  },
  totalCount: 2,
  numOfRows: 2,
  pageNo: 1,
});

export function checkTaasLiveConfiguration(environment: ServerEnvironment) {
  const missing = missingTaasEnvironmentVariables(environment);
  const truckUrl = environment.TAAS_TRUCK_URL ?? officialTaasTruckUrl;
  const statsUrl = environment.TAAS_STATS_URL ?? officialTaasStatsUrl;
  const allowedHost =
    environment.TAAS_ALLOWED_HOST ?? "opendata.koroad.or.kr";
  return {
    schemaVersion: "taas-public-data-configuration-check-v1" as const,
    capturedAt: new Date().toISOString(),
    status: missing.length ? ("NOT_CONFIGURED" as const) : ("READY" as const),
    requestSent: false as const,
    missing,
    endpointContractVerified:
      truckUrl === officialTaasTruckUrl &&
      statsUrl === officialTaasStatsUrl &&
      allowedHost === "opendata.koroad.or.kr",
    sharedApprovedKeySupported: true as const,
  };
}

export async function executeTaasMockContractSmoke(
  capturedAt = new Date().toISOString(),
) {
  const truckCandidate = await parseTaasTruckResponse({
    responseText: mockTruckResponse,
    request: taasTruckSmokeRequest,
    receivedAt: capturedAt,
  });
  const statsCandidate = await parseTaasStatsResponse({
    responseText: mockStatsResponse,
    request: taasStatsSmokeRequest,
    receivedAt: capturedAt,
  });
  const asMock = <T extends { provenance: Record<string, unknown> }>(
    candidate: T,
  ) => ({
    ...candidate,
    provenance: {
      ...candidate.provenance,
      kind: "MOCK" as const,
      sourceId: `mock-${candidate.provenance.sourceId}`,
      sourceLabel: `합성 계약 표본 · ${candidate.provenance.sourceLabel}`,
      sourceUri: undefined,
      licenseOrPolicy: "SafeRoute deterministic mock contract",
      isDemo: true,
    },
  });
  return {
    schemaVersion: "taas-public-data-smoke-v1" as const,
    capturedAt,
    status: "COMPLETED" as const,
    mode: "MOCK_CONTRACT" as const,
    requestSent: false as const,
    truckCandidate: asMock(truckCandidate),
    statsCandidate: asMock(statsCandidate),
    assertions: {
      responseSchemasValidated: true,
      publicDataClaimed: false,
      safetyEngineInputApproved: false,
      exactCoordinatesSentToAi: false,
      rawResponsesStored: false,
      secretsStored: false,
    },
  };
}

export async function executeTaasLiveSmoke(
  environment: ServerEnvironment,
  {
    nowIso = new Date().toISOString(),
    fetchImplementation = fetch,
  }: { nowIso?: string; fetchImplementation?: FetchImplementation } = {},
) {
  const truckKeyConfigured = Boolean(
    (environment.TAAS_TRUCK_API_KEY ?? environment.TAAS_API_KEY)?.trim(),
  );
  const statsKeyConfigured = Boolean(
    (environment.TAAS_STATS_API_KEY ?? environment.TAAS_API_KEY)?.trim(),
  );
  const missing = [
    ...(!truckKeyConfigured
      ? ["TAAS_TRUCK_API_KEY or TAAS_API_KEY"]
      : []),
    ...(!statsKeyConfigured
      ? ["TAAS_STATS_API_KEY or shared TAAS_API_KEY"]
      : []),
  ];
  if (!truckKeyConfigured) {
    return {
      schemaVersion: "taas-public-data-smoke-v1" as const,
      capturedAt: nowIso,
      status: "NOT_CONFIGURED" as const,
      mode: "LIVE" as const,
      requestSent: false as const,
      missing,
      message: "TAAS Live smoke was not executed.",
    };
  }

  const safeEnvironment = {
    ...environment,
    TAAS_STATS_API_KEY:
      environment.TAAS_STATS_API_KEY ??
      environment.TAAS_API_KEY,
  };
  const adapter = createTaasLiveAdapter({
    config: readTaasLiveConfig(safeEnvironment),
    fetchImplementation,
    nowIso: () => nowIso,
  });
  try {
    const truckCandidate = await adapter.fetchTruckZones(
      taasTruckSmokeRequest,
    );
    if (!statsKeyConfigured) {
      return {
        schemaVersion: "taas-public-data-smoke-v1" as const,
        capturedAt: nowIso,
        status: "PARTIAL" as const,
        mode: "LIVE" as const,
        requestSent: true as const,
        missing: ["TAAS_STATS_API_KEY or shared TAAS_API_KEY"],
        truckCandidate,
        statsCandidate: null,
        assertions: {
          approvedTruckApiOnly: true,
          truckResponseSchemaValidated: true,
          statsResponseSchemaValidated: false,
          publicDataProvenanceVerified:
            truckCandidate.provenance.kind === "PUBLIC_DATA_DERIVED",
          safetyEngineInputApproved: false,
          exactCoordinatesSentToAi: false,
          rawResponsesStored: false,
          secretsStored: false,
        },
        message:
          "Truck API passed. Municipal statistics Live smoke awaits its separately issued key.",
      };
    }
    const statsCandidate = await adapter.fetchMunicipalStats(
      taasStatsSmokeRequest,
    );
    const result = {
      schemaVersion: "taas-public-data-smoke-v1" as const,
      capturedAt: nowIso,
      status: "COMPLETED" as const,
      mode: "LIVE" as const,
      requestSent: true as const,
      truckCandidate,
      statsCandidate,
      assertions: {
        approvedTruckApiOnly: true,
        approvedStatsApiOnly: true,
        responseSchemasValidated: true,
        publicDataProvenanceVerified:
          truckCandidate.provenance.kind === "PUBLIC_DATA_DERIVED" &&
          statsCandidate.provenance.kind === "PUBLIC_DATA_DERIVED",
        safetyEngineInputApproved: false,
        exactCoordinatesSentToAi: false,
        rawResponsesStored: false,
        secretsStored: false,
      },
    };
    const serialized = JSON.stringify(result);
    for (const secret of [
      environment.TAAS_API_KEY,
      environment.TAAS_TRUCK_API_KEY,
      environment.TAAS_STATS_API_KEY,
    ]) {
      if (secret && serialized.includes(secret)) {
        throw new Error("SECRET_SERIALIZATION_GUARD");
      }
    }
    return result;
  } catch (error) {
    return {
      schemaVersion: "taas-public-data-smoke-v1" as const,
      capturedAt: nowIso,
      status: "FAILED" as const,
      mode: "LIVE" as const,
      requestSent: true as const,
      missing,
      failureCode:
        error instanceof TaasProviderError ? error.code : "NETWORK_ERROR",
      failureDiagnostic:
        error instanceof TaasProviderError
          ? error.diagnosticCode ?? "UNSPECIFIED"
          : "UNSPECIFIED",
      message:
        "TAAS Live smoke failed safely; no raw response or API key was stored.",
    };
  }
}
