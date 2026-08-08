import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  DEMO_RIDER_DANGER_SIGNAL_EVENT,
  DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY,
  loadDemoRiderDangerSignal,
  loadDemoRiderDangerSignalsFromOperationsStore,
  parseDemoRiderDangerSignal,
} from "../application/demoRiderDangerSignal";
import {
  loadKakaoMapsSdk,
  type KakaoMapInstance,
  type KakaoMapOverlay,
  type KakaoMapsNamespace,
} from "../adapters/maps/kakao";
import {
  createDashboardOperationsProjection,
  type DashboardCourierProjection,
  type DashboardHubProjection,
  type DashboardOperationsProjection,
} from "../application/dashboardOperationsProjection";
import {
  createSyntheticLiveOperationsFrame,
  SYNTHETIC_LIVE_INTERVAL_MS,
  SYNTHETIC_LIVE_MAX_TICK,
  SYNTHETIC_LIVE_MINUTES_PER_TICK,
  SYNTHETIC_LIVE_SAFETY_STRIDE_TICKS,
  type SyntheticLiveCourierState,
} from "../application/syntheticLiveOperations";
import { bundledDailyOperationsPackage } from "../adapters/fixtures/syntheticOperationsPackage";
import {
  approveAndApplyOperationsDecision,
  createDailyOperationsSnapshot,
  createOperationsDecisionWorkspace,
  createOperationsPersistedSession,
  evaluateOperationsFleet,
  initializeOperationsDecision,
  loadCurrentDailyOperationsPackage,
  loadLatestOperationsSessionForCourier,
  loadOperationsPersistedSession,
  restoreOperationsPersistedSession,
  saveOperationsPersistedSession,
  selectOperationsDecisionCandidate,
  type FleetEvaluation,
  type OperationsDecisionWorkspace,
} from "../application/operations";
import type {
  InterventionCandidate,
  InterventionEvaluation,
} from "../domain/contracts";
import type { ExplanationResult } from "../domain/contracts";
import type {
  DailyOperationsPackage,
  DailyOperationsSnapshot,
} from "../domain/operations";
import {
  riderAreaKey,
  riderMapMarkerScale,
  riderMapMarkerSizePx,
  riderRoutePolyline,
  riderRoutePosition,
  riderRoutePositionAtProgress,
  type RiderRoutePoint,
} from "../application/riderMapPresentation";
import { axModelQualification } from "./axModelQualification";
import { generateOperationsAdminExplanation } from "./operationsExplanation";
import syntheticCourierProfiles from "../assets/synthetic-courier-profiles-v1.jpg";
import "./one-page-dashboard.css";

type SupportState = "BREACH" | "SUPPORT" | "CAUTION" | "STABLE";
type CourierFilter = "ALL" | "SIGNAL" | "SUPPORT" | "CAUTION" | "STABLE";
type DashboardMapStatus = "LOADING" | "READY" | "FALLBACK";
type Courier = DashboardCourierProjection & {
  live?: SyntheticLiveCourierState;
};

type PositionedCourier = Courier & RiderRoutePoint;

type RiderDangerSignal = {
  courierId: string;
  label: string;
  receivedAt: string;
};

type AddCourierDraft = {
  alias: string;
  hubId: string;
  area: string;
};

const initialDangerSignals: Record<string, RiderDangerSignal> = {};
const clockFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
type DashboardDecisionContext = {
  workspaceId: string;
  operationsPackage: DailyOperationsPackage;
  snapshot: DailyOperationsSnapshot;
  fleet: FleetEvaluation;
  workspace: OperationsDecisionWorkspace;
  baseSavedAt?: string;
  sent: boolean;
};

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
  const profile = {
    courierId: courier.id,
    areaCode: courier.area,
    mapX: courier.mapX,
    mapY: courier.mapY,
  };
  const point = courier.live
    ? riderRoutePositionAtProgress(profile, courier.live.routeProgress)
    : riderRoutePosition(profile, movementSecond);
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

function interventionActionLabel(
  action: InterventionCandidate["actions"][number],
) {
  switch (action.type) {
    case "REST":
      return `${action.restMinutes}분 휴식`;
    case "TRANSFER_STOPS":
      return `배송 ${action.stopIds.length}건 분담`;
    case "REORDER_STOPS":
      return "순서 변경";
    case "SAFER_ROUTE":
      return "안전 경로";
    case "SAFE_DELAY":
      return "시간 재약정";
  }
}

function interventionCandidateLabel(candidate: InterventionCandidate) {
  return candidate.actions.map(interventionActionLabel).join(" + ");
}

function interventionTypeLabel(
  action: InterventionCandidate["actions"][number],
) {
  return {
    REST: "휴식",
    TRANSFER_STOPS: "배송 분담",
    REORDER_STOPS: "순서 변경",
    SAFER_ROUTE: "안전 경로",
    SAFE_DELAY: "시간 재약정",
  }[action.type];
}

function decisionStatusLabel(status: string) {
  return {
    RIDER_RESPONSE_PENDING: "기사 응답 대기",
    RIDER_CONSENTED: "기사 동의 완료",
    MODIFICATION_REQUESTED: "다른 방법 요청",
    RIDER_DECLINED: "현재 제안 거절",
    ADMIN_APPROVAL_REQUIRED: "관리자 승인 대기",
    ADMIN_HELD: "관리자 보류",
    REVALIDATION_REQUIRED: "최신 계획 재검증 필요",
    APPLY_FAILED: "적용 실패 · 현재 계획 유지",
    APPLIED: "계획 적용 완료",
    NOTICE_RECORDED: "계획·안내 갱신 완료",
    CLOSED: "검토 완료",
  }[status] ?? status;
}

function explanationSourceLabel(result: ExplanationResult) {
  if (result.status === "LIVE") return "Upstage · 검증 완료";
  if (result.status === "MOCK") return "Upstage Mock · 검증 완료";
  return "안전 템플릿 · 검증 완료";
}

function interventionEtaLabel(evaluation: InterventionEvaluation) {
  if (evaluation.etaDeltaMinutes === 0) return "변화 없음";
  return `${evaluation.etaDeltaMinutes > 0 ? "+" : "−"}${Math.abs(evaluation.etaDeltaMinutes)}분`;
}

function interventionResultLabel(evaluation: InterventionEvaluation) {
  if (evaluation.feasibility.status !== "FEASIBLE") return "차단";
  const source = evaluation.courierImpacts.find(
    (impact) => impact.role === "SOURCE",
  );
  const budget = source?.candidateMinimumBudget ?? 0;
  return stateLabel[supportState(budget)];
}

function transferAction(candidate: InterventionCandidate) {
  return candidate.actions.find(
    (action) => action.type === "TRANSFER_STOPS",
  );
}

