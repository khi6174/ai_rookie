import { describe, expect, it } from "vitest";
import {
  assessKmaSupplementSafetyCoverage,
  createKmaSupplementAdapter,
  deriveKmaFeelsLike,
  officialKmaHighResolutionPointUrl,
  officialKmaShortForecastUrl,
  parseKmaHighResolutionResponse,
  parseKmaShortForecastResponse,
  parseKmaSnowfall,
  selectKmaSnowfallForSafety,
  type KmaShortForecastRequest,
  type KmaSupplementConfig,
} from "../src/adapters/weather";
import {
  createKmaSupplementSmokeRequests,
  executeKmaSupplementLiveSmoke,
} from "../scripts/kma-supplement-smoke-entry";

const authKey = "kma_supplement_test_key_not_a_real_secret";
const config: KmaSupplementConfig = {
  authKey,
  allowedHost: "apihub.kma.go.kr",
  timeoutMs: 5_000,
  maxResponseBytes: 64_000,
  maxAgeMinutes: 180,
};
const highResolutionRequest = {
  representativePointId: "public-kma-example",
  timeKst: "202607172100",
  longitude: 126.96579,
  latitude: 37.57141,
};
const shortRequest: KmaShortForecastRequest = {
  areaId: "demo-grid-60-127",
  baseDate: "20260717",
  baseTime: "2000",
  gridX: 60,
  gridY: 127,
  horizonStartIso: "2026-07-17T21:00:00+09:00",
  horizonMinutes: 120,
};

const shortResponse = (snowValues = ["0", "0.5cm 미만", "5.0cm 이상"]) =>
  JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: {
        items: {
          item: snowValues.flatMap((value, index) => [
            {
              baseDate: shortRequest.baseDate,
              baseTime: shortRequest.baseTime,
              fcstDate: shortRequest.baseDate,
              fcstTime: `${21 + index}00`,
              category: "SNO",
              nx: shortRequest.gridX,
              ny: shortRequest.gridY,
              fcstValue: value,
            },
            {
              baseDate: shortRequest.baseDate,
              baseTime: shortRequest.baseTime,
              fcstDate: shortRequest.baseDate,
              fcstTime: `${21 + index}00`,
              category: "TMP",
              nx: shortRequest.gridX,
              ny: shortRequest.gridY,
              fcstValue: "30",
            },
            {
              baseDate: shortRequest.baseDate,
              baseTime: shortRequest.baseTime,
              fcstDate: shortRequest.baseDate,
              fcstTime: `${21 + index}00`,
              category: "REH",
              nx: shortRequest.gridX,
              ny: shortRequest.gridY,
              fcstValue: "70",
            },
            {
              baseDate: shortRequest.baseDate,
              baseTime: shortRequest.baseTime,
              fcstDate: shortRequest.baseDate,
              fcstTime: `${21 + index}00`,
              category: "WSD",
              nx: shortRequest.gridX,
              ny: shortRequest.gridY,
              fcstValue: "2.0",
            },
          ]),
        },
      },
    },
  });

