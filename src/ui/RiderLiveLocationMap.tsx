import { useEffect, useMemo, useRef, useState } from "react";
import {
  interpolateRiderLocationPoint,
  riderMapMarkerSizePx,
  useRiderDeviceLocation,
  type RiderDeviceLocationState,
  type RiderLocationPoint,
} from "../application/riderLiveLocation";
import type { RiderProfile } from "../application/riderProfileRepository";
import { loadKakaoMapsSdk, type KakaoCustomOverlay, type KakaoMapInstance, type KakaoMapsNamespace } from "../adapters/maps/kakao";

type MapStatus = "LOADING" | "READY" | "FALLBACK" | "ERROR";

const statusLabels: Record<RiderDeviceLocationState["status"], string> = {
  IDLE: "위치 권한 필요",
  REQUESTING: "위치 확인 중",
  CURRENT: "기기 위치",
  STALE: "위치 갱신 지연",
  PERMISSION_DENIED: "위치 권한 없음",
  UNAVAILABLE: "위치 사용 불가",
  ERROR: "위치 확인 필요",
};

export function riderProfileMapPoint(profile: Pick<RiderProfile, "mapX" | "mapY">): RiderLocationPoint {
  return {
    latitude: 37.55 - profile.mapY * 0.00105,
    longitude: 126.99 + profile.mapX * 0.00142,
  };
}

function updatedTimeLabel(state: RiderDeviceLocationState) {
  if (state.status !== "CURRENT" && state.status !== "STALE") return undefined;
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(state.capturedAt));
}

function createTruckMarker() {
  const marker = document.createElement("div");
  marker.className = "rider-truck-map-marker";
  marker.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.src = "/assets/rider-truck-top-2d.png";
  image.alt = "";
  const label = document.createElement("span");
  label.textContent = "내 위치";
  marker.append(image, label);
  return marker;
}

function updateTruckMarkerSize(marker: HTMLDivElement, map: KakaoMapInstance, container: HTMLDivElement) {
  const size = riderMapMarkerSizePx(map.getLevel(), container.clientWidth);
  marker.style.setProperty("--rider-marker-size", `${size}px`);
  marker.dataset.markerSize = String(size);
}