function candidateGuardLabel(
  candidate: InterventionCandidate,
  evaluation: InterventionEvaluation,
) {
  if (evaluation.feasibility.status !== "FEASIBLE") {
    return transferAction(candidate)
      ? "수신 기사 기준 미달"
      : "안전 기준 미달";
  }
  const recipient = evaluation.courierImpacts.find(
    (impact) => impact.role === "RECIPIENT",
  );
  return recipient
    ? `최소 ${recipient.candidateMinimumBudget.toFixed(1)} / 기준 45 통과`
    : evaluation.breachOutcome === "AVOIDED"
      ? "예상 초과 해소"
      : "안전 기준 통과";
}

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

function compareCourierPriority(left: Courier, right: Courier) {
  return (
    (left.criticalMinute ?? Number.POSITIVE_INFINITY)
      - (right.criticalMinute ?? Number.POSITIVE_INFINITY)
    || left.budget - right.budget
    || left.id.localeCompare(right.id)
  );
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

function syntheticProfileIndex(courierId: string) {
  const match = courierId.match(/^demo-courier-(\d{3})$/);
  if (!match) return undefined;
  const index = Number.parseInt(match[1], 10) - 1;
  return index >= 0 && index < 20 ? index : undefined;
}

function syntheticProfileStyle(courierId: string): CSSProperties | undefined {
  const index = syntheticProfileIndex(courierId);
  if (index === undefined) return undefined;
  return {
    backgroundImage: `url(${syntheticCourierProfiles})`,
    backgroundPosition: `${(index % 5) * 25}% ${Math.floor(index / 5) * (100 / 3)}%`,
  };
}

function SyntheticCourierPhoto({
  courierId,
  className,
}: {
  courierId: string;
  className: string;
}) {
  const hasSyntheticPhoto = syntheticProfileIndex(courierId) !== undefined;
  return (
    <span
      className={`${className} ${hasSyntheticPhoto ? "has-synthetic-photo" : "has-profile-fallback"}`}
      data-profile-photo={hasSyntheticPhoto ? "synthetic" : "fallback"}
      aria-hidden="true"
      style={syntheticProfileStyle(courierId)}
    >
      {hasSyntheticPhoto ? null : courierId.slice(-3)}
    </span>
  );
}

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
      data-live-activity={courier.live?.activity ?? "SNAPSHOT"}
      data-safety-updated-at={courier.live?.simulatedAt ?? ""}
      data-rider-danger-signal={dangerSignal ? "active" : "inactive"}
      aria-pressed={selected}
      aria-label={`${courier.name} 기사, 지정구역 ${courier.area}, 현재 Safety Budget ${courier.currentScore.toFixed(1)}, 예상 최저 ${courier.budget.toFixed(1)}, ${stateLabel[state]}, ${supportTimingLabel(courier)}${dangerSignal ? ", 기사앱 위험 신호" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="onepage-card-identity">
        <span className="onepage-avatar" aria-hidden="true">
          <SyntheticCourierPhoto
            courierId={courier.id}
            className="onepage-profile-photo"
          />
          <i className={`onepage-avatar-status state-${state.toLowerCase()}`} />
        </span>
        <span className="onepage-card-copy">
          <span className="onepage-card-name">{courier.name}</span>
          <strong className="onepage-card-area">{courier.area}</strong>
          {courier.live ? (
            <span className={`onepage-card-activity is-${courier.live.activity.toLowerCase()}`}>
              {courier.live.activityLabel}
            </span>
          ) : null}
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

function AddCourierDialog({
  couriers,
  hubs,
  onClose,
  onSave,
}: {
  couriers: Courier[];
  hubs: DashboardHubProjection[];
  onClose: () => void;
  onSave: (draft: AddCourierDraft) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const aliasRef = useRef<HTMLInputElement>(null);
  const [alias, setAlias] = useState("");
  const [hubId, setHubId] = useState(hubs[0]?.hubId ?? "");
  const areas = [...new Set(couriers.map((courier) => courier.area))];
  const [area, setArea] = useState(areas[0] ?? "");

  useEffect(() => {
    aliasRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
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
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ alias: alias.trim(), hubId, area });
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
        className="onepage-add-courier-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-courier-title"
      >
        <header className="onepage-add-courier-header">
          <div>
            <small>합성 Demo 등록</small>
            <h2 id="add-courier-title">기사 추가</h2>
          </div>
          <button
            type="button"
            aria-label="기사 추가 닫기"
            className="onepage-dialog-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form className="onepage-add-courier-form" onSubmit={submit}>
          <div className="onepage-add-courier-notice">
            <strong>실제 개인정보를 입력하지 않습니다.</strong>
            <span>승인된 합성 사진과 별칭만 사용하며, 운영계획 검증 전에는 안전 계산에서 제외됩니다.</span>
          </div>
          <label>
            <span>합성 별칭</span>
            <input
              ref={aliasRef}
              type="text"
              value={alias}
              minLength={2}
              maxLength={20}
              required
              placeholder="예: 김안전"
              autoComplete="off"
              onChange={(event) => setAlias(event.target.value)}
            />
            <small>실제 기사 이름·연락처·차량번호는 입력하지 마세요.</small>
          </label>
          <div className="onepage-add-courier-fields">
            <label>
              <span>배정 허브</span>
              <select value={hubId} required onChange={(event) => setHubId(event.target.value)}>
                {hubs.map((hub) => (
                  <option key={hub.hubId} value={hub.hubId}>{hub.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>거친 운영 권역</span>
              <select value={area} required onChange={(event) => setArea(event.target.value)}>
                {areas.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="onepage-add-courier-boundary">
            <span aria-hidden="true">i</span>
            <p>등록 요청은 이 브라우저의 Demo 상태에만 남습니다. 근무계획·차량·배송계획·Safety 초기값 검증 후에만 활성 기사로 전환할 수 있습니다.</p>
          </div>
          <footer className="onepage-add-courier-footer">
            <button type="button" onClick={onClose}>취소</button>
            <button type="submit" className="is-primary">등록 요청 저장</button>
          </footer>
        </form>
      </div>
    </div>
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
      data-live-activity={courier.live?.activity ?? "SNAPSHOT"}
      style={{ left: `${courier.mapX}%`, top: `${courier.mapY}%` }}
      aria-label={`${courier.name} 기사 ${courier.live?.activityLabel ?? "갱신 위치"}, ${stateLabel[state]}, ${supportTimingLabel(courier)}`}
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
  const courierIdentityKey = couriers
    .map((courier) => `${courier.id}:${courier.area}:${courier.mapX}:${courier.mapY}`)
    .join("|");
  const hubIdentityKey = hubs
    .map((hub) => `${hub.hubId}:${hub.mapX}:${hub.mapY}`)
    .join("|");

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

        const renderedRoutes = new Set<string>();
        couriers.forEach((courier) => {
          if (!map) return;
          const routeKey = courierAreaKey(courier);
          if (renderedRoutes.has(routeKey)) return;
          renderedRoutes.add(routeKey);
          const path = riderRoutePolyline({
            courierId: courier.id,
            areaCode: courier.area,
            mapX: courier.mapX,
            mapY: courier.mapY,
          }).map((point) => {
            const position = new maps.LatLng(point.latitude, point.longitude);
            bounds.extend(position);
            return position;
          });
          overlays.push(new maps.Polyline({
            map,
            path,
            strokeWeight: 5,
            strokeColor: "#167c7a",
            strokeOpacity: 0.34,
            strokeStyle: "solid",
            zIndex: 2,
          }));
        });

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
          const selectCourierMarker = (event: Event) => {
            event.stopPropagation();
            selectRef.current(courier.id);
          };
          button.addEventListener("pointerdown", selectCourierMarker);
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            if (event.detail === 0) selectRef.current(courier.id);
          });
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
            zIndex: 1,
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
  }, [courierIdentityKey, hubIdentityKey, javaScriptKey, onStatus, requested]);

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
        const state = supportState(courier.budget);
        button.dataset.latitude = movingCourier.latitude.toFixed(6);
        button.dataset.longitude = movingCourier.longitude.toFixed(6);
        button.dataset.liveActivity = courier.live?.activity ?? "SNAPSHOT";
        button.className = `onepage-map-marker onepage-kakao-marker state-${state.toLowerCase()}${courier.id === selectedId ? " is-selected" : ""}`;
        button.setAttribute(
          "aria-label",
          `${courier.name} 기사 ${courier.live?.activityLabel ?? "갱신 위치"}, 안전 지원 점수 ${courier.budget.toFixed(1)}, ${stateLabel[state]}`,
        );
      }
      markerOverlaysRef.current
        .get(courier.id)
        ?.setPosition(new maps.LatLng(movingCourier.latitude, movingCourier.longitude));
    });
  }, [couriers, movementSecond, selectedId]);

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
  context,
  busy,
  message,
  onClose,
  onSelectCandidate,
  onRequestReview,
  onApprove,
}: {
  courier: Courier;
  context: DashboardDecisionContext;
  busy: boolean;
  message?: string;
  onClose: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onRequestReview: () => void;
  onApprove: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const explanationSummaryRef = useRef<HTMLElement>(null);
  const [showBlockedTransfer, setShowBlockedTransfer] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationResult>();
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string>();
  const artifacts = context.workspace.decisions.find(
    (item) => item.queueItem.courierId === courier.id,
  )!;
  const selectedCandidate = artifacts.selectedCandidate;
  const selectedEvaluation = artifacts.selectedEvaluation;
  const selectedTransfer = transferAction(selectedCandidate);
  const candidatePairs = artifacts.candidates.map((candidate) => ({
    candidate,
    evaluation: artifacts.evaluations.find(
      (evaluation) => evaluation.candidateId === candidate.candidateId,
    )!,
  }));
  const feasibleTransfers = candidatePairs.filter(
    ({ candidate, evaluation }) =>
      Boolean(transferAction(candidate)) &&
      evaluation.feasibility.status === "FEASIBLE",
  );
  const recipientCount = new Set(
    feasibleTransfers.flatMap(({ candidate }) => {
      const action = transferAction(candidate);
      return action?.type === "TRANSFER_STOPS"
        ? [action.recipientCourierId]
        : [];
    }),
  ).size;
  const maximumTransferCount = Math.max(
    0,
    ...feasibleTransfers.map(({ candidate }) => {
      const action = transferAction(candidate);
      return action?.type === "TRANSFER_STOPS" ? action.stopIds.length : 0;
    }),
  );
  const decision = artifacts.decision;
  const sourceRequirement = decision.consentRequirements.find(
    (requirement) => requirement.courierId === courier.id,
  );
  const recipientRequirement = decision.consentRequirements.find(
    (requirement) => requirement.courierId !== courier.id && requirement.required,
  );
  const applied = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(
    decision.status,
  );

  useEffect(() => {
    setExplanation(undefined);
    setExplanationError(undefined);
  }, [decision.decisionId, selectedCandidate.candidateId]);

  useEffect(() => {
    if (explanation) explanationSummaryRef.current?.focus();
  }, [explanation]);

  const explainSelection = async () => {
    const sourceImpact = selectedEvaluation.courierImpacts.find(
      (impact) => impact.role === "SOURCE",
    );
    if (!sourceImpact) {
      setExplanationError("검증된 기사 영향 근거를 찾지 못했습니다.");
      return;
    }
    setExplanationLoading(true);
    setExplanationError(undefined);
    try {
      const result = await generateOperationsAdminExplanation({
        requestId: `operations-explanation-dashboard-${decision.decisionId}`,
        currentBudget: courier.budget,
        currentBudgetLabel: "현재 예상 최저 안전여유",
        candidateMinimumBudget: sourceImpact.candidateMinimumBudget,
        etaDeltaMinutes: selectedEvaluation.etaDeltaMinutes,
        etaDisplayValue: interventionEtaLabel(selectedEvaluation),
        decisionStatus: decisionStatusLabel(decision.status),
        selectedIntervention: selectedCandidate.actions
          .map(interventionTypeLabel)
          .join(" + "),
        confidence: courier.confidence,
        confidenceLabel: "입력 신뢰도",
        allowedActions: [
          "기사 응답과 수신 기사 영향을 확인",
          "관리자 승인 전 최신 계획 재검증",
        ],
        timeToBreachMinutes: courier.criticalMinute ?? undefined,
        breachStopOrdinal: courier.criticalStopOrdinal ?? undefined,
      });
      setExplanation(result);
    } catch {
      setExplanationError(
        "설명을 확인하지 못했습니다. 결정 수치와 현재 계획은 변경되지 않았습니다.",
      );
    } finally {
      setExplanationLoading(false);
    }
  };

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
      if (!focusable.length) return;
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
  }, []);

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
            <SyntheticCourierPhoto
              courierId={courier.id}
              className="onepage-support-photo"
            />
            <div>
              <h2 id="intervention-dialog-title">{courier.name} 기사</h2>
              <span>{courier.area} | 배송 {courier.completed}/{courier.total}</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="onepage-dialog-close"
            aria-label="지원 검토 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="onepage-dialog-body">
          <section className="onepage-intervention-candidates" aria-labelledby="candidate-title">
            <div className="onepage-dialog-brief">
              <span>먼저 확인할 결론</span>
              <strong>
                {courier.criticalMinute === 0
                  ? "지금 지원이 필요합니다."
                  : courier.criticalMinute !== null
                    ? `${courier.criticalMinute}분 후 · ${courier.criticalStopOrdinal ?? "예상"}번째 배송지 전에 지원합니다.`
                    : "향후 60분은 현재 계획을 유지합니다."}
              </strong>
              <small>
                합성 운영자료의 운영 위험지수 · 기사 확인과 관리자 승인 전에는 계획을 바꾸지 않습니다.
              </small>
            </div>
            <div className="onepage-dialog-section-title">
              <div>
                <h3 id="candidate-title">안전한 지원안 비교</h3>
                <small>안전 기준을 통과한 후보 안에서만 선택합니다.</small>
              </div>
              <span>{candidatePairs.length}개</span>
            </div>
            <div className="onepage-candidate-list">
              {candidatePairs.map(({ candidate, evaluation }) => {
                const feasible = evaluation.feasibility.status === "FEASIBLE";
                const selected = candidate.candidateId === selectedCandidate.candidateId;
                return (
                  <button
                    key={candidate.candidateId}
                    type="button"
                    aria-pressed={selected}
                    disabled={context.sent || !feasible || busy}
                    onClick={() => onSelectCandidate(candidate.candidateId)}
                  >
                    <span><strong>{interventionCandidateLabel(candidate)}</strong></span>
                    <span>
                      <b className={feasible ? "is-band" : "is-blocked"}>
                        {interventionResultLabel(evaluation)} / {interventionEtaLabel(evaluation)}
                      </b>
                      {!feasible || evaluation.rank === 1 ? (
                        <em>{feasible ? "추천" : candidateGuardLabel(candidate, evaluation)}</em>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="onepage-decision-summary" aria-live="polite">
            <div className="onepage-dialog-section-title">
              <div><h3>선택 사항</h3></div>
            </div>
            <div className="onepage-before-after" aria-label="현재 → 조정 후">
              <div><small>현재</small><b>{stateLabel[supportState(courier.budget)]}</b></div>
              <span aria-hidden="true">→</span>
              <div><small>조정 후</small><b>{interventionResultLabel(selectedEvaluation)}</b></div>
            </div>
            <dl className="onepage-decision-facts">
              <div><dt>배송 시간</dt><dd>{interventionEtaLabel(selectedEvaluation)}</dd></div>
              <div>
                <dt>{selectedTransfer ? "배송을 나눠 맡는 기사 기준" : "안전 기준"}</dt>
                <dd>{candidateGuardLabel(selectedCandidate, selectedEvaluation)}</dd>
              </div>
              <div>
                <dt>배송 보전</dt>
                <dd>영향 {selectedEvaluation.affectedCustomerCount}건 / 고객안내 준비</dd>
              </div>
            </dl>

            <details
              className={`onepage-explanation${explanation?.status === "FALLBACK" ? " is-fallback" : ""}`}
            >
              <summary ref={explanationSummaryRef}>
                <span>AI 근거 설명</span>
                <small>
                  {explanation
                    ? explanationSourceLabel(explanation)
                    : "요청 시 생성"}
                </small>
              </summary>
              <div className="onepage-explanation-body" aria-live="polite">
                {!explanation && !explanationError && (
                  <>
                    <p>현재 화면의 검증된 수치와 상태만 역할에 맞게 설명합니다.</p>
                    <button
                      type="button"
                      disabled={explanationLoading}
                      onClick={() => void explainSelection()}
                    >
                      {explanationLoading ? "설명 확인 중…" : "근거 설명 생성"}
                    </button>
                  </>
                )}
                {explanationError && (
                  <>
                    <p role="alert">{explanationError}</p>
                    <button
                      type="button"
                      disabled={explanationLoading}
                      onClick={() => void explainSelection()}
                    >
                      다시 시도
                    </button>
                  </>
                )}
                {explanation && (
                  <div
                    className={`onepage-explanation-result is-${explanation.status.toLowerCase()}`}
                    data-explanation-status={explanation.status}
                  >
                    <p>{explanation.data.summary}</p>
                    <small>
                      스키마·수치·역할 검증 완료 · AI는 지원안과 실행 여부를 변경하지 않습니다.
                    </small>
                    {explanation.status === "FALLBACK" && (
                      <em>
                        AI 연결 대신 동일한 결정 사실을 안전 템플릿으로 설명했습니다.
                      </em>
                    )}
                  </div>
                )}
                <details className="onepage-model-evidence">
                  <summary>
                    <span>A.X v2 검증 근거</span>
                    <small>{axModelQualification.statusLabel}</small>
                  </summary>
                  <div className="onepage-model-evidence-body">
                    <div className="onepage-model-runtime">
                      <span>현재 공개 실행</span>
                      <strong>{axModelQualification.publicRuntimeLabel}</strong>
                      <small>A.X Local runtime은 활성화하지 않았습니다.</small>
                    </div>
                    <dl className="onepage-model-metrics">
                      <div>
                        <dt>학습</dt>
                        <dd>{axModelQualification.evidence.trainingRecords.toLocaleString("ko-KR")}건</dd>
                      </div>
                      <div>
                        <dt>Validation</dt>
                        <dd>{axModelQualification.evidence.validationPassed}/{axModelQualification.evidence.validationTotal}</dd>
                      </div>
                      <div>
                        <dt>Frozen</dt>
                        <dd>{axModelQualification.evidence.frozenPassed}/{axModelQualification.evidence.frozenTotal}</dd>
                      </div>
                      <div>
                        <dt>동일 과업</dt>
                        <dd>{axModelQualification.evidence.productReviewPassed}/{axModelQualification.evidence.productReviewTotal}</dd>
                      </div>
                      <div>
                        <dt>Local P95</dt>
                        <dd>{axModelQualification.evidence.localP95Label}</dd>
                      </div>
                      <div>
                        <dt>Hosted P95</dt>
                        <dd>{axModelQualification.evidence.hostedP95Label}</dd>
                      </div>
                    </dl>
                    <p>
                      {axModelQualification.modelLabel} · {axModelQualification.dataModeLabel} · {axModelQualification.evidenceLabel} · Fallback {axModelQualification.evidence.fallbackCount} · unsafe 표시 {axModelQualification.evidence.unsafeDisplayCount}
                    </p>
                    <section className="onepage-model-qa" aria-labelledby="onepage-model-qa-title">
                      <h4 id="onepage-model-qa-title">심사 Q&amp;A</h4>
                      <dl>
                        {axModelQualification.questions.map((item) => (
                          <div key={item.question}>
                            <dt>{item.question}</dt>
                            <dd>{item.answer}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </div>
                </details>
              </div>
            </details>

            <div className="onepage-transfer-guard">
              <div><strong>위험전가 검사 · 배송 분담</strong><b>{maximumTransferCount > 0 ? "가능" : "불가"}</b></div>
              <span>배송을 나눠 맡을 수 있는 기사 {recipientCount}명 / 최대 {maximumTransferCount}건</span>
              <em>
                {selectedTransfer?.type === "TRANSFER_STOPS"
                  ? `현재 선택 ${selectedTransfer.stopIds.length}건 / ${selectedEvaluation.feasibility.status === "FEASIBLE" ? "가능" : "불가"}`
                  : "분담 없음"}
              </em>
              <button
                type="button"
                aria-expanded={showBlockedTransfer}
                onClick={() => setShowBlockedTransfer((current) => !current)}
              >
                분담 불가 상황 보기
              </button>
              {showBlockedTransfer && (
                <p>배송을 나눠 맡는 기사의 기준 45 미달, 용량 초과 또는 시간창 위반 후보는 선택할 수 없습니다.</p>
              )}
            </div>

            <div className={`onepage-workflow-state is-${decision.status.toLowerCase()}`}>
              {!context.sent && <strong>기사 확인 전 / 현재 계획 유지</strong>}
              {context.sent && decision.status === "RIDER_RESPONSE_PENDING" && sourceRequirement?.status === "PENDING" && (
                <><small>기사 응답 대기</small><strong>{courier.name} 기사 확인을 기다립니다</strong><span>현재 계획은 유지됩니다.</span></>
              )}
              {context.sent && decision.status === "RIDER_RESPONSE_PENDING" && sourceRequirement?.status === "CONSENTED" && recipientRequirement?.status === "PENDING" && (
                <><small>수신 기사 응답 대기</small><strong>배송을 나눠 맡는 기사 확인을 기다립니다</strong><span>두 기사 응답 전에는 계획을 적용하지 않습니다.</span></>
              )}
              {decision.status === "ADMIN_APPROVAL_REQUIRED" && (
                <><small>관리자 승인 대기</small><strong>필수 기사 확인 완료</strong><span>승인 직전에 최신 계획을 다시 검증합니다.</span></>
              )}
              {decision.status === "MODIFICATION_REQUESTED" && (
                <><small>다른 방법 요청</small><strong>현재 계획을 유지합니다</strong><span>새 후보가 확정되기 전에는 다시 요청하지 않습니다.</span></>
              )}
              {decision.status === "RIDER_DECLINED" && (
                <><small>지금은 거절</small><strong>현재 계획을 유지합니다</strong></>
              )}
              {applied && (
                <><small>적용</small><strong>{interventionCandidateLabel(selectedCandidate)} 반영</strong><span>경로 / 배송순서 / ETA / 고객 안내 상태를 갱신했습니다.</span></>
              )}
              {message && <span role="status">{message}</span>}
            </div>
          </aside>
        </div>

        <footer className="onepage-dialog-footer">
          <div>
            {!context.sent && (
              <button type="button" className="is-primary" disabled={busy} onClick={onRequestReview}>
                기사 확인 요청
              </button>
            )}
            {context.sent && decision.status === "RIDER_RESPONSE_PENDING" && (
              <button type="button" disabled>기사 응답 기다리는 중</button>
            )}
            {decision.status === "ADMIN_APPROVAL_REQUIRED" && (
              <button type="button" className="is-primary" disabled={busy} onClick={onApprove}>
                관리자 승인 및 적용
              </button>
            )}
            {(applied || decision.status === "MODIFICATION_REQUESTED" || decision.status === "RIDER_DECLINED") && (
              <button type="button" className="is-primary" onClick={onClose}>완료</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function OnePageDashboardDemo() {
  const [now, setNow] = useState(() => new Date());
  const [baseOperationsPackage, setBaseOperationsPackage] =
    useState<DailyOperationsPackage>();
  const [projection, setProjection] =
    useState<DashboardOperationsProjection>();
  const [liveCourierStates, setLiveCourierStates] = useState<
    SyntheticLiveCourierState[]
  >([]);
  const [simulationTick, setSimulationTick] = useState(0);
  const [simulationRunning, setSimulationRunning] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<CourierFilter>("ALL");
  const [mapStatus, setMapStatus] = useState<DashboardMapStatus>("LOADING");
  const pausedMovementSecondRef = useRef<number | undefined>(undefined);
  const [dangerSignals, setDangerSignals] = useState<
    Record<string, RiderDangerSignal>
  >(initialDangerSignals);
  const dangerSignalEtagRef = useRef<string | undefined>(undefined);
  const [decisionContext, setDecisionContext] =
    useState<DashboardDecisionContext>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addCourierOpen, setAddCourierOpen] = useState(false);
  const [pendingCourierRequest, setPendingCourierRequest] =
    useState<AddCourierDraft>();
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string>();
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardRailRef = useRef<HTMLDivElement>(null);
  const addCourierButtonRef = useRef<HTMLButtonElement>(null);
  const supportReviewButtonRef = useRef<HTMLButtonElement>(null);
  const activeOperationsPackageRef = useRef<DailyOperationsPackage | undefined>(undefined);
  const projectionRequestRef = useRef(0);
  const projectionSourceRef = useRef<{
    storage: DashboardOperationsProjection["storage"];
    sourceBundleId: string;
  }>({
    storage: "BUNDLED_FALLBACK",
    sourceBundleId: "daily-operations-documents-2026-07-25-bundled-v1",
  });

  const liveStateByCourier = new Map(
    liveCourierStates.map((state) => [state.courierId, state]),
  );
  const couriers: Courier[] = (projection?.couriers ?? []).map((courier) => ({
    ...courier,
    live: liveStateByCourier.get(courier.id),
    completed:
      liveStateByCourier.get(courier.id)?.completedStopCount ?? courier.completed,
    remaining:
      (liveStateByCourier.get(courier.id)?.totalStopCount ?? courier.total) -
      (liveStateByCourier.get(courier.id)?.completedStopCount ?? courier.completed),
  }));
  const hubs = projection?.hubs ?? [];
  const clusters = hubClusters(couriers);
  const clusteredIds = new Set(
    clusters.flatMap((cluster) => cluster.memberIds),
  );
  const selectedCourier = couriers.find((courier) => courier.id === selectedId) ?? couriers[0];
  const urgentCouriers = couriers
    .filter((courier) => courier.budget < 45)
    .sort(compareCourierPriority);
  const nextPredictedCourier = [...urgentCouriers]
    .filter((courier) => courier.criticalMinute !== null && courier.criticalMinute > 0)
    .sort((left, right) => left.criticalMinute! - right.criticalMinute!)[0];
  const supportCounts = couriers.reduce<Record<SupportState, number>>((counts, courier) => {
    counts[supportState(courier.budget)] += 1;
    return counts;
  }, { BREACH: 0, SUPPORT: 0, CAUTION: 0, STABLE: 0 });
  const dangerSignalCount = Object.keys(dangerSignals).length;
  const selectedDangerSignal = selectedCourier
    ? dangerSignals[selectedCourier.id]
    : undefined;
  const currentTimeLabel = clockFormatter.format(now);
  const liveMovementSecond = Math.floor(now.getTime() / 1_000);
  const movementSecond = pausedMovementSecondRef.current ?? liveMovementSecond;
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
    if (
      !baseOperationsPackage ||
      !simulationRunning ||
      dialogOpen ||
      simulationTick >= SYNTHETIC_LIVE_MAX_TICK
    ) {
      return;
    }
    const timer = window.setInterval(
      () => setSimulationTick((current) => Math.min(SYNTHETIC_LIVE_MAX_TICK, current + 1)),
      SYNTHETIC_LIVE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [baseOperationsPackage, dialogOpen, simulationRunning, simulationTick]);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const result = await loadDemoRiderDangerSignalsFromOperationsStore({
          etag: dangerSignalEtagRef.current,
          signal: controller.signal,
        });
        if (result.status === "LOADED") {
          dangerSignalEtagRef.current = result.etag;
          const knownSignals = Object.fromEntries(
            result.signals
              .filter((signal) =>
                couriers.some((courier) => courier.id === signal.courierId),
              )
              .map((signal) => [signal.courierId, signal]),
          );
          setDangerSignals(knownSignals);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // The validated browser signal remains a presentation-only fallback.
        }
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [couriers]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCurrentDailyOperationsPackage(controller.signal)
      .then((loaded) => {
        const operationsPackage =
          loaded.status === "LOADED"
            ? loaded.operationsPackage
            : bundledDailyOperationsPackage;
        projectionSourceRef.current = loaded.status === "LOADED"
          ? {
              storage: loaded.storage,
              sourceBundleId: loaded.sourceBundleId,
            }
          : {
              storage: "BUNDLED_FALLBACK",
              sourceBundleId: "daily-operations-documents-2026-07-25-bundled-v1",
            };
        setBaseOperationsPackage(operationsPackage);
      })
      .catch(() => setBaseOperationsPackage(bundledDailyOperationsPackage));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!baseOperationsPackage) return;
    const frame = createSyntheticLiveOperationsFrame(
      baseOperationsPackage,
      simulationTick,
    );
    setLiveCourierStates(frame.courierStates);
  }, [baseOperationsPackage, simulationTick]);

  const safetySimulationTick =
    Math.floor(simulationTick / SYNTHETIC_LIVE_SAFETY_STRIDE_TICKS) *
    SYNTHETIC_LIVE_SAFETY_STRIDE_TICKS;

  useEffect(() => {
    if (!baseOperationsPackage) return;
    const requestId = ++projectionRequestRef.current;
    const frame = createSyntheticLiveOperationsFrame(
      baseOperationsPackage,
      safetySimulationTick,
    );
    activeOperationsPackageRef.current = frame.operationsPackage;
    void createDashboardOperationsProjection(
      frame.operationsPackage,
      projectionSourceRef.current,
    )
      .then((result) => {
        if (requestId !== projectionRequestRef.current) return;
        setProjection(result);
        setSelectedId((current) =>
          result.couriers.some((courier) => courier.id === current)
            ? current
            : (
                result.couriers
                  .filter((courier) => courier.budget < 45)
                  .sort(compareCourierPriority)[0]
                ?? result.couriers[0]
              ).id,
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
  }, [baseOperationsPackage, safetySimulationTick]);

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
  }, [couriers]);

  useEffect(() => {
    if (filter !== "SIGNAL" || dangerSignals[selectedId]) return;
    const nextCourier = couriers.find((courier) => dangerSignals[courier.id]);
    if (nextCourier) {
      setSelectedId(nextCourier.id);
    } else {
      setFilter("ALL");
    }
  }, [dangerSignals, filter, selectedId]);

  useEffect(() => {
    if (!dialogOpen || !decisionContext?.sent) return;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const loaded = await loadOperationsPersistedSession(
          decisionContext.workspaceId,
          { ifUpdatedAt: decisionContext.baseSavedAt },
        );
        if (
          loaded.status === "LOADED" &&
          loaded.updatedAt !== decisionContext.baseSavedAt
        ) {
          const restored = await restoreOperationsPersistedSession(
            loaded.session,
          );
          setDecisionContext((current) =>
            current?.workspaceId === decisionContext.workspaceId
              ? {
                  ...current,
                  operationsPackage: restored.operationsPackage,
                  snapshot: restored.snapshot,
                  fleet: restored.fleet,
                  workspace: restored.workspace,
                  baseSavedAt: loaded.updatedAt,
                  sent: true,
                }
              : current,
          );
        }
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [dialogOpen, decisionContext?.workspaceId, decisionContext?.sent, decisionContext?.baseSavedAt]);

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

  const openSupportReview = async () => {
    if (!selectedCourier?.decisionId) return;
    if (
      decisionContext?.workspace.decisions.some(
        (item) => item.queueItem.courierId === selectedCourier.id,
      )
    ) {
      setDialogMessage(undefined);
      setDialogOpen(true);
      return;
    }
    setDialogBusy(true);
    setDialogMessage(undefined);
    try {
      const latest = await loadLatestOperationsSessionForCourier(
        selectedCourier.id,
      );
      if (
        latest.status === "LOADED"
      ) {
        const restored = await restoreOperationsPersistedSession(
          latest.session,
        );
        setDecisionContext({
          workspaceId: latest.session.workspaceId,
          operationsPackage: restored.operationsPackage,
          snapshot: restored.snapshot,
          fleet: restored.fleet,
          workspace: restored.workspace,
          baseSavedAt: latest.updatedAt,
          sent: true,
        });
        setDialogOpen(true);
        return;
      }
      const operationsPackage =
        activeOperationsPackageRef.current ?? bundledDailyOperationsPackage;
      const snapshot = await createDailyOperationsSnapshot(
        operationsPackage,
        { createdAt: operationsPackage.evaluatedAt },
      );
      const fleet = evaluateOperationsFleet(snapshot);
      const queueItem = fleet.supportQueue.find(
        (item) => item.courierId === selectedCourier.id,
      );
      if (!queueItem) {
        setDialogMessage("현재 기사에 보낼 수 있는 안전지원 후보가 없습니다.");
        return;
      }
      const workspace = initializeOperationsDecision(
        createOperationsDecisionWorkspace(snapshot, fleet),
        snapshot,
        fleet,
        queueItem.decisionId,
      );
      setDecisionContext({
        workspaceId: `operations-workspace-${globalThis.crypto.randomUUID()}`,
        operationsPackage,
        snapshot,
        fleet,
        workspace,
        sent: false,
      });
      setDialogOpen(true);
    } catch {
      setDialogMessage("지원 검토 정보를 준비하지 못했습니다.");
    } finally {
      setDialogBusy(false);
    }
  };

  const selectDialogCandidate = (candidateId: string) => {
    if (!decisionContext || !selectedCourier) return;
    const decisionId = decisionContext.workspace.decisions.find(
      (item) => item.queueItem.courierId === selectedCourier.id,
    )?.decision.decisionId;
    if (!decisionId) return;
    try {
      setDecisionContext({
        ...decisionContext,
        workspace: selectOperationsDecisionCandidate(
          decisionContext.workspace,
          { decisionId, candidateId },
        ),
      });
      setDialogMessage(undefined);
    } catch (error) {
      setDialogMessage(
        error instanceof Error ? error.message : "후보를 선택하지 못했습니다.",
      );
    }
  };

  const requestCourierReviewFromDialog = async () => {
    if (!decisionContext) return;
    setDialogBusy(true);
    setDialogMessage(undefined);
    try {
      const session = createOperationsPersistedSession({
        workspaceId: decisionContext.workspaceId,
        operationsPackage: decisionContext.operationsPackage,
        snapshot: decisionContext.snapshot,
        fleet: decisionContext.fleet,
        workspace: decisionContext.workspace,
        savedAt: new Date().toISOString(),
      });
      const saved = await saveOperationsPersistedSession(session, {
        baseSavedAt: decisionContext.baseSavedAt,
      });
      if (saved.status !== "SAVED") {
        setDialogMessage(
          "message" in saved
            ? saved.message
            : "기사 확인 요청을 저장하지 못했습니다.",
        );
        return;
      }
      setDecisionContext({
        ...decisionContext,
        baseSavedAt: saved.updatedAt,
        sent: true,
      });
      setDialogMessage("기사 앱에 지원안을 보냈습니다.");
    } finally {
      setDialogBusy(false);
    }
  };

  const approveDialogDecision = async () => {
    if (!decisionContext || !selectedCourier) return;
    const decisionId = decisionContext.workspace.decisions.find(
      (item) => item.queueItem.courierId === selectedCourier.id,
    )?.decision.decisionId;
    if (!decisionId) return;
    setDialogBusy(true);
    setDialogMessage(undefined);
    try {
      const result = approveAndApplyOperationsDecision(
        decisionContext.workspace,
        decisionId,
      );
      const session = createOperationsPersistedSession({
        workspaceId: decisionContext.workspaceId,
        operationsPackage: decisionContext.operationsPackage,
        snapshot: decisionContext.snapshot,
        fleet: decisionContext.fleet,
        workspace: result.workspace,
        savedAt: new Date().toISOString(),
      });
      const saved = await saveOperationsPersistedSession(session, {
        baseSavedAt: decisionContext.baseSavedAt,
      });
      if (saved.status !== "SAVED") {
        setDialogMessage(
          "message" in saved
            ? saved.message
            : "최종 적용 상태를 저장하지 못했습니다.",
        );
        return;
      }
      setDecisionContext({
        ...decisionContext,
        workspace: result.workspace,
        baseSavedAt: saved.updatedAt,
        sent: true,
      });
      setDialogMessage(
        result.status === "APPLIED" || result.status === "ALREADY_APPLIED"
          ? "승인된 계획과 고객 안내 상태를 갱신했습니다."
          : "최신 계획 재검증이 필요합니다.",
      );
    } catch (error) {
      setDialogMessage(
        error instanceof Error ? error.message : "승인 적용을 완료하지 못했습니다.",
      );
    } finally {
      setDialogBusy(false);
    }
  };

  const closeSupportReview = () => {
    setDialogOpen(false);
    window.requestAnimationFrame(() => supportReviewButtonRef.current?.focus());
  };

  const closeAddCourier = () => {
    setAddCourierOpen(false);
    window.requestAnimationFrame(() => addCourierButtonRef.current?.focus());
  };

  const savePendingCourier = (draft: AddCourierDraft) => {
    setPendingCourierRequest(draft);
    closeAddCourier();
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
  const selectedRoutePoints = riderRoutePolyline({
    courierId: selectedCourier.id,
    areaCode: selectedCourier.area,
    mapX: selectedCourier.mapX,
    mapY: selectedCourier.mapY,
  })
    .map((point) => `${point.mapX},${point.mapY}`)
    .join(" ");
  const activeDialogArtifacts = decisionContext?.workspace.decisions.find(
    (item) => item.queueItem.courierId === selectedCourier.id,
  );
  const riderAppHref = activeDialogArtifacts && decisionContext?.sent
    ? `/rider-demo?courier=${encodeURIComponent(selectedCourier.id)}&workspace=${encodeURIComponent(decisionContext.workspaceId)}&decision=${encodeURIComponent(activeDialogArtifacts.decision.decisionId)}&simTick=${simulationTick}`
    : `/rider-demo?courier=${encodeURIComponent(selectedCourier.id)}&simTick=${simulationTick}`;

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
          <span className="onepage-synthetic-stream-link" role="status">
            합성 운행 중 · 실제 TMS 아님
          </span>
          <time dateTime={now.toISOString()} aria-label={`현재 시각 ${currentTimeLabel}`}>
            {currentTimeLabel}
          </time>
          <a className="onepage-rider-app-link" href={riderAppHref}>
            기사 앱
          </a>
        </div>
      </header>

      <section
        className="onepage-priority-brief"
        aria-labelledby="priority-brief-title"
      >
        <div className="onepage-brief-overview">
          <span className="onepage-brief-kicker">향후 60분 안전지원 브리핑</span>
          <h2 id="priority-brief-title">
            {urgentCouriers.length}명의 판단이 필요합니다.
          </h2>
        </div>

        <article
          id="priority-decision"
          className={`onepage-priority-decision state-${supportState(selectedCourier.budget).toLowerCase()}`}
          aria-live="polite"
        >
          <div className="onepage-priority-heading">
            <span className={`onepage-state-pill state-${supportState(selectedCourier.budget).toLowerCase()}`}>
              {supportPanelStateLabel(selectedCourier)}
            </span>
            <small>지원받는 기사 · {selectedCourier.name}</small>
          </div>
          <h2>
            {selectedCourier.criticalMinute === 0
              ? "지금 지원안을 확인해야 합니다."
              : selectedCourier.criticalMinute !== null
                ? `${selectedCourier.criticalMinute}분 후 · ${selectedCourier.criticalStopOrdinal ?? "예상"}번째 배송지 전에 확인합니다.`
                : "향후 60분은 현재 계획을 유지합니다."}
          </h2>
          <dl className="onepage-priority-facts">
            <div>
              <dt>현재 → 예상 최저</dt>
              <dd>{selectedCourier.currentScore.toFixed(1)} → {selectedCourier.budget.toFixed(1)}</dd>
            </div>
            <div>
              <dt>먼저 비교할 지원</dt>
              <dd>휴식 · 배송 분담 최대 {selectedCourier.maxTransferStopCount}건</dd>
            </div>
            <div>
              <dt>위험전가 확인</dt>
              <dd>나눠 맡을 기사 {selectedCourier.transferRecipientCount}명 검증</dd>
            </div>
          </dl>
        </article>

        <div className="onepage-brief-action">
          <div className="onepage-next-support">
            <span>다음 예측</span>
            <strong>
              {nextPredictedCourier
                ? `${nextPredictedCourier.criticalMinute}분 후 · ${nextPredictedCourier.criticalStopOrdinal ?? "예상"}번째 배송지`
                : "향후 60분 추가 초과 없음"}
            </strong>
            <small>
              {nextPredictedCourier
                ? `${nextPredictedCourier.name} · 지도와 지원 목록에서 확인`
                : "동일 평가시각 기준"}
            </small>
          </div>
          <ol className="onepage-approval-path" aria-label="지원안 적용 순서">
            <li>안전한 후보만 비교</li>
            <li>영향 기사 확인</li>
            <li>관리자 승인 후 적용</li>
          </ol>
          <button
            ref={supportReviewButtonRef}
            type="button"
            className="onepage-open-intervention onepage-brief-review"
            disabled={!selectedCourier.decisionId || dialogBusy}
            onClick={() => void openSupportReview()}
          >
            지원 검토
          </button>
          {dialogMessage && !dialogOpen && <small role="status">{dialogMessage}</small>}
        </div>
      </section>

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
          <div className="onepage-courier-actions">
            <button
              ref={addCourierButtonRef}
              type="button"
              className="onepage-add-courier-button"
              aria-haspopup="dialog"
              onClick={() => setAddCourierOpen(true)}
            >
              <span aria-hidden="true">＋</span>
              기사 추가
              {pendingCourierRequest && <b>대기 1</b>}
            </button>
            <div className="onepage-scroll-controls">
              <button type="button" aria-label="이전 기사 카드" onClick={() => scrollCards(-1)}>‹</button>
              <button type="button" aria-label="다음 기사 카드" onClick={() => scrollCards(1)}>›</button>
            </div>
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

      <section className="onepage-workspace" aria-label="지원 필요 목록과 운영 지도">
        <div className="onepage-map-section" aria-label="기사 위치 지도">
          <div className="onepage-map-toolbar">
            <div>
              <strong>합성 운영권역 · {hubs.length}개 허브</strong>
              <span>
                {mapStatus === "READY"
                  ? `도로 운행 1초·Safety 5초 갱신 · +${simulationTick * SYNTHETIC_LIVE_MINUTES_PER_TICK}분`
                  : mapStatus === "LOADING"
                    ? "지도 불러오는 중"
                    : `도로 운행 1초·Safety 5초 갱신 · +${simulationTick * SYNTHETIC_LIVE_MINUTES_PER_TICK}분 · 지도 대체 화면`}
              </span>
            </div>
            <div className="onepage-live-controls" aria-label="합성 운행 재생 제어">
              <span aria-live="polite">
                {dialogOpen
                  ? "지원 검토 중 일시정지"
                  : simulationTick >= SYNTHETIC_LIVE_MAX_TICK
                    ? "운행 주기 완료"
                    : simulationRunning
                      ? "운행·배송·안전여유 반영 중"
                      : "일시정지"}
              </span>
              <button
                type="button"
                aria-pressed={!simulationRunning}
                onClick={() => setSimulationRunning((current) => !current)}
                disabled={dialogOpen || simulationTick >= SYNTHETIC_LIVE_MAX_TICK}
              >
                {simulationRunning ? "일시정지" : "계속"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimulationTick(0);
                  setSimulationRunning(true);
                }}
                disabled={dialogOpen}
              >
                처음부터
              </button>
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
            data-simulation-tick={simulationTick}
            onPointerEnter={() => {
              pausedMovementSecondRef.current ??= liveMovementSecond;
            }}
            onPointerMove={() => {
              pausedMovementSecondRef.current ??= liveMovementSecond;
            }}
            onPointerLeave={() => {
              pausedMovementSecondRef.current = undefined;
            }}
            onFocusCapture={() => {
              pausedMovementSecondRef.current ??= liveMovementSecond;
            }}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                pausedMovementSecondRef.current = undefined;
              }
            }}
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
                <svg
                  className="onepage-selected-road-route"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline points={selectedRoutePoints} />
                </svg>
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
              {selectedCourier.live ? (
                <em className={`onepage-live-activity is-${selectedCourier.live.activity.toLowerCase()}`}>
                  {selectedCourier.live.activityLabel}
                </em>
              ) : null}
              <b>운영 위험지수 · 현재 Budget {selectedCourier.currentScore.toFixed(1)} / 예상 최저 {selectedCourier.budget.toFixed(1)}</b>
              <b>{supportTimingLabel(selectedCourier)}</b>
              <span>배송 {selectedCourier.completed}/{selectedCourier.total}</span>
            </div>
          </div>
        </div>

        <aside className="onepage-support-panel" aria-labelledby="support-panel-title">
          <header>
            <div>
              <small>향후 60분</small>
              <h2 id="support-panel-title">지원 우선순위</h2>
            </div>
            <span>{urgentCouriers.length}/{couriers.length}</span>
          </header>

          <div className="onepage-support-focus" aria-live="polite">
            <div className="onepage-support-person">
              <SyntheticCourierPhoto
                courierId={selectedCourier.id}
                className="onepage-support-photo"
              />
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
                <strong>배송 분담 · {selectedHub.label.replace("합성 ", "")}</strong>
              </div>
              <span>
                수신 가능 {selectedCourier.transferRecipientCount}명 / 최대 {selectedCourier.maxTransferStopCount}건
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
            <a className="onepage-focus-jump" href="#priority-decision">
              위 브리핑에서 지원 판단 보기
            </a>
          </div>

          <div className="onepage-support-queue">
            <div className="onepage-support-queue-title">
              <strong>지원받을 기사</strong>
              <small>빠른 지원 시점순</small>
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
      {addCourierOpen && (
        <AddCourierDialog
          couriers={couriers}
          hubs={hubs}
          onClose={closeAddCourier}
          onSave={savePendingCourier}
        />
      )}
      {dialogOpen && decisionContext && activeDialogArtifacts && (
        <InterventionDialog
          courier={selectedCourier}
          context={decisionContext}
          busy={dialogBusy}
          message={dialogMessage}
          onClose={closeSupportReview}
          onSelectCandidate={selectDialogCandidate}
          onRequestReview={() => void requestCourierReviewFromDialog()}
          onApprove={() => void approveDialogDecision()}
        />
      )}
    </main>
  );
}
