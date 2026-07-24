import { describe, expect, it } from "vitest";
import {
  createTaasLiveAdapter,
  officialTaasStatsUrl,
  officialTaasTruckUrl,
  parseTaasStatsResponse,
  parseTaasTruckResponse,
  readTaasLiveConfig,
  type TaasLiveConfig,
  type TaasStatsRequest,
  type TaasTruckRequest,
} from "../src/adapters/traffic";
import {
  checkTaasLiveConfiguration,
  executeTaasLiveSmoke,
  executeTaasMockContractSmoke,
} from "../scripts/taas-smoke-entry";

const truckRequest: TaasTruckRequest = {
  areaId: "seoul-yeongdeungpo-public",
  year: 2024,
  sidoCode: "11",
  gugunCode: "560",
};

const statsRequest: TaasStatsRequest = {
  areaId: "seoul-gwanak-public",
  year: 2024,
  sidoCode: "1100",
  gugunCode: "1121",
};

const truckResponse = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    resultCode: "00",
    resultMsg: "NORMAL_CODE",
    items: {
      item: [
        {
          afos_fid: 7000001,
          afos_id: "2024001",
          bjd_cd: "1156010100",
          spot_cd: "11560001",
          sido_sgg_nm: "서울 영등포구1",
          spot_nm: "서울 영등포구 합성동(공개 다발지역 부근)",
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
          ...overrides,
        },
      ],
    },
    totalCount: 1,
    numOfRows: 1,
    pageNo: 1,
  });

const statsResponse = (items = [
  {
    std_year: "2024",
    sido_sgg_nm: "서울특별시 관악구",
    acc_cl_nm: "전체사고",
    acc_cnt: "720",
    dth_dnv_cnt: "4",
    ftlt_rate: "0.56",
    injpsn_cnt: "910",
  },
]) =>
  JSON.stringify({
    resultCode: "00",
    resultMsg: "NORMAL_CODE",
    items: { item: items },
    totalCount: items.length,
    numOfRows: items.length,
    pageNo: 1,
  });

const config = (
  overrides: Partial<TaasLiveConfig> = {},
): TaasLiveConfig => ({
  truckAuthKey: "truck_test_key_not_a_real_secret",
  statsAuthKey: "stats_test_key_not_a_real_secret",
  truckUrl: officialTaasTruckUrl,
  statsUrl: officialTaasStatsUrl,
  allowedHost: "opendata.koroad.or.kr",
  timeoutMs: 5_000,
  maxResponseBytes: 100_000,
  ...overrides,
});

const environment = {
  TAAS_TRUCK_API_KEY: "truck_test_key_not_a_real_secret",
  TAAS_STATS_API_KEY: "stats_test_key_not_a_real_secret",
  TAAS_TRUCK_URL: officialTaasTruckUrl,
  TAAS_STATS_URL: officialTaasStatsUrl,
  TAAS_ALLOWED_HOST: "opendata.koroad.or.kr",
  TAAS_TIMEOUT_MS: "5000",
  TAAS_MAX_RESPONSE_BYTES: "100000",
};

