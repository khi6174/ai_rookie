import type { RiderProfile } from "./riderProfileRepository";

export type RiderRoutePoint = {
  mapX: number;
  mapY: number;
  latitude: number;
  longitude: number;
};

export type RiderMapMarkerScale = "STREET" | "DISTRICT" | "OVERVIEW";

export type RiderDeliveryRouteStop = RiderRoutePoint & {
  stopOrdinal: number;
  label: string;
  progress: number;
};

type RiderRouteProfile = Pick<
  RiderProfile,
  "courierId" | "areaCode" | "mapX" | "mapY"
>;

function geographicPoint(latitude: number, longitude: number): RiderRoutePoint {
  return {
    latitude,
    longitude,
    mapX: (longitude - 126.99) / 0.00142,
    mapY: (37.55 - latitude) / 0.00105,
  };
}

const roadCorridors: Record<string, readonly RiderRoutePoint[]> = {
  역삼: [
    { mapX: 31, mapY: 45, latitude: 37.4981, longitude: 127.0305 },
    { mapX: 35, mapY: 46, latitude: 37.4996, longitude: 127.0342 },
    { mapX: 39, mapY: 48, latitude: 37.5014, longitude: 127.0382 },
    { mapX: 43, mapY: 50, latitude: 37.5032, longitude: 127.042 },
  ],
  논현: [
    { mapX: 27, mapY: 38, latitude: 37.5102, longitude: 127.021 },
    { mapX: 31, mapY: 37, latitude: 37.511, longitude: 127.0248 },
    { mapX: 35, mapY: 35, latitude: 37.5118, longitude: 127.0285 },
    { mapX: 39, mapY: 34, latitude: 37.5124, longitude: 127.032 },
  ],
  대치: [
    { mapX: 61, mapY: 48, latitude: 37.503, longitude: 127.053 },
    { mapX: 73, mapY: 45, latitude: 37.5033, longitude: 127.065 },
  ],
  도곡: [
    { mapX: 47, mapY: 63, latitude: 37.4885, longitude: 127.0385 },
    { mapX: 58, mapY: 67, latitude: 37.49, longitude: 127.049 },
  ],
  삼성: [
    { mapX: 69, mapY: 34, latitude: 37.509, longitude: 127.053 },
    { mapX: 80, mapY: 31, latitude: 37.5105, longitude: 127.063 },
  ],
  청담: [
    { mapX: 61, mapY: 29, latitude: 37.519, longitude: 127.043 },
    { mapX: 73, mapY: 27, latitude: 37.52, longitude: 127.055 },
  ],
  개포: [
    { mapX: 67, mapY: 71, latitude: 37.481, longitude: 127.049 },
    { mapX: 79, mapY: 75, latitude: 37.4825, longitude: 127.061 },
  ],
  신사: [
    { mapX: 23, mapY: 31, latitude: 37.518, longitude: 127.018 },
    { mapX: 35, mapY: 28, latitude: 37.5195, longitude: 127.03 },
  ],
  압구정: [
    { mapX: 39, mapY: 28, latitude: 37.5235, longitude: 127.027 },
    { mapX: 51, mapY: 31, latitude: 37.524, longitude: 127.039 },
  ],
  세곡: [
    { mapX: 71, mapY: 82, latitude: 37.466, longitude: 127.092 },
    { mapX: 83, mapY: 78, latitude: 37.469, longitude: 127.103 },
  ],
  자곡: [
    { mapX: 62, mapY: 85, latitude: 37.474, longitude: 127.096 },
    { mapX: 74, mapY: 83, latitude: 37.477, longitude: 127.107 },
  ],
};

const syntheticRoadGrids = {
  "합성 서부권역": {
    latitudes: [37.4968, 37.5007, 37.5043],
    longitudes: [127.0225, 127.0275, 127.033, 127.0395],
  },
  "합성 북부권역": {
    latitudes: [37.5122, 37.516, 37.5196],
    longitudes: [127.0405, 127.047, 127.0535, 127.059],
  },
  "합성 남부권역": {
    latitudes: [37.4845, 37.4887, 37.492],
    longitudes: [127.0385, 127.045, 127.052, 127.0585],
  },
} as const;

const courierRoadTemplates = [
  [[0, 0], [0, 3], [1, 3], [1, 1]],
  [[0, 3], [0, 1], [2, 1], [2, 3]],
  [[0, 0], [0, 2], [2, 2], [2, 0]],
  [[1, 0], [1, 2], [0, 2], [0, 3]],
  [[1, 3], [1, 1], [2, 1], [2, 0]],
  [[1, 0], [1, 3], [2, 3], [2, 1]],
  [[2, 0], [2, 2], [1, 2], [1, 0]],
  [[2, 3], [2, 1], [0, 1], [0, 0]],
  [[2, 0], [2, 3], [0, 3], [0, 2]],
] as const;

function courierNumber(courierId: string) {
  return Number.parseInt(courierId.replace(/\D/g, ""), 10) || 1;
}

function syntheticCourseIndex(profile: RiderRouteProfile) {
  return Math.floor((courierNumber(profile.courierId) - 1) / 3) % 9;
}

function syntheticCourierRoadRoute(profile: RiderRouteProfile) {
  const areaKey = riderAreaKey(profile);
  const grid = syntheticRoadGrids[areaKey as keyof typeof syntheticRoadGrids];
  if (!grid) return undefined;
  const template = courierRoadTemplates[syntheticCourseIndex(profile)];
  return template.map(([row, column]) =>
    geographicPoint(grid.latitudes[row], grid.longitudes[column]),
  );
}

