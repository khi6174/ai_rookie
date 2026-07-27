import { useEffect, useMemo, useRef, useState } from "react";
import {
  KakaoDirectionsClientError,
  createKakaoMapDemoDirectionsUrl,
  fetchKakaoDirectionsPreview,
  type KakaoDirectionsFallbackCode,
  type KakaoDirectionsPreview,
} from "../adapters/maps";
import {
  loadKakaoMapsSdk,
  type KakaoMapOverlay,
} from "../adapters/maps/kakao";
import {
  createOperationsMapCouriers,
  createOperationsRiderMapModel,
} from "../application/operations";
import type { DailyOperationsPackage } from "../domain/operations";

type MapStatus = "LOADING" | "READY" | "FALLBACK";

export function OperationsMap({
  operationsPackage,
  selectedCourierId,
  supportCourierIds,
  onSelectCourier,
}: {
  operationsPackage: DailyOperationsPackage;
  selectedCourierId?: string;
  supportCourierIds: ReadonlySet<string>;
  onSelectCourier(courierId: string): void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("LOADING");
  const [directions, setDirections] = useState<
    | { status: "IDLE" }
    | { status: "LOADING" }
    | { status: "LIVE"; preview: KakaoDirectionsPreview }
    | { status: "FALLBACK"; code: KakaoDirectionsFallbackCode }
  >({ status: "IDLE" });
  const couriers = useMemo(
    () => createOperationsMapCouriers(operationsPackage),
    [operationsPackage],
  );
  const selectedModel = useMemo(
    () =>
      selectedCourierId
        ? createOperationsRiderMapModel(
            operationsPackage,
            selectedCourierId,
          )
        : undefined,
    [operationsPackage, selectedCourierId],
  );
  const hubs = useMemo(
    () =>
      [...new Set(couriers.map((courier) => courier.hubId))].map(
        (hubId) => {
          const members = couriers.filter(
            (courier) => courier.hubId === hubId,
          );
          const supportMembers = members.filter((courier) =>
            supportCourierIds.has(courier.courierId),
          );
          return {
            hubId,
            point: {
              latitude:
                members.reduce(
                  (total, member) => total + member.current.latitude,
                  0,
                ) / members.length,
              longitude:
                members.reduce(
                  (total, member) => total + member.current.longitude,
                  0,
                ) / members.length,
            },
            courierCount: members.length,
            supportCount: supportMembers.length,
            firstSupportCourierId: supportMembers[0]?.courierId,
          };
        },
      ),
    [couriers, supportCourierIds],
  );

  useEffect(() => {
    const container = containerRef.current;
    const javaScriptKey =
      import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? "";
    const enabled =
      Boolean(javaScriptKey) &&
      import.meta.env.VITE_KAKAO_MAP_ENABLED !== "false";
    if (!container || !enabled) {
      setMapStatus("FALLBACK");
      return;
    }
    let cancelled = false;
    const overlays: KakaoMapOverlay[] = [];
    void loadKakaoMapsSdk(javaScriptKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const center = selectedModel?.current ?? couriers[0].current;
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(center.latitude, center.longitude),
          level: selectedModel ? 6 : 9,
        });
        const bounds = new maps.LatLngBounds();
        const addPoint = (point: {
          latitude: number;
          longitude: number;
        }) => {
          const value = new maps.LatLng(point.latitude, point.longitude);
          bounds.extend(value);
          return value;
        };
        for (const hub of hubs) {
          const node = document.createElement("button");
          node.type = "button";
          node.className = "operations-map-hub";
          node.innerHTML = `<strong>${hub.hubId.replace("demo-hub-", "허브 ")}</strong><small>지원 ${hub.supportCount} · 전체 ${hub.courierCount}</small>`;
          node.disabled = !hub.firstSupportCourierId;
          node.setAttribute(
            "aria-label",
            `${hub.hubId} 합성 권역 · 지원 ${hub.supportCount}명 · 전체 ${hub.courierCount}명`,
          );
          if (hub.firstSupportCourierId) {
            node.addEventListener("click", () =>
              onSelectCourier(hub.firstSupportCourierId!),
            );
          }
          overlays.push(
            new maps.CustomOverlay({
              map,
              position: addPoint(hub.point),
              content: node,
              xAnchor: 0.5,
              yAnchor: 0.5,
              zIndex: 2,
            }),
          );
        }
        if (selectedModel) {
          const path = selectedModel.path.map(addPoint);
          const node = document.createElement("div");
          node.className = "operations-map-marker selected";
          node.textContent =
            selectedCourierId?.replace("demo-courier-", "") ?? "선택";
          node.setAttribute(
            "aria-label",
            `${selectedCourierId} 선택된 합성 위치`,
          );
          overlays.push(
            new maps.CustomOverlay({
              map,
              position: addPoint(selectedModel.current),
              content: node,
              xAnchor: 0.5,
              yAnchor: 0.5,
              zIndex: 5,
            }),
          );
          overlays.push(
            new maps.Polyline({
              map,
              path,
              strokeWeight: 5,
              strokeColor: "#0f766e",
              strokeOpacity: 0.9,
              strokeStyle: "solid",
              zIndex: 4,
            }),
          );
        }
        map.setBounds(bounds, 40, 40, 40, 40);
        map.relayout();
        setMapStatus("READY");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("FALLBACK");
      });
    return () => {
      cancelled = true;
      overlays.forEach((overlay) => overlay.setMap(null));
    };
  }, [
    couriers,
    hubs,
    onSelectCourier,
    selectedCourierId,
    selectedModel,
    supportCourierIds,
  ]);

  useEffect(() => {
    if (!selectedModel) {
      setDirections({ status: "IDLE" });
      return;
    }
    const controller = new AbortController();
    setDirections({ status: "LOADING" });
    void fetchKakaoDirectionsPreview({
      model: selectedModel,
      signal: controller.signal,
    })
      .then((preview) => setDirections({ status: "LIVE", preview }))
      .catch((error) =>
        setDirections({
          status: "FALLBACK",
          code:
            error instanceof KakaoDirectionsClientError
              ? error.code
              : "NETWORK_ERROR",
        }),
      );
    return () => controller.abort();
  }, [selectedModel]);

  const latitudes = couriers.map((item) => item.current.latitude);
  const longitudes = couriers.map((item) => item.current.longitude);
  const latitudeSpan =
    Math.max(...latitudes) - Math.min(...latitudes) || 0.001;
  const longitudeSpan =
    Math.max(...longitudes) - Math.min(...longitudes) || 0.001;

  return (
    <section className="operations-map-card" aria-labelledby="operations-map-heading">
      <div className="operations-map-header">
        <div>
          <p className="operations-section-label">합성 운영 위치</p>
          <h2 id="operations-map-heading">Kakao 지도·길찾기</h2>
        </div>
        <span className={mapStatus === "READY" ? "is-live" : "is-fallback"}>
          {mapStatus === "READY"
            ? "Kakao map · 합성 좌표"
            : mapStatus === "LOADING"
              ? "Kakao 지도 확인 중"
              : "Schematic Fallback · 합성 좌표"}
        </span>
      </div>
      <div className="operations-map-stage">
        <div
          ref={containerRef}
          className="operations-kakao-map"
          aria-label="25명 합성 기사의 권역 위치와 선택 경로"
        />
        {mapStatus !== "READY" && (
          <div
            className="operations-map-fallback"
            aria-label="지도 없이 보는 합성 기사 위치"
          >
            {hubs.map((hub) => {
              const left =
                12 +
                ((hub.point.longitude - Math.min(...longitudes)) /
                  longitudeSpan) *
                  76;
              const top =
                12 +
                ((Math.max(...latitudes) - hub.point.latitude) /
                  latitudeSpan) *
                  76;
              return (
                <button
                  key={hub.hubId}
                  type="button"
                  className="operations-map-hub"
                  style={{ left: `${left}%`, top: `${top}%` }}
                  disabled={!hub.firstSupportCourierId}
                  aria-label={`${hub.hubId} 합성 권역 · 지원 ${hub.supportCount}명 · 전체 ${hub.courierCount}명`}
                  onClick={() =>
                    hub.firstSupportCourierId &&
                    onSelectCourier(hub.firstSupportCourierId)
                  }
                >
                  <strong>{hub.hubId.replace("demo-hub-", "허브 ")}</strong>
                  <small>
                    지원 {hub.supportCount} · 전체 {hub.courierCount}
                  </small>
                </button>
              );
            })}
            {selectedModel &&
              selectedModel.path.map((point, index) => {
                const left =
                  12 +
                  ((point.longitude - Math.min(...longitudes)) /
                    longitudeSpan) *
                    76;
                const top =
                  12 +
                  ((Math.max(...latitudes) - point.latitude) /
                    latitudeSpan) *
                    76;
                return (
                  <span
                    key={`${point.latitude}-${point.longitude}`}
                    className={
                      index === 0
                        ? "operations-route-point current"
                        : "operations-route-point"
                    }
                    style={{ left: `${left}%`, top: `${top}%` }}
                    aria-hidden="true"
                  />
                );
              })}
          </div>
        )}
      </div>
      <div className="operations-directions-status" role="status">
        {!selectedModel && (
          <span>지원 건을 선택하면 해당 합성 경로의 길찾기를 확인합니다.</span>
        )}
        {directions.status === "LOADING" && (
          <span>Kakao Mobility 선택 경로 확인 중…</span>
        )}
        {directions.status === "LIVE" && (
          <span>
            Kakao Mobility Live ·{" "}
            {(directions.preview.distanceMeters / 1_000).toFixed(1)}km ·{" "}
            {Math.ceil(directions.preview.durationSeconds / 60)}분
          </span>
        )}
        {directions.status === "FALLBACK" && (
          <span>
            길찾기 Fallback · {directions.code} · 기존 합성 계획을 유지합니다.
          </span>
        )}
        {selectedModel && (
          <a
            href={createKakaoMapDemoDirectionsUrl(selectedModel)}
            target="_blank"
            rel="noreferrer"
          >
            Kakao 길찾기에서 보기
          </a>
        )}
      </div>
      <p className="operations-map-disclosure">
        결정론적 합성 좌표만 전송합니다. 지도·길찾기 결과는 시각화와 ETA 비교
        보조이며 Safety Budget 계산 입력을 덮어쓰지 않습니다.
      </p>
    </section>
  );
}