describe("TAAS configuration", () => {
  it("requires separate keys and exact approved HTTPS endpoints", () => {
    expect(checkTaasLiveConfiguration({})).toMatchObject({
      status: "NOT_CONFIGURED",
      requestSent: false,
      missing: expect.arrayContaining([
        "TAAS_TRUCK_API_KEY or TAAS_API_KEY",
        "TAAS_STATS_API_KEY or shared TAAS_API_KEY",
      ]),
    });
    expect(checkTaasLiveConfiguration(environment)).toMatchObject({
      status: "READY",
      endpointContractVerified: true,
      sharedApprovedKeySupported: true,
    });
    expect(
      checkTaasLiveConfiguration({
        TAAS_API_KEY: "shared_test_key_not_a_real_secret",
      }),
    ).toMatchObject({
      status: "READY",
      missing: [],
      sharedApprovedKeySupported: true,
    });
    expect(() =>
      readTaasLiveConfig({
        ...environment,
        TAAS_TRUCK_URL:
          "https://example.com/data/rest/frequentzone/truck",
      }),
    ).toThrow();
  });

  it("accepts an already URL-encoded portal key without double encoding", () => {
    const parsed = readTaasLiveConfig({
      ...environment,
      TAAS_TRUCK_API_KEY: "abc%2Fdef%2Bghi%3D",
    });
    expect(parsed.truckAuthKey).toBe("abc/def+ghi=");
  });

  it("reuses a portal key after both APIs are registered to that key", () => {
    const parsed = readTaasLiveConfig({
      ...environment,
      TAAS_TRUCK_API_KEY: undefined,
      TAAS_STATS_API_KEY: undefined,
      TAAS_API_KEY: "shared_test_key_not_a_real_secret",
    });
    expect(parsed.truckAuthKey).toBe("shared_test_key_not_a_real_secret");
    expect(parsed.statsAuthKey).toBe("shared_test_key_not_a_real_secret");
  });
});

describe("TAAS parsers", () => {
  it("normalizes public truck zones but does not approve a courier risk label", async () => {
    const candidate = await parseTaasTruckResponse({
      responseText: truckResponse(),
      request: truckRequest,
      receivedAt: "2026-07-24T13:30:00.000Z",
    });
    expect(candidate).toMatchObject({
      status: "AVAILABLE",
      areaId: truckRequest.areaId,
      zones: [
        {
          zoneId: "7000001",
          occurrenceCount: 4,
          casualtyCount: 5,
          centroid: { longitude: 126.9005, latitude: 37.5005 },
        },
      ],
      provenance: {
        kind: "PUBLIC_DATA_DERIVED",
        sourceId: "taas-truck-frequent-zone",
        isDemo: true,
      },
      domainReadiness: {
        safeForSafetyEngine: false,
        allowedUse: "REGIONAL_CONTEXT_AND_EVALUATION_ONLY",
      },
    });
    expect(candidate.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(candidate).not.toHaveProperty("rawResponse");
    expect(JSON.stringify(candidate)).not.toContain("geom_json");
  });

  it("treats provider no-data as a valid public result", async () => {
    const candidate = await parseTaasTruckResponse({
      responseText: JSON.stringify({
        resultCode: "03",
        resultMsg: "NODATA_ERROR",
        items: { item: [] },
        totalCount: 0,
        numOfRows: 0,
        pageNo: 1,
      }),
      request: { ...truckRequest, areaId: "seoul-gwanak-public", gugunCode: "620" },
      receivedAt: "2026-07-24T13:30:00.000Z",
    });
    expect(candidate).toMatchObject({
      status: "NO_DATA",
      zones: [],
      provenance: { kind: "PUBLIC_DATA_DERIVED" },
    });
  });

  it("rejects malformed geometry and casualty totals", async () => {
    await expect(
      parseTaasTruckResponse({
        responseText: truckResponse({ geom_json: "{bad" }),
        request: truckRequest,
        receivedAt: "2026-07-24T13:30:00.000Z",
      }),
    ).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
      diagnosticCode: "INVALID_GEOMETRY_JSON",
    });
    await expect(
      parseTaasTruckResponse({
        responseText: truckResponse({ caslt_cnt: 99 }),
        request: truckRequest,
        receivedAt: "2026-07-24T13:30:00.000Z",
      }),
    ).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
      diagnosticCode: "CASUALTY_TOTAL_MISMATCH",
    });
  });

  it("normalizes only approved municipal statistics fields", async () => {
    const candidate = await parseTaasStatsResponse({
      responseText: statsResponse(),
      request: statsRequest,
      receivedAt: "2026-07-24T13:30:00.000Z",
    });
    expect(candidate).toMatchObject({
      status: "AVAILABLE",
      areaLabel: "서울특별시 관악구",
      statistics: [
        {
          category: "전체사고",
          accidentCount: 720,
          deathCount: 4,
          injuredPersonCount: 910,
          fatalityRate: 0.56,
        },
      ],
      domainReadiness: { safeForSafetyEngine: false },
    });
    expect(candidate).not.toHaveProperty("rawResponse");
  });

  it("maps provider authentication and schema failures safely", async () => {
    await expect(
      parseTaasStatsResponse({
        responseText: JSON.stringify({
          resultCode: "30",
          resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
        }),
        request: statsRequest,
        receivedAt: "2026-07-24T13:30:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      parseTaasStatsResponse({
        responseText: "<html>blocked</html>",
        request: statsRequest,
        receivedAt: "2026-07-24T13:30:00.000Z",
      }),
    ).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
      diagnosticCode: "NON_JSON_RESPONSE",
    });
  });
});

