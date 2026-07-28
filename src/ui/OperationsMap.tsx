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
  createOperationsRouteComparison,
  createOperationsRiderMapModel,
} from "../application/operations";
import type { ScenarioFixture } from "../domain/contracts";
import type { DailyOperationsPackage } from "../domain/operations";

type MapStatus = "LOADING" | "READY" | "FALLBACK";

function courierProgressLabel(
  courierId: string,
  completed: number,
  total: number,
  needsSupport: boolean,
) {
  return `${courierId} 합성 위치 · 배송 ${completed}/${total}건 완료 · ${needsSupport ? "지원 필요" : "지원 없음"}`;
}

export function OperationsMap({
  operationsPackage,
  selectedCourierId,
  baselinePlan,
  activePlan,
  supportCourierIds,
  onSelectCourier,
}: {
  operationsPackage: DailyOperationsPackage;
  selectedCourierId?: string;
  baselinePlan?: ScenarioFixture;
  activePlan?: ScenarioFixture;
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
  const routeComparison = useMemo(
    () =>
      selectedCourierId && baselinePlan && activePlan
        ? createOperationsRouteComparison(
            operationsPackage,
            baselinePlan,
            activePlan,
            selectedCourierId,
          )
        : undefined,
    [activePlan, baselinePlan, operationsPackage, selectedCourierId],
  );
  const selectedModel = useMemo(
    () =>
      routeComparison
        ? routeComparison.mapModel
        : selectedCourierId
          ? createOperationsRiderMapModel(
              operationsPackage,
              selectedCourierId,
            )
          : undefined,
    [operationsPackage, routeComparison, selectedCourierId],
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
        if (!selectedModel) {
          for (const courier of couriers) {
            const needsSupport = supportCourierIds.has(courier.courierId);
            const node = document.createElement("button");
            node.type = "button";
            node.className = `operations-map-courier-marker${needsSupport ? " needs-support" : ""}`;
            node.innerHTML = `<strong>${courier.courierId.replace("demo-courier-", "")}</strong><small>${courier.completed}/${courier.total}</small>`;
            node.disabled = !needsSupport;
            node.setAttribute(
              "aria-label",
              courierProgressLabel(
                courier.courierId,
                courier.completed,
                courier.total,
                needsSupport,
              ),
            );
            if (needsSupport) {
              node.addEventListener("click", () =>
                onSelectCourier(courier.courierId),
              );
            }
            overlays.push(
              new maps.CustomOverlay({
                map,
                position: addPoint(courier.current),
                content: node,
                xAnchor: 0.5,
                yAnchor: 0.5,
                zIndex: needsSupport ? 4 : 2,
              }),
            );
          }
        }
        if (selectedModel) {
          const path = selectedModel.path.map(addPoint);
          const node = document.createElement("div");
          node.className = "operations-map-marker selected";
          node.textContent = selectedCourierId!.replace("demo-courier-", "");
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
  const routeApplied =
    routeComparison?.baseline.planVersion !==
    routeComparison?.active.planVersion;
  return (
    <section className="operations-map-card" aria-labelledby="operations-map-heading">
      <div className="operations-map-header">
        <div>
          <p className="operations-section-label">합성 운영 위치</p>
          <h2 id="operations-map-heading">
            {selectedModel ? "Kakao 지도·길찾기" : "기사 위치·배송 진행"}
          </h2>
        </div>
        <span
          className={
            !selectedModel
              ? "is-synthetic"
              : mapStatus === "READY"
                ? "is-live"
                : "is-fallback"
          }
        >
          {!selectedModel
            ? "합성 스냅샷 · Live 0명"
            : mapStatus === "READY"
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
          aria-label="25명 합성 기사의 위치·배송 진행과 선택 경로"
        />
        {mapStatus !== "READY" && (
          <div
            className="operations-map-fallback"
            aria-label="지도 없이 보는 합성 기사 위치"
          >
            {!selectedModel &&
              couriers.map((courier) => {
                  const needsSupport = supportCourierIds.has(
                    courier.courierId,
                  );
                  const left =
                    12 +
                    ((courier.current.longitude -
                      Math.min(...longitudes)) /
                      longitudeSpan) *
                      76;
                  const top =
                    12 +
                    ((Math.max(...latitudes) - courier.current.latitude) /
                      latitudeSpan) *
                      76;
                  return (
                    <button
                      key={courier.courierId}
                      type="button"
                      className={`operations-map-courier-marker${needsSupport ? " needs-support" : ""}`}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      disabled={!needsSupport}
                      aria-label={courierProgressLabel(
                        courier.courierId,
                        courier.completed,
                        courier.total,
                        needsSupport,
                      )}
                      onClick={() =>
                        needsSupport && onSelectCourier(courier.courierId)
                      }
                    >
                      <strong>
                        {courier.courierId.replace("demo-courier-", "")}
                      </strong>
                      <small>
                        {courier.completed}/{courier.total}
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
                    className={`operations-route-point active${index === 0 ? " current" : ""}`}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    aria-hidden="true"
                  />
                );
              })}
          </div>
        )}
      </div>
      {routeComparison && (
        <section
          className="operations-route-comparison"
          aria-label="경로 계획 비교"
        >
          <h3>조정 전·후 경로·배송순서·ETA</h3>
          <strong>{routeApplied ? "승인 적용 완료" : "현재 계획 유지"}</strong>
          <p>
            계획 {routeComparison.baseline.planVersion} → {routeComparison.active.planVersion}
            {" · "}남은 배송 {routeComparison.baseline.remainingStopIds.length}건 → {routeComparison.active.remainingStopIds.length}건
            {" · "}예상 종료 {routeComparison.baseline.projectedEndAt.slice(11, 16)} → {routeComparison.active.projectedEndAt.slice(11, 16)}
          </p>
          <p><strong>적용 전 순서</strong> {routeComparison.baseline.remainingStopIds.join(" → ")}</p>
          {routeApplied && (
            <p><strong>적용 후 순서</strong> {routeComparison.active.remainingStopIds.join(" → ")}</p>
          )}
        </section>
      )}
      <div className="operations-directions-status" role="status">
        {!selectedModel && (
          <span>
            합성 {couriers.length}명 · 지원 {supportCourierIds.size}명 · 실제 위치 0명
          </span>
        )}
        {selectedModel && directions.status === "LOADING" && (
          <span>Kakao Mobility 선택 경로 확인 중…</span>
        )}
        {selectedModel && directions.status === "LIVE" && (
          <span>
            Kakao Mobility Live ·{" "}
            {(directions.preview.distanceMeters / 1_000).toFixed(1)}km ·{" "}
            {Math.ceil(directions.preview.durationSeconds / 60)}분
          </span>
        )}
        {selectedModel && directions.status === "FALLBACK" && (
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
        합성 좌표입니다. Kakao 결과는 계획·Safety 계산을 변경하지 않습니다.
      </p>
    </section>
  );
}