export function riderAreaKey(profile: Pick<RiderProfile, "areaCode">) {
  if (profile.areaCode.includes("북부권역")) return "합성 북부권역";
  if (profile.areaCode.includes("남부권역")) return "합성 남부권역";
  if (profile.areaCode.includes("서부권역")) return "합성 서부권역";
  return profile.areaCode.split(" ")[0];
}

export function riderRoutePolyline(profile: RiderRouteProfile) {
  const syntheticRoute = syntheticCourierRoadRoute(profile);
  if (syntheticRoute) return syntheticRoute;
  const knownRoute = roadCorridors[riderAreaKey(profile)];
  if (knownRoute) return [...knownRoute];
  const courierPhase = Number.parseInt(profile.courierId.replace(/\D/g, ""), 10) || 0;
  const horizontalDirection = courierPhase % 2 === 0 ? 1 : -1;
  const verticalDirection = courierPhase % 3 === 0 ? 1 : -1;
  const point = (mapX: number, mapY: number): RiderRoutePoint => ({
    mapX,
    mapY,
    latitude: 37.55 - mapY * 0.00105,
    longitude: 126.99 + mapX * 0.00142,
  });
  return [
    point(
      Math.max(20, Math.min(83, profile.mapX - 4 * horizontalDirection)),
      Math.max(24, Math.min(85, profile.mapY - 1.5 * verticalDirection)),
    ),
    point(profile.mapX, profile.mapY),
    point(
      Math.max(20, Math.min(83, profile.mapX + 4 * horizontalDirection)),
      Math.max(24, Math.min(85, profile.mapY + 1.5 * verticalDirection)),
    ),
  ];
}

export function riderDeliveryRouteId(profile: RiderRouteProfile) {
  return `synthetic-road-route-${profile.courierId}`;
}

export function riderAssignedDeliveryZone(profile: RiderRouteProfile) {
  const areaKey = riderAreaKey(profile).replace("합성 ", "");
  const courseNumber = syntheticCourseIndex(profile) + 1;
  return `${areaKey} · ${courseNumber}코스`;
}

export function riderRouteDeliveryStops(
  profile: RiderRouteProfile,
  completedStopCount: number,
  totalStopCount: number,
  maximumVisibleStops = 4,
): RiderDeliveryRouteStop[] {
  const remainingStopCount = Math.max(0, totalStopCount - completedStopCount);
  const count = Math.min(maximumVisibleStops, remainingStopCount);
  const baseProgress = [0.2, 0.43, 0.68, 0.9];
  return Array.from({ length: count }, (_, index) => {
    const progress = baseProgress[index] ?? (index + 1) / (count + 1);
    return {
      ...riderRoutePositionAtProgress(profile, progress),
      stopOrdinal: completedStopCount + index + 1,
      label: `배송 ${completedStopCount + index + 1}`,
      progress,
    };
  });
}

export function riderRoutePositionAtProgress(
  profile: RiderRouteProfile,
  requestedProgress: number,
): RiderRoutePoint {
  const route = riderRoutePolyline(profile);
  const progress = Math.max(0, Math.min(1, requestedProgress));
  const lengths = route.slice(1).map((point, index) =>
    Math.hypot(
      point.latitude - route[index].latitude,
      point.longitude - route[index].longitude,
    ),
  );
  const totalLength = lengths.reduce((total, value) => total + value, 0);
  let target = totalLength * progress;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (target <= segmentLength || index === lengths.length - 1) {
      const localProgress = segmentLength === 0 ? 0 : target / segmentLength;
      const start = route[index];
      const end = route[index + 1];
      const interpolate = (from: number, to: number) =>
        from + (to - from) * localProgress;
      return {
        mapX: interpolate(start.mapX, end.mapX),
        mapY: interpolate(start.mapY, end.mapY),
        latitude: interpolate(start.latitude, end.latitude),
        longitude: interpolate(start.longitude, end.longitude),
      };
    }
    target -= segmentLength;
  }
  return route.at(-1)!;
}

export function riderRoutePosition(
  profile: RiderRouteProfile,
  movementSecond: number,
): RiderRoutePoint {
  const courierPhase = Number.parseInt(profile.courierId.replace(/\D/g, ""), 10) || 0;
  const normalizedSecond = Number.isFinite(movementSecond) ? Math.floor(movementSecond) : 0;
  const cycle = (((normalizedSecond + courierPhase * 5) % 24) + 24) % 24 / 12;
  const progress = cycle <= 1 ? cycle : 2 - cycle;
  return riderRoutePositionAtProgress(profile, progress);
}

export function riderMapMarkerScale(level: number): RiderMapMarkerScale {
  const normalizedLevel = Number.isFinite(level) ? Math.round(level) : 3;
  if (normalizedLevel <= 3) return "STREET";
  if (normalizedLevel <= 5) return "DISTRICT";
  return "OVERVIEW";
}

export function riderMapMarkerSizePx(level: number, viewportWidth: number) {
  const normalizedLevel = Number.isFinite(level) ? Math.round(level) : 3;
  const sizeByLevel = [108, 100, 90, 68, 52, 34, 28, 24];
  const levelSize = sizeByLevel[Math.max(0, Math.min(sizeByLevel.length - 1, normalizedLevel - 1))];
  const viewportScale = viewportWidth < 320 ? 0.88 : viewportWidth < 380 ? 0.94 : viewportWidth >= 520 ? 1.06 : 1;
  return Math.round(Math.max(24, Math.min(108, levelSize * viewportScale)));
}
