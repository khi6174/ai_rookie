import { describe, expect, it } from "vitest";
import {
  createKmaLiveAdapter,
  missingKmaEnvironmentVariables,
  officialKmaUltraShortForecastUrl,
  officialKmaUltraShortObservationUrl,
  parseKmaForecastResponse,
  parseKmaObservationResponse,
  readKmaLiveConfig,
  assessKmaWeatherSafetyCoverage,
  selectKmaRainfallForSafety,
  validateKmaLiveConfig,
  type KmaLiveConfig,
  type KmaForecastRequest,
  type KmaObservationRequest,
} from "../src/adapters/weather";
import {
  checkKmaLiveConfiguration,
  createKmaLiveSmokeRequests,
  executeKmaLiveSmoke,
  executeKmaMockContractSmoke,
} from "../scripts/kma-weather-smoke-entry";

const authKey = "kma_api_hub_test_key_not_a_real_secret";
const request: KmaObservationRequest = {
  areaId: "public-weather-smoke-area",
  baseDate: "20260717",
  baseTime: "1200",
  gridX: 55,
  gridY: 127,
};

const config = (
  overrides: Partial<KmaLiveConfig> = {},
): KmaLiveConfig => ({
  authKey,
  observationUrl: officialKmaUltraShortObservationUrl,
  forecastUrl: officialKmaUltraShortForecastUrl,
  allowedHost: "apihub.kma.go.kr",
  timeoutMs: 5_000,
  maxResponseBytes: 64_000,
  maxAgeMinutes: 180,
  ...overrides,
});

const item = (category: string, obsrValue: string | number) => ({
  baseDate: request.baseDate,
  baseTime: request.baseTime,
  category,
  nx: request.gridX,
  ny: request.gridY,
  obsrValue,
});

const responseText = (
  items = [
    item("T1H", "27.2"),
    item("RN1", "3.5"),
    item("REH", "81"),
    item("WSD", "4.1"),
    item("PTY", "1"),
  ],
) =>
  JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: { items: { item: items } },
    },
  });

const forecastRequest: KmaForecastRequest = {
  ...request,
  baseTime: "1230",
};

const forecastItem = (
  forecastTime: string,
  category: string,
  fcstValue: string | number,
) => ({
  baseDate: forecastRequest.baseDate,
  baseTime: forecastRequest.baseTime,
  fcstDate: forecastRequest.baseDate,
  fcstTime: forecastTime,
  category,
  nx: forecastRequest.gridX,
  ny: forecastRequest.gridY,
  fcstValue,
});

const forecastResponseText = (
  items = [
    forecastItem("1300", "T1H", "28.1"),
    forecastItem("1300", "RN1", "1.2"),
    forecastItem("1300", "REH", "79"),
    forecastItem("1300", "WSD", "3.2"),
    forecastItem("1300", "PTY", "1"),
    forecastItem("1300", "SKY", "4"),
    forecastItem("1300", "LGT", "0"),
    forecastItem("1400", "T1H", "28.5"),
    forecastItem("1400", "RN1", "0"),
    forecastItem("1400", "REH", "76"),
    forecastItem("1400", "WSD", "2.8"),
    forecastItem("1400", "PTY", "0"),
    forecastItem("1400", "SKY", "3"),
    forecastItem("1400", "LGT", "0"),
  ],
) =>
  JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: { items: { item: items } },
    },
  });

describe("KMA Live configuration", () => {
  it("requires server-only variables and exact approved HTTPS endpoint", () => {
    expect(missingKmaEnvironmentVariables({})).toContain(
      "KMA_API_HUB_AUTH_KEY",
    );
    expect(missingKmaEnvironmentVariables({})).toContain(
      "KMA_ULTRA_SHORT_FORECAST_URL",
    );
    expect(() => readKmaLiveConfig({})).toThrow();
    expect(() =>
      validateKmaLiveConfig(
        config({
          observationUrl:
            "http://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst",
        }),
      ),
    ).toThrow();
    expect(() =>
      validateKmaLiveConfig(
        config({ forecastUrl: "https://other.example/weather" }),
      ),
    ).toThrow();
  });
});

