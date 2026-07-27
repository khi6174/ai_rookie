import { describe, expect, it } from "vitest";
import {
  KakaoDirectionsClientError,
  KakaoDirectionsPreviewSchema,
  createKakaoMapDemoDirectionsUrl,
  fetchKakaoDirectionsPreview,
  type RiderCompactMapModel,
} from "../src/adapters/maps";
import {
  handleKakaoDirectionsRequest,
  kakaoDirectionsDemoRoute,
} from "../server/kakao-directions-proxy.mjs";

const secret = "kakao_test_key_not_a_real_secret";

const providerResponse = {
  trans_id: "not-stored",
  routes: [
    {
      result_code: 0,
      result_msg: "길찾기 성공",
      summary: {
        distance: 2_480,
        duration: 742,
      },
      sections: [
        {
          roads: [
            {
              vertexes: [
                127.0016033,
                37.6039457,
                127.0006,
                37.606,
                126.9997883,
                37.6114457,
              ],
            },
          ],
        },
      ],
    },
  ],
};

const livePreview = {
  schemaVersion: "kakao-directions-preview-v1",
  status: "LIVE",
  provider: "KAKAO_MOBILITY",
  profile: "rider-demo",
  capturedAt: "2026-07-24T15:00:00.000Z",
  distanceMeters: 2_480,
  durationSeconds: 742,
  path: [
    { latitude: 37.6039457, longitude: 127.0016033 },
    { latitude: 37.6114457, longitude: 126.9997883 },
  ],
  isDemo: true,
  coordinateSource: "DETERMINISTIC_SYNTHETIC_FIXTURE",
  safetyEngineInputApproved: false,
} as const;

describe("Kakao Mobility directions server boundary", () => {
  it("allows only the fixed synthetic profile", async () => {
    const invalid = await handleKakaoDirectionsRequest(
      new Request(
        "https://demo.example/api/kakao-directions?profile=rider-demo&origin=1,2",
      ),
      { apiKey: secret },
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      status: "FALLBACK",
      code: "INVALID_DEMO_PROFILE",
      safetyEngineInputApproved: false,
    });
  });

  it("fails safely when the server key is unavailable", async () => {
    const response = await handleKakaoDirectionsRequest(
      new Request(
        "https://demo.example/api/kakao-directions?profile=rider-demo",
      ),
      { apiKey: "" },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "FALLBACK",
      code: "NOT_CONFIGURED",
    });
  });

  it("normalizes route geometry and never serializes the key or provider raw id", async () => {
    let requestedUrl = "";
    let authorization = "";
    const response = await handleKakaoDirectionsRequest(
      new Request(
        "https://demo.example/api/kakao-directions?profile=rider-demo",
      ),
      {
        apiKey: secret,
        nowIso: () => "2026-07-24T15:00:00.000Z",
        fetchImplementation: async (input, init) => {
          requestedUrl = String(input);
          authorization = new Headers(init?.headers).get("Authorization") ?? "";
          return new Response(JSON.stringify(providerResponse), { status: 200 });
        },
      },
    );
    expect(response.status).toBe(200);
    const result = KakaoDirectionsPreviewSchema.parse(await response.json());
    expect(result).toMatchObject({
      distanceMeters: 2_480,
      durationSeconds: 742,
      path: [
        { latitude: 37.6039457, longitude: 127.0016033 },
        { latitude: 37.606, longitude: 127.0006 },
        { latitude: 37.6114457, longitude: 126.9997883 },
      ],
      isDemo: true,
      safetyEngineInputApproved: false,
    });
    const requested = new URL(requestedUrl);
    expect(requested.origin + requested.pathname).toBe(
      "https://apis-navi.kakaomobility.com/v1/directions",
    );
    expect(requested.searchParams.get("origin")).toBe(
      `${kakaoDirectionsDemoRoute.origin.longitude},${kakaoDirectionsDemoRoute.origin.latitude}`,
    );
    expect(requested.searchParams.get("waypoints")).toBe(
      `${kakaoDirectionsDemoRoute.rest.longitude},${kakaoDirectionsDemoRoute.rest.latitude}`,
    );
    expect(authorization).toBe(`KakaoAK ${secret}`);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("not-stored");
  });

  it("maps provider authentication failure without exposing the response", async () => {
    const response = await handleKakaoDirectionsRequest(
      new Request(
        "https://demo.example/api/kakao-directions?profile=rider-demo",
      ),
      {
        apiKey: secret,
        fetchImplementation: async () =>
          new Response("private provider detail", { status: 401 }),
      },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      schemaVersion: "kakao-directions-preview-v1",
      status: "FALLBACK",
      code: "UNAUTHORIZED",
      isDemo: true,
      safetyEngineInputApproved: false,
    });
  });

  it("accepts only explicitly marked deterministic operations coordinates", async () => {
    let requestedUrl = "";
    const response = await handleKakaoDirectionsRequest(
      new Request(
        "https://demo.example/api/kakao-directions?profile=operations-demo&source=deterministic-synthetic-operations&origin=127.01%2C37.59&waypoint=127.02%2C37.60&destination=127.03%2C37.61",
      ),
      {
        apiKey: secret,
        fetchImplementation: async (input) => {
          requestedUrl = String(input);
          return new Response(JSON.stringify(providerResponse), {
            status: 200,
          });
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: "operations-demo",
      coordinateSource: "DETERMINISTIC_SYNTHETIC_FIXTURE",
      safetyEngineInputApproved: false,
    });
    const requested = new URL(requestedUrl);
    expect(requested.searchParams.get("origin")).toBe("127.01,37.59");
    expect(requested.searchParams.get("waypoints")).toBe("127.02,37.6");
    expect(requested.searchParams.get("destination")).toBe("127.03,37.61");
  });
});

