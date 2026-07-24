const KAKAO_DIRECTIONS_URL =
  "https://apis-navi.kakaomobility.com/v1/directions";
const PROFILE = "rider-demo";
const MAX_PROVIDER_BYTES = 1_500_000;
const MAX_PATH_POINTS = 500;

const DEMO_ROUTE = Object.freeze({
  origin: { latitude: 37.60394579989519, longitude: 127.00160335631371 },
  rest: { latitude: 37.60644579989519, longitude: 126.99953699309756 },
  destination: { latitude: 37.61144579989519, longitude: 126.9997883445039 },
});

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
  return json(
    {
      schemaVersion: "kakao-directions-preview-v1",
      status: "FALLBACK",
      code,
      isDemo: true,
      safetyEngineInputApproved: false,
    },
    status,
  );
}

function point(latitude, longitude) {
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

function isValidPoint(candidate) {
  return (
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    candidate.latitude >= 33 &&
    candidate.latitude <= 39.5 &&
    candidate.longitude >= 124 &&
    candidate.longitude <= 132
  );
}

function normalizedPath(route) {
  const rawPoints = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      if (!Array.isArray(road.vertexes) || road.vertexes.length % 2 !== 0) {
        continue;
      }
      for (let index = 0; index < road.vertexes.length; index += 2) {
        const candidate = point(road.vertexes[index + 1], road.vertexes[index]);
        if (isValidPoint(candidate)) rawPoints.push(candidate);
      }
    }
  }
  if (rawPoints.length < 2) {
    return [DEMO_ROUTE.origin, DEMO_ROUTE.rest, DEMO_ROUTE.destination];
  }
  const stride = Math.max(1, Math.ceil(rawPoints.length / MAX_PATH_POINTS));
  const sampled = rawPoints.filter((_, index) => index % stride === 0);
  const last = rawPoints[rawPoints.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export async function handleKakaoDirectionsRequest(
  request,
  {
    apiKey,
    enabled = true,
    fetchImplementation = fetch,
    nowIso = () => new Date().toISOString(),
  } = {},
) {
  if (request.method !== "GET") return fallback("METHOD_NOT_ALLOWED", 405);
  const requestUrl = new URL(request.url);
  if (
    requestUrl.searchParams.get("profile") !== PROFILE ||
    [...requestUrl.searchParams.keys()].some((key) => key !== "profile")
  ) {
    return fallback("INVALID_DEMO_PROFILE", 400);
  }
  if (!enabled || !apiKey?.trim()) {
    return fallback("NOT_CONFIGURED", 503);
  }

  const endpoint = new URL(KAKAO_DIRECTIONS_URL);
  endpoint.searchParams.set(
    "origin",
    `${DEMO_ROUTE.origin.longitude},${DEMO_ROUTE.origin.latitude}`,
  );
  endpoint.searchParams.set(
    "destination",
    `${DEMO_ROUTE.destination.longitude},${DEMO_ROUTE.destination.latitude}`,
  );
  endpoint.searchParams.set(
    "waypoints",
    `${DEMO_ROUTE.rest.longitude},${DEMO_ROUTE.rest.latitude}`,
  );
  endpoint.searchParams.set("priority", "RECOMMEND");
  endpoint.searchParams.set("summary", "false");
  endpoint.searchParams.set("alternatives", "false");
  endpoint.searchParams.set("road_details", "false");
  endpoint.searchParams.set("car_type", "1");
  endpoint.searchParams.set("car_fuel", "DIESEL");
  endpoint.searchParams.set("car_hipass", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImplementation(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `KakaoAK ${apiKey.trim()}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return fallback(
        response.status === 401 || response.status === 403
          ? "UNAUTHORIZED"
          : response.status === 429
            ? "RATE_LIMITED"
            : "PROVIDER_ERROR",
        502,
      );
    }
    const responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > MAX_PROVIDER_BYTES) {
      return fallback("RESPONSE_TOO_LARGE", 502);
    }
    let provider;
    try {
      provider = JSON.parse(responseText);
    } catch {
      return fallback("MALFORMED_RESPONSE", 502);
    }
    const route = provider?.routes?.[0];
    const summary = route?.summary;
    if (
      route?.result_code !== 0 ||
      !Number.isInteger(summary?.distance) ||
      summary.distance <= 0 ||
      !Number.isInteger(summary?.duration) ||
      summary.duration <= 0
    ) {
      return fallback("MALFORMED_RESPONSE", 502);
    }
    return json(
      {
        schemaVersion: "kakao-directions-preview-v1",
        status: "LIVE",
        provider: "KAKAO_MOBILITY",
        profile: PROFILE,
        capturedAt: nowIso(),
        distanceMeters: summary.distance,
        durationSeconds: summary.duration,
        path: normalizedPath(route),
        isDemo: true,
        coordinateSource: "DETERMINISTIC_SYNTHETIC_FIXTURE",
        safetyEngineInputApproved: false,
      },
      200,
      "public, max-age=60, stale-while-revalidate=120",
    );
  } catch (error) {
    return fallback(
      error instanceof DOMException && error.name === "AbortError"
        ? "TIMEOUT"
        : "NETWORK_ERROR",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const kakaoDirectionsDemoRoute = DEMO_ROUTE;
