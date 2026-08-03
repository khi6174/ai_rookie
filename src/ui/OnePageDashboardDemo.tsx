import { useEffect, useRef, useState } from "react";
import {
  DEMO_RIDER_DANGER_SIGNAL_EVENT,
  DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY,
  loadDemoRiderDangerSignal,
  parseDemoRiderDangerSignal,
} from "../application/demoRiderDangerSignal";
import {
  loadKakaoMapsSdk,
  type KakaoMapInstance,
  type KakaoMapOverlay,
  type KakaoMapsNamespace,
} from "../adapters/maps/kakao";
import {
  loadDashboardOperationsProjection,
  type DashboardCourierProjection,
  type DashboardHubProjection,
  type DashboardOperationsProjection,
} from "../application/dashboardOperationsProjection";
import {
  riderAreaKey,
  riderMapMarkerScale,
  riderMapMarkerSizePx,
  riderRoutePosition,
  type RiderRoutePoint,
} from "../application/riderMapPresentation";
import "./one-page-dashboard.css";

type SupportState = "BREACH" | "SUPPORT" | "CAUTION" | "STABLE";
type CourierFilter = "ALL" | "SIGNAL" | "SUPPORT" | "CAUTION" | "STABLE";
type DashboardMapStatus = "LOADING" | "READY" | "FALLBACK";
type InterventionStage =
  | "COMPARE"
  | "REQUESTED"
  | "RECIPIENT_REQUESTED"
  | "CONSENTED"
  | "MODIFY"
  | "DECLINED"
  | "APPLIED";

type InterventionOption = {
  id:
    | "REST_RESEQUENCE"
    | "REST_SAFE_DELAY"
    | "REST_TRANSFER"
    | "TRANSFER_12"
      | "REST_ONLY";
  label: string;
  resultBand: "지원 필요" | "주의";
  etaLabel: string;
  guard: string;
  feasible: boolean;
  transferDependent: boolean;
  recommended?: boolean;
  compensation: string;
};

type Courier = DashboardCourierProjection;

type PositionedCourier = Courier & RiderRoutePoint;

type RiderDangerSignal = {
  courierId: string;
  label: string;
  receivedAt: string;
};

const initialDangerSignals: Record<string, RiderDangerSignal> = {};
const clockFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const interventionOptions: InterventionOption[] = [
  {
    id: "REST_RESEQUENCE",
    label: "10분 휴식 + 순서 변경",
    resultBand: "지원 필요",
    etaLabel: "+6분",
    guard: "초과 해소 · 실행 가능",
    feasible: true,
    transferDependent: false,
    compensation: "배송시간 목표 조정 가정",
  },
  {
    id: "REST_SAFE_DELAY",
    label: "10분 휴식 + 시간 재약정",
    resultBand: "주의",
    etaLabel: "+12분",
    guard: "초과 해소 · 실행 가능",
    feasible: true,
    transferDependent: false,
    compensation: "지연 미집계 가정",
  },
  {
    id: "REST_TRANSFER",
    label: "10분 휴식 + 배송 8건 분담",
    resultBand: "주의",
    etaLabel: "−15분",
    guard: "수신 기사 기준 45 통과",
    feasible: true,
    transferDependent: true,
    recommended: true,
    compensation: "이관 8건 보전 검토",
  },
  {
    id: "TRANSFER_12",
    label: "배송 12건 분담",
    resultBand: "주의",
    etaLabel: "−37분",
    guard: "차단 · 수신 기사 41 / 기준 45 미달",
    feasible: false,
    transferDependent: true,
    compensation: "적용 불가",
  },
  {
    id: "REST_ONLY",
    label: "10분 휴식",
    resultBand: "지원 필요",
    etaLabel: "+10분",
    guard: "초과 해소 · 실행 가능",
    feasible: true,
    transferDependent: false,
    compensation: "배송시간 목표 조정 가정",
  },
];

function hubClusters(couriers: Courier[]) {
  return [...new Set(couriers.map((courier) => courier.hubId))].map((hubId) => {
    const members = couriers.filter((courier) => courier.hubId === hubId);
    return {
      id: `cluster-${hubId}`,
      x: members.reduce((total, courier) => total + courier.mapX, 0) / members.length,
      y: members.reduce((total, courier) => total + courier.mapY, 0) / members.length,
      memberIds: members.map((courier) => courier.id),
    };
  });
}

function courierAreaKey(courier: Courier) {
  return riderAreaKey({ areaCode: courier.area });
}

function simulatedCourierPosition(
  courier: Courier,
  movementSecond: number,
): PositionedCourier {
  const point = riderRoutePosition({
    courierId: courier.id,
    areaCode: courier.area,
    mapX: courier.mapX,
    mapY: courier.mapY,
  }, movementSecond);
  return {
    ...courier,
    ...point,
  };
}

function supportState(budget: number): SupportState {
  if (budget < 30) return "BREACH";
  if (budget < 45) return "SUPPORT";
  if (budget < 60) return "CAUTION";
  return "STABLE";
}

function matchesCourierFilter(
  courier: Courier,
  filter: CourierFilter,
  dangerSignals: Record<string, RiderDangerSignal>,
) {
  const state = supportState(courier.budget);
  if (filter === "ALL") return true;
  if (filter === "SIGNAL") return Boolean(dangerSignals[courier.id]);
  if (filter === "SUPPORT") return state === "BREACH" || state === "SUPPORT";
  return state === filter;
}