export function RiderLiveLocationMap({ profile, online }: { profile: RiderProfile; online: boolean }) {
  const { state, request } = useRiderDeviceLocation(profile.courierId);
  const fallbackPoint = useMemo(() => riderProfileMapPoint(profile), [profile]);
  const displayPoint = state.status === "CURRENT" || state.status === "STALE" ? state.point : fallbackPoint;
  const hasDevicePoint = state.status === "CURRENT" || state.status === "STALE";
  const kakaoJavaScriptKey = import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? "";
  const kakaoRequested = online && Boolean(kakaoJavaScriptKey) && import.meta.env.VITE_KAKAO_MAP_ENABLED !== "false";
  const [mapStatus, setMapStatus] = useState<MapStatus>(kakaoRequested ? "LOADING" : "FALLBACK");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | undefined>(undefined);
  const mapsRef = useRef<KakaoMapsNamespace | undefined>(undefined);
  const overlayRef = useRef<KakaoCustomOverlay | undefined>(undefined);
  const markerRef = useRef<HTMLDivElement | undefined>(undefined);
  const pointRef = useRef(displayPoint);
  const renderedPointRef = useRef(displayPoint);
  const renderedSourceRef = useRef<"DEVICE" | "ROUTE">(hasDevicePoint ? "DEVICE" : "ROUTE");
  const pointSourceRef = useRef<"DEVICE" | "ROUTE">(hasDevicePoint ? "DEVICE" : "ROUTE");
  const animationFrameRef = useRef<number | undefined>(undefined);
  pointRef.current = displayPoint;
  pointSourceRef.current = hasDevicePoint ? "DEVICE" : "ROUTE";

  useEffect(() => {
    if (!kakaoRequested || !containerRef.current) {
      setMapStatus("FALLBACK");
      return;
    }
    let active = true;
    let createdOverlay: KakaoCustomOverlay | undefined;
    let createdMap: KakaoMapInstance | undefined;
    let createdMaps: KakaoMapsNamespace | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let updateMarkerSize: (() => void) | undefined;
    setMapStatus("LOADING");
    loadKakaoMapsSdk(kakaoJavaScriptKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;
        const point = pointRef.current;
        const position = new maps.LatLng(point.latitude, point.longitude);
        const map = new maps.Map(containerRef.current, { center: position, level: 3 });
        createdMap = map;
        createdMaps = maps;
        const marker = createTruckMarker();
        createdOverlay = new maps.CustomOverlay({
          map,
          position,
          content: marker,
          xAnchor: 0.5,
          yAnchor: 0.82,
          zIndex: 12,
        });
        mapsRef.current = maps;
        mapRef.current = map;
        overlayRef.current = createdOverlay;
        markerRef.current = marker;
        renderedPointRef.current = point;
        renderedSourceRef.current = pointSourceRef.current;
        marker.dataset.locationSource = renderedSourceRef.current;
        updateMarkerSize = () => {
          if (!containerRef.current) return;
          updateTruckMarkerSize(marker, map, containerRef.current);
        };
        updateMarkerSize();
        maps.event.addListener(map, "zoom_changed", updateMarkerSize);
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            map.relayout();
            updateMarkerSize?.();
          });
          resizeObserver.observe(containerRef.current);
        }
        map.relayout();
        setMapStatus("READY");
      })
      .catch(() => {
        if (active) setMapStatus("ERROR");
      });
    return () => {
      active = false;
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      if (updateMarkerSize && createdMap && createdMaps) {
        createdMaps.event.removeListener(createdMap, "zoom_changed", updateMarkerSize);
      }
      resizeObserver?.disconnect();
      createdOverlay?.setMap(null);
      overlayRef.current = undefined;
      markerRef.current = undefined;
      mapRef.current = undefined;
      mapsRef.current = undefined;
    };
  }, [kakaoJavaScriptKey, kakaoRequested, profile.courierId]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!maps || !map || !overlay) return;
    if (animationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    const source = hasDevicePoint ? "DEVICE" : "ROUTE";
    const moveImmediately = renderedSourceRef.current !== "DEVICE"
      || source !== "DEVICE"
      || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    if (moveImmediately) {
      const position = new maps.LatLng(displayPoint.latitude, displayPoint.longitude);
      overlay.setPosition(position);
      map.panTo(position);
      renderedPointRef.current = displayPoint;
      renderedSourceRef.current = source;
      return;
    }

    const from = renderedPointRef.current;
    const startedAt = performance.now();
    const durationMs = 900;
    const animate = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / durationMs);
      const easedProgress = 1 - (1 - progress) ** 3;
      const point = interpolateRiderLocationPoint(from, displayPoint, easedProgress);
      overlay.setPosition(new maps.LatLng(point.latitude, point.longitude));
      renderedPointRef.current = point;
      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }
      animationFrameRef.current = undefined;
      renderedPointRef.current = displayPoint;
      renderedSourceRef.current = source;
      map.panTo(new maps.LatLng(displayPoint.latitude, displayPoint.longitude));
    };
    animationFrameRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [displayPoint.latitude, displayPoint.longitude, hasDevicePoint]);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.dataset.locationSource = state.status === "CURRENT" || state.status === "STALE" ? "DEVICE" : "ROUTE";
    }
  }, [mapStatus, state.status]);

  const updateTime = updatedTimeLabel(state);
  const buttonLabel = state.status === "IDLE" ? "내 위치 표시" : "위치 다시 확인";
  const mapLabel = mapStatus === "READY" ? "카카오 지도" : mapStatus === "LOADING" ? "지도 준비 중" : "경로 위치";

  return (
    <section className="rider-live-location" aria-label="기사 본인 현재 위치">
      <div className="rider-live-location-heading">
        <div>
          <span>현재 위치</span>
          <strong>{statusLabels[state.status]}</strong>
        </div>
        <span className={`rider-location-status is-${state.status.toLowerCase()}`} aria-live="polite">
          {mapLabel}
        </span>
      </div>
      <div className={`rider-live-map-stage ${mapStatus === "READY" ? "is-kakao" : "is-fallback"}`}>
        <div ref={containerRef} className="rider-live-kakao-map" aria-hidden={mapStatus !== "READY"} />
        {mapStatus !== "READY" && (
          <div className="rider-live-map-fallback" data-location-source={hasDevicePoint ? "DEVICE" : "ROUTE"}>
            <i className="rider-live-road is-one" aria-hidden="true" />
            <i className="rider-live-road is-two" aria-hidden="true" />
            <div className="rider-truck-map-marker" aria-hidden="true">
              <img src="/assets/rider-truck-top-2d.png" alt="" />
              <span>{hasDevicePoint ? "내 위치" : "경로 위치"}</span>
            </div>
            <p>{mapStatus === "ERROR" ? "지도를 불러오지 못했습니다" : mapStatus === "LOADING" ? "지도를 준비하고 있습니다" : profile.areaCode}</p>
          </div>
        )}
      </div>
      <div className="rider-live-location-footer">
        <div>
          <strong>{hasDevicePoint ? `${updateTime} 갱신` : "배송 구역 기준 위치"}</strong>
          <span>{hasDevicePoint ? `정확도 약 ${Math.round(state.accuracyMeters)}m` : "기기 위치는 이 화면에서만 사용"}</span>
        </div>
        <button type="button" onClick={request} disabled={state.status === "REQUESTING"}>
          {state.status === "REQUESTING" ? "확인 중" : buttonLabel}
        </button>
      </div>
    </section>
  );
}
