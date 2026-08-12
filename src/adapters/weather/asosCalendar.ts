import { z } from "zod";

const OptionalFinite = z.number().finite().optional();

export const KmaAsosCalendarPointSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  airTemperatureCelsius: OptionalFinite,
  relativeHumidityPercent: OptionalFinite,
  rainfallMmPerHour: OptionalFinite,
  visibilityMeters: OptionalFinite,
  windSpeedMetersPerSecond: OptionalFinite,
}).strict();

export const KmaAsosCalendarSchema = z.object({
  schemaVersion: z.literal("kma-asos-calendar-v1"),
  status: z.literal("LIVE"),
  provider: z.literal("KMA_API_HUB_ASOS"),
  station: z.object({ id: z.literal("108"), label: z.literal("서울") }).strict(),
  capturedAt: z.string().datetime({ offset: true }),
  range: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    dayCount: z.literal(31),
  }).strict(),
  days: z.array(z.object({
    date: z.string().date(),
    pointCount: z.number().int().min(1).max(24),
    summary: z.object({
      averageAirTemperatureCelsius: OptionalFinite,
      maximumRainfallMmPerHour: OptionalFinite,
      minimumVisibilityMeters: OptionalFinite,
      maximumWindSpeedMetersPerSecond: OptionalFinite,
    }).strict(),
    points: z.array(KmaAsosCalendarPointSchema).min(1).max(24),
  }).strict()).min(1).max(31),
  isDemo: z.literal(true),
  use: z.literal("HISTORICAL_CONTEXT_FOR_USER_SCENARIO"),
  safetyEngineInputApproved: z.literal(false),
  rawResponseStored: z.literal(false),
}).strict();

export type KmaAsosCalendar = z.infer<typeof KmaAsosCalendarSchema>;
export type KmaAsosCalendarPoint = z.infer<typeof KmaAsosCalendarPointSchema>;

export type KmaAsosCalendarFallbackCode =
  | "NOT_CONFIGURED"
  | "PERMISSION_REQUIRED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "MALFORMED_RESPONSE"
  | "NETWORK_ERROR";

const FallbackSchema = z.object({
  schemaVersion: z.literal("kma-asos-calendar-v1"),
  status: z.literal("FALLBACK"),
  code: z.string(),
  isDemo: z.literal(true),
  safetyEngineInputApproved: z.literal(false),
}).strict();

export class KmaAsosCalendarError extends Error {
  constructor(readonly code: KmaAsosCalendarFallbackCode) {
    super(code);
    this.name = "KmaAsosCalendarError";
  }
}

export async function fetchKmaAsosCalendar({
  fetchImplementation = fetch,
  signal,
}: {
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
} = {}) {
  let response: Response;
  try {
    response = await fetchImplementation("/api/kma-asos-calendar", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new KmaAsosCalendarError("TIMEOUT");
    }
    throw new KmaAsosCalendarError("NETWORK_ERROR");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new KmaAsosCalendarError("MALFORMED_RESPONSE");
  }
  if (!response.ok) {
    const fallback = FallbackSchema.safeParse(body);
    const supported = [
      "NOT_CONFIGURED",
      "PERMISSION_REQUIRED",
      "UNAUTHORIZED",
      "RATE_LIMITED",
      "TIMEOUT",
      "PROVIDER_ERROR",
      "MALFORMED_RESPONSE",
      "NETWORK_ERROR",
    ];
    throw new KmaAsosCalendarError(
      fallback.success && supported.includes(fallback.data.code)
        ? fallback.data.code as KmaAsosCalendarFallbackCode
        : "PROVIDER_ERROR",
    );
  }
  const parsed = KmaAsosCalendarSchema.safeParse(body);
  if (!parsed.success) throw new KmaAsosCalendarError("MALFORMED_RESPONSE");
  return parsed.data;
}