const stateLabel: Record<SupportState, string> = {
  BREACH: "한계 초과",
  SUPPORT: "지원 필요",
  CAUTION: "주의",
  STABLE: "정상",
};

function supportTimingLabel(courier: Courier) {
  if (courier.criticalMinute === 0) return "현재 한계 초과";
  if (courier.criticalMinute !== null) {
    return `한계까지 ${courier.criticalMinute}분`;
  }
  return "향후 60분 내 초과 없음";
}

function supportTimingShort(courier: Courier) {
  if (courier.criticalMinute === 0) return "지금";
  if (courier.criticalMinute !== null) return `${courier.criticalMinute}분`;
  return "60분+";
}

function supportPanelStateLabel(courier: Courier) {
  const state = supportState(courier.budget);
  if (state === "BREACH" || state === "SUPPORT") return "위험";
  if (state === "CAUTION") return "주의";
  return "정상";
}

const roads = [
  { left: -6, top: 26, width: 116, rotate: 5, kind: "major" },
  { left: -2, top: 60, width: 108, rotate: -7, kind: "major" },
  { left: 16, top: 44, width: 88, rotate: 27, kind: "minor" },
  { left: 32, top: -10, width: 92, rotate: 82, kind: "major" },
  { left: 57, top: -8, width: 82, rotate: 89, kind: "minor" },
  { left: 76, top: -2, width: 72, rotate: 96, kind: "minor" },
  { left: 5, top: 78, width: 76, rotate: -25, kind: "minor" },
];

