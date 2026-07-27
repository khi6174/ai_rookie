import { z } from "zod";
import type { RiderCompactMapModel } from ".";

const GeographicPointSchema = z.object({
  latitude: z.number().finite().min(33).max(39.5),
  longitude: z.number().finite().min(124).max(132),
});

export const KakaoDirectionsPreviewSchema = z.object({
  schemaVersion: z.literal("kakao-directions-preview-v1"),
  status: z.literal("LIVE"),
  provider: z.literal("KAKAO_MOBILITY"),
  profile: z.enum(["rider-demo", "operations-demo"]),
  capturedAt: z.string().datetime({ offset: true }),
  distanceMeters: z.number().int().positive().max(1_500_000),
  durationSeconds: z.number().int().positive().max(172_800),
  path: z.array(GeographicPointSchema).min(2).max(501),
  isDemo: z.literal(true),
  coordinateSource: z.literal("DETERMINISTIC_SYNTHETIC_FIXTURE"),
  safetyEngineInputApproved: z.literal(false),
});

export type KakaoDirectionsPreview = z.infer<
  typeof KakaoDirectionsPreviewSchema
>;

export type KakaoDirectionsFallbackCode =
  | "OFFLINE"
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "MALFORMED_RESPONSE"
  | "NETWORK_ERROR";

export class KakaoDirectionsClientError extends Error {
  readonly code: KakaoDirectionsFallbackCode;

  constructor(code: KakaoDirectionsFallbackCode) {
    super(code);
    this.name = "KakaoDirectionsClientError";
    this.code = code;
  }
}

const FallbackEnvelopeSchema = z.object({
  schemaVersion: z.literal("kakao-directions-preview-v1"),
  status: z.literal("FALLBACK"),
  code: z.string(),
  isDemo: z.literal(true),
  safetyEngineInputApproved: z.literal(false),
});

export async function fetchKakaoDirectionsPreview({
  fetchImplementation = fetch,
  signal,
  model,
}: {
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
  model?: RiderCompactMapModel;
} = {}) {
  let response: Response;
  try {
    const query = new URLSearchParams(
      model
        ? {
            profile: "operations-demo",
            source: "deterministic-synthetic-operations",
            origin: `${model.current.longitude},${model.current.latitude}`,
            waypoint: `${model.rest.longitude},${model.rest.latitude}`,
            destination: `${model.next.longitude},${model.next.latitude}`,
          }
        : { profile: "rider-demo" },
    );
    response = await fetchImplementation(
      `/api/kakao-directions?${query.toString()}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new KakaoDirectionsClientError("TIMEOUT");
    }
    throw new KakaoDirectionsClientError("NETWORK_ERROR");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new KakaoDirectionsClientError("MALFORMED_RESPONSE");
  }
  if (!response.ok) {
    const fallback = FallbackEnvelopeSchema.safeParse(body);
    const supported = [
      "NOT_CONFIGURED",
      "UNAUTHORIZED",
      "RATE_LIMITED",
      "TIMEOUT",
      "PROVIDER_ERROR",
      "MALFORMED_RESPONSE",
      "NETWORK_ERROR",
    ] as const;
    throw new KakaoDirectionsClientError(
      fallback.success &&
        supported.includes(
          fallback.data.code as (typeof supported)[number],
        )
        ? (fallback.data.code as (typeof supported)[number])
        : "PROVIDER_ERROR",
    );
  }
  const parsed = KakaoDirectionsPreviewSchema.safeParse(body);
  if (!parsed.success) {
    throw new KakaoDirectionsClientError("MALFORMED_RESPONSE");
  }
  return parsed.data;
}

const kakaoMapSegment = (
  label: string,
  point: { latitude: number; longitude: number },
) =>
  encodeURIComponent(
    `${label},${point.latitude.toFixed(7)},${point.longitude.toFixed(7)}`,
  );

export function createKakaoMapDemoDirectionsUrl(
  model: RiderCompactMapModel,
) {
  return [
    "https://map.kakao.com/link/by/car",
    kakaoMapSegment("합성 현재 위치", model.current),
    kakaoMapSegment("합성 휴식 지점", model.rest),
    kakaoMapSegment("합성 17번째 배송지", model.next),
  ].join("/");
}