describe("KMA observation parser", () => {
  it("preserves supported source values but blocks incomplete Safety input", async () => {
    const candidate = await parseKmaObservationResponse({
      responseText: responseText(),
      request,
      receivedAt: "2026-07-17T03:30:00.000Z",
      maxAgeMinutes: 180,
    });
    expect(candidate).toMatchObject({
      areaId: request.areaId,
      observedAt: "2026-07-17T12:00:00+09:00",
      airTemperatureCelsius: 27.2,
      rainfallMmPerHour: 3.5,
      relativeHumidityPercent: 81,
      windSpeedMetersPerSecond: 4.1,
      precipitationTypeCode: 1,
      missingSourceCategories: [],
      domainReadiness: {
        safeForSafetyEngine: false,
        reason: "KMA_OBSERVATION_DOES_NOT_COVER_REQUIRED_SAFETY_FIELDS",
      },
      provenance: {
        kind: "PUBLIC_DATA_DERIVED",
        sourceId: "kma-api-hub-ultra-short-observation",
      },
    });
    expect(candidate.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(candidate.provenance.contentHashSha256).toBe(
      candidate.responseSha256,
    );
    expect(candidate.domainReadiness.missingWeatherStateFields).toEqual([
      "snowfallCmPerHour",
      "feelsLikeCelsius",
      "visibilityMeters",
      "roadSurface",
    ]);
    expect(candidate).not.toHaveProperty("feelsLikeCelsius");
    expect(candidate).not.toHaveProperty("roadSurface");
  });

  it("reports missing source categories without inventing values", async () => {
    const candidate = await parseKmaObservationResponse({
      responseText: responseText([item("T1H", "20")]),
      request,
      receivedAt: "2026-07-17T03:30:00.000Z",
      maxAgeMinutes: 180,
    });
    expect(candidate.missingSourceCategories).toEqual([
      "RN1",
      "REH",
      "WSD",
      "PTY",
    ]);
    expect(candidate.rainfallMmPerHour).toBeUndefined();
  });

  it("rejects stale, mixed-grid, duplicate, and malformed values", async () => {
    await expect(
      parseKmaObservationResponse({
        responseText: responseText(),
        request,
        receivedAt: "2026-07-17T08:30:00.000Z",
        maxAgeMinutes: 180,
      }),
    ).rejects.toMatchObject({ code: "STALE_DATA" });
    await expect(
      parseKmaObservationResponse({
        responseText: responseText([
          item("T1H", "20"),
          { ...item("RN1", "1"), nx: 56 },
        ]),
        request,
        receivedAt: "2026-07-17T03:30:00.000Z",
        maxAgeMinutes: 180,
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    await expect(
      parseKmaObservationResponse({
        responseText: responseText([item("T1H", "20"), item("T1H", "21")]),
        request,
        receivedAt: "2026-07-17T03:30:00.000Z",
        maxAgeMinutes: 180,
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    await expect(
      parseKmaObservationResponse({
        responseText: responseText([item("REH", "101")]),
        request,
        receivedAt: "2026-07-17T03:30:00.000Z",
        maxAgeMinutes: 180,
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("maps provider result codes without exposing provider messages", async () => {
    for (const [resultMsg, expectedCode] of [
      ["SERVICE KEY IS NOT REGISTERED ERROR", "UNAUTHORIZED"],
      ["LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS", "RATE_LIMITED"],
      ["APPLICATION ERROR", "PROVIDER_ERROR"],
    ] as const) {
      await expect(
        parseKmaObservationResponse({
          responseText: JSON.stringify({
            response: {
              header: { resultCode: "30", resultMsg },
            },
          }),
          request,
          receivedAt: "2026-07-17T03:30:00.000Z",
          maxAgeMinutes: 180,
        }),
      ).rejects.toMatchObject({ code: expectedCode });
    }
  });
});

describe("KMA ultra-short forecast parser", () => {
  it("groups the six-hour forecast by effective time without filling safety gaps", async () => {
    const candidate = await parseKmaForecastResponse({
      responseText: forecastResponseText(),
      request: forecastRequest,
      receivedAt: "2026-07-17T03:40:00.000Z",
      maxAgeMinutes: 180,
    });
    expect(candidate).toMatchObject({
      schemaVersion: "kma-api-hub-ultra-short-forecast-v1",
      issuedAt: "2026-07-17T12:30:00+09:00",
      points: [
        {
          forecastAt: "2026-07-17T13:00:00+09:00",
          airTemperatureCelsius: 28.1,
          rainfallMmPerHour: 1.2,
          skyConditionCode: 4,
          domainReadiness: { safeForSafetyEngine: false },
        },
        {
          forecastAt: "2026-07-17T14:00:00+09:00",
          airTemperatureCelsius: 28.5,
        },
      ],
      provenance: {
        kind: "PUBLIC_DATA_DERIVED",
        sourceId: "kma-api-hub-ultra-short-forecast",
      },
    });
    expect(candidate.points.every((point) => !point.missingSourceCategories.length)).toBe(
      true,
    );
    expect(candidate.points[0]).not.toHaveProperty("roadSurface");
    expect(candidate.responseSha256).toBe(
      candidate.provenance.contentHashSha256,
    );
  });

  it("rejects duplicate categories, mixed grids, stale issues, and horizons over six hours", async () => {
    for (const items of [
      [forecastItem("1300", "T1H", "20"), forecastItem("1300", "T1H", "21")],
      [forecastItem("1300", "T1H", "20"), { ...forecastItem("1400", "RN1", "0"), nx: 56 }],
      [forecastItem("1900", "T1H", "20")],
    ]) {
      await expect(
        parseKmaForecastResponse({
          responseText: forecastResponseText(items),
          request: forecastRequest,
          receivedAt: "2026-07-17T03:40:00.000Z",
          maxAgeMinutes: 180,
        }),
      ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    }
    await expect(
      parseKmaForecastResponse({
        responseText: forecastResponseText(),
        request: forecastRequest,
        receivedAt: "2026-07-17T08:40:00.000Z",
        maxAgeMinutes: 180,
      }),
    ).rejects.toMatchObject({ code: "STALE_DATA" });
  });

  it("preserves official RN1 exact and range semantics without inventing midpoints", async () => {
    for (const [sourceValue, expected] of [
      ["강수없음", { rainfallMmPerHour: 0 }],
      ["6.2mm", { rainfallMmPerHour: 6.2 }],
      [
        "1mm 미만",
        {
          rainfallRangeMmPerHour: {
            minimumInclusive: 0.1,
            maximumExclusive: 1,
          },
        },
      ],
      [
        "30.0~50.0mm",
        {
          rainfallRangeMmPerHour: {
            minimumInclusive: 30,
            maximumExclusive: 50,
          },
        },
      ],
      [
        "50.0mm 이상",
        { rainfallRangeMmPerHour: { minimumInclusive: 50 } },
      ],
    ] as const) {
      const candidate = await parseKmaForecastResponse({
        responseText: forecastResponseText([
          forecastItem("1300", "RN1", sourceValue),
        ]),
        request: forecastRequest,
        receivedAt: "2026-07-17T03:40:00.000Z",
        maxAgeMinutes: 180,
      });
      expect(candidate.points[0]).toMatchObject(expected);
      if ("rainfallRangeMmPerHour" in expected) {
        expect(candidate.points[0]).not.toHaveProperty("rainfallMmPerHour");
      }
    }
  });
});

describe("KMA Live-to-Safety coverage gate", () => {
  it("uses exact rain or a conservative normalization bound, never a midpoint", () => {
    expect(selectKmaRainfallForSafety({ rainfallMmPerHour: 6.2 })).toEqual({
      status: "READY",
      selectedMmPerHour: 6.2,
      mode: "EXACT_SOURCE_VALUE",
    });
    expect(
      selectKmaRainfallForSafety({
        rainfallRangeMmPerHour: {
          minimumInclusive: 0.1,
          maximumExclusive: 1,
        },
      }),
    ).toMatchObject({
      status: "READY",
      selectedMmPerHour: 1,
      mode: "CONSERVATIVE_NORMALIZATION_BOUND",
    });
    expect(
      selectKmaRainfallForSafety({
        rainfallRangeMmPerHour: {
          minimumInclusive: 30,
          maximumExclusive: 50,
        },
      }),
    ).toMatchObject({ status: "READY", selectedMmPerHour: 20 });
    expect(
      selectKmaRainfallForSafety({
        rainfallRangeMmPerHour: { minimumInclusive: 50 },
      }),
    ).toMatchObject({ status: "READY", selectedMmPerHour: 20 });
    expect(
      selectKmaRainfallForSafety({
        rainfallRangeMmPerHour: { minimumInclusive: 5 },
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "UNBOUNDED_BELOW_NORMALIZATION_CAP",
    });
  });

  it("keeps feels-like, visibility, and hourly snowfall blocked", async () => {
    const observationCandidate = await parseKmaObservationResponse({
      responseText: responseText(),
      request,
      receivedAt: "2026-07-17T03:30:00.000Z",
      maxAgeMinutes: 180,
    });
    const forecastCandidate = await parseKmaForecastResponse({
      responseText: forecastResponseText([
        forecastItem("1300", "RN1", "1mm 미만"),
        forecastItem("1400", "RN1", "30.0~50.0mm"),
      ]),
      request: forecastRequest,
      receivedAt: "2026-07-17T03:40:00.000Z",
      maxAgeMinutes: 180,
    });
    const assessment = assessKmaWeatherSafetyCoverage({
      observationCandidate,
      forecastCandidate,
    });
    expect(assessment).toMatchObject({
      status: "BLOCKED",
      safeForSafetyEngine: false,
      forecastPointCount: 2,
      rainfall: { allPointsReady: true },
      explicitUnknownFields: [
        {
          weatherStateField: "roadSurface",
          selectedValue: "UNKNOWN",
          usedBySafetyModelV1: false,
        },
      ],
    });
    expect(assessment.blockingFields.map((item) => item.weatherStateField)).toEqual([
      "snowfallCmPerHour",
      "feelsLikeCelsius",
      "visibilityMeters",
    ]);
    expect(assessment.rainfall.forecast.map((item) => item.selection)).toMatchObject([
      { selectedMmPerHour: 1 },
      { selectedMmPerHour: 20 },
    ]);
  });
});

describe("KMA server adapter", () => {
  it("keeps the API Hub auth key in observation and forecast requests only", async () => {
    let requestedUrl = "";
    const adapter = createKmaLiveAdapter({
      config: config(),
      nowIso: () => "2026-07-17T03:40:00.000Z",
      fetchImplementation: async (input) => {
        requestedUrl = String(input);
        return new Response(
          requestedUrl.includes("getUltraSrtFcst")
            ? forecastResponseText()
            : responseText(),
          { status: 200 },
        );
      },
    });
    const observation = await adapter.fetchObservation(request);
    expect(new URL(requestedUrl).searchParams.get("authKey")).toBe(authKey);
    expect(new URL(requestedUrl).searchParams.has("serviceKey")).toBe(false);
    const forecast = await adapter.fetchForecast(forecastRequest);
    expect(requestedUrl.startsWith(officialKmaUltraShortForecastUrl)).toBe(true);
    expect(new URL(requestedUrl).searchParams.get("authKey")).toBe(authKey);
    const serialized = JSON.stringify({ observation, forecast });
    expect(serialized).not.toContain(authKey);
    expect(serialized).not.toContain("NORMAL_SERVICE");
    expect(serialized).not.toContain("responseText");
  });

  it("maps HTTP authentication, rate, timeout, and network failures", async () => {
    for (const [response, code] of [
      [new Response("", { status: 401 }), "UNAUTHORIZED"],
      [new Response("", { status: 429 }), "RATE_LIMITED"],
      [new Response("", { status: 500 }), "NETWORK_ERROR"],
    ] as const) {
      await expect(
        createKmaLiveAdapter({
          config: config(),
          fetchImplementation: async () => response.clone(),
        }).fetchObservation(request),
      ).rejects.toMatchObject({ code });
    }
    await expect(
      createKmaLiveAdapter({
        config: config(),
        fetchImplementation: async () => {
          throw new DOMException("private detail", "AbortError");
        },
      }).fetchObservation(request),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      createKmaLiveAdapter({
        config: config(),
        fetchImplementation: async () => {
          throw new Error("private network detail");
        },
      }).fetchObservation(request),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});

describe("KMA smoke boundary", () => {
  it("checks configuration without returning the secret or sending a request", () => {
    const ready = checkKmaLiveConfiguration({
      KMA_API_HUB_AUTH_KEY: authKey,
      KMA_ULTRA_SHORT_OBSERVATION_URL: officialKmaUltraShortObservationUrl,
      KMA_ULTRA_SHORT_FORECAST_URL: officialKmaUltraShortForecastUrl,
      KMA_ALLOWED_HOST: "apihub.kma.go.kr",
      KMA_TIMEOUT_MS: "5000",
      KMA_MAX_RESPONSE_BYTES: "64000",
      KMA_MAX_AGE_MINUTES: "180",
    });
    expect(ready).toMatchObject({
      status: "READY",
      requestSent: false,
      endpointContractVerified: true,
    });
    expect(JSON.stringify(ready)).not.toContain(authKey);
  });

  it("reports missing variable names without a request", () => {
    expect(checkKmaLiveConfiguration({})).toMatchObject({
      status: "NOT_CONFIGURED",
      requestSent: false,
      missing: expect.arrayContaining(["KMA_API_HUB_AUTH_KEY"]),
    });
  });

  it("labels the fake response as Demo MOCK and blocks Safety-engine use", async () => {
    const result = await executeKmaMockContractSmoke(
      "2026-07-17T12:00:00.000Z",
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      mode: "MOCK_CONTRACT",
      requestSent: false,
      observationCandidate: {
        provenance: { kind: "MOCK", isDemo: true },
        domainReadiness: { safeForSafetyEngine: false },
      },
      forecastCandidate: {
        provenance: { kind: "MOCK", isDemo: true },
        points: [
          { domainReadiness: { safeForSafetyEngine: false } },
          { domainReadiness: { safeForSafetyEngine: false } },
        ],
      },
      assertions: {
        observationResponseSchemaValidated: true,
        forecastResponseSchemaValidated: true,
        publicDataClaimed: false,
        safetyEngineInputApproved: false,
        secretsStored: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("PUBLIC_DATA_DERIVED");
  });

  it("selects conservative KST base times and executes both opt-in Live calls", async () => {
    const nowIso = "2026-07-17T03:40:00.000Z";
    expect(createKmaLiveSmokeRequests(nowIso)).toMatchObject({
      observation: { baseDate: "20260717", baseTime: "1100" },
      forecast: { baseDate: "20260717", baseTime: "1130" },
    });
    const requestedUrls: string[] = [];
    const result = await executeKmaLiveSmoke(
      {
        KMA_API_HUB_AUTH_KEY: authKey,
        KMA_ULTRA_SHORT_OBSERVATION_URL: officialKmaUltraShortObservationUrl,
        KMA_ULTRA_SHORT_FORECAST_URL: officialKmaUltraShortForecastUrl,
        KMA_ALLOWED_HOST: "apihub.kma.go.kr",
        KMA_TIMEOUT_MS: "5000",
        KMA_MAX_RESPONSE_BYTES: "64000",
        KMA_MAX_AGE_MINUTES: "180",
      },
      {
        nowIso,
        fetchImplementation: async (input) => {
          const url = new URL(String(input));
          requestedUrls.push(url.toString());
          const baseDate = url.searchParams.get("base_date")!;
          const baseTime = url.searchParams.get("base_time")!;
          const nx = Number(url.searchParams.get("nx"));
          const ny = Number(url.searchParams.get("ny"));
          const items = url.pathname.endsWith("getUltraSrtFcst")
            ? [
                {
                  baseDate,
                  baseTime,
                  fcstDate: baseDate,
                  fcstTime: "1200",
                  category: "T1H",
                  nx,
                  ny,
                  fcstValue: "27.0",
                },
              ]
            : [
                {
                  baseDate,
                  baseTime,
                  category: "T1H",
                  nx,
                  ny,
                  obsrValue: "26.5",
                },
              ];
          return new Response(
            JSON.stringify({
              response: {
                header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
                body: { items: { item: items } },
              },
            }),
            { status: 200 },
          );
        },
      },
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      requestSent: true,
      assertions: {
        publicDataProvenanceVerified: true,
        safetyEngineInputApproved: false,
        secretsStored: false,
      },
    });
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls.every((url) => new URL(url).searchParams.get("authKey") === authKey)).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain(authKey);
  });
});
