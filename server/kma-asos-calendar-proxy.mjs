const KMA_ASOS_RANGE_URL =
  "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php";
const SEOUL_ASOS_STATION = "108";
const MAX_PROVIDER_BYTES = 5_000_000;

function json(body, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

function fallback(code, status) {
  return json({
    schemaVersion: "kma-asos-calendar-v1",
    status: "FALLBACK",
    code,
    isDemo: true,
    safetyEngineInputApproved: false,
  }, status);
}

function dateInSeoul(instant) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function shiftDate(date, days) {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function compactDate(date) {
  return date.replaceAll("-", "");
}

function numberAt(tokens, index, { min, max, scale = 1 }) {
  if (index === undefined) return undefined;
  const value = Number(tokens[index]);
  if (!Number.isFinite(value) || value === -9 || value === -9.0) return undefined;
  const scaled = value * scale;
  return scaled >= min && scaled <= max ? scaled : undefined;
}

function isoFromKma(value) {
  if (!/^\d{12}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:00+09:00`;
}

function parseAsosResponse(responseText, expectedStart, expectedEnd) {
  const lines = responseText.split(/\r?\n/);
  const header = [...lines].reverse().find((line) =>
    line.startsWith("#") && line.includes("STN") && line.includes("TA") && line.includes("VS"),
  );
  if (!header) throw new Error("MISSING_HEADER");
  const columns = header.replace(/^#\s*/, "").trim().split(/\s+/);
  const column = (name) => {
    const index = columns.indexOf(name);
    return index >= 0 ? index : undefined;
  };
  const timeIndex = column("TM") ?? column("YYMMDDHHMI") ?? 0;
  const stationIndex = column("STN") ?? 1;
  const points = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const tokens = line.trim().split(/\s+/);
    const observedAt = isoFromKma(tokens[timeIndex]);
    if (!observedAt || tokens[stationIndex] !== SEOUL_ASOS_STATION) continue;
    const date = observedAt.slice(0, 10);
    if (date < expectedStart || date > expectedEnd) continue;
    points.push({
      observedAt,
      airTemperatureCelsius: numberAt(tokens, column("TA"), { min: -60, max: 60 }),
      relativeHumidityPercent: numberAt(tokens, column("HM"), { min: 0, max: 100 }),
      rainfallMmPerHour:
        numberAt(tokens, column("RN_INT"), { min: 0, max: 300 }) ??
        numberAt(tokens, column("RN"), { min: 0, max: 300 }),
      visibilityMeters: numberAt(tokens, column("VS"), { min: 0, max: 200_000, scale: 10 }),
      windSpeedMetersPerSecond: numberAt(tokens, column("WS"), { min: 0, max: 100 }),
    });
  }
  if (points.length === 0) throw new Error("EMPTY_DATA");
  const grouped = new Map();
  for (const point of points) {
    const date = point.observedAt.slice(0, 10);
    const existing = grouped.get(date) ?? [];
    existing.push(point);
    grouped.set(date, existing);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([date, dayPoints]) => {
      const available = (field) => dayPoints.map((point) => point[field]).filter(Number.isFinite);
      const temperatures = available("airTemperatureCelsius");
      const rainfalls = available("rainfallMmPerHour");
      const visibilities = available("visibilityMeters");
      const winds = available("windSpeedMetersPerSecond");
      return {
        date,
        pointCount: dayPoints.length,
        summary: {
          ...(temperatures.length
            ? { averageAirTemperatureCelsius: temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length }
            : {}),
          ...(rainfalls.length ? { maximumRainfallMmPerHour: Math.max(...rainfalls) } : {}),
          ...(visibilities.length ? { minimumVisibilityMeters: Math.min(...visibilities) } : {}),
          ...(winds.length ? { maximumWindSpeedMetersPerSecond: Math.max(...winds) } : {}),
        },
        points: dayPoints,
      };
    },
  );
}

export async function handleKmaAsosCalendarRequest(
  request,
  {
    apiKey,
    enabled = true,
    endpointUrl = KMA_ASOS_RANGE_URL,
    fetchImplementation = fetch,
    nowIso = () => new Date().toISOString(),
  } = {},
) {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== "/api/kma-asos-calendar") return undefined;
  if (request.method !== "GET") return fallback("METHOD_NOT_ALLOWED", 405);
  if ([...requestUrl.searchParams.keys()].some((key) => key !== "end")) {
    return fallback("INVALID_REQUEST", 400);
  }
  const latestCompleteDate = shiftDate(dateInSeoul(new Date(nowIso())), -1);
  const requestedEnd = requestUrl.searchParams.get("end") ?? latestCompleteDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedEnd) || requestedEnd > latestCompleteDate) {
    return fallback("INVALID_REQUEST", 400);
  }
  const startDate = shiftDate(requestedEnd, -30);
  if (!enabled || !apiKey?.trim()) return fallback("NOT_CONFIGURED", 503);
  const endpoint = new URL(endpointUrl);
  endpoint.searchParams.set("tm1", `${compactDate(startDate)}0000`);
  endpoint.searchParams.set("tm2", `${compactDate(requestedEnd)}2300`);
  endpoint.searchParams.set("stn", SEOUL_ASOS_STATION);
  endpoint.searchParams.set("help", "1");
  endpoint.searchParams.set("authKey", apiKey.trim());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImplementation(endpoint, {
      method: "GET",
      headers: { Accept: "text/plain, application/json" },
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > MAX_PROVIDER_BYTES) {
      return fallback("RESPONSE_TOO_LARGE", 502);
    }
    if (!response.ok) {
      return fallback(
        response.status === 401
          ? "UNAUTHORIZED"
          : response.status === 403
            ? "PERMISSION_REQUIRED"
            : response.status === 429
              ? "RATE_LIMITED"
              : "PROVIDER_ERROR",
        response.status === 403 ? 503 : 502,
      );
    }
    let days;
    try {
      days = parseAsosResponse(responseText, startDate, requestedEnd);
    } catch {
      return fallback("MALFORMED_RESPONSE", 502);
    }
    return json({
      schemaVersion: "kma-asos-calendar-v1",
      status: "LIVE",
      provider: "KMA_API_HUB_ASOS",
      station: { id: SEOUL_ASOS_STATION, label: "서울" },
      capturedAt: nowIso(),
      range: { startDate, endDate: requestedEnd, dayCount: 31 },
      days,
      isDemo: true,
      use: "HISTORICAL_CONTEXT_FOR_USER_SCENARIO",
      safetyEngineInputApproved: false,
      rawResponseStored: false,
    }, 200, "public, max-age=900, stale-while-revalidate=3600");
  } catch (error) {
    return fallback(
      error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const kmaAsosCalendarConfig = Object.freeze({
  endpointUrl: KMA_ASOS_RANGE_URL,
  stationId: SEOUL_ASOS_STATION,
  maximumDays: 31,
});