function CourierCard({
  courier,
  selected,
  dimmed,
  dangerSignal,
  onSelect,
  cardRef,
}: {
  courier: Courier;
  selected: boolean;
  dimmed: boolean;
  dangerSignal?: RiderDangerSignal;
  onSelect: () => void;
  cardRef: (node: HTMLButtonElement | null) => void;
}) {
  const state = supportState(courier.budget);
  return (
    <button
      ref={cardRef}
      className={`onepage-courier-card state-${state.toLowerCase()} ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""} ${dangerSignal ? "has-danger-signal" : ""}`}
      data-courier-card={courier.id}
      data-current-score={courier.currentScore.toFixed(1)}
      data-projected-score={courier.budget.toFixed(1)}
      data-area-code={courier.area}
      data-completed-count={courier.completed}
      data-total-count={courier.total}
      data-decision-id={courier.decisionId ?? ""}
      data-rider-danger-signal={dangerSignal ? "active" : "inactive"}
      aria-pressed={selected}
      aria-label={`${courier.name} 기사, 지정구역 ${courier.area}, 현재 Safety Budget ${courier.currentScore.toFixed(1)}, 예상 최저 ${courier.budget.toFixed(1)}, ${stateLabel[state]}, ${supportTimingLabel(courier)}${dangerSignal ? ", 기사앱 위험 신호" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="onepage-card-identity">
        <span className="onepage-avatar" aria-hidden="true">
          <span className="onepage-profile-photo">
            {courier.id.slice(-3)}
          </span>
          <i className={`onepage-avatar-status state-${state.toLowerCase()}`} />
        </span>
        <span className="onepage-card-copy">
          <span className="onepage-card-name">{courier.name}</span>
          <strong className="onepage-card-area">{courier.area}</strong>
          <span className={`onepage-state-pill state-${state.toLowerCase()}`}>
            {stateLabel[state]}
          </span>
        </span>
      </span>
      <span className={`onepage-card-safety state-${state.toLowerCase()}`}>
        <small>{dangerSignal ? "위험 신호 / 예상 최저" : "예상 최저 Budget"}</small>
        <span className="onepage-card-safety-value">
          <b>{courier.budget.toFixed(1)}</b>
          <em>{supportTimingShort(courier)}</em>
        </span>
      </span>
    </button>
  );
}

function MapMarker({
  courier,
  selected,
  onSelect,
}: {
  courier: PositionedCourier;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = supportState(courier.budget);
  return (
    <button
      className={`onepage-map-marker state-${state.toLowerCase()} ${selected ? "is-selected" : ""}`}
      data-map-marker={courier.id}
      data-road-corridor={courierAreaKey(courier)}
      data-latitude={courier.latitude.toFixed(6)}
      data-longitude={courier.longitude.toFixed(6)}
      style={{ left: `${courier.mapX}%`, top: `${courier.mapY}%` }}
      aria-label={`${courier.name} 기사 갱신 위치, ${stateLabel[state]}, ${supportTimingLabel(courier)}`}
      aria-pressed={selected}
      onClick={onSelect}
      type="button"
    >
      <span aria-hidden="true" />
    </button>
  );
}

function updateDashboardMarkerScale(
  button: HTMLButtonElement,
  map: KakaoMapInstance,
  container: HTMLDivElement,
) {
  const scale = riderMapMarkerScale(map.getLevel());
  const size = Math.max(24, Math.round(riderMapMarkerSizePx(map.getLevel(), container.clientWidth) * 0.64));
  button.dataset.markerScale = scale;
  button.style.setProperty("--dashboard-marker-size", `${size}px`);
  button.classList.toggle("is-scale-street", scale === "STREET");
  button.classList.toggle("is-scale-district", scale === "DISTRICT");
  button.classList.toggle("is-scale-overview", scale === "OVERVIEW");
}

function SafetyMarginTrack({ value }: { value: number }) {
  const markerPosition = Math.max(0, Math.min(100, value));
  return (
    <div className="onepage-safety-track" aria-label={`안전여유 ${value.toFixed(1)}, 30 한계, 45 기준`}>
      <div className="onepage-safety-track-title">
        <strong>Safety Margin</strong>
        <span>0–100</span>
      </div>
      <div className="onepage-safety-track-bar" aria-hidden="true">
        <span className="onepage-track-zone is-breach" />
        <span className="onepage-track-zone is-support" />
        <span className="onepage-track-zone is-caution" />
        <span className="onepage-track-zone is-stable" />
        <i style={{ left: `${markerPosition}%` }} />
      </div>
      <div className="onepage-safety-track-ticks" aria-hidden="true">
        <span>0</span>
        <span style={{ left: "30%" }}>30(한계)</span>
        <span style={{ left: "45%" }}>45(기준)</span>
        <span style={{ left: "60%" }}>60</span>
        <span>100</span>
      </div>
    </div>
  );
}

function DashboardKakaoMap({
  couriers,
  hubs,
  selectedId,
  movementSecond,
  onSelect,
  onStatus,
}: {
  couriers: Courier[];
  hubs: DashboardHubProjection[];
  selectedId: string;
  movementSecond: number;
  onSelect: (id: string) => void;
  onStatus: (status: DashboardMapStatus) => void;
}) {
  type MovableKakaoOverlay = KakaoMapOverlay & {
    setPosition(position: object): void;
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const markerButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const markerOverlaysRef = useRef(new Map<string, MovableKakaoOverlay>());
  const mapsNamespaceRef = useRef<KakaoMapsNamespace | undefined>(undefined);
  const selectRef = useRef(onSelect);
  const javaScriptKey =
    import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? "";
  const requested =
    Boolean(javaScriptKey) &&
    import.meta.env.VITE_KAKAO_MAP_ENABLED !== "false";

  selectRef.current = onSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !requested) {
      onStatus("FALLBACK");
      return;
    }

    let disposed = false;
    let map: KakaoMapInstance | undefined;
    let updateMarkerScales: (() => void) | undefined;
    const overlays: KakaoMapOverlay[] = [];
    const buttons = markerButtonsRef.current;
    const markerOverlays = markerOverlaysRef.current;
    onStatus("LOADING");

    void loadKakaoMapsSdk(javaScriptKey)
      .then((maps) => {
        if (disposed) return;
        mapsNamespaceRef.current = maps;
        const firstHub = hubs[0] ?? { mapX: 48, mapY: 48 };
        const center = new maps.LatLng(
          37.55 - firstHub.mapY * 0.00105,
          126.99 + firstHub.mapX * 0.00142,
        );
        map = new maps.Map(container, { center, level: 6 });
        const bounds = new maps.LatLngBounds();

        couriers.forEach((courier) => {
          if (!map) return;
          const point = simulatedCourierPosition(courier, movementSecond);
          const position = new maps.LatLng(point.latitude, point.longitude);
          const state = supportState(courier.budget);
          const button = document.createElement("button");
          const truckImage = document.createElement("img");
          const markerDot = document.createElement("span");

          button.type = "button";
          button.className = `onepage-map-marker onepage-kakao-marker state-${state.toLowerCase()}`;
          button.dataset.mapMarker = courier.id;
          button.dataset.roadCorridor = courierAreaKey(courier);
          button.dataset.latitude = point.latitude.toFixed(6);
          button.dataset.longitude = point.longitude.toFixed(6);
          button.setAttribute("aria-label", `${courier.name} 기사 갱신 위치, 안전 지원 점수 ${courier.budget.toFixed(1)}, ${stateLabel[state]}`);
          truckImage.src = "/assets/rider-truck-top-2d.png";
          truckImage.alt = "";
          markerDot.setAttribute("aria-hidden", "true");
          button.append(truckImage, markerDot);
          button.addEventListener("click", () => selectRef.current(courier.id));
          buttons.set(courier.id, button);

          const markerOverlay = new maps.CustomOverlay({
            map,
            position,
            content: button,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: courier.budget < 45 ? 8 : 6,
          }) as MovableKakaoOverlay;
          overlays.push(markerOverlay);
          markerOverlays.set(courier.id, markerOverlay);
          bounds.extend(position);
        });

        hubs.forEach((hubProjection) => {
          if (!map) return;
          const hubPosition = new maps.LatLng(
            37.55 - hubProjection.mapY * 0.00105,
            126.99 + hubProjection.mapX * 0.00142,
          );
          const hub = document.createElement("span");
          const hubIcon = document.createElement("span");
          const hubLabel = document.createElement("strong");
          hub.className = "onepage-hub onepage-kakao-hub";
          hub.setAttribute("aria-label", `${hubProjection.label} 합성 위치`);
          hubIcon.className = "onepage-hub-icon";
          hubIcon.setAttribute("aria-hidden", "true");
          hubLabel.textContent = hubProjection.label;
          hub.append(hubIcon, hubLabel);
          overlays.push(new maps.CustomOverlay({
            map,
            position: hubPosition,
            content: hub,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 7,
          }));
          bounds.extend(hubPosition);
        });
        map.setBounds(bounds, 56, 56, 56, 56);
        updateMarkerScales = () => {
          if (!map) return;
          markerButtonsRef.current.forEach((button) => {
            updateDashboardMarkerScale(button, map!, container);
          });
        };
        updateMarkerScales();
        maps.event.addListener(map, "zoom_changed", updateMarkerScales);

        markerButtonsRef.current.forEach((button, id) => {
          button.classList.toggle("is-selected", id === selectedId);
          button.setAttribute("aria-pressed", String(id === selectedId));
        });
        onStatus("READY");
      })
      .catch(() => {
        if (!disposed) onStatus("FALLBACK");
      });

    return () => {
      disposed = true;
      if (map && updateMarkerScales) {
        mapsNamespaceRef.current?.event.removeListener(map, "zoom_changed", updateMarkerScales);
      }
      overlays.forEach((overlay) => overlay.setMap(null));
      buttons.clear();
      markerOverlays.clear();
      mapsNamespaceRef.current = undefined;
      container.replaceChildren();
      map = undefined;
    };
  }, [couriers, hubs, javaScriptKey, onStatus, requested]);

  useEffect(() => {
    markerButtonsRef.current.forEach((button, id) => {
      button.classList.toggle("is-selected", id === selectedId);
      button.setAttribute("aria-pressed", String(id === selectedId));
    });
  }, [selectedId]);

  useEffect(() => {
    const maps = mapsNamespaceRef.current;
    if (!maps) return;
    couriers.forEach((courier) => {
      const movingCourier = simulatedCourierPosition(courier, movementSecond);
      const button = markerButtonsRef.current.get(courier.id);
      if (button) {
        button.dataset.latitude = movingCourier.latitude.toFixed(6);
        button.dataset.longitude = movingCourier.longitude.toFixed(6);
      }
      markerOverlaysRef.current
        .get(courier.id)
        ?.setPosition(new maps.LatLng(movingCourier.latitude, movingCourier.longitude));
    });
  }, [couriers, movementSecond]);

  return (
    <div
      ref={containerRef}
      className="onepage-kakao-layer"
      aria-label="Kakao 지도 위 기사 위치"
    />
  );
}

function InterventionDialog({
  courier,
  onClose,
  onApplied,
}: {
  courier: Courier;
  onClose: () => void;
  onApplied: (label: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedOptionId, setSelectedOptionId] =
    useState<InterventionOption["id"]>("REST_TRANSFER");
  const [stage, setStage] = useState<InterventionStage>("COMPARE");
  const [transferAvailable, setTransferAvailable] = useState(true);
  const selectedOption =
    interventionOptions.find((option) => option.id === selectedOptionId) ??
    interventionOptions[0];
  const selectedTransferCount =
    selectedOption.id === "REST_TRANSFER"
      ? 8
      : selectedOption.id === "TRANSFER_12"
        ? 12
        : 0;
  const selectedTransferFeasible =
    transferAvailable &&
    selectedOption.feasible &&
    selectedTransferCount > 0 &&
    selectedTransferCount <= 11;
  const selectedTransferLabel =
    selectedTransferCount === 0
      ? "분담 없음"
      : `현재 선택 ${selectedTransferCount}건 / ${selectedTransferFeasible ? "가능" : "불가"}`;
  const courierIndex = Math.max(0, Number.parseInt(courier.id.slice(-3), 10) - 1);

  useEffect(() => {
    if (transferAvailable || !selectedOption.transferDependent) return;
    setSelectedOptionId("REST_RESEQUENCE");
    setStage("COMPARE");
  }, [selectedOption.transferDependent, transferAvailable]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const resetComparison = () => {
    setStage("COMPARE");
  };

  const applyPlan = () => {
    setStage("APPLIED");
    onApplied(selectedOption.label);
  };

  return (
    <div
      className="onepage-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="onepage-intervention-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intervention-dialog-title"
      >
        <header className="onepage-dialog-header">
          <div className="onepage-dialog-person">
            <span
              className="onepage-support-photo"
              aria-hidden="true"
              style={{
                backgroundPosition:
                  `${(courierIndex % 5) * 25}% ${Math.floor(courierIndex / 5) * (100 / 3)}%`,
              }}
            />
            <div>
              <h2 id="intervention-dialog-title">
                {courier.name} 기사
              </h2>
              <span>{courier.area} | 배송 {courier.completed}/{courier.total}</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="onepage-dialog-close"
            aria-label="지원안 검토 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="onepage-dialog-body">
          <section className="onepage-intervention-candidates" aria-labelledby="candidate-title">
            <div className="onepage-dialog-section-title">
              <div>
                <h3 id="candidate-title">지원 선택</h3>
              </div>
              <span>5개</span>
            </div>
            <div className="onepage-candidate-list">
              {interventionOptions.map((option) => {
                const isSelected = option.id === selectedOptionId;
                const isAvailable =
                  option.feasible &&
                  (!option.transferDependent || transferAvailable);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={!isAvailable}
                    onClick={() => {
                      setSelectedOptionId(option.id);
                      setStage("COMPARE");
                    }}
                    >
                      <span>
                        <strong>{option.label}</strong>
                      </span>
                      <span>
                        <b className={!option.feasible ? "is-blocked" : "is-band"}>
                          {option.feasible
                            ? `${option.resultBand} / ${option.etaLabel}`
                            : "차단"}
                        </b>
                        {!option.feasible || option.recommended || (option.transferDependent && !transferAvailable) ? (
                          <em>
                            {!option.feasible
                              ? "수신 기사 기준 미달"
                              : option.transferDependent && !transferAvailable
                                ? "분담 불가"
                                : "추천"}
                          </em>
                        ) : null}
                      </span>
                    </button>
                );
              })}
            </div>
            <p className="onepage-prescription-ladder">
              <strong>분담 불가 시:</strong>
              <span>휴식 → 순서 변경 → 시간 재약정</span>
            </p>
          </section>

          <aside className="onepage-decision-summary" aria-live="polite">
            <div className="onepage-dialog-section-title">
              <div>
                <h3>선택 사항</h3>
              </div>
            </div>
            <div className="onepage-before-after">
              <div>
                <small>현재</small>
                <b>{stateLabel[supportState(courier.budget)]}</b>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <small>조정 후</small>
                <b>{selectedOption.resultBand}</b>
              </div>
            </div>
            <dl className="onepage-decision-facts">
              <div>
                <dt>배송 시간</dt>
                <dd>{selectedOption.etaLabel}</dd>
              </div>
              <div>
                <dt>{selectedOption.transferDependent ? "수신 기사 기준" : "안전 기준"}</dt>
                <dd>{selectedOption.guard}</dd>
              </div>
              <div>
                <dt>배송 보전</dt>
                <dd>{selectedOption.compensation}</dd>
              </div>
            </dl>

            <div className="onepage-transfer-guard">
              <div>
                <strong>배송 분담</strong>
                <b>{transferAvailable ? "가능" : "불가"}</b>
              </div>
              <span>
                {transferAvailable
                  ? "가능 기사 4명 / 최대 11건"
                  : "가능 기사 없음"}
              </span>
              <em>{selectedTransferLabel}</em>
              <button
                type="button"
                aria-pressed={!transferAvailable}
                onClick={() => setTransferAvailable((current) => !current)}
              >
                {transferAvailable ? "분담 불가 상황 보기" : "기본 상태로"}
              </button>
            </div>

            <div className={`onepage-workflow-state is-${stage.toLowerCase()}`}>
              {stage === "COMPARE" && (
                <strong>기사 확인 전 · 현재 계획 유지</strong>
              )}
              {stage === "REQUESTED" && (
                <>
                  <small>2 · 원 기사 확인</small>
                  <strong>{courier.name} 기사 응답을 선택하세요</strong>
                  <span>동의·수정 요청·거절에 불이익이 없고, 거절 사유는 개인 단위로 저장하지 않습니다.</span>
                </>
              )}
              {stage === "RECIPIENT_REQUESTED" && (
                <>
                  <small>3 · 수신 기사 확인</small>
                  <strong>배송을 나눠 맡는 기사 검토</strong>
                  <span>수신 기사도 같은 수준으로 동의·수정 요청·거절할 수 있습니다.</span>
                </>
              )}
              {stage === "CONSENTED" && (
                <>
                  <small>4 · 관리자 승인</small>
                  <strong>{selectedOption.transferDependent ? "두 기사 동의 완료" : "기사 동의 완료"}</strong>
                  <span>최종 승인 후 계획과 고객 안내를 함께 갱신합니다.</span>
                </>
              )}
              {stage === "MODIFY" && (
                <>
                  <small>기사 수정 요청</small>
                  <strong>계획은 적용하지 않았습니다</strong>
                  <span>후보를 다시 비교한 뒤 재요청할 수 있습니다.</span>
                </>
              )}
              {stage === "DECLINED" && (
                <>
                  <small>기사 거절</small>
                  <strong>현재 계획을 유지합니다</strong>
                  <span>거절은 성과나 불이익 상태로 기록하지 않습니다.</span>
                </>
              )}
              {stage === "APPLIED" && (
                <>
                  <small>5 · 적용됨</small>
                  <strong>{selectedOption.label} 반영</strong>
                  <span>경로·배송순서·ETA·고객 안내를 함께 갱신했습니다.</span>
                </>
              )}
            </div>
          </aside>
        </div>

        <footer className="onepage-dialog-footer">
          <div>
            {stage === "COMPARE" && (
              <button type="button" className="is-primary" onClick={() => setStage("REQUESTED")}>
                기사 확인 요청
              </button>
            )}
            {stage === "REQUESTED" && (
              <>
                <button type="button" onClick={() => setStage("DECLINED")}>지금은 거절</button>
                <button type="button" onClick={() => setStage("MODIFY")}>다른 방법 요청</button>
                <button
                  type="button"
                  className="is-primary"
                  onClick={() =>
                    setStage(
                      selectedOption.transferDependent
                        ? "RECIPIENT_REQUESTED"
                        : "CONSENTED",
                    )
                  }
                >
                  이 조정에 동의
                </button>
              </>
            )}
            {stage === "RECIPIENT_REQUESTED" && (
              <>
                <button type="button" onClick={() => setStage("DECLINED")}>지금은 거절</button>
                <button type="button" onClick={() => setStage("MODIFY")}>다른 방법 요청</button>
                <button type="button" className="is-primary" onClick={() => setStage("CONSENTED")}>
                  이어받기에 동의
                </button>
              </>
            )}
            {(stage === "MODIFY" || stage === "DECLINED") && (
              <button type="button" className="is-primary" onClick={resetComparison}>
                후보 다시 비교
              </button>
            )}
            {stage === "CONSENTED" && (
              <button type="button" className="is-primary" onClick={applyPlan}>
                관리자 승인 및 적용
              </button>
            )}
            {stage === "APPLIED" && (
              <button type="button" className="is-primary" onClick={onClose}>
                완료
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function OnePageDashboardDemo() {
  const [now, setNow] = useState(() => new Date());
  const [projection, setProjection] =
    useState<DashboardOperationsProjection>();
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<CourierFilter>("ALL");
  const [mapStatus, setMapStatus] = useState<DashboardMapStatus>("LOADING");
  const [dangerSignals, setDangerSignals] = useState<
    Record<string, RiderDangerSignal>
  >(initialDangerSignals);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardRailRef = useRef<HTMLDivElement>(null);

  const couriers = projection?.couriers ?? [];
  const hubs = projection?.hubs ?? [];
  const clusters = hubClusters(couriers);
  const clusteredIds = new Set(
    clusters.flatMap((cluster) => cluster.memberIds),
  );
  const selectedCourier = couriers.find((courier) => courier.id === selectedId) ?? couriers[0];
  const urgentCouriers = couriers.filter((courier) => courier.budget < 45);
  const supportCounts = couriers.reduce<Record<SupportState, number>>((counts, courier) => {
    counts[supportState(courier.budget)] += 1;
    return counts;
  }, { BREACH: 0, SUPPORT: 0, CAUTION: 0, STABLE: 0 });
  const dangerSignalCount = Object.keys(dangerSignals).length;
  const selectedDangerSignal = selectedCourier
    ? dangerSignals[selectedCourier.id]
    : undefined;
  const currentTimeLabel = clockFormatter.format(now);
  const movementSecond = Math.floor(now.getTime() / 1_000);
  const movingCouriers = couriers.map((courier) =>
    simulatedCourierPosition(courier, movementSecond),
  );
  const movingSelectedCourier =
    movingCouriers.find((courier) => courier.id === selectedId) ??
    movingCouriers[0];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboardOperationsProjection(controller.signal)
      .then((result) => {
        setProjection(result);
        setSelectedId((current) =>
          result.couriers.some((courier) => courier.id === current)
            ? current
            : result.couriers[0].id,
        );
        try {
          const storedSignal = loadDemoRiderDangerSignal(window.localStorage);
          if (
            storedSignal &&
            result.couriers.some(
              (courier) => courier.id === storedSignal.courierId,
            )
          ) {
            setDangerSignals({ [storedSignal.courierId]: storedSignal });
          }
        } catch {
          // A damaged presentation-only signal must not block DB data loading.
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleRiderDangerSignal = (event: Event) => {
      const detail = (
        event as CustomEvent<
          Partial<RiderDangerSignal> & { active?: boolean }
        >
      ).detail;
      if (
        !detail ||
        typeof detail.courierId !== "string" ||
        !couriers.some((courier) => courier.id === detail.courierId)
      ) {
        return;
      }

      setDangerSignals((current) => {
        if (detail.active === false) {
          const next = { ...current };
          delete next[detail.courierId!];
          return next;
        }
        return {
          ...current,
          [detail.courierId!]: {
            courierId: detail.courierId!,
            label: detail.label?.trim() || "긴급 지원 요청",
            receivedAt: detail.receivedAt?.trim() || "15:28",
          },
        };
      });
    };

    const handleStoredDangerSignal = (event: StorageEvent) => {
      if (
        event.key !== DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY ||
        !event.newValue
      ) {
        return;
      }
      try {
        const signal = parseDemoRiderDangerSignal(
          JSON.parse(event.newValue),
        );
        if (signal) {
          handleRiderDangerSignal(
            new CustomEvent(DEMO_RIDER_DANGER_SIGNAL_EVENT, {
              detail: signal,
            }),
          );
        }
      } catch {
        // Ignore damaged browser demo state at this presentation boundary.
      }
    };

    window.addEventListener(
      DEMO_RIDER_DANGER_SIGNAL_EVENT,
      handleRiderDangerSignal,
    );
    window.addEventListener("storage", handleStoredDangerSignal);
    return () => {
      window.removeEventListener(
        DEMO_RIDER_DANGER_SIGNAL_EVENT,
        handleRiderDangerSignal,
      );
      window.removeEventListener("storage", handleStoredDangerSignal);
    };
  }, []);

  useEffect(() => {
    if (filter !== "SIGNAL" || dangerSignals[selectedId]) return;
    const nextCourier = couriers.find((courier) => dangerSignals[courier.id]);
    if (nextCourier) {
      setSelectedId(nextCourier.id);
    } else {
      setFilter("ALL");
    }
  }, [dangerSignals, filter, selectedId]);

  const selectCourier = (id: string, revealCard = false) => {
    setSelectedId(id);
    if (revealCard) {
      window.requestAnimationFrame(() => {
        cardRefs.current.get(id)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      });
    }
  };

  const scrollCards = (direction: -1 | 1) => {
    cardRailRef.current?.scrollBy({
      left: direction * Math.max(360, cardRailRef.current.clientWidth * 0.72),
      behavior: "smooth",
    });
  };

  const changeFilter = (nextFilter: CourierFilter) => {
    setFilter(nextFilter);
  };

  if (!projection || !selectedCourier || !movingSelectedCourier) {
    return (
      <main className="onepage-demo">
        <div className="onepage-data-loading" role="status">
          합성 운영 DB에서 기사·배송·Safety projection을 확인하고 있습니다.
        </div>
      </main>
    );
  }

  const selectedIsClustered = clusteredIds.has(selectedId);
  const selectedHub = hubs.find((hub) => hub.hubId === selectedCourier.hubId)!;

  return (
    <main className="onepage-demo">
      <header className="onepage-header">
        <div className="onepage-brand" aria-label="SafeRoute AI">
          <span className="onepage-brand-mark" aria-hidden="true">SR</span>
          <span className="onepage-brand-copy">
            <strong>SafeRoute AI</strong>
            <small>
              {projection.storage === "BUNDLED_FALLBACK"
                ? "DB 장애 · 승인 번들 Fallback"
                : `${projection.storage} · 합성 기사 ${couriers.length}명`}
            </small>
          </span>
        </div>
        <div className="onepage-page-title">
          <h1>Safety Control Tower</h1>
        </div>
        <div className="onepage-header-status">
          <time dateTime={now.toISOString()} aria-label={`현재 시각 ${currentTimeLabel}`}>
            {currentTimeLabel}
          </time>
          <a className="onepage-rider-app-link" href={`/rider-demo?courier=${encodeURIComponent(selectedCourier.id)}`}>
            기사 앱
          </a>
          <a className="onepage-rider-app-link" href={`/operations?courier=${encodeURIComponent(selectedCourier.id)}`}>
            운영 검토
          </a>
        </div>
      </header>

      <section className="onepage-courier-section" aria-labelledby="courier-section-title">
        <div className="onepage-section-rail">
          <div className="onepage-section-title">
            <span className="onepage-section-icon" aria-hidden="true">●</span>
            <h2 id="courier-section-title">기사 현황</h2>
            <small>예상 최저 Safety Budget</small>
          </div>
          <div className="onepage-filter-tabs" aria-label="기사 현황 필터">
            {([
              ["ALL", "전체", couriers.length],
              ["SIGNAL", "위험신호", dangerSignalCount],
              ["SUPPORT", "지원", supportCounts.BREACH + supportCounts.SUPPORT],
              ["CAUTION", "주의", supportCounts.CAUTION],
              ["STABLE", "안정", supportCounts.STABLE],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                className={value === "SIGNAL" ? "is-danger-filter" : undefined}
                aria-pressed={filter === value}
                onClick={() => changeFilter(value)}
              >
                {label} <b>{count}</b>
              </button>
            ))}
          </div>
          <div className="onepage-scroll-controls">
            <button type="button" aria-label="이전 기사 카드" onClick={() => scrollCards(-1)}>‹</button>
            <button type="button" aria-label="다음 기사 카드" onClick={() => scrollCards(1)}>›</button>
          </div>
        </div>
        <div className="onepage-card-rail" ref={cardRailRef}>
          {couriers.map((courier) => (
            <CourierCard
              key={courier.id}
              courier={courier}
              selected={selectedId === courier.id}
              dimmed={!matchesCourierFilter(courier, filter, dangerSignals)}
              dangerSignal={dangerSignals[courier.id]}
              onSelect={() => selectCourier(courier.id)}
              cardRef={(node) => {
                if (node) cardRefs.current.set(courier.id, node);
                else cardRefs.current.delete(courier.id);
              }}
            />
          ))}
        </div>
      </section>

      <section className="onepage-workspace" aria-label="지도와 지원 필요 목록">
        <div className="onepage-map-section" aria-label="기사 위치 지도">
          <div className="onepage-map-toolbar">
            <div>
              <strong>합성 운영권역 · {hubs.length}개 허브</strong>
              <span>
                {mapStatus === "READY"
                  ? `위치 갱신 · ${currentTimeLabel}`
                  : mapStatus === "LOADING"
                    ? "지도 불러오는 중"
                    : `위치 갱신 · ${currentTimeLabel} · 지도 대체 화면`}
              </span>
            </div>
            <div className="onepage-region-capacity" aria-label="허브별 합성 운영 현황">
              {hubs.map((hub) => (
                <span key={hub.hubId} className="is-ok">
                  <strong>{hub.label.replace("합성 ", "")}</strong>
                  <b>{hub.courierCount}명</b>
                  <small>남은 배송 {hub.remainingStopCount}건</small>
                </span>
              ))}
            </div>
          </div>
          <div
            className={`onepage-map-canvas ${mapStatus === "READY" ? "has-kakao-map" : ""}`}
            data-movement-second={movementSecond}
          >
            <DashboardKakaoMap
              couriers={couriers}
              hubs={hubs}
              selectedId={selectedId}
              movementSecond={movementSecond}
              onSelect={(id) => selectCourier(id, true)}
              onStatus={setMapStatus}
            />
            {mapStatus !== "READY" ? (
              <>
                <div className="onepage-river" aria-hidden="true" />
                {roads.map((road, index) => (
                  <span
                    key={index}
                    className={`onepage-road is-${road.kind}`}
                    aria-hidden="true"
                    style={{
                      left: `${road.left}%`,
                      top: `${road.top}%`,
                      width: `${road.width}%`,
                      rotate: `${road.rotate}deg`,
                    }}
                  />
                ))}
                <span className="onepage-district label-yeoksam">합성 서부권역</span>
                <span className="onepage-district label-daechi">합성 북부권역</span>
                <span className="onepage-district label-dogok">합성 남부권역</span>
                {hubs.map((hub) => (
                  <span
                    key={hub.hubId}
                    className="onepage-hub"
                    aria-label={`${hub.label} 합성 위치`}
                    style={{ left: `${hub.mapX}%`, top: `${hub.mapY}%` }}
                  >
                    <span className="onepage-hub-icon" aria-hidden="true" />
                    <strong>{hub.label}</strong>
                  </span>
                ))}

                {movingCouriers
                  .filter((courier) => !clusteredIds.has(courier.id))
                  .map((courier) => (
                    <MapMarker
                      key={courier.id}
                      courier={courier}
                      selected={selectedId === courier.id}
                      onSelect={() => selectCourier(courier.id, true)}
                    />
                  ))}

                {clusters.map((cluster) => {
                  const members = cluster.memberIds
                    .map((id) => couriers.find((courier) => courier.id === id))
                    .filter((courier): courier is Courier => Boolean(courier));
                  const priority = [...members].sort((a, b) => a.budget - b.budget)[0];
                  return (
                    <button
                      key={cluster.id}
                      className="onepage-map-cluster"
                      style={{ left: `${cluster.x}%`, top: `${cluster.y}%` }}
                      aria-label={`${priority.name} 기사 외 ${members.length - 1}명 묶음`}
                      onClick={() => selectCourier(priority.id, true)}
                      type="button"
                    >
                      <strong>{members.length}</strong>
                      <small>{stateLabel[supportState(priority.budget)]}</small>
                    </button>
                  );
                })}

                {selectedIsClustered ? (
                  <MapMarker
                    courier={movingSelectedCourier}
                    selected
                    onSelect={() => selectCourier(selectedCourier.id, true)}
                  />
                ) : null}
              </>
            ) : null}

            <div className="onepage-map-overlay-tools">
              <div className="onepage-map-legend" aria-label="지도 상태 범례">
                <span className="state-breach"><i /> 한계 초과 {supportCounts.BREACH}</span>
                <span className="state-support"><i /> 지원 필요 {supportCounts.SUPPORT}</span>
                <span className="state-caution"><i /> 주의 {supportCounts.CAUTION}</span>
                <span className="state-stable"><i /> 정상 {supportCounts.STABLE}</span>
              </div>
            </div>

            <div className="onepage-selected-strip" aria-live="polite">
              <span className={`onepage-state-pill state-${supportState(selectedCourier.budget).toLowerCase()}`}>
                {stateLabel[supportState(selectedCourier.budget)]}
              </span>
              <strong>{selectedCourier.name}</strong>
              <span>{selectedCourier.area}</span>
              <b>현재 Budget {selectedCourier.currentScore.toFixed(1)} / 예상 최저 {selectedCourier.budget.toFixed(1)}</b>
              <b>{supportTimingLabel(selectedCourier)}</b>
              <span>배송 {selectedCourier.completed}/{selectedCourier.total}</span>
            </div>
          </div>
        </div>

        <aside className="onepage-support-panel" aria-labelledby="support-panel-title">
          <header>
            <div>
              <small>선택 기사</small>
              <h2 id="support-panel-title">안전 지원</h2>
            </div>
            <span>{urgentCouriers.length}/{couriers.length}</span>
          </header>

          <div className="onepage-support-focus" aria-live="polite">
            <div className="onepage-support-person">
              <span
                className="onepage-support-photo"
                aria-hidden="true"
              >
                {selectedCourier.id.slice(-3)}
              </span>
              <div>
                <strong>{selectedCourier.name}</strong>
                <span>{selectedCourier.area}</span>
              </div>
              <em className={`onepage-state-pill state-${supportState(selectedCourier.budget).toLowerCase()}`}>
                {supportPanelStateLabel(selectedCourier)}
              </em>
            </div>
            <div className="onepage-support-metrics">
              <div>
                <small>현재 상태</small>
                <b>{supportPanelStateLabel(selectedCourier)}</b>
              </div>
              <div>
                <small>지원 시점</small>
                <strong>{supportTimingShort(selectedCourier)}</strong>
              </div>
            </div>
            <SafetyMarginTrack value={selectedCourier.budget} />
            <div className="onepage-transfer-capacity">
              <div>
                <strong>같은 허브 운영 현황</strong>
              </div>
              <span>
                {selectedHub.label} · 기사 {selectedHub.courierCount}명 · 남은 배송 {selectedHub.remainingStopCount}건
              </span>
              <i aria-hidden="true"><span /></i>
            </div>
            <p>
              <span>
                {selectedDangerSignal
                  ? "기사 지원 요청 · 실제 운영 적용 전"
                  : selectedCourier.decisionId
                    ? "결정론적 지원 검토 필요"
                    : "향후 60분 모니터링"}
              </span>
              <span>배송 {selectedCourier.completed}/{selectedCourier.total} 완료</span>
            </p>
            <a
              className="onepage-open-intervention"
              href={`/operations?courier=${encodeURIComponent(selectedCourier.id)}`}
            >
              운영 폐루프에서 검토
            </a>
          </div>

          <div className="onepage-support-queue">
            <div className="onepage-support-queue-title">
              <strong>예상 최저 Safety Budget</strong>
            </div>
            <div className="onepage-support-list">
              {urgentCouriers.map((courier) => (
                <button
                  key={courier.id}
                  type="button"
                  aria-pressed={selectedCourier.id === courier.id}
                  onClick={() => selectCourier(courier.id, true)}
                >
                  <span>
                    <strong>{courier.name}</strong>
                    <small>{courier.area}</small>
                  </span>
                  <span>
                    <b className={`state-${supportState(courier.budget).toLowerCase()}`}>
                      {courier.budget.toFixed(1)}
                    </b>
                    <small className="onepage-eta-pill">
                      {supportTimingShort(courier)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