describe("TAAS server adapter and smoke boundary", () => {
  it("uses the separate keys only in their approved requests", async () => {
    const requestedUrls: string[] = [];
    const adapter = createTaasLiveAdapter({
      config: config(),
      nowIso: () => "2026-07-24T13:30:00.000Z",
      fetchImplementation: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        return new Response(
          url.startsWith(officialTaasTruckUrl)
            ? truckResponse()
            : statsResponse(),
          { status: 200 },
        );
      },
    });
    const truck = await adapter.fetchTruckZones(truckRequest);
    const stats = await adapter.fetchMunicipalStats(statsRequest);
    expect(new URL(requestedUrls[0]).searchParams.get("authKey")).toBe(
      config().truckAuthKey,
    );
    expect(new URL(requestedUrls[1]).searchParams.get("authKey")).toBe(
      config().statsAuthKey,
    );
    const serialized = JSON.stringify({ truck, stats });
    expect(serialized).not.toContain(config().truckAuthKey);
    expect(serialized).not.toContain(config().statsAuthKey);
    expect(serialized).not.toContain("NORMAL_CODE");
  });

  it("maps HTTP and transport failures without leaking details", async () => {
    for (const [response, code] of [
      [new Response("", { status: 401 }), "UNAUTHORIZED"],
      [new Response("", { status: 429 }), "RATE_LIMITED"],
      [new Response("", { status: 500 }), "NETWORK_ERROR"],
    ] as const) {
      await expect(
        createTaasLiveAdapter({
          config: config(),
          fetchImplementation: async () => response.clone(),
        }).fetchTruckZones(truckRequest),
      ).rejects.toMatchObject({ code });
    }
    await expect(
      createTaasLiveAdapter({
        config: config(),
        fetchImplementation: async () => {
          throw new DOMException("private timeout detail", "AbortError");
        },
      }).fetchTruckZones(truckRequest),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("labels mock data and never promotes it to public evidence", async () => {
    const result = await executeTaasMockContractSmoke(
      "2026-07-24T13:30:00.000Z",
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      mode: "MOCK_CONTRACT",
      requestSent: false,
      truckCandidate: {
        provenance: { kind: "MOCK", isDemo: true },
        domainReadiness: { safeForSafetyEngine: false },
      },
      statsCandidate: {
        provenance: { kind: "MOCK", isDemo: true },
      },
      assertions: {
        publicDataClaimed: false,
        rawResponsesStored: false,
        secretsStored: false,
      },
    });
  });

  it("executes both Live contracts without serializing secrets", async () => {
    const result = await executeTaasLiveSmoke(environment, {
      nowIso: "2026-07-24T13:30:00.000Z",
      fetchImplementation: async (input) =>
        new Response(
          String(input).startsWith(officialTaasTruckUrl)
            ? truckResponse()
            : statsResponse(),
          { status: 200 },
        ),
    });
    expect(result).toMatchObject({
      status: "COMPLETED",
      requestSent: true,
      assertions: {
        publicDataProvenanceVerified: true,
        safetyEngineInputApproved: false,
        rawResponsesStored: false,
        secretsStored: false,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(environment.TAAS_TRUCK_API_KEY);
    expect(serialized).not.toContain(environment.TAAS_STATS_API_KEY);
  });
});
