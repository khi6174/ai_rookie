import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadKakaoMapsSdk,
  type KakaoMapInstance,
  type KakaoMapOverlay,
} from "../adapters/maps/kakao";
import "./one-page-dashboard.css";

type SupportState = "BREACH" | "SUPPORT" | "CAUTION" | "STABLE";
type CourierFilter = "ALL" | "SIGNAL" | "SUPPORT" | "CAUTION" | "STABLE";
type DashboardMapStatus = "LOADING" | "LIVE" | "FALLBACK";
type InterventionStage =
  | "COMPARE"
  | "REQUESTED"
  | "CONSENTED"
  | "MODIFY"
  | "DECLINED"
  | "APPLIED";

type InterventionOption = {
  id: "REST" | "SAFE_ROUTE" | "TRANSFER" | "RESEQUENCE" | "SAFE_DELAY";
  label: string;
  detail: string;
  budgetDelta: number;
  etaDelta: number;
  guard: string;
};

type Courier = {
  id: string;
  name: string;
  budget: number;
  area: string;
  completed: number;
  total: number;
  shift: string;
  mapX: number;
  mapY: number;
  criticalMinute: number | null;
};

type RiderDangerSignal = {
  courierId: string;
  label: string;
  receivedAt: string;
};

const couriers: Courier[] = [
  { id: "R-014", name: "강태현", budget: 24.1, area: "역삼 A", completed: 14, total: 31, shift: "08:30", mapX: 29, mapY: 38, criticalMinute: 0 },
  { id: "R-022", name: "윤재호", budget: 27.6, area: "논현 B", completed: 18, total: 34, shift: "08:10", mapX: 37, mapY: 29, criticalMinute: 0 },
  { id: "R-031", name: "문상혁", budget: 29.3, area: "대치 A", completed: 16, total: 29, shift: "08:20", mapX: 70, mapY: 43, criticalMinute: 0 },
  { id: "R-008", name: "배준영", budget: 31.8, area: "도곡 B", completed: 15, total: 32, shift: "08:40", mapX: 54, mapY: 67, criticalMinute: 16 },
  { id: "R-019", name: "임세훈", budget: 34.2, area: "삼성 A", completed: 19, total: 36, shift: "08:00", mapX: 78, mapY: 24, criticalMinute: 21 },
  { id: "R-027", name: "노현우", budget: 36.5, area: "청담 B", completed: 12, total: 28, shift: "09:00", mapX: 67, mapY: 18, criticalMinute: 28 },
  { id: "R-005", name: "곽민제", budget: 38.9, area: "개포 A", completed: 13, total: 30, shift: "08:50", mapX: 74, mapY: 72, criticalMinute: 34 },
  { id: "R-016", name: "서동하", budget: 41.4, area: "신사 B", completed: 17, total: 33, shift: "08:15", mapX: 25, mapY: 19, criticalMinute: 41 },
  { id: "R-024", name: "채우진", budget: 43.7, area: "압구정 A", completed: 20, total: 35, shift: "08:05", mapX: 44, mapY: 17, criticalMinute: 49 },
  { id: "R-011", name: "백승기", budget: 46.2, area: "역삼 B", completed: 18, total: 32, shift: "08:25", mapX: 44, mapY: 45, criticalMinute: null },
  { id: "R-029", name: "오태림", budget: 48.8, area: "논현 A", completed: 14, total: 29, shift: "08:55", mapX: 41, mapY: 39, criticalMinute: null },
  { id: "R-003", name: "신주완", budget: 50.5, area: "대치 B", completed: 21, total: 37, shift: "07:50", mapX: 62, mapY: 48, criticalMinute: null },
  { id: "R-018", name: "하은성", budget: 52.9, area: "도곡 A", completed: 16, total: 31, shift: "08:35", mapX: 57, mapY: 61, criticalMinute: null },
  { id: "R-034", name: "남기석", budget: 54.7, area: "삼성 B", completed: 22, total: 38, shift: "07:45", mapX: 72, mapY: 32, criticalMinute: null },
  { id: "R-007", name: "조민혁", budget: 57.1, area: "청담 A", completed: 19, total: 33, shift: "08:00", mapX: 64, mapY: 23, criticalMinute: null },
  { id: "R-026", name: "구본재", budget: 59.4, area: "개포 B", completed: 17, total: 30, shift: "08:30", mapX: 68, mapY: 68, criticalMinute: null },
  { id: "R-013", name: "정해윤", budget: 62.8, area: "신사 A", completed: 23, total: 35, shift: "07:40", mapX: 30, mapY: 24, criticalMinute: null },
  { id: "R-021", name: "최이든", budget: 65.3, area: "압구정 B", completed: 20, total: 32, shift: "08:10", mapX: 48, mapY: 22, criticalMinute: null },
  { id: "R-009", name: "한서웅", budget: 68.6, area: "세곡 A", completed: 18, total: 28, shift: "08:45", mapX: 60, mapY: 78, criticalMinute: null },
  { id: "R-032", name: "유정민", budget: 72.4, area: "자곡 B", completed: 24, total: 36, shift: "07:35", mapX: 51, mapY: 82, criticalMinute: null },
];