describe("KMA 1.3 high-resolution point adapter", () => {
  it("decodes the fixed field order, converts km to m, and never converts three-hour snow", async () => {
    const candidate = await parseKmaHighResolutionResponse({
      responseBytes: new TextEncoder().encode(
        "# tm, ta_chi, vs, sd_3hr\n202607172100 31.2 2.5 0.6\n",
      ),
      request: highResolutionRequest,
      receivedAt: "2026-07-17T12:40:00.000Z",
      maxAgeMinutes: 180,
    });
    expect(candidate).toMatchObject({
      observedAt: "2026-07-17T21:00:00+09:00",
      feelsLikeCelsius: 31.2,
      visibilityMeters: 2_500,
      newSnowThreeHoursCm: 0.6,
      missingSourceFields: [],
      domainReadiness: {
        safeForSafetyEngine: false,
        reason: "CURRENT_ONLY_AND_THREE_HOUR_SNOW_NOT_HOURLY",
      },
      provenance: { kind: "PUBLIC_DATA_DERIVED" },
    });
    expect(candidate).not.toHaveProperty("snowfallCmPerHour");
    expect(JSON.stringify(candidate)).not.toContain("126.96579");
    expect(candidate.responseSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves unavailable snow as missing and rejects the wrong row shape", async () => {
    const candidate = await parseKmaHighResolutionResponse({
      responseBytes: new TextEncoder().encode(
        "# tm, ta_chi, vs, sd_3hr\n202607172100 31.2 2.5 -9\n",
      ),
      request: highResolutionRequest,
      receivedAt: "2026-07-17T12:40:00.000Z",
      maxAgeMinutes: 180,
    });
    expect(candidate.missingSourceFields).toContain("sd_3hr");
    expect(candidate).not.toHaveProperty("newSnowThreeHoursCm");
    await expect(
      parseKmaHighResolutionResponse({
        responseBytes: new TextEncoder().encode(
          "# tm, ta_chi, vs, sd_3hr\n202607172100 31.2 2.5\n",
        ),
        request: highResolutionRequest,
        receivedAt: "2026-07-17T12:40:00.000Z",
        maxAgeMinutes: 180,
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });
});

describe("KMA 4.3 short forecast snowfall adapter", () => {
  it("preserves official exact and range semantics without a midpoint", () => {
    expect(parseKmaSnowfall("-")).toEqual({ snowfallCmPerHour: 0 });
    expect(parseKmaSnowfall("2.3cm")).toEqual({ snowfallCmPerHour: 2.3 });
    expect(parseKmaSnowfall("0.5cm 미만")).toEqual({
      snowfallRangeCmPerHour: { minimumInclusive: 0.1, maximumExclusive: 0.5 },
    });
    expect(parseKmaSnowfall("5.0cm 이상")).toEqual({
      snowfallRangeCmPerHour: { minimumInclusive: 5 },
    });
    expect(() => parseKmaSnowfall("2~4cm")).toThrow();
  });

  it("keeps only SNO points in the approved 120-minute horizon", async () => {
    const candidate = await parseKmaShortForecastResponse({
      responseText: shortResponse(),
      request: shortRequest,
      receivedAt: "2026-07-17T12:40:00.000Z",
      maxAgeMinutes: 180,
    });
    expect(candidate.points).toMatchObject([
      {
        forecastAt: "2026-07-17T21:00:00+09:00",
        snowfallCmPerHour: 0,
        airTemperatureCelsius: 30,
        relativeHumidityPercent: 70,
        windSpeedMetersPerSecond: 2,
        feelsLikeDerivation: {
          formulaVersion: "KMA_SUMMER_HUMIDITY_FORMULA_2025",
        },
        missingSourceCategories: [],
      },
      {
        forecastAt: "2026-07-17T22:00:00+09:00",
        snowfallRangeCmPerHour: { minimumInclusive: 0.1, maximumExclusive: 0.5 },
      },
      {
        forecastAt: "2026-07-17T23:00:00+09:00",
        snowfallRangeCmPerHour: { minimumInclusive: 5 },
      },
    ]);
    expect(candidate.points[0].feelsLikeCelsius).toBeCloseTo(
      31.289415783658153,
      10,
    );
    expect(candidate.domainReadiness.safeForSafetyEngine).toBe(false);
  });

  it("applies the official seasonal formula only when its inputs and conditions hold", () => {
    expect(
      deriveKmaFeelsLike({
        forecastAt: "2026-07-17T22:00:00+09:00",
        airTemperatureCelsius: 30,
        relativeHumidityPercent: 70,
        windSpeedMetersPerSecond: 0,
      }),
    ).toMatchObject({
      feelsLikeCelsius: expect.any(Number),
      feelsLikeDerivation: {
        formulaVersion: "KMA_SUMMER_HUMIDITY_FORMULA_2025",
      },
    });
    expect(
      deriveKmaFeelsLike({
        forecastAt: "2026-01-17T22:00:00+09:00",
        airTemperatureCelsius: -5,
        windSpeedMetersPerSecond: 4,
      }),
    ).toMatchObject({
      feelsLikeCelsius: expect.any(Number),
      feelsLikeDerivation: {
        formulaVersion: "KMA_WINTER_WIND_FORMULA_2025",
      },
    });
    expect(
      deriveKmaFeelsLike({
        forecastAt: "2026-01-17T22:00:00+09:00",
        airTemperatureCelsius: 12,
        windSpeedMetersPerSecond: 4,
      }),
    ).toEqual({});
  });

  it("uses conservative bounds capped at the model normalization limit", () => {
    expect(selectKmaSnowfallForSafety({ snowfallCmPerHour: 1.2 })).toMatchObject({
      status: "READY",
      selectedCmPerHour: 1.2,
    });
    expect(
      selectKmaSnowfallForSafety({
        snowfallRangeCmPerHour: { minimumInclusive: 0.1, maximumExclusive: 0.5 },
      }),
    ).toMatchObject({ status: "READY", selectedCmPerHour: 0.5 });
    expect(
      selectKmaSnowfallForSafety({
        snowfallRangeCmPerHour: { minimumInclusive: 5 },
      }),
    ).toMatchObject({ status: "READY", selectedCmPerHour: 3 });
  });
});

describe("KMA supplement server and coverage boundary", () => {
  it("calls only exact approved endpoints and keeps secret and coordinates out of results", async () => {
    const requestedUrls: string[] = [];
    const adapter = createKmaSupplementAdapter({
      config,
      nowIso: () => "2026-07-17T13:05:00.000Z",
      fetchImplementation: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        return new Response(
          url.startsWith(officialKmaHighResolutionPointUrl)
            ? "# tm, ta_chi, vs, sd_3hr\n202607172100 31.2 2.5 -9\n"
            : shortResponse(),
          { status: 200 },
        );
      },
    });
    const highResolutionCandidate = await adapter.fetchHighResolutionPoint(
      highResolutionRequest,
    );
    const shortForecastCandidate = await adapter.fetchShortForecast(shortRequest);
    expect(requestedUrls[0].startsWith(officialKmaHighResolutionPointUrl)).toBe(true);
    expect(requestedUrls[1].startsWith(officialKmaShortForecastUrl)).toBe(true);
    expect(requestedUrls.every((url) => new URL(url).searchParams.get("authKey") === authKey)).toBe(true);
    const serialized = JSON.stringify({ highResolutionCandidate, shortForecastCandidate });
    expect(serialized).not.toContain(authKey);
    expect(serialized).not.toContain("126.96579");

    const coverage = assessKmaSupplementSafetyCoverage({
      highResolutionCandidate,
      shortForecastCandidate,
    });
    expect(coverage).toMatchObject({
      status: "BLOCKED",
      safeForSafetyEngine: false,
      current: {
        feelsLikeCelsiusReady: true,
        visibilityMetersReady: true,
        threeHourSnowPreservedButNotUsed: false,
      },
      forecast: { allSnowfallPointsReady: true },
    });
    expect(coverage.blockingFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ timeScope: "CURRENT", weatherStateField: "snowfallCmPerHour" }),
        expect.objectContaining({ timeScope: "FORECAST_120_MINUTES", weatherStateField: "visibilityMeters" }),
      ]),
    );
    expect(coverage.forecast.allFeelsLikePointsReady).toBe(true);
    expect(
      coverage.blockingFields.some(
        (item) =>
          item.timeScope === "FORECAST_120_MINUTES" &&
          item.weatherStateField === "feelsLikeCelsius",
      ),
    ).toBe(false);
  });

  it("selects released base times and completes two opt-in Live calls safely", async () => {
    const nowIso = "2026-07-17T12:40:00.000Z";
    expect(createKmaSupplementSmokeRequests(nowIso)).toMatchObject({
      highResolution: { timeKst: "202607172100" },
      shortForecast: {
        baseDate: "20260717",
        baseTime: "2000",
        horizonStartIso: "2026-07-17T21:00:00+09:00",
      },
    });
    const result = await executeKmaSupplementLiveSmoke(
      {
        KMA_API_HUB_AUTH_KEY: authKey,
        KMA_ALLOWED_HOST: "apihub.kma.go.kr",
        KMA_TIMEOUT_MS: "5000",
        KMA_MAX_RESPONSE_BYTES: "64000",
        KMA_MAX_AGE_MINUTES: "180",
      },
      {
        nowIso,
        fetchImplementation: async (input) =>
          String(input).startsWith(officialKmaHighResolutionPointUrl)
            ? new Response(
                "# tm, ta_chi, vs, sd_3hr\n202607172100 31.2 2.5 -9\n",
                { status: 200 },
              )
            : new Response(shortResponse(), { status: 200 }),
      },
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      requestSent: true,
      assertions: {
        safetyEngineInputApproved: false,
        rawCoordinatesStored: false,
        rawResponsesStored: false,
        secretsStored: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain(authKey);
    expect(JSON.stringify(result)).not.toContain("126.96579");
  });
});
