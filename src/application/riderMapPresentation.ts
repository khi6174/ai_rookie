import type { RiderProfile } from "./riderProfileRepository";

export type RiderRoutePoint = {
  mapX: number;
  mapY: number;
  latitude: number;
  longitude: number;
};

export type RiderMapMarkerScale = "STREET" | "DISTRICT" | "OVERVIEW";

const roadCorridors: Record<string, readonly [RiderRoutePoint, RiderRoutePoint]> = {
  역삼: [
    { mapX: 31, mapY: 45, latitude: 37.4981, longitude: 127.0305 },
    { mapX: 43, mapY: 50, latitude: 37.5032, longitude: 127.042 },
  ],
  논현: [
    { mapX: 27, mapY: 38, latitude: 37.5102, longitude: 127.021 },
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

export function riderAreaKey(profile: Pick<RiderProfile, "areaCode">) {
  return profile.areaCode.split(" ")[0];
}

export function riderRoutePosition(
  profile: Pick<RiderProfile, "courierId" | "areaCode" | "mapX" | "mapY">,
  movementSecond: number,
): RiderRoutePoint {
  const courierPhase = Number.parseInt(profile.courierId.replace(/\D/g, ""), 10) || 0;
  const corridor = roadCorridors[riderAreaKey(profile)] ?? (() => {
    const horizontalDirection = courierPhase % 2 === 0 ? 1 : -1;
    const verticalDirection = courierPhase % 3 === 0 ? 1 : -1;
    const startMapX = Math.max(20, Math.min(83, profile.mapX - 4 * horizontalDirection));
    const startMapY = Math.max(24, Math.min(85, profile.mapY - 1.5 * verticalDirection));
    const endMapX = Math.max(20, Math.min(83, profile.mapX + 4 * horizontalDirection));
    const endMapY = Math.max(24, Math.min(85, profile.mapY + 1.5 * verticalDirection));
    const point = (mapX: number, mapY: number): RiderRoutePoint => ({
      mapX,
      mapY,
      latitude: 37.55 - mapY * 0.00105,
      longitude: 126.99 + mapX * 0.00142,
    });
    return [point(startMapX, startMapY), point(endMapX, endMapY)] as const;
  })();
  const normalizedSecond = Number.isFinite(movementSecond) ? Math.floor(movementSecond) : 0;
  const cycle = (((normalizedSecond + courierPhase * 5) % 24) + 24) % 24 / 12;
  const progress = cycle <= 1 ? cycle : 2 - cycle;
  const [start, end] = corridor;
  const interpolate = (from: number, to: number) => from + (to - from) * progress;
  return {
    mapX: interpolate(start.mapX, end.mapX),
    mapY: interpolate(start.mapY, end.mapY),
    latitude: interpolate(start.latitude, end.latitude),
    longitude: interpolate(start.longitude, end.longitude),
  };
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