const initialDangerSignals: Record<string, RiderDangerSignal> = {
  "R-014": {
    courierId: "R-014",
    label: "긴급 지원 요청",
    receivedAt: "14:31",
  },
};

const clusters = [
  { id: "cluster-west", x: 42, y: 42, memberIds: ["R-011", "R-029"] },
  { id: "cluster-east", x: 66, y: 37, memberIds: ["R-003", "R-034", "R-007"] },
  { id: "cluster-south", x: 60, y: 73, memberIds: ["R-018", "R-026", "R-009", "R-032"] },
  { id: "cluster-north", x: 40, y: 23, memberIds: ["R-013", "R-021"] },
];

const clusteredIds = new Set(clusters.flatMap((cluster) => cluster.memberIds));
const gangnamHubPoint = { latitude: 37.4986, longitude: 127.045 };
const interventionOptions: InterventionOption[] = [
  { id: "REST", label: "10분 휴식", detail: "가까운 휴식 거점 경유", budgetDelta: 18.4, etaDelta: 10, guard: "실행 가능" },
  { id: "SAFE_ROUTE", label: "안전경로", detail: "위험 노출 구간 우회", budgetDelta: 13.6, etaDelta: 6, guard: "실행 가능" },
  { id: "TRANSFER", label: "물량이관 6건", detail: "인접 기사에게 일부 이관", budgetDelta: 16.1, etaDelta: 4, guard: "위험전가 검사 통과" },
  { id: "RESEQUENCE", label: "순서 변경", detail: "가까운 배송지부터 재배치", budgetDelta: 8.7, etaDelta: 2, guard: "실행 가능" },
  { id: "SAFE_DELAY", label: "Safe Delay", detail: "고객 안내 후 안전 지연", budgetDelta: 12.5, etaDelta: 8, guard: "고객 안내 가능" },
];