describe("Kakao directions browser contract", () => {
  it("accepts the strict same-origin preview response", async () => {
    let requested = "";
    const result = await fetchKakaoDirectionsPreview({
      fetchImplementation: async (input) => {
        requested = String(input);
        return new Response(JSON.stringify(livePreview), { status: 200 });
      },
    });
    expect(requested).toBe("/api/kakao-directions?profile=rider-demo");
    expect(result).toEqual(livePreview);
  });

  it("converts server fallback and malformed success into typed errors", async () => {
    await expect(
      fetchKakaoDirectionsPreview({
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              schemaVersion: "kakao-directions-preview-v1",
              status: "FALLBACK",
              code: "RATE_LIMITED",
              isDemo: true,
              safetyEngineInputApproved: false,
            }),
            { status: 502 },
          ),
      }),
    ).rejects.toEqual(new KakaoDirectionsClientError("RATE_LIMITED"));
    await expect(
      fetchKakaoDirectionsPreview({
        fetchImplementation: async () =>
          new Response(JSON.stringify({ status: "LIVE" }), { status: 200 }),
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("creates a Kakao Map car route link from synthetic points only", () => {
    const model: RiderCompactMapModel = {
      decisionId: "decision-demo",
      current: kakaoDirectionsDemoRoute.origin,
      rest: kakaoDirectionsDemoRoute.rest,
      next: kakaoDirectionsDemoRoute.destination,
      path: [
        kakaoDirectionsDemoRoute.origin,
        kakaoDirectionsDemoRoute.rest,
        kakaoDirectionsDemoRoute.destination,
      ],
    };
    const url = createKakaoMapDemoDirectionsUrl(model);
    expect(url).toMatch(/^https:\/\/map\.kakao\.com\/link\/by\/car\//);
    expect(decodeURIComponent(url)).toContain("합성 현재 위치");
    expect(decodeURIComponent(url)).toContain("합성 휴식 지점");
    expect(decodeURIComponent(url)).toContain("합성 17번째 배송지");
  });

  it("serializes the selected operations route as a same-origin request", async () => {
    const model: RiderCompactMapModel = {
      decisionId: "operations-map-demo-courier-003",
      current: { latitude: 37.59, longitude: 127.01 },
      rest: { latitude: 37.6, longitude: 127.02 },
      next: { latitude: 37.61, longitude: 127.03 },
      path: [],
    };
    let requested = "";
    await fetchKakaoDirectionsPreview({
      model,
      fetchImplementation: async (input) => {
        requested = String(input);
        return new Response(
          JSON.stringify({
            ...livePreview,
            profile: "operations-demo",
          }),
          { status: 200 },
        );
      },
    });
    const query = new URL(requested, "https://demo.example");
    expect(query.pathname).toBe("/api/kakao-directions");
    expect(query.searchParams.get("profile")).toBe("operations-demo");
    expect(query.searchParams.get("source")).toBe(
      "deterministic-synthetic-operations",
    );
    expect(query.searchParams.get("origin")).toBe("127.01,37.59");
  });
});
