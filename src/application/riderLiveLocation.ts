import { useCallback, useEffect, useRef, useState } from "react";

export const RIDER_LOCATION_STALE_AFTER_MS = 30_000;

export type RiderLocationPoint = {
  latitude: number;
  longitude: number;
};

export type RiderDeviceLocationState =
  | { status: "IDLE" }
  | { status: "REQUESTING" }
  | {
      status: "CURRENT" | "STALE";
      point: RiderLocationPoint;
      accuracyMeters: number;
      capturedAt: string;
    }
  | { status: "PERMISSION_DENIED" }
  | { status: "UNAVAILABLE" }
  | { status: "ERROR" };

export function isValidRiderLocationPoint(point: RiderLocationPoint) {
  return Number.isFinite(point.latitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && Number.isFinite(point.longitude)
    && point.longitude >= -180
    && point.longitude <= 180;
}

export function riderMapMarkerSizePx(level: number, viewportWidth: number) {
  const normalizedLevel = Number.isFinite(level) ? Math.round(level) : 3;
  const sizeByLevel = [108, 102, 92, 82, 72, 62, 54, 50];
  const levelSize = sizeByLevel[Math.max(0, Math.min(sizeByLevel.length - 1, normalizedLevel - 1))];
  const viewportScale = viewportWidth < 320 ? 0.88 : viewportWidth < 380 ? 0.94 : viewportWidth >= 520 ? 1.06 : 1;
  return Math.round(Math.max(50, Math.min(108, levelSize * viewportScale)));
}

export function interpolateRiderLocationPoint(
  from: RiderLocationPoint,
  to: RiderLocationPoint,
  progress: number,
): RiderLocationPoint {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * normalizedProgress,
    longitude: from.longitude + (to.longitude - from.longitude) * normalizedProgress,
  };
}

export function riderLocationErrorState(
  code: number,
): Extract<RiderDeviceLocationState, { status: "PERMISSION_DENIED" | "UNAVAILABLE" | "ERROR" }> {
  if (code === 1) return { status: "PERMISSION_DENIED" };
  if (code === 2) return { status: "UNAVAILABLE" };
  return { status: "ERROR" };
}

export function riderLocationFromPosition(
  position: Pick<GeolocationPosition, "coords" | "timestamp">,
): RiderDeviceLocationState {
  const point = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
  if (!isValidRiderLocationPoint(point) || !Number.isFinite(position.coords.accuracy) || position.coords.accuracy < 0) {
    return { status: "ERROR" };
  }
  return {
    status: "CURRENT",
    point,
    accuracyMeters: position.coords.accuracy,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

export function useRiderDeviceLocation(resetKey: string) {
  const [state, setState] = useState<RiderDeviceLocationState>({ status: "IDLE" });
  const watchIdRef = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    if (watchIdRef.current !== undefined && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = undefined;
  }, []);

  const request = useCallback(() => {
    stop();
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "UNAVAILABLE" });
      return;
    }
    setState({ status: "REQUESTING" });
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => setState(riderLocationFromPosition(position)),
      (error) => setState(riderLocationErrorState(error.code)),
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 12_000,
      },
    );
  }, [stop]);

  useEffect(() => {
    if (state.status !== "CURRENT") return;
    const capturedAt = state.capturedAt;
    const timer = window.setTimeout(() => {
      setState((current) => current.status === "CURRENT" && current.capturedAt === capturedAt
        ? { ...current, status: "STALE" }
        : current);
    }, RIDER_LOCATION_STALE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    stop();
    setState({ status: "IDLE" });
    return stop;
  }, [resetKey, stop]);

  return { state, request };
}