function courierGeographicPoint(courier: Courier) {
  return {
    latitude: 37.54 - courier.mapY * 0.0008,
    longitude: 127.01 + courier.mapX * 0.0009,
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
  BREACH: "긴급",
  SUPPORT: "지원",
  CAUTION: "주의",
  STABLE: "안정",
};

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
  photoIndex,
  selected,
  dangerSignal,
  onSelect,
  cardRef,
}: {
  courier: Courier;
  photoIndex: number;
  selected: boolean;
  dangerSignal?: RiderDangerSignal;
  onSelect: () => void;
  cardRef: (node: HTMLButtonElement | null) => void;
}) {
  const photoColumn = photoIndex % 5;
  const photoRow = Math.floor(photoIndex / 5);
  const state = supportState(courier.budget);
  return (
    <button
      ref={cardRef}
      className={`onepage-courier-card state-${state.toLowerCase()} ${selected ? "is-selected" : ""} ${dangerSignal ? "has-danger-signal" : ""}`}
      data-courier-card={courier.id}
      data-rider-danger-signal={dangerSignal ? "active" : "inactive"}
      aria-pressed={selected}
      aria-label={`${courier.name} 기사, 지정구역 ${courier.area}, 안전여유 ${courier.budget}, ${stateLabel[state]}${dangerSignal ? ", 기사앱 위험 신호" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="onepage-card-identity">
        <span
          className="onepage-profile-photo"
          aria-hidden="true"
          style={{
            backgroundPosition: `${photoColumn * 25}% ${photoRow * (100 / 3)}%`,
          }}
        />
        <span className="onepage-card-copy">
          <span className="onepage-card-name">{courier.name}</span>
          <span className="onepage-card-area">
            <small>지정구역</small>
            <strong>{courier.area}</strong>
          </span>
        </span>
      </span>
      <span className={`onepage-card-safety state-${state.toLowerCase()}`}>
        <small>{dangerSignal ? "기사앱 위험 신호" : "안전여유"}</small>
        <span className="onepage-card-safety-value">
          <b>{courier.budget.toFixed(1)}</b>
        </span>
      </span>
    </button>
  );
}

function MapMarker({
  courier,
  photoIndex,
  selected,
  onSelect,
}: {
  courier: Courier;
  photoIndex: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = supportState(courier.budget);
  const photoColumn = photoIndex % 5;
  const photoRow = Math.floor(photoIndex / 5);
  return (
    <button
      className={`onepage-map-marker state-${state.toLowerCase()} ${selected ? "is-selected" : ""}`}
      data-map-marker={courier.id}
      style={{ left: `${courier.mapX}%`, top: `${courier.mapY}%` }}
      aria-label={`${courier.name} 기사 위치, ${stateLabel[state]}, ${courier.budget.toFixed(1)}`}
      aria-pressed={selected}
      onClick={onSelect}
      type="button"
    >
      <span
        className="onepage-map-marker-photo"
        aria-hidden="true"
        style={{
          backgroundPosition: `${photoColumn * 25}% ${photoRow * (100 / 3)}%`,
        }}
      />
      <small className="onepage-map-marker-score" aria-hidden="true">
        {courier.budget.toFixed(0)}
      </small>
    </button>
  );
}

function DashboardKakaoMap({
  selectedId,
  onSelect,
  onStatus,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  onStatus: (status: DashboardMapStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerButtonsRef = useRef(new Map<string, HTMLButtonElement>());
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
    const overlays: KakaoMapOverlay[] = [];
    const buttons = markerButtonsRef.current;
    onStatus("LOADING");

    void loadKakaoMapsSdk(javaScriptKey)
      .then((maps) => {
        if (disposed) return;
        const center = new maps.LatLng(
          gangnamHubPoint.latitude,
          gangnamHubPoint.longitude,
        );
        map = new maps.Map(container, { center, level: 6 });
        const bounds = new maps.LatLngBounds();

        couriers.forEach((courier, photoIndex) => {
          if (!map) return;
          const point = courierGeographicPoint(courier);
          const position = new maps.LatLng(point.latitude, point.longitude);
          const state = supportState(courier.budget);
          const button = document.createElement("button");
          const photo = document.createElement("span");
          const score = document.createElement("small");
          const photoColumn = photoIndex % 5;
          const photoRow = Math.floor(photoIndex / 5);

          button.type = "button";
          button.className = `onepage-map-marker onepage-kakao-marker state-${state.toLowerCase()}`;
          button.dataset.mapMarker = courier.id;
          button.setAttribute(
            "aria-label",
            `${courier.name} 기사 Demo 위치, ${stateLabel[state]}, ${courier.budget.toFixed(1)}`,
          );
          photo.className = "onepage-map-marker-photo";
          photo.setAttribute("aria-hidden", "true");
          photo.style.backgroundPosition =
            `${photoColumn * 25}% ${photoRow * (100 / 3)}%`;
          score.className = "onepage-map-marker-score";
          score.setAttribute("aria-hidden", "true");
          score.textContent = courier.budget.toFixed(0);
          button.append(photo, score);
          button.addEventListener("click", () => selectRef.current(courier.id));
          buttons.set(courier.id, button);

          overlays.push(new maps.CustomOverlay({
            map,
            position,
            content: button,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: courier.budget < 45 ? 8 : 6,
          }));
          bounds.extend(position);
        });

        const hubPosition = new maps.LatLng(
          gangnamHubPoint.latitude,
          gangnamHubPoint.longitude,
        );
        const hub = document.createElement("span");
        const hubIcon = document.createElement("span");
        const hubLabel = document.createElement("strong");
        hub.className = "onepage-hub onepage-kakao-hub";
        hub.setAttribute("aria-label", "강남 허브 위치");
        hubIcon.className = "onepage-hub-icon";
        hubIcon.setAttribute("aria-hidden", "true");
        hubLabel.textContent = "강남 허브";
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
        map.setBounds(bounds, 56, 56, 56, 56);

        markerButtonsRef.current.forEach((button, id) => {
          button.classList.toggle("is-selected", id === selectedId);
          button.setAttribute("aria-pressed", String(id === selectedId));
        });
        onStatus("LIVE");
      })
      .catch(() => {
        if (!disposed) onStatus("FALLBACK");
      });

    return () => {
      disposed = true;
      overlays.forEach((overlay) => overlay.setMap(null));
      buttons.clear();
      container.replaceChildren();
      map = undefined;
    };
  }, [javaScriptKey, onStatus, requested]);

  useEffect(() => {
    markerButtonsRef.current.forEach((button, id) => {
      button.classList.toggle("is-selected", id === selectedId);
      button.setAttribute("aria-pressed", String(id === selectedId));
    });
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      className="onepage-kakao-layer"
      aria-label="Kakao 실제 지도 데이터 위 Demo 기사 위치"
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
    useState<InterventionOption["id"]>("REST");
  const [stage, setStage] = useState<InterventionStage>("COMPARE");
  const selectedOption =
    interventionOptions.find((option) => option.id === selectedOptionId) ??
    interventionOptions[0];
  const projectedBudget = Math.min(
    89.9,
    courier.budget + selectedOption.budgetDelta,
  );
  const courierIndex = couriers.findIndex((item) => item.id === courier.id);

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
              <small>합성 Demo · 지원안 검토</small>
              <h2 id="intervention-dialog-title">
                {courier.name} 기사 안전지원
              </h2>
              <span>{courier.area} · 배송 {courier.completed}/{courier.total}</span>
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
                <small>안전한 후보만 비교</small>
                <h3 id="candidate-title">지원안 선택</h3>
              </div>
              <span>5개 후보</span>
            </div>
            <div className="onepage-candidate-list">
              {interventionOptions.map((option) => {
                const after = Math.min(89.9, courier.budget + option.budgetDelta);
                const isSelected = option.id === selectedOptionId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedOptionId(option.id);
                      setStage("COMPARE");
                    }}
                  >
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </span>
                    <span>
                      <b>{after.toFixed(1)}</b>
                      <small>ETA +{option.etaDelta}분</small>
                    </span>
                    <em>{option.guard}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="onepage-decision-summary" aria-live="polite">
            <div className="onepage-dialog-section-title">
              <div>
                <small>선택한 조치</small>
                <h3>결정 요약</h3>
              </div>
            </div>
            <div className="onepage-before-after">
              <div>
                <small>조정 전</small>
                <b>{courier.budget.toFixed(1)}</b>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <small>조정 후</small>
                <b>{projectedBudget.toFixed(1)}</b>
              </div>
            </div>
            <dl className="onepage-decision-facts">
              <div>
                <dt>선택</dt>
                <dd>{selectedOption.label}</dd>
              </div>
              <div>
                <dt>고객 ETA</dt>
                <dd>+{selectedOption.etaDelta}분</dd>
              </div>
              <div>
                <dt>안전 제약</dt>
                <dd>{selectedOption.guard}</dd>
              </div>
            </dl>

            <div className={`onepage-workflow-state is-${stage.toLowerCase()}`}>
              {stage === "COMPARE" && (
                <>
                  <small>1 · 비교 완료</small>
                  <strong>기사 확인이 필요합니다</strong>
                  <span>승인 전에는 현재 계획을 유지합니다.</span>
                </>
              )}
              {stage === "REQUESTED" && (
                <>
                  <small>2 · 기사 확인</small>
                  <strong>응답을 선택하세요</strong>
                  <span>동의·수정 요청·거절에 불이익이 없습니다.</span>
                </>
              )}
              {stage === "CONSENTED" && (
                <>
                  <small>3 · 관리자 승인</small>
                  <strong>기사 동의 확인</strong>
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
                  <small>4 · 적용됨</small>
                  <strong>{selectedOption.label} 반영</strong>
                  <span>경로·배송순서·ETA·고객 안내를 함께 갱신했습니다.</span>
                </>
              )}
            </div>
          </aside>
        </div>

        <footer className="onepage-dialog-footer">
          <span>모든 수치와 응답은 합성 Demo입니다.</span>
          <div>
            {stage === "COMPARE" && (
              <button type="button" className="is-primary" onClick={() => setStage("REQUESTED")}>
                기사 확인 요청
              </button>
            )}
            {stage === "REQUESTED" && (
              <>
                <button type="button" onClick={() => setStage("DECLINED")}>거절</button>
                <button type="button" onClick={() => setStage("MODIFY")}>수정 요청</button>
                <button type="button" className="is-primary" onClick={() => setStage("CONSENTED")}>
                  동의 확인
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
  const [selectedId, setSelectedId] = useState(couriers[0].id);
  const [filter, setFilter] = useState<CourierFilter>("ALL");
  const [mapStatus, setMapStatus] = useState<DashboardMapStatus>("LOADING");
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [appliedPlans, setAppliedPlans] = useState<Record<string, string>>({});
  const [dangerSignals, setDangerSignals] =
    useState<Record<string, RiderDangerSignal>>(initialDangerSignals);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardRailRef = useRef<HTMLDivElement>(null);

  const selectedCourier =
    couriers.find((courier) => courier.id === selectedId) ?? couriers[0];
  const selectedIndex = couriers.findIndex(
    (courier) => courier.id === selectedCourier.id,
  );
  const urgentCouriers = couriers.filter((courier) => courier.budget < 45);
  const dangerSignalCount = Object.keys(dangerSignals).length;
  const selectedDangerSignal = dangerSignals[selectedCourier.id];
  const filteredCouriers = couriers.filter((courier) =>
    matchesCourierFilter(courier, filter, dangerSignals),
  );

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
            receivedAt: detail.receivedAt?.trim() || "14:32",
          },
        };
      });
    };

    window.addEventListener(
      "saferoute:rider-danger-signal",
      handleRiderDangerSignal,
    );
    return () => {
      window.removeEventListener(
        "saferoute:rider-danger-signal",
        handleRiderDangerSignal,
      );
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
    if (!filteredCouriers.some((courier) => courier.id === id)) {
      setFilter("ALL");
    }
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
    const nextCouriers = couriers.filter((courier) =>
      matchesCourierFilter(courier, nextFilter, dangerSignals),
    );
    if (!nextCouriers.some((courier) => courier.id === selectedId)) {
      setSelectedId(nextCouriers[0]?.id ?? couriers[0].id);
    }
  };

  const selectedIsClustered = clusteredIds.has(selectedId);
  const closeIntervention = useCallback(() => {
    setInterventionOpen(false);
  }, []);
  const recordAppliedPlan = useCallback((label: string) => {
    setAppliedPlans((current) => ({
      ...current,
      [selectedId]: label,
    }));
  }, [selectedId]);

  return (
    <main className="onepage-demo">
      <header className="onepage-header">
        <div className="onepage-brand" aria-label="SafeRoute AI">
          <span className="onepage-brand-mark" aria-hidden="true">S</span>
          <span className="onepage-brand-copy">
            <strong>SafeRoute AI</strong>
            <small>운영 안전 코파일럿</small>
          </span>
        </div>
        <div className="onepage-page-title">
          <h1>Safety Control Tower</h1>
        </div>
        <div className="onepage-header-status">
          <span className="onepage-demo-badge">합성 Demo</span>
          <span className="onepage-live-badge"><i aria-hidden="true" /> Live 0</span>
          <span className="onepage-operator">운영 관리자</span>
          <time dateTime="2026-07-30T14:32:00+09:00">14:32</time>
        </div>
      </header>

      <section className="onepage-courier-section" aria-labelledby="courier-section-title">
        <div className="onepage-section-rail">
          <div className="onepage-section-title">
            <span className="onepage-section-icon" aria-hidden="true">●</span>
            <h2 id="courier-section-title">기사 현황</h2>
          </div>
          <div className="onepage-filter-tabs" aria-label="기사 현황 필터">
            {([
              ["ALL", "전체", 20],
              ["SIGNAL", "위험신호", dangerSignalCount],
              ["SUPPORT", "지원", 9],
              ["CAUTION", "주의", 7],
              ["STABLE", "안정", 4],
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
          {filteredCouriers.map((courier) => (
            <CourierCard
              key={courier.id}
              courier={courier}
              photoIndex={couriers.findIndex((item) => item.id === courier.id)}
              selected={selectedId === courier.id}
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
              <strong>강남 허브</strong>
              <span>
                {mapStatus === "LIVE"
                  ? "위치 기준 14:32"
                  : mapStatus === "LOADING"
                    ? "지도 불러오는 중"
                    : "위치 기준 14:32 · Fallback"}
              </span>
            </div>
            <div className="onepage-map-legend" aria-label="지도 상태 범례">
              <span><i className="legend-breach" /> 긴급 3</span>
              <span><i className="legend-support" /> 지원 6</span>
              <span><i className="legend-caution" /> 주의 7</span>
              <span><i className="legend-stable" /> 안정 4</span>
            </div>
          </div>
          <div className={`onepage-map-canvas ${mapStatus === "LIVE" ? "has-kakao-map" : ""}`}>
            <DashboardKakaoMap
              selectedId={selectedId}
              onSelect={(id) => selectCourier(id, true)}
              onStatus={setMapStatus}
            />
            {mapStatus !== "LIVE" ? (
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
                <span className="onepage-district label-yeoksam">역삼</span>
                <span className="onepage-district label-daechi">대치</span>
                <span className="onepage-district label-dogok">도곡</span>
                <span className="onepage-hub" aria-label="강남 허브 위치">
                  <span className="onepage-hub-icon" aria-hidden="true" />
                  <strong>강남 허브</strong>
                </span>

                {couriers
                  .filter((courier) => !clusteredIds.has(courier.id))
                  .map((courier) => (
                    <MapMarker
                      key={courier.id}
                      courier={courier}
                      photoIndex={couriers.findIndex((item) => item.id === courier.id)}
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
                      <small>{priority.budget.toFixed(0)}</small>
                    </button>
                  );
                })}

                {selectedIsClustered ? (
                  <MapMarker
                    courier={selectedCourier}
                    photoIndex={selectedIndex}
                    selected
                    onSelect={() => selectCourier(selectedCourier.id, true)}
                  />
                ) : null}
              </>
            ) : null}

            <div className="onepage-selected-strip" aria-live="polite">
              <span className={`onepage-selected-state state-${supportState(selectedCourier.budget).toLowerCase()}`}>
                {stateLabel[supportState(selectedCourier.budget)]}
              </span>
              <strong>{selectedCourier.name}</strong>
              <span>{selectedCourier.area}</span>
              <b>{selectedCourier.budget.toFixed(1)}</b>
              <span>{selectedCourier.completed}/{selectedCourier.total}</span>
            </div>
          </div>
        </div>

        <aside className="onepage-support-panel" aria-labelledby="support-panel-title">
          <header>
            <div>
              <small>선택 기사</small>
              <h2 id="support-panel-title">지원 검토</h2>
            </div>
            <span>검토 {urgentCouriers.length}명</span>
          </header>

          <div className="onepage-support-focus" aria-live="polite">
            <div className="onepage-support-person">
              <span
                className="onepage-support-photo"
                aria-hidden="true"
                style={{
                  backgroundPosition: `${(selectedIndex % 5) * 25}% ${Math.floor(selectedIndex / 5) * (100 / 3)}%`,
                }}
              />
              <div>
                <strong>{selectedCourier.name}</strong>
                <span>{selectedCourier.area}</span>
              </div>
              <em className={`state-${supportState(selectedCourier.budget).toLowerCase()}`}>
                {stateLabel[supportState(selectedCourier.budget)]}
              </em>
            </div>
            <div className="onepage-support-metrics">
              <div>
                <small>안전여유</small>
                <b>{selectedCourier.budget.toFixed(1)}</b>
              </div>
              <div>
                <small>안전한계</small>
                <strong>
                  {selectedCourier.criticalMinute === null
                    ? "예상 없음"
                    : selectedCourier.criticalMinute === 0
                      ? "한계 초과"
                      : `+${selectedCourier.criticalMinute}분`}
                </strong>
              </div>
            </div>
            <p>
              {selectedDangerSignal
                ? `기사앱 위험 신호 · ${selectedDangerSignal.receivedAt}${appliedPlans[selectedCourier.id] ? ` · 적용됨 · ${appliedPlans[selectedCourier.id]}` : ""}`
                : appliedPlans[selectedCourier.id]
                  ? `적용됨 · ${appliedPlans[selectedCourier.id]}`
                  : "승인 전까지 현재 계획 유지"}
              <span>{selectedCourier.completed}/{selectedCourier.total} 완료</span>
            </p>
            <button
              type="button"
              className="onepage-open-intervention"
              onClick={() => setInterventionOpen(true)}
            >
              지원안 검토
            </button>
          </div>

          <div className="onepage-support-queue">
            <div className="onepage-support-queue-title">
              <strong>지원 필요</strong>
              <small>지원 기준 45 미만</small>
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
                    <b>{courier.budget.toFixed(1)}</b>
                    <small>
                      {courier.criticalMinute === 0
                        ? "지금"
                        : `+${courier.criticalMinute}분`}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>
      {interventionOpen ? (
        <InterventionDialog
          key={selectedCourier.id}
          courier={selectedCourier}
          onClose={closeIntervention}
          onApplied={recordAppliedPlan}
        />
      ) : null}
    </main>
  );
}
