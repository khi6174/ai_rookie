import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  DecisionSpatialScene,
  ExplanationResult,
  InterventionCandidate,
  MapSelection,
  MultiRegionMapFixture,
} from "../domain/contracts";
import { publishDemoRiderDangerSignal } from "../application/demoRiderDangerSignal";
import {
  applyMapMovementFrame,
  createMapMovementTimeline,
  createMultiRegionMapFixture,
} from "../adapters/fixtures";
import {
  createDecisionSpatialScene,
  createFixtureMapAdapter,
  createKakaoMapDemoDirectionsUrl,
  createRiderCompactMapModel,
  fetchKakaoDirectionsPreview,
  KakaoDirectionsClientError,
  validateSpatialSceneAgainstMapModel,
  type KakaoDirectionsFallbackCode,
  type KakaoDirectionsPreview,
  type MapAdapter,
  type MapRenderModel,
  type RiderCompactMapModel,
} from "../adapters/maps";
import {
  loadKakaoMapsSdk,
  type KakaoMapInstance,
  type KakaoMapOverlay,
  type KakaoMapsNamespace,
} from "../adapters/maps/kakao";
import {
  clearCachedApprovedDemoPlan,
  createCachedApprovedDemoPlan,
  readCachedApprovedDemoPlan,
  writeCachedApprovedDemoPlan,
  type CachedApprovedDemoPlanState,
} from "../pwa/approvedPlanCache";
import { usePwaRuntime, type PwaInstallStatus } from "../pwa/usePwaRuntime";
import {
  approveAndApplyDemo,
  consentStatusFor,
  createInitialDemoSession,
  createResetDemoDecisionId,
  decisionStatusLabels,
  demoBaselineSnapshot,
  demoCandidates,
  demoEvaluations,
  demoFixture,
  demoRecipientCourierId,
  demoRecommendedCandidate,
  demoRecommendedEvaluation,
  demoSourceCourierId,
  demoTransfer12Evaluation,
  demoWeatherRuntime,
  holdDemoDecision,
  requestDemoModification,
  respondToDemo,
  type DemoSession,
} from "./demoSession";
import {
  demoAdminExplanationInput,
  generateDemoAdminExplanation,
} from "./demoExplanation";

type Role = "ADMIN" | "SOURCE" | "RECIPIENT";
type RiderTab = "ROUTE" | "SUPPORT" | "PROFILE";
type AppProps = {
  initialSession?: DemoSession;
  initialExplanation?: ExplanationResult;
  stageMode?: boolean;
  initialRole?: Role;
  initialRiderEntry?: boolean;
};

const formatBudget = (value: number) => value.toFixed(1);

const confidenceLabels = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
} as const;

const demoConfidence = `${demoBaselineSnapshot.confidenceScore} · ${confidenceLabels[demoBaselineSnapshot.confidence]}`;
const riderDemoClockMinutes = 10 * 60 + 21;

const displayOperationalLabel = (label: string) => label.replace(/합성\s*/g, "");
const formatRiderClock = (totalMinutes: number) => {
  const dayMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(dayMinutes / 60);
  const minute = dayMinutes % 60;
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;
  return `${period} ${hour12}:${String(minute).padStart(2, "0")}`;
};

function candidateLabel(candidate: InterventionCandidate) {
  const types = candidate.actions.map((action) => action.type);
  if (types.includes("REST") && types.includes("TRANSFER_STOPS")) {
    return "10분 휴식 + 8건 이관";
  }
  if (types.includes("TRANSFER_STOPS")) {
    const transfer = candidate.actions.find(
      (action) => action.type === "TRANSFER_STOPS",
    );
    return `${transfer?.type === "TRANSFER_STOPS" ? transfer.stopIds.length : 0}건 이관`;
  }
  if (types.includes("REST")) return "10분 휴식";
  return "계획 조정안";
}

function consentLabel(status: ReturnType<typeof consentStatusFor>) {
  if (status === "CONSENTED") return "동의 완료";
  if (status === "MODIFICATION_REQUESTED") return "수정 요청";
  if (status === "DECLINED") return "다른 대안 필요";
  if (status === "EXPIRED") return "재검토 필요";
  if (status === "PENDING") return "검토 중";
  return "검토 요청 전";
}

function RoleSwitcher({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div className="role-switcher" role="tablist" aria-label="화면 역할 전환">
      {[
        ["ADMIN", "관리자"],
        ["SOURCE", "원 기사"],
        ["RECIPIENT", "수신 기사"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={role === value}
          className={role === value ? "is-active" : undefined}
          onClick={() => onChange(value as Role)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function RiderRoleMenu({ role, onChange }: { role: Exclude<Role, "ADMIN">; onChange: (role: Role) => void }) {
  const riderName = role === "SOURCE" ? "강태현" : "채우진";
  return (
    <details className="rider-role-menu">
      <summary aria-label={`${riderName} 기사 화면 전환`}>
        <span>{riderName}</span>
        <small>기사</small>
      </summary>
      <RoleSwitcher role={role} onChange={onChange} />
    </details>
  );
}

function DemoFlowSteps({ session }: { session: DemoSession }) {
  const status = session.decision.status;
  const currentStep = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(status)
    ? 4
    : status === "ADMIN_APPROVAL_REQUIRED" || status === "ADMIN_HELD"
      ? 3
      : status === "RIDER_RESPONSE_PENDING"
        ? 2
        : 1;

  return (
    <ol className="demo-flow-steps" aria-label="의사결정 진행 단계">
      {["판단", "기사 검토", "관리자 승인", "계획 적용"].map((label, index) => {
        const step = index + 1;
        return (
          <li key={label} className={step < currentStep ? "is-done" : step === currentStep ? "is-current" : undefined}>
            <span aria-hidden="true">{step < currentStep ? "✓" : step}</span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function MobileStatusBar() {
  return (
    <div className="mobile-status-bar" aria-hidden="true">
      <span>{formatRiderClock(riderDemoClockMinutes).replace(/^(오전|오후) /, "")}</span>
      <span className="mobile-device-status">
        <span className="mobile-signal"><i /><i /><i /><i /></span>
        <b>5G</b>
        <span className="mobile-battery"><i /></span>
      </span>
    </div>
  );
}

function AppHeader({
  role,
  session,
  onRoleChange,
  onReset,
}: {
  role: Role;
  session: DemoSession;
  onRoleChange: (role: Role) => void;
  onReset: () => void;
}) {
  return (
    <header className={`app-header ${role === "ADMIN" ? "is-admin" : "is-rider"}`}>
      <div className="brand-lockup" aria-label="SafeRoute AI">
        <span className="brand-mark" aria-hidden="true">SR</span>
        <span>
          <strong>SafeRoute</strong>
          <small>{role === "ADMIN" ? "운영 안전 관제" : "기사 안전배송"}</small>
        </span>
      </div>
      {role === "ADMIN" && <DemoFlowSteps session={session} />}
      {role === "ADMIN"
        ? <RoleSwitcher role={role} onChange={onRoleChange} />
        : <RiderRoleMenu role={role} onChange={onRoleChange} />}
      <div className="header-actions">
        <span className="mode-badge"><span aria-hidden="true">◇</span><span className="mode-label-full">시연 데이터</span><span className="mode-label-short">시연 데이터</span></span>
        <button type="button" className="button button-quiet button-small" onClick={onReset}>
          초기화
        </button>
      </div>
    </header>
  );
}

function StatusPill({ session }: { session: DemoSession }) {
  const status = session.decision.status;
  const tone = status === "NOTICE_RECORDED"
    ? "success"
    : status.includes("MODIFICATION") || status === "ADMIN_HELD"
      ? "info"
      : status === "RIDER_DECLINED"
        ? "neutral"
        : "pending";
  return <span className={`status-pill status-${tone}`}>{decisionStatusLabels[status]}</span>;
}

function AdminNavigation() {
  return (
    <nav className="admin-nav" aria-label="관리자 주요 메뉴">
      <div className="admin-nav-brand" aria-label="SafeRoute AI">
        <span aria-hidden="true">SR</span>
        <div><strong>SafeRoute AI</strong><small>운영 안전 코파일럿</small></div>
      </div>
      <strong className="nav-title">Control<br />Tower</strong>
      <a className="nav-item is-current" href="#control-tower" aria-current="page">
        <span aria-hidden="true">01</span><span>지원 상황</span>
      </a>
      {[
        ["02", "경로"],
        ["03", "개입 검토"],
      ].map(([label, meta]) => (
        <a className="nav-item" href={label === "02" ? "#route-decision" : "#comparison-heading"} key={label}>
          <span aria-hidden="true">{label}</span><span>{meta}</span>
        </a>
      ))}
      <a className="nav-item" href="#audit"><span aria-hidden="true">04</span><span>감사기록</span></a>
    </nav>
  );
}

const mapSupportLabels = {
  OPERATING: "운행 중",
  SUPPORT_NEEDED: "지원 필요",
  CONSENT_PENDING: "기사 검토",
  APPROVAL_PENDING: "승인 대기",
  APPLIED: "계획 적용",
  OFFLINE: "오프라인",
} as const;

const mapPanLimit = { x: 160, y: 110 } as const;

function clampMapPan(value: number, axis: keyof typeof mapPanLimit) {
  return Math.max(-mapPanLimit[axis], Math.min(mapPanLimit[axis], value));
}

type KakaoMapStatus = "LOADING" | "READY" | "ERROR";

const formatMovementTime = (seconds: number) =>
  `00:${String(seconds).padStart(2, "0")}`;

function DecisionSpatialScenePanel({
  applied,
  scene,
}: {
  applied: boolean;
  scene: DecisionSpatialScene;
}) {
  const elevations = scene.samples.map((sample) => sample.elevationMeters);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const elevationSpan = Math.max(maxElevation - minElevation, 1);
  const maxDistance = scene.samples.at(-1)?.distanceFromStartMeters ?? 1;
  const points = scene.samples.map((sample) => ({
    x: 58 + (sample.distanceFromStartMeters / maxDistance) * 604,
    y:
      238 -
      ((sample.elevationMeters - minElevation) / elevationSpan) *
        116 *
        scene.verticalExaggeration,
  }));
  const terrainPoints = [
    ...points.map((point) => `${point.x},${point.y + 18}`),
    "662,278",
    "58,278",
  ].join(" ");
  const routePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const riskRoutePoints = points
    .slice(1)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const facts = scene.decisionFacts;
  const segmentLabels = ["현재", "휴식", "경사 노출", String(facts.breachStopOrdinal)];

  return (
    <div
      className="spatial-scene-shell"
      role="group"
      aria-labelledby="spatial-scene-heading"
      data-spatial-scene
      data-decision-id={scene.decisionId}
      data-plan-id={scene.planId}
      data-route-id={scene.routeId}
    >
      <div className="spatial-scene-copy">
        <div>
          <p className="section-kicker">왜 이 조치인가 · 보조 상세</p>
          <h3 id="spatial-scene-heading">휴식 뒤 경사 구간을 지나기 전에 지원합니다</h3>
        </div>
        <div className="spatial-scene-badges" aria-label="공간 장면 데이터 상태">
          <span>경사 근거</span>
          <span>연결 기사 0명</span>
          <span>세로 {scene.verticalExaggeration}배 · 참고 고도</span>
        </div>
      </div>
      <div className="spatial-scene-grid">
        <figure className="spatial-profile" aria-describedby="spatial-profile-caption">
          <svg viewBox="0 0 720 300" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="spatial-terrain-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#dfe9ff" />
                <stop offset="1" stopColor="#f7f9ff" />
              </linearGradient>
              <pattern id="spatial-risk-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <rect width="8" height="8" fill="#fff6dd" />
                <rect width="3" height="8" fill="#f0a000" />
              </pattern>
            </defs>
            <polygon points={terrainPoints} className="spatial-terrain" />
            <polyline points={routePoints} className="spatial-route-shadow" />
            <polyline points={routePoints} className="spatial-route-line" />
            <polyline
              points={riskRoutePoints}
              className="spatial-risk-segment"
            />
            {points.map((point, index) => (
              <g key={scene.samples[index].routePointId} className={`spatial-point is-${scene.samples[index].segmentKind.toLowerCase()}`}>
                <circle cx={point.x} cy={point.y} r="13" />
                <text x={point.x} y={point.y + 4} textAnchor="middle">{segmentLabels[index]}</text>
                <text className="spatial-elevation-label" x={point.x} y={point.y - 22} textAnchor="middle">
                  {scene.samples[index].elevationMeters}m · {scene.samples[index].slopePercent}%
                </text>
              </g>
            ))}
          </svg>
          <figcaption id="spatial-profile-caption">
            <strong>순서 결론: 10분 휴식이 예상 초과보다 먼저입니다.</strong>
            <span>현재 → 휴식 → 경사 노출 → 17번째 배송지 전 지원. 높이는 위험점수가 아닙니다.</span>
          </figcaption>
        </figure>
        <div className="spatial-facts" aria-label="2.5D 장면의 구조화 수치 대안">
          <div className="spatial-decision-question">
            <span>예상 지원 지점</span>
            <strong>{facts.timeToBreachMinutes}분 후 · {facts.breachStopOrdinal}번째 배송지 전</strong>
            <small>먼저 10분 휴식 → 휴식 뒤 경사 노출 → 예상 초과</small>
          </div>
          <dl>
            <div><dt>현재 계획 최소</dt><dd>{formatBudget(facts.baselineMinimumBudget)}</dd></div>
            <div><dt>{applied ? "적용 계획 최소" : "추천안 적용 후"}</dt><dd>{formatBudget(facts.adjustedMinimumBudget)}</dd></div>
            <div><dt>지원 조치</dt><dd>{facts.restMinutes}분 휴식 + {facts.transferStopCount}건 이관</dd></div>
            <div><dt>ETA 변화</dt><dd>+{facts.etaChangeMinutes}분 · 안전 하드 제약 통과</dd></div>
            <div className="spatial-impact-fact"><dt>지원받는 기사</dt><dd>8건 감소 · 안전여유 회복</dd></div>
            <div className="spatial-impact-fact"><dt>배송을 나눠 맡는 기사</dt><dd>8건 추가 · 기준 45 통과</dd></div>
          </dl>
          <code>Decision ID · {scene.decisionId}</code>
          <p>양측 기사 모두 안전기준을 통과한 같은 결정입니다.</p>
        </div>
      </div>
    </div>
  );
}

function KakaoControlMap({
  applied,
  javaScriptKey,
  model,
  resetVersion,
  onSelectionChange,
  onSelectDecision,
  onStatusChange,
}: {
  applied: boolean;
  javaScriptKey: string;
  model: MapRenderModel;
  resetVersion: number;
  onSelectionChange: (selection: MapSelection) => void;
  onSelectDecision: (decisionId: string) => void;
  onStatusChange: (status: KakaoMapStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const mapsRef = useRef<KakaoMapsNamespace | null>(null);
  const overlaysRef = useRef<KakaoMapOverlay[]>([]);
  const [status, setStatus] = useState<KakaoMapStatus>("LOADING");

  useEffect(() => {
    let active = true;
    setStatus("LOADING");
    onStatusChange("LOADING");
    loadKakaoMapsSdk(javaScriptKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;
        mapsRef.current = maps;
        mapRef.current = new maps.Map(containerRef.current, {
          center: new maps.LatLng(37.535, 126.96),
          level: 8,
        });
        setStatus("READY");
        onStatusChange("READY");
      })
      .catch(() => {
        if (!active) return;
        setStatus("ERROR");
        onStatusChange("ERROR");
      });
    return () => {
      active = false;
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
      mapsRef.current = null;
    };
  }, [javaScriptKey, onStatusChange]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (status !== "READY" || !map || !maps) return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    const bounds = new maps.LatLngBounds();
    let pointCount = 0;
    const toLatLng = (point: { latitude: number; longitude: number }) => {
      const latLng = new maps.LatLng(point.latitude, point.longitude);
      bounds.extend(latLng);
      pointCount += 1;
      return latLng;
    };
    const addOverlay = (overlay: KakaoMapOverlay) => {
      overlaysRef.current.push(overlay);
    };

    model.routes.forEach((route) => {
      addOverlay(new maps.Polyline({
        map,
        path: route.geographicPoints.map(toLatLng),
        strokeWeight: route.selected ? 6 : 3,
        strokeColor: applied && route.selected ? "#087334" : route.selected ? "#0628C7" : "#6680A6",
        strokeOpacity: route.selected ? 0.95 : 0.62,
        strokeStyle: "solid",
        zIndex: route.selected ? 4 : 2,
      }));
    });

    model.regions.forEach((region) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "kakao-region-cluster";
      button.setAttribute(
        "aria-label",
        `${displayOperationalLabel(region.label)}, 기사 ${region.courierCount}명, 지원 decision ${region.supportDecisionCount}건`,
      );
      const count = document.createElement("span");
      count.textContent = String(region.supportDecisionCount);
      const label = document.createElement("strong");
      label.textContent = displayOperationalLabel(region.label);
      const detail = document.createElement("small");
      detail.textContent = `기사 ${region.courierCount} · stale/offline ${region.staleOrOfflineCount}`;
      button.append(count, label, detail);
      button.addEventListener("click", () => onSelectionChange({ regionId: region.regionId }));
      addOverlay(new maps.CustomOverlay({
        map,
        position: toLatLng(region.geographicPoint),
        content: button,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 5,
      }));
    });

    model.hubs.forEach((hub) => {
      const node = document.createElement("div");
      node.className = "kakao-hub-marker";
      node.textContent = `${hub.courierCount}명`;
      node.setAttribute("aria-label", `${displayOperationalLabel(hub.label)}, 기사 ${hub.courierCount}명`);
      addOverlay(new maps.CustomOverlay({
        map,
        position: toLatLng(hub.geographicPoint),
        content: node,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 3,
      }));
    });

    model.couriers.forEach((courier) => {
      if (!courier.geographicPoint) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `kakao-courier-marker status-${courier.supportStatus.toLowerCase()} ${courier.positionStatus === "STALE" ? "is-stale" : ""}`;
      button.textContent = courier.positionStatus === "STALE"
        ? "!"
        : courier.supportStatus === "OPERATING" ? "·" : "◆";
      button.setAttribute(
        "aria-label",
        `${courier.courierId.slice(-10)}, ${mapSupportLabels[courier.supportStatus]}, 위치 ${courier.positionStatus}`,
      );
      button.setAttribute("aria-pressed", String(model.selection.courierId === courier.courierId));
      button.addEventListener("click", () => courier.decisionId
        ? onSelectDecision(courier.decisionId)
        : onSelectionChange({ regionId: courier.regionId, courierId: courier.courierId }));
      addOverlay(new maps.CustomOverlay({
        map,
        position: toLatLng(courier.geographicPoint),
        content: button,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: model.selection.courierId === courier.courierId ? 8 : 6,
      }));
    });

    map.relayout();
    if (pointCount > 0) map.setBounds(bounds, 70, 70, 70, 70);
  }, [applied, model, onSelectDecision, onSelectionChange, resetVersion, status]);

  return (
    <>
      <div
        ref={containerRef}
        className="kakao-map-layer"
        data-kakao-map
        role="group"
        aria-label="카카오 지도 위에 표시한 기사와 경로"
      />
      {status === "LOADING" && <div className="kakao-map-loading" role="status">카카오 지도를 불러오는 중입니다.</div>}
    </>
  );
}

function MultiRegionControlMap({
  applied,
  fixture,
  adapter,
  selection,
  mapAvailable,
  onMapAvailabilityChange,
  onSelectionChange,
  movement,
  spatialScene,
}: {
  applied: boolean;
  fixture: MultiRegionMapFixture;
  adapter: MapAdapter;
  selection: MapSelection;
  mapAvailable: boolean;
  onMapAvailabilityChange: (available: boolean) => void;
  onSelectionChange: (selection: MapSelection) => void;
  movement: {
    frameIndex: number;
    frameCount: number;
    elapsedSeconds: number;
    durationSeconds: number;
    intervalSeconds: number;
    playing: boolean;
    connectionState: "NORMAL" | "DISCONNECTED" | "RECOVERED";
    onToggle: () => void;
    onNext: () => void;
    onReset: () => void;
  };
  spatialScene: DecisionSpatialScene;
}) {
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isMapPanning, setIsMapPanning] = useState(false);
  const kakaoJavaScriptKey = import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? "";
  const kakaoRequested = Boolean(kakaoJavaScriptKey) && import.meta.env.VITE_KAKAO_MAP_ENABLED !== "false";
  const [kakaoMapStatus, setKakaoMapStatus] = useState<KakaoMapStatus>("LOADING");
  const [kakaoResetVersion, setKakaoResetVersion] = useState(0);
  const [spatialMode, setSpatialMode] = useState<"TWO_D" | "DEMO_TWO_POINT_FIVE_D">("TWO_D");
  const kakaoReady = kakaoRequested && kakaoMapStatus === "READY";
  const kakaoFailed = kakaoRequested && kakaoMapStatus === "ERROR";
  const mapDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const model = adapter.getModel(selection);
  const spatialValidation = validateSpatialSceneAgainstMapModel(spatialScene, model);
  const spatialAvailable = spatialValidation.valid;
  const spatialActive = spatialMode === "DEMO_TWO_POINT_FIVE_D" && spatialAvailable;
  useEffect(() => {
    if (!mapAvailable || !spatialAvailable) setSpatialMode("TWO_D");
  }, [mapAvailable, spatialAvailable]);
  const selectedRegion = model.selection.regionId
    ? fixture.regions.find((region) => region.regionId === model.selection.regionId)
    : undefined;
  const selectedCourier = model.selection.courierId
    ? fixture.couriers.find(
        (courier) => courier.courierId === model.selection.courierId,
      )
    : undefined;
  const title = model.scope === "NATIONAL"
    ? "3개 권역의 지원 필요 상황"
    : model.scope === "REGION"
      ? `${selectedRegion ? displayOperationalLabel(selectedRegion.label) : "선택 권역"}의 기사와 경로`
      : "선택한 지원 decision과 계획 경로";
  const movementAtEnd = movement.frameIndex === movement.frameCount - 1;
  const movementStatus = movement.connectionState === "DISCONNECTED"
    ? "기사 1명 연결 끊김"
    : movement.connectionState === "RECOVERED"
      ? "연결 복구"
      : movement.frameIndex === 0
        ? "재생 대기"
        : "위치 정보 수신";
  const selectDecision = (decisionId: string) => {
    onSelectionChange(adapter.selectionForDecision(decisionId));
  };
  const resetMapPan = () => setMapPan({ x: 0, y: 0 });
  const handleMapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest("button, a, summary, [data-map-overlay], [data-kakao-map]")) return;
    mapDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapPan.x,
      originY: mapPan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsMapPanning(true);
  };
  const handleMapPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = mapDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setMapPan({
      x: clampMapPan(drag.originX + event.clientX - drag.startX, "x"),
      y: clampMapPan(drag.originY + event.clientY - drag.startY, "y"),
    });
  };
  const stopMapPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mapDrag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    mapDrag.current = null;
    setIsMapPanning(false);
  };
  const handleMapKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const movement = 24;
    if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      resetMapPan();
      return;
    }
    const delta = event.key === "ArrowLeft"
      ? { x: -movement, y: 0 }
      : event.key === "ArrowRight"
        ? { x: movement, y: 0 }
        : event.key === "ArrowUp"
          ? { x: 0, y: -movement }
          : event.key === "ArrowDown"
            ? { x: 0, y: movement }
            : null;
    if (!delta) return;
    event.preventDefault();
    setMapPan((current) => ({
      x: clampMapPan(current.x + delta.x, "x"),
      y: clampMapPan(current.y + delta.y, "y"),
    }));
  };
  const structuredAlternative = (
    <div className="map-structured-content">
      <p className="map-structured-status">
        현재 범위 · <strong>{title}</strong>
      </p>
      {model.scope === "NATIONAL" ? (
        <ul className="map-region-list" aria-label="권역 목록">
          {model.regions.map((region) => (
            <li key={region.regionId}>
              <div>
                <strong>{displayOperationalLabel(region.label)}</strong>
                <span>기사 {region.courierCount}명 · 지원 decision {region.supportDecisionCount}건 · stale/offline {region.staleOrOfflineCount}명</span>
              </div>
              <button type="button" onClick={() => onSelectionChange({ regionId: region.regionId })}>
                {displayOperationalLabel(region.label)} 목록 보기
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="map-courier-list" aria-label={`${selectedRegion ? displayOperationalLabel(selectedRegion.label) : "선택 권역"} 기사와 위치 상태 목록`}>
          {model.couriers.map((courier) => (
            <li key={courier.courierId} className={model.selection.courierId === courier.courierId ? "is-selected" : undefined}>
              <div>
                <strong>{courier.courierId.slice(-10)}</strong>
                <span>{mapSupportLabels[courier.supportStatus]} · 위치 {courier.positionStatus}</span>
              </div>
              <button
                type="button"
                aria-pressed={model.selection.courierId === courier.courierId}
                onClick={() => courier.decisionId
                  ? selectDecision(courier.decisionId)
                  : onSelectionChange({ regionId: courier.regionId, courierId: courier.courierId })}
              >
                {courier.decisionId ? `${courier.courierId.slice(-10)} decision 선택` : `${courier.courierId.slice(-10)} 경로 선택`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {model.selectedDecision && (
        <div className="map-route-order" aria-labelledby="map-route-order-heading">
          <h3 id="map-route-order-heading">지도 없이 확인하는 배송순서와 지원 조치</h3>
          <ol>
            <li><span>현재 계획</span><strong>14번째 배송지 예정</strong></li>
            <li><span>예상 지원 시점</span><strong>약 52분 후 · 17번째 배송지 전</strong></li>
            <li><span>추천 조치</span><strong>10분 휴식 + 배송지 8건 이관</strong></li>
            <li><span>{applied ? "적용 결과" : "승인 후 계획"}</span><strong>{applied ? "원 기사 9건 · 수신 기사 추가 8건" : "기사 동의와 관리자 승인 전에는 변경 없음"}</strong></li>
          </ol>
          <code>Decision ID · {model.selectedDecision.decisionId}</code>
        </div>
      )}
    </div>
  );

  return (
    <section
      className="panel route-panel linked-decision"
      id="route-decision"
      tabIndex={-1}
      aria-labelledby="route-heading"
      data-map-total-couriers={model.featureBudget.totalCouriers}
      data-map-visible-couriers={model.featureBudget.visibleCouriers}
      data-map-rendered-routes={model.featureBudget.renderedRoutes}
    >
      <div className="panel-heading">
        <div>
          <p className="section-kicker">다지역 운영 · 기사 {fixture.couriers.length}명 · 허브 6개</p>
          <h2 id="route-heading">{title}</h2>
        </div>
        <div className="route-heading-meta">
          {model.scope === "DECISION" && (
            <button
              type="button"
              className="spatial-mode-toggle"
              aria-pressed={spatialActive}
              disabled={!spatialAvailable}
              onClick={() => setSpatialMode(spatialActive ? "TWO_D" : "DEMO_TWO_POINT_FIVE_D")}
            >
              {spatialActive ? "2D로 돌아가기" : spatialAvailable ? "경사 근거 자세히 보기 · 2.5D" : "2.5D 데이터 없음"}
            </button>
          )}
          <span className={`fallback-map-badge ${kakaoReady ? "is-live-map" : ""}`}>
            {kakaoReady ? "Kakao 지도 · 지원 경로" : kakaoFailed ? "Kakao 오류 · 기본 지도" : "기본 지도"}
          </span>
          <span className="legend"><i className="legend-current" /> 현재 계획 <i className="legend-adjusted" /> 적용 계획</span>
          <button
            type="button"
            className="map-error-toggle"
            aria-pressed={!mapAvailable}
            onClick={() => {
              setSpatialMode("TWO_D");
              onMapAvailabilityChange(!mapAvailable);
            }}
          >
            {mapAvailable ? "지도 오류 재현" : "지도 복구"}
          </button>
          <button
            type="button"
            className="map-pan-reset"
            disabled={spatialActive || (!kakaoReady && mapPan.x === 0 && mapPan.y === 0)}
            onClick={() => {
              if (kakaoReady) setKakaoResetVersion((version) => version + 1);
              else resetMapPan();
            }}
          >
            지도 중심 복원
          </button>
        </div>
      </div>
      <div className="map-movement-toolbar" aria-label="기사 이동 타임라인">
        <div className="map-movement-status">
          <span className={`movement-state is-${movement.connectionState.toLowerCase()}`}>이동 경로</span>
          <strong aria-live="polite">{formatMovementTime(movement.elapsedSeconds)} / {formatMovementTime(movement.durationSeconds)}</strong>
          <small>{movementStatus} · 연결 기사 0명</small>
        </div>
        <progress
          aria-label="이동 진행률"
          max={movement.durationSeconds}
          value={movement.elapsedSeconds}
        />
        <div className="map-movement-actions">
          <button
            type="button"
            className="button button-primary"
            aria-pressed={movement.playing}
            onClick={() => {
              if (!movement.playing && model.scope === "NATIONAL") {
                onSelectionChange({ regionId: fixture.regions[0].regionId });
              }
              movement.onToggle();
            }}
          >
            {movement.playing ? "이동 일시정지" : movementAtEnd ? "이동 다시 재생" : "이동 재생"}
          </button>
          <button type="button" className="button button-neutral" disabled={movementAtEnd} onClick={movement.onNext}>
            다음 {movement.intervalSeconds}초
          </button>
          <button type="button" className="button button-neutral" disabled={movement.frameIndex === 0} onClick={movement.onReset}>
            처음으로
          </button>
        </div>
      </div>
      {model.featureBudget.routesCapped && (
        <p className="map-feature-budget" role="status">
          성능 보호 · 기사 {model.featureBudget.visibleCouriers}명 중 경로 {model.featureBudget.renderedRoutes}/{model.featureBudget.totalRoutes}개 표시 · 기사 선택 시 상세 경로 제공
        </p>
      )}
      <nav className="map-breadcrumb" aria-label="지도 탐색 위치">
        <button
          type="button"
          className={model.scope === "NATIONAL" ? "is-current" : undefined}
          aria-current={model.scope === "NATIONAL" ? "page" : undefined}
          onClick={() => onSelectionChange(adapter.resetSelection())}
        >
          전체 권역
        </button>
        {selectedRegion && (
          <>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              className={model.scope === "REGION" ? "is-current" : undefined}
              aria-current={model.scope === "REGION" ? "page" : undefined}
              onClick={() => onSelectionChange({ regionId: selectedRegion.regionId })}
            >
              {displayOperationalLabel(selectedRegion.label)}
            </button>
          </>
        )}
        {selectedCourier && (
          <><span aria-hidden="true">/</span><strong>{selectedCourier.courierId.slice(-10)}</strong></>
        )}
        <button type="button" className="map-reset-camera" onClick={() => {
          resetMapPan();
          setKakaoResetVersion((version) => version + 1);
          onSelectionChange(adapter.resetSelection());
        }}>전체 보기</button>
      </nav>
      <p className="sr-only" aria-live="polite">{mapAvailable ? title : `지도 오류 · 기본 지도 · ${title}`}</p>
      {mapAvailable && spatialActive ? (
        <DecisionSpatialScenePanel applied={applied} scene={spatialScene} />
      ) : mapAvailable ? <div
        className={`control-map-canvas scope-${model.scope.toLowerCase()} ${isMapPanning ? "is-panning" : ""} ${kakaoReady ? "is-kakao" : ""}`}
        role="group"
        tabIndex={0}
        aria-label="지도 이동 영역"
        aria-describedby="map-pan-instructions"
        style={{
          "--map-pan-x": `${mapPan.x}px`,
          "--map-pan-y": `${mapPan.y}px`,
        } as CSSProperties}
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={stopMapPointer}
        onPointerCancel={stopMapPointer}
        onLostPointerCapture={() => {
          mapDrag.current = null;
          setIsMapPanning(false);
        }}
        onKeyDown={handleMapKeyDown}
      >
        <p id="map-pan-instructions" className="sr-only">{kakaoReady ? "카카오 지도는 포인터로 이동·확대할 수 있습니다. 지도 없이 보기에서도 같은 decision을 선택할 수 있습니다." : "빈 지도 영역을 드래그하거나 방향키로 이동합니다. Home 또는 숫자 0 키로 중심을 복원합니다."}</p>
        {kakaoRequested && kakaoMapStatus !== "ERROR" && (
          <KakaoControlMap
            applied={applied}
            javaScriptKey={kakaoJavaScriptKey}
            model={model}
            resetVersion={kakaoResetVersion}
            onSelectionChange={onSelectionChange}
            onSelectDecision={selectDecision}
            onStatusChange={setKakaoMapStatus}
          />
        )}
        <div
          className="control-map-pan-surface"
          data-pan-x={Math.round(mapPan.x)}
          data-pan-y={Math.round(mapPan.y)}
        >
          <div className="control-map-pan-background" aria-hidden="true" />
          <svg
            className="control-map-svg"
            viewBox="0 0 100 100"
            role="img"
            aria-label={model.scope === "NATIONAL"
              ? "3개 권역과 권역별 기사 8명, 지원 decision 4건을 집계한 지도"
              : `${selectedRegion ? displayOperationalLabel(selectedRegion.label) : "선택 권역"}의 허브, 기사 위치 상태와 계획 경로 지도`}
          >
            <defs>
              <pattern id="map-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.25" />
              </pattern>
            </defs>
            <rect width="100" height="100" className="map-grid-fill" />
            {model.routes.map((route) => (
              <polyline
                key={route.routeId}
                className={`svg-route ${route.selected ? "is-selected" : ""} ${applied && route.selected ? "is-applied" : ""}`}
                points={route.points.map((point) => `${point.x},${point.y}`).join(" ")}
              />
            ))}
            {model.hubs.map((hub) => (
              <g key={hub.hubId} className="svg-hub" transform={`translate(${hub.point.x} ${hub.point.y})`}>
                <rect x="-2.5" y="-2.5" width="5" height="5" rx="1" />
                <text x="0" y="6.5" textAnchor="middle">{hub.courierCount}명</text>
              </g>
            ))}
          </svg>
          {model.scope === "NATIONAL" && model.regions.map((region) => (
            <button
              key={region.regionId}
              type="button"
              className="region-cluster"
              style={{ left: `${region.point.x}%`, top: `${region.point.y}%` }}
              aria-label={`${displayOperationalLabel(region.label)}, 기사 ${region.courierCount}명, 지원 decision ${region.supportDecisionCount}건`}
              onClick={() => onSelectionChange({ regionId: region.regionId })}
            >
              <span>{region.supportDecisionCount}</span>
              <strong>{displayOperationalLabel(region.label)}</strong>
              <small>기사 {region.courierCount} · stale/offline {region.staleOrOfflineCount}</small>
            </button>
          ))}
          {model.scope !== "NATIONAL" && model.couriers.map((courier) => courier.point && (
            <button
              key={courier.courierId}
              type="button"
              className={`courier-marker status-${courier.supportStatus.toLowerCase()} ${courier.positionStatus === "STALE" ? "is-stale" : ""}`}
              style={{ left: `${courier.point.x}%`, top: `${courier.point.y}%` }}
              aria-label={`${courier.courierId.slice(-10)}, ${mapSupportLabels[courier.supportStatus]}, 위치 ${courier.positionStatus}`}
              aria-pressed={model.selection.courierId === courier.courierId}
              onClick={() => courier.decisionId
                ? selectDecision(courier.decisionId)
                : onSelectionChange({ regionId: courier.regionId, courierId: courier.courierId })}
            >
              <span aria-hidden="true">{courier.positionStatus === "STALE" ? "!" : courier.supportStatus === "OPERATING" ? "·" : "◆"}</span>
            </button>
          ))}
        </div>
        <div className="map-data-mode" data-map-overlay><strong>경로 이동 · {formatMovementTime(movement.elapsedSeconds)}</strong><span>{kakaoReady ? "Kakao 지도 · " : "기본 지도 · "}연결 기사 0명</span></div>
        <span className="map-pan-hint" data-map-overlay>{kakaoReady ? "드래그·휠로 지도 이동" : "드래그·방향키로 지도 이동"}</span>
        <span className="sr-only" aria-live="polite">지도 이동 위치 가로 {Math.round(mapPan.x)}, 세로 {Math.round(mapPan.y)}</span>
        <div className={`map-active-decision ${applied ? "is-applied" : ""}`} data-map-overlay>
          <span>{applied ? "계획 적용 완료" : "현재 지원 큐 · 1건"}</span>
          <strong>{applied ? "예상 초과 해소" : "약 52분 후 · 17번째 배송지"}</strong>
          <small>{applied ? "원 기사 9건 · 수신 기사로 이관 8건" : "10분 휴식 + 8건 이관 검토"}</small>
          <button type="button" onClick={() => selectDecision(fixture.decisions[0].decisionId)}>
            지도에서 decision 보기
          </button>
        </div>
      </div> : (
        <div className="map-error-boundary" role="alert">
          <div className="map-error-message">
            <span aria-hidden="true">!</span>
            <div>
              <strong>지도를 불러오지 못했습니다.</strong>
              <p>빈 화면 대신 같은 지역·기사·배송순서 목록을 제공합니다. Safety 계산과 현재 결정은 변경되지 않았습니다.</p>
            </div>
          </div>
          {structuredAlternative}
        </div>
      )}
      {mapAvailable && (
        <details className="map-structured-alternative">
          <summary>지도 없이 배송순서·decision 보기</summary>
          {structuredAlternative}
        </details>
      )}
      <div className="map-status-strip" aria-label="선택 권역 위치 상태">
        <span><i className="status-dot is-current" />현재 위치 {model.scope === "NATIONAL" ? fixture.couriers.filter((courier) => courier.position.status === "CURRENT").length : model.couriers.filter((courier) => courier.positionStatus === "CURRENT").length}</span>
        <span><i className="status-dot is-stale" />stale {model.scope === "NATIONAL" ? fixture.couriers.filter((courier) => courier.position.status === "STALE").length : model.couriers.filter((courier) => courier.positionStatus === "STALE").length}</span>
        <span><i className="status-dot is-offline" />offline {model.scope === "NATIONAL" ? fixture.couriers.filter((courier) => courier.position.status === "OFFLINE").length : fixture.couriers.filter((courier) => courier.regionId === model.selection.regionId && courier.position.status === "OFFLINE").length}</span>
        <span className="map-privacy-note">저배율 개별 기사 위치 비공개</span>
      </div>
      <div className="timeline-summary">
        <div><span>현재 안전여유</span><strong>54.7</strong></div>
        <div><span>{applied ? "조정 전 계획 최소" : "현재 계획 최소"}</span><strong className={applied ? undefined : "text-red"}>29.9</strong></div>
        <div><span>{applied ? "적용 계획 최소" : "추천안 적용 후"}</span><strong className="text-teal">47.2</strong></div>
        <div><span>입력 신뢰도</span><strong>{demoConfidence}</strong></div>
      </div>
      <a className="decision-link" href="#support-queue">같은 결정을 지원 큐에서 보기 <span aria-hidden="true">→</span></a>
    </section>
  );
}

function InterventionQueue({
  session,
  onOpenApproval,
  onMapSelect,
}: {
  session: DemoSession;
  onOpenApproval: () => void;
  onMapSelect: () => void;
}) {
  const sourceStatus = consentStatusFor(session, demoSourceCourierId);
  const recipientStatus = consentStatusFor(session, demoRecipientCourierId);
  const approvalReady = session.decision.status === "ADMIN_APPROVAL_REQUIRED";
  const applied = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(session.decision.status);
  const sourceImpact = demoRecommendedEvaluation.courierImpacts.find(
    (impact) => impact.role === "SOURCE",
  )!;
  const recipientImpact = demoRecommendedEvaluation.courierImpacts.find(
    (impact) => impact.role === "RECIPIENT",
  )!;
  const sourceStopsBefore = demoFixture.workloads.find(
    (workload) => workload.courierId === demoSourceCourierId,
  )!.remainingStopIds.length;
  const sourceStopsAfter = sourceStopsBefore + sourceImpact.stopCountDelta;
  return (
    <aside className="panel intervention-queue linked-decision" id="support-queue" tabIndex={-1} aria-labelledby="queue-heading">
      <div className="panel-heading compact">
        <div>
          <p className="section-kicker">{applied ? "결정 완료 · 1건" : "결정 요청 · 1건"}</p>
          <h2 id="queue-heading">{applied ? "적용된 지원 계획" : "지금 필요한 결정"}</h2>
        </div>
        <StatusPill session={session} />
      </div>
      <article className={`support-card ${applied ? "is-applied" : ""}`}>
        <div className="support-urgency">{applied ? "계획 적용 완료" : "60분 안에 결정 필요"}</div>
        <h3>{applied ? "10분 휴식과 배송 8건 이관을 적용했습니다." : "약 52분 후 17번째 배송지 전에, 10분 휴식과 배송 8건 이관이 필요합니다."}</h3>
        <p className="decision-one-line">{applied
          ? "지원받는 기사의 안전여유가 회복되고, 배송을 나눠 맡는 기사도 안전기준을 통과했습니다."
          : "지원받는 기사는 안전여유가 회복되고, 배송을 나눠 맡는 기사는 8건 추가 후에도 안전기준을 통과합니다."}</p>
        <ol className="decision-sequence" aria-label="현재부터 지원 완료까지의 순서">
          <li><span>현재</span><strong>14번째 배송지 운행</strong></li>
          <li><span>먼저</span><strong>10분 휴식</strong></li>
          <li><span>그 다음</span><strong>휴식 뒤 경사 노출 구간</strong></li>
          <li><span>지원 마감</span><strong>약 52분 후 · 17번째 배송지 전</strong></li>
        </ol>
        <p className="decision-sequence-verdict"><strong>순서 결론</strong> 10분 휴식이 예상 초과보다 먼저입니다.</p>
      </article>
      <section className="decision-impact" aria-labelledby="decision-impact-heading">
        <div className="decision-impact-heading">
          <h3 id="decision-impact-heading">조정하면 무엇이 바뀌나요?</h3>
          <span>양쪽 기사 모두 안전 기준 확인</span>
        </div>
        <div className="decision-impact-grid">
          <article>
            <span>지원받는 기사 · 작업이 줄어듭니다</span>
            <strong>8건 줄고 안전여유가 회복됩니다</strong>
            <small>배송 {sourceStopsBefore} → {sourceStopsAfter}건 · 안전여유 {formatBudget(sourceImpact.baselineMinimumBudget)} → {formatBudget(sourceImpact.candidateMinimumBudget)}</small>
          </article>
          <article>
            <span>배송을 나눠 맡는 기사 · 8건을 받습니다</span>
            <strong>8건 추가 후에도 안전기준을 통과합니다</strong>
            <small>배송 {recipientImpact.stopCountDelta > 0 ? "+" : ""}{recipientImpact.stopCountDelta}건 · 안전여유 {formatBudget(recipientImpact.baselineMinimumBudget)} → {formatBudget(recipientImpact.candidateMinimumBudget)} · 기준 45 이상</small>
          </article>
        </div>
        <p className="decision-rationale"><strong>왜 이 조치인가?</strong> 연속작업·비·경사 노출을 줄이고, 12건 이관처럼 수신 기사 기준을 넘는 대안은 제외했습니다.</p>
      </section>
      <div className="consent-grid" aria-label="기사별 동의 상태">
        <div><span>지원받는 기사 · 작업 8건 감소</span><strong>{consentLabel(sourceStatus)}</strong></div>
        <div><span>배송을 나눠 맡는 기사 · 배송 8건 추가</span><strong>{consentLabel(recipientStatus)}</strong></div>
      </div>
      <button
        type="button"
        className="button button-primary button-block"
        disabled={!approvalReady || applied}
        onClick={onOpenApproval}
      >
        {applied ? "계획 적용 완료" : approvalReady ? "승인 검토" : "기사 동의 대기"}
      </button>
      {!approvalReady && !applied && (
        <p className="button-help">두 기사 모두 같은 조정안에 동의해야 승인할 수 있습니다.</p>
      )}
      <a className="decision-link queue-map-link" href="#route-decision" onClick={onMapSelect}>지도에서 같은 decision 보기 <span aria-hidden="true">→</span></a>
    </aside>
  );
}

function evaluationFor(candidate: InterventionCandidate) {
  return demoEvaluations.find((evaluation) => evaluation.candidateId === candidate.candidateId)!;
}

function ComparisonTable() {
  return (
    <section className="panel comparison-panel" aria-labelledby="comparison-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">전체 계획 재계산</p>
          <h2 id="comparison-heading">개입안 비교</h2>
        </div>
        <span className="meta-text">안전하지 않은 후보는 순위에서 제외</span>
      </div>
      <div className="table-wrap">
        <table>
          <caption>추천안과 대안의 안전여유, ETA, 수신 기사 영향 및 실행 가능성</caption>
          <thead>
            <tr><th scope="col">조정안</th><th scope="col">원 기사 최소</th><th scope="col">종료시각 영향</th><th scope="col">수신 기사 최소</th><th scope="col">결과</th></tr>
          </thead>
          <tbody>
            {demoCandidates.map((candidate) => {
              const evaluation = evaluationFor(candidate);
              const source = evaluation.courierImpacts.find((impact) => impact.role === "SOURCE");
              const recipient = evaluation.courierImpacts.find((impact) => impact.role === "RECIPIENT");
              const recommended = candidate.candidateId === demoRecommendedCandidate.candidateId;
              return (
                <tr key={candidate.candidateId} className={recommended ? "is-recommended" : undefined}>
                  <th scope="row">{candidateLabel(candidate)} {recommended && <span className="mini-badge">추천</span>}</th>
                  <td>{formatBudget(source?.candidateMinimumBudget ?? 0)}</td>
                  <td>{evaluation.etaDeltaMinutes > 0 ? "+" : ""}{evaluation.etaDeltaMinutes}분</td>
                  <td>{recipient ? formatBudget(recipient.candidateMinimumBudget) : "—"}</td>
                  <td>{evaluation.feasibility.status === "FEASIBLE"
                    ? <span className="result-safe">실행 가능</span>
                    : <span className="result-blocked">실행 불가 · 기준 45 미달</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="blocked-explanation">
        <strong><span aria-hidden="true">⊘</span> 12건 이관은 실행할 수 없습니다.</strong>
        <span>수신 기사의 최소 안전여유가 {formatBudget(demoTransfer12Evaluation.courierImpacts[1].candidateMinimumBudget)}로 내려가 기준 45를 충족하지 못합니다.</span>
      </div>
      <div className="intervention-coverage" aria-label="결정론적 개입 엔진 검증 범위">
        <span>엔진 검증 범위</span>
        <strong>휴식 · 물량이관 · 순서변경 · 안전경로 · Safe Delay</strong>
        <small>현재 장면은 이 계획에 적용 가능한 대표 후보만 비교합니다.</small>
      </div>
    </section>
  );
}

function AuditTimeline({ session }: { session: DemoSession }) {
  return (
    <section className="panel audit-panel" id="audit" aria-labelledby="audit-heading">
      <div className="panel-heading compact">
        <div><p className="section-kicker">불변 감사기록</p><h2 id="audit-heading">Decision timeline</h2></div>
        <code>{session.decision.decisionId}</code>
      </div>
      <ol>
        {session.decision.events.slice(-7).map((event) => (
          <li key={event.eventId}>
            <span className="audit-dot" aria-hidden="true" />
            <div><strong>{decisionStatusLabels[event.toStatus]}</strong><span>{event.actor === "COURIER" ? "기사" : event.actor === "ADMIN" ? "관리자" : "시스템"} · {new Date(event.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" })}</span></div>
          </li>
        ))}
      </ol>
      <div className="audit-data-boundary">
        <strong>날씨 입력 경계</strong>
        <span>외부 연동 증거 미사용 · 저장된 타임라인 사용</span>
        <code>{demoWeatherRuntime.active.fallbackReason.code}</code>
      </div>
    </section>
  );
}

const weatherFieldLabels = {
  snowfallCmPerHour: "현재 시간당 적설",
  visibilityMeters: "미래 120분 시정",
} as const;

function WeatherDataBoundary() {
  const evidence = demoWeatherRuntime.liveEvidence;
  return (
    <section
      className="weather-data-boundary"
      aria-labelledby="weather-boundary-heading"
    >
      <span className="weather-fallback-badge">연결 전</span>
      <div className="weather-boundary-copy">
        <strong id="weather-boundary-heading">Safety 계산은 현재 날씨 입력만 사용합니다.</strong>
        <span>기상청 표본은 별도로 검증하며 현재 계산 입력과 혼합하지 않습니다.</span>
      </div>
      <dl aria-label="기상청 날씨 적합성">
        <div>
          <dt>준비</dt>
          <dd>{evidence.readyFields.length}개 시간범위 필드</dd>
        </div>
        <div>
          <dt>차단</dt>
          <dd>{evidence.blockingFields.map((item) => weatherFieldLabels[item.field as keyof typeof weatherFieldLabels]).join(" · ")}</dd>
        </div>
      </dl>
      <code>{demoWeatherRuntime.active.fallbackReason.code}</code>
    </section>
  );
}

function ExplanationPanel({
  result,
  loading,
  onGenerate,
  onFallback,
}: {
  result: ExplanationResult | null;
  loading: boolean;
  onGenerate: () => void;
  onFallback: () => void;
}) {
  const citation = demoAdminExplanationInput.allowedCitations[0];
  return (
    <section className="panel explanation-panel" aria-labelledby="explanation-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">검증된 JSON → 역할별 문장</p>
          <h2 id="explanation-heading">Upstage 근거 설명</h2>
        </div>
        <span className={`explanation-status ${result?.status === "FALLBACK" ? "is-fallback" : ""}`}>
          {result?.status === "MOCK"
            ? "문구 생성 · 검증 통과"
            : result?.status === "FALLBACK"
              ? "기본 문구"
              : "설명 생성 전"}
        </span>
      </div>
      <div className="explanation-body">
        <div className="explanation-copy">
          {result ? (
            <>
              <span className="mode-badge">◇ 문구 생성 완료</span>
              <p>{result.data.summary}</p>
              {result.status === "FALLBACK" && (
                <div className="fallback-note" role="status">
                  설명 서비스 지연으로 검증된 템플릿을 사용했습니다. 수치·추천·적용 상태는 변경되지 않았습니다.
                  <code>{result.fallbackReason.code}</code>
                </div>
              )}
              <div className="citation-card">
                <span>인용 근거</span>
                <strong>{citation.documentTitle} · {citation.section}</strong>
                <q>{citation.excerpt}</q>
              </div>
            </>
          ) : (
            <p>적용된 결정 사실과 허용된 운영문서 인용만 사용해 관리자 메모를 생성합니다. 숫자나 추천은 다시 계산하지 않습니다.</p>
          )}
        </div>
        <div className="explanation-checks" aria-label="설명 검증 상태">
          <strong>출력 Gate</strong>
          <ul>
            <li><span aria-hidden="true">✓</span> strict JSON</li>
            <li><span aria-hidden="true">✓</span> 숫자 불변</li>
            <li><span aria-hidden="true">✓</span> 허용 인용만 사용</li>
            <li><span aria-hidden="true">✓</span> 추천·상태 권한 없음</li>
          </ul>
          <div className="explanation-actions">
            <button type="button" className="button button-primary" disabled={loading} onClick={onGenerate}>
              {loading ? "검증 중" : "설명 생성"}
            </button>
            <button type="button" className="button button-neutral" disabled={loading} onClick={onFallback}>
              오류 모사
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminDashboard({
  session,
  explanation,
  explanationLoading,
  stageMode,
  role,
  onRoleChange,
  onReset,
  onOpenApproval,
  onGenerateExplanation,
  onFallbackExplanation,
}: {
  session: DemoSession;
  explanation: ExplanationResult | null;
  explanationLoading: boolean;
  stageMode: boolean;
  role: Role;
  onRoleChange: (role: Role) => void;
  onReset: () => void;
  onOpenApproval: () => void;
  onGenerateExplanation: () => void;
  onFallbackExplanation: () => void;
}) {
  const applied = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(session.decision.status);
  const currentWeather = demoWeatherRuntime.active.data[0];
  const mapLoadCourierCount = useMemo(() => {
    if (typeof window === "undefined") return 24;
    const requested = Number(new URLSearchParams(window.location.search).get("map-load-test"));
    return requested === 96 || requested === 240 ? requested : 24;
  }, []);
  const baseMapFixture = useMemo(
    () => createMultiRegionMapFixture({
      primaryDecisionId: session.decision.decisionId,
      couriersPerHub: mapLoadCourierCount / 6,
    }),
    [mapLoadCourierCount, session.decision.decisionId],
  );
  const spatialScene = useMemo(
    () => createDecisionSpatialScene(baseMapFixture, session.decision.decisionId),
    [baseMapFixture, session.decision.decisionId],
  );
  const movementTimeline = useMemo(
    () => createMapMovementTimeline(baseMapFixture),
    [baseMapFixture],
  );
  const [movementFrameIndex, setMovementFrameIndex] = useState(0);
  const [movementPlaying, setMovementPlaying] = useState(false);
  const mapFixture = useMemo(
    () => applyMapMovementFrame(baseMapFixture, movementTimeline, movementFrameIndex),
    [baseMapFixture, movementFrameIndex, movementTimeline],
  );
  const mapAdapter = useMemo(
    () => createFixtureMapAdapter(mapFixture),
    [mapFixture],
  );
  const stageInitialSelection = useMemo<MapSelection>(
    () => stageMode
      ? createFixtureMapAdapter(baseMapFixture).selectionForDecision(session.decision.decisionId)
      : {},
    [baseMapFixture, session.decision.decisionId, stageMode],
  );
  const [mapSelection, setMapSelection] = useState<MapSelection>(
    () => stageInitialSelection,
  );
  const [mapAvailable, setMapAvailable] = useState(true);

  useEffect(() => {
    setMapSelection(stageInitialSelection);
    setMapAvailable(true);
    setMovementFrameIndex(0);
    setMovementPlaying(false);
  }, [stageInitialSelection]);

  useEffect(() => {
    if (!movementPlaying) return;
    const timer = window.setInterval(() => {
      setMovementFrameIndex((current) => {
        const finalIndex = movementTimeline.frames.length - 1;
        if (current >= finalIndex - 1) {
          setMovementPlaying(false);
          return finalIndex;
        }
        return current + 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [movementPlaying, movementTimeline.frames.length]);

  const selectPrimaryDecision = () => {
    setMapSelection(mapAdapter.selectionForDecision(session.decision.decisionId));
  };

  return (
    <div className={`admin-layout design-react-shell ${stageMode ? "is-stage-mode" : ""}`} id="control-tower" data-decision-status={session.decision.status}>
      <AdminNavigation />
      <main id="main-content" className="admin-main">
        <header className="admin-dashboard-header">
          <div className="admin-context">
            <div>
              <p className="section-kicker">{stageMode ? "SafeRoute AI · 3분 제출 화면" : "2026년 7월 14일 · Asia/Seoul"}</p>
              <h1>{stageMode ? "52분 후 17번째 배송지 전, 지금 지원이 필요합니다" : "향후 60분 안에 어떤 지원이 필요한가?"}</h1>
            </div>
            <div className="weather-summary"><span aria-hidden="true">☂</span><span><strong>강수 {currentWeather.rainfallMmPerHour.toFixed(1)} mm/h</strong><small>기상 확인 중 · 시정 {(currentWeather.visibilityMeters / 1_000).toFixed(1)} km</small></span></div>
          </div>
          <div className="admin-dashboard-actions">
            <RoleSwitcher role={role} onChange={onRoleChange} />
            <div className="header-actions">
              <span className="mode-badge"><span aria-hidden="true">◇</span><span>시연 데이터</span></span>
              <button type="button" className="button button-quiet button-small" onClick={onReset}>초기화</button>
            </div>
          </div>
        </header>
        <DemoFlowSteps session={session} />
        <div className="global-announcement" aria-live="polite">
          <StatusPill session={session} />
          <span>{session.announcement}</span>
          <code>{session.decision.decisionId}</code>
        </div>
        {!stageMode && (
          <>
            <WeatherDataBoundary />
            <div className="kpi-strip" aria-label="운영 요약">
              <div><span>지원 필요 상황</span><strong>{applied ? "0건" : "1건"}</strong><small>{applied ? "조정 완료" : "현재 선택된 결정"}</small></div>
              <div><span>60분 내 임계치 예상</span><strong>{applied ? "0건" : "1건"}</strong><small>{applied ? "예상 초과 해소" : "약 52분 후"}</small></div>
              <div><span>차단된 대안</span><strong>1건</strong><small>12건 이관</small></div>
              <div><span>승인 대기</span><strong>{session.decision.status === "ADMIN_APPROVAL_REQUIRED" ? "1건" : "0건"}</strong><small>{decisionStatusLabels[session.decision.status]}</small></div>
            </div>
          </>
        )}
        <div className="admin-grid">
          <MultiRegionControlMap
            applied={applied}
            fixture={mapFixture}
            adapter={mapAdapter}
            selection={mapSelection}
            mapAvailable={mapAvailable}
            onMapAvailabilityChange={setMapAvailable}
            onSelectionChange={setMapSelection}
            movement={{
              frameIndex: movementFrameIndex,
              frameCount: movementTimeline.frames.length,
              elapsedSeconds: movementTimeline.frames[movementFrameIndex].elapsedSeconds,
              durationSeconds: movementTimeline.durationSeconds,
              intervalSeconds: movementTimeline.intervalSeconds,
              playing: movementPlaying,
              connectionState: movementFrameIndex === 3 || movementFrameIndex === 4
                ? "DISCONNECTED"
                : movementFrameIndex >= 5
                  ? "RECOVERED"
                  : "NORMAL",
              onToggle: () => {
                if (!movementPlaying && movementFrameIndex === movementTimeline.frames.length - 1) {
                  setMovementFrameIndex(0);
                }
                setMovementPlaying((current) => !current);
              },
              onNext: () => {
                setMovementPlaying(false);
                setMovementFrameIndex((current) => Math.min(current + 1, movementTimeline.frames.length - 1));
              },
              onReset: () => {
                setMovementPlaying(false);
                setMovementFrameIndex(0);
              },
            }}
            spatialScene={spatialScene}
          />
          <InterventionQueue
            session={session}
            onOpenApproval={onOpenApproval}
            onMapSelect={selectPrimaryDecision}
          />
        </div>
        <div className="admin-lower-grid">
          <ComparisonTable />
          <AuditTimeline session={session} />
        </div>
        {applied && (
          <ExplanationPanel
            result={explanation}
            loading={explanationLoading}
            onGenerate={onGenerateExplanation}
            onFallback={onFallbackExplanation}
          />
        )}
      </main>
    </div>
  );
}

function KakaoRiderRouteMap({
  applied,
  javaScriptKey,
  model,
  onStatusChange,
}: {
  applied: boolean;
  javaScriptKey: string;
  model: RiderCompactMapModel;
  onStatusChange: (status: KakaoMapStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlaysRef = useRef<KakaoMapOverlay[]>([]);

  useEffect(() => {
    let active = true;
    onStatusChange("LOADING");
    loadKakaoMapsSdk(javaScriptKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(model.current.latitude, model.current.longitude),
          level: 5,
        });
        const bounds = new maps.LatLngBounds();
        const toLatLng = (point: { latitude: number; longitude: number }) => {
          const latLng = new maps.LatLng(point.latitude, point.longitude);
          bounds.extend(latLng);
          return latLng;
        };
        const path = model.path.map(toLatLng);
        overlaysRef.current.push(new maps.Polyline({
          map,
          path,
          strokeWeight: 5,
          strokeColor: applied ? "#087334" : "#0628C7",
          strokeOpacity: 0.92,
          strokeStyle: "solid",
          zIndex: 3,
        }));
        const stops = [
          { className: "is-current", label: "현재", point: model.current },
          { className: "is-rest", label: "휴식", point: model.rest },
          { className: "is-next", label: "17", point: model.next },
        ];
        stops.forEach((stop) => {
          const node = document.createElement("div");
          node.className = `rider-kakao-stop ${stop.className}`;
          node.textContent = stop.label;
          node.setAttribute("aria-hidden", "true");
          overlaysRef.current.push(new maps.CustomOverlay({
            map,
            position: toLatLng(stop.point),
            content: node,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 6,
          }));
        });
        map.relayout();
        map.setBounds(bounds, 42, 30, 30, 30);
        onStatusChange("READY");
      })
      .catch(() => {
        if (active) onStatusChange("ERROR");
      });
    return () => {
      active = false;
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [applied, javaScriptKey, model, onStatusChange]);

  return (
    <div
      ref={containerRef}
      className="rider-kakao-map-layer"
      data-rider-kakao-map
      role="group"
      aria-label="카카오 지도 위에 표시한 현재 위치, 휴식 지점과 다음 배송지"
    />
  );
}

function RiderCompactRoute({
  applied,
  mapModel,
  online,
}: {
  applied: boolean;
  mapModel: RiderCompactMapModel;
  online: boolean;
}) {
  const currentWeather = demoWeatherRuntime.active.data[0];
  const kakaoJavaScriptKey = import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? "";
  const kakaoRequested = online && Boolean(kakaoJavaScriptKey) && import.meta.env.VITE_KAKAO_MAP_ENABLED !== "false";
  const [kakaoMapStatus, setKakaoMapStatus] = useState<KakaoMapStatus>("LOADING");
  const [directionsState, setDirectionsState] = useState<
    | { status: "LOADING" }
    | { status: "LIVE"; preview: KakaoDirectionsPreview }
    | { status: "FALLBACK"; code: KakaoDirectionsFallbackCode }
  >(
    online
      ? { status: "LOADING" }
      : { status: "FALLBACK", code: "OFFLINE" },
  );
  const kakaoReady = kakaoRequested && kakaoMapStatus === "READY";
  const kakaoFailed = kakaoRequested && kakaoMapStatus === "ERROR";
  const mapDirectionsUrl = useMemo(
    () => createKakaoMapDemoDirectionsUrl(mapModel),
    [mapModel],
  );
  const renderedMapModel = useMemo(
    () =>
      directionsState.status === "LIVE"
        ? { ...mapModel, path: directionsState.preview.path }
        : mapModel,
    [directionsState, mapModel],
  );

  useEffect(() => {
    if (!online) {
      setDirectionsState({ status: "FALLBACK", code: "OFFLINE" });
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_500);
    setDirectionsState({ status: "LOADING" });
    fetchKakaoDirectionsPreview({ signal: controller.signal })
      .then((preview) => setDirectionsState({ status: "LIVE", preview }))
      .catch((error: unknown) => {
        setDirectionsState({
          status: "FALLBACK",
          code:
            error instanceof KakaoDirectionsClientError
              ? error.code
              : "NETWORK_ERROR",
        });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [online]);

  const directionsLabel =
    directionsState.status === "LIVE"
      ? "카카오모빌리티 경로"
      : directionsState.status === "LOADING"
        ? "경로 계산 중"
        : "기본 경로로 계속";
  return (
    <section className={`rider-compact-map ${applied ? "is-applied" : ""}`} aria-label="현재 위치, 휴식 지점과 다음 배송지 경로 요약">
      <div className="compact-map-heading">
        <div><span>현재 운행 경로</span><strong>{applied ? "휴식 후 조정 순서" : "17번째 배송지 전 지원"}</strong></div>
        <span className={`fallback-map-badge ${kakaoReady ? "is-live-map" : ""}`}>
          {kakaoReady ? "Kakao 지도 · 운행 경로" : kakaoFailed ? "Kakao 오류 · 기본 지도" : "기본 지도"}
        </span>
      </div>
      <div className={`compact-map-stage ${kakaoReady ? "is-kakao" : ""}`}>
        {kakaoRequested && kakaoMapStatus !== "ERROR" && (
          <KakaoRiderRouteMap
            applied={applied}
            javaScriptKey={kakaoJavaScriptKey}
            model={renderedMapModel}
            onStatusChange={setKakaoMapStatus}
          />
        )}
        {kakaoRequested && kakaoMapStatus === "LOADING" && (
          <div className="rider-kakao-map-loading" role="status">경로 지도를 불러오는 중입니다.</div>
        )}
        <div className="compact-map-context" aria-label="현재 위치와 날씨 상태">
          <span><i aria-hidden="true">⌖</i> 현재 위치</span>
          <span><i aria-hidden="true">☂</i> 강수 {currentWeather.rainfallMmPerHour.toFixed(1)} mm/h</span>
          <span><i aria-hidden="true">△</i> 경사 구간</span>
        </div>
        <div className="compact-route-line" aria-hidden="true">
          <span className="compact-stop is-current">현재</span>
          <span className="compact-stop is-rest">휴식</span>
          <span className="compact-stop is-next">17</span>
        </div>
      </div>
      <ol className="compact-route-list" aria-label="구조화된 다음 경로">
        <li><span>현재</span><strong>14번째 배송지 구간</strong></li>
        <li><span>다음 안전 거점</span><strong>{applied ? "15:48 휴식 지점" : "10분 휴식 지점"}</strong></li>
        <li><span>지원 기준</span><strong>{applied ? "조정 순서 적용" : "약 52분 · 17번째 전"}</strong></li>
      </ol>
      <section
        className={`rider-directions-preview ${directionsState.status === "LIVE" ? "is-live" : "is-fallback"}`}
        aria-label="자동차 길찾기 미리보기"
        aria-live="polite"
      >
        <div className="rider-directions-heading">
          <div>
            <span>자동차 길찾기</span>
            <strong>{directionsLabel}</strong>
          </div>
          <span className="rider-directions-status">
            {directionsState.status === "LIVE"
              ? "연결됨"
              : directionsState.status === "LOADING"
                ? "확인 중"
                : "기본 경로"}
          </span>
        </div>
        {directionsState.status === "LIVE" ? (
          <div className="rider-directions-metrics">
            <div>
              <span>예상 거리</span>
              <strong>
                {(directionsState.preview.distanceMeters / 1_000).toFixed(1)} km
              </strong>
            </div>
            <div>
              <span>예상 시간</span>
              <strong>
                약 {Math.max(1, Math.round(directionsState.preview.durationSeconds / 60))}분
              </strong>
            </div>
            <div>
              <span>경유</span>
              <strong>휴식 지점</strong>
            </div>
          </div>
        ) : (
          <p className="rider-directions-fallback">
            {directionsState.status === "LOADING"
              ? "카카오 경로와 ETA를 확인하고 있습니다."
              : "외부 경로를 불러오지 못해 승인된 경로와 구조화 목록을 유지합니다."}
          </p>
        )}
        {online ? (
          <a
            className="button button-secondary rider-directions-open"
            href={mapDirectionsUrl}
            target="_blank"
            rel="noreferrer"
          >
            카카오맵에서 길찾기
          </a>
        ) : (
          <span
            className="button button-secondary rider-directions-open is-disabled"
            aria-disabled="true"
          >
            연결 후 길찾기
          </span>
        )}
        <small>
          현재 화면의 위치 정보는 Safety 계산·배송순서를 변경하지 않습니다.
        </small>
      </section>
    </section>
  );
}

function RiderLogin({
  isRecipient,
  onEnter,
  onBack,
}: {
  isRecipient: boolean;
  onEnter: () => void;
  onBack: () => void;
}) {
  return (
    <main id="main-content" className="rider-login-stage">
      <section className="rider-login" aria-labelledby="rider-login-title">
        <MobileStatusBar />
        <div className="login-hero">
          <div className="login-brand"><span aria-hidden="true">SR</span><strong>SafeRoute</strong></div>
          <div className="login-route-art" aria-hidden="true"><i /><i /><i /><b /></div>
          <p>오늘의 배송을 시작하기 전에</p>
          <h1 id="rider-login-title">안전한 운행을<br />함께 준비합니다.</h1>
        </div>
        <div className="login-panel">
          <span className="fixture-pill">시연 데이터</span>
          <h2>기사 계정 확인</h2>
          <p>배정된 허브와 차량을 확인하고 업무 화면으로 이동합니다.</p>
          <dl>
            <div><dt>기사</dt><dd>{isRecipient ? "채우진" : "강태현"}</dd></div>
            <div><dt>배정 허브</dt><dd>관악 허브</dd></div>
            <div><dt>차량</dt><dd>{isRecipient ? "EV-31" : "EV-24"} · 확인됨</dd></div>
          </dl>
          <button type="button" className="button button-primary button-block login-primary" onClick={onEnter}>업무 화면 시작</button>
          <button type="button" className="button button-quiet button-block login-back" onClick={onBack}>관리자 화면으로 돌아가기</button>
        </div>
      </section>
    </main>
  );
}

function formatCachedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function RiderPwaStatus({
  online,
  shellReady,
  cacheState,
}: {
  online: boolean;
  shellReady: boolean;
  cacheState: CachedApprovedDemoPlanState;
}) {
  if (online) {
    return (
      <section className="rider-pwa-status is-online" aria-live="polite">
        <span aria-hidden="true">●</span>
        <div><strong>온라인</strong><small>{shellReady ? "오프라인 앱 셸 준비됨" : "앱 셸 확인 중"}</small></div>
      </section>
    );
  }

  if (cacheState.status === "FRESH") {
    return (
      <section className="rider-pwa-status is-offline" aria-live="polite">
        <span aria-hidden="true">↓</span>
        <div>
          <strong>오프라인 · 마지막 승인 계획</strong>
          <small>{formatCachedAt(cacheState.plan.storedAt)} 저장 · {formatCachedAt(cacheState.plan.expiresAt)}까지 읽기 전용</small>
        </div>
      </section>
    );
  }

  if (cacheState.status === "EXPIRED") {
    return (
      <section className="rider-pwa-status is-expired" aria-live="assertive">
        <span aria-hidden="true">!</span>
        <div><strong>캐시 만료 · 최신 계획 아님</strong><small>연결 후 승인된 계획을 다시 확인해 주세요. 동의·적용은 기록되지 않습니다.</small></div>
      </section>
    );
  }

  return (
    <section className="rider-pwa-status is-empty" aria-live="assertive">
      <span aria-hidden="true">×</span>
      <div><strong>오프라인 · 저장된 승인 계획 없음</strong><small>현재 화면을 최신 배송계획으로 사용하지 마세요. 연결 후 다시 확인해 주세요.</small></div>
    </section>
  );
}

function RiderView({
  session,
  courierId,
  isRecipient,
  role,
  onRoleChange,
  onReset,
  onResponse,
  pwa,
  mapModel,
}: {
  session: DemoSession;
  courierId: string;
  isRecipient: boolean;
  role: Exclude<Role, "ADMIN">;
  onRoleChange: (role: Role) => void;
  onReset: () => void;
  onResponse: (response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED") => void;
  pwa: {
    online: boolean;
    shellReady: boolean;
    installStatus: PwaInstallStatus;
    requestInstall: () => Promise<"accepted" | "dismissed" | "UNAVAILABLE">;
    cacheState: CachedApprovedDemoPlanState;
  };
  mapModel: RiderCompactMapModel;
}) {
  const [tab, setTab] = useState<RiderTab>("ROUTE");
  const [dangerDemoMessage, setDangerDemoMessage] = useState<string>();
  const consentStatus = consentStatusFor(session, courierId);
  const canRespond = pwa.online && session.decision.status === "RIDER_RESPONSE_PENDING" && consentStatus === "PENDING";
  const offlinePlan = !pwa.online && pwa.cacheState.status === "FRESH" ? pwa.cacheState.plan : null;
  const applied = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(session.decision.status) || Boolean(offlinePlan);
  const sourceImpact = demoRecommendedEvaluation.courierImpacts.find((impact) => impact.role === "SOURCE")!;
  const recipientImpact = demoRecommendedEvaluation.courierImpacts.find((impact) => impact.role === "RECIPIENT")!;
  const impact = isRecipient ? recipientImpact : sourceImpact;
  const activeWorkload = session.store.activePlan.workloads.find((workload) => workload.courierId === courierId)!;
  const cachedCourierPlan = offlinePlan?.couriers.find((courier) => courier.courierId === courierId);
  const remainingStopCount = cachedCourierPlan?.remainingStopCount ?? activeWorkload.remainingLoad.stopCount;
  const deliveryCompletedCount = isRecipient ? 9 : 14;
  const deliveryTotalCount = isRecipient ? 24 : 31;
  const deliveryRate = deliveryTotalCount
    ? Math.round((deliveryCompletedCount / deliveryTotalCount) * 100)
    : 0;
  const remainingPlanMinutes = Math.max(
    0,
    Math.round(
      (Date.parse(activeWorkload.projectedEndAt) -
        Date.parse(activeWorkload.evaluatedAt)) /
        60_000,
    ),
  );
  const expectedCompletionLabel = formatRiderClock(
    riderDemoClockMinutes + remainingPlanMinutes,
  );
  const baselineBreach = demoBaselineSnapshot.breach;
  const dangerMinutes =
    baselineBreach.status === "PREDICTED"
      ? Math.round(baselineBreach.timeToBreachMinutes)
      : undefined;
  const dangerStopOrdinal =
    baselineBreach.status === "PREDICTED"
      ? baselineBreach.stopIndex + 1
      : undefined;
  const tabContentId = `rider-${tab.toLowerCase()}-panel`;
  const selectTab = (nextTab: RiderTab) => {
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const sendDangerDemoSignal = () => {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      storage = undefined;
    }
    const result = publishDemoRiderDangerSignal({
      courierId: "R-022",
      storage,
      eventTarget: window,
    });
    setDangerDemoMessage(
      result.persisted
        ? "관제 화면에 위험 신호를 보냈습니다."
        : "브라우저 저장소가 차단되어 신호를 보존하지 못했습니다.",
    );
  };

  return (
    <main id="main-content" className="rider-stage">
      <div className="rider-phone design-react-shell" data-rider-tab={tab} data-applied={applied ? "true" : "false"}>
        <MobileStatusBar />
        <div className="rider-demo-toolbar">
          <div className="rider-toolbar-title">
            <span aria-hidden="true">{tab === "ROUTE" ? "SR" : tab === "SUPPORT" ? "◈" : "●"}</span>
            <strong>{tab === "ROUTE" ? "SafeRoute AI" : tab === "SUPPORT" ? "안전지원 검토" : "내 정보"}</strong>
          </div>
          <div className="rider-toolbar-actions">
            <a className="rider-dashboard-link" href="/">관제</a>
            <button type="button" className="rider-reset-button" onClick={onReset}>초기화</button>
            <RiderRoleMenu role={role} onChange={onRoleChange} />
          </div>
        </div>
        <div className="rider-topline">
          <span className="mode-badge"><span aria-hidden="true">◇</span><span>시연 데이터</span></span>
          <span className="stopped-badge">정차 확인</span>
        </div>
        <div className="rider-route-bar">
          <div><span>현재 배송 구역</span><strong>{tab === "ROUTE" ? "서울 용산" : tab === "SUPPORT" ? "안전지원 검토" : "내 정보"}</strong></div>
          <div><span>배송률</span><strong>{deliveryRate}%</strong></div>
        </div>
        {(!pwa.online || tab === "PROFILE") && (
          <RiderPwaStatus online={pwa.online} shellReady={pwa.shellReady} cacheState={pwa.cacheState} />
        )}

        {tab === "ROUTE" && (
          <section id={tabContentId} role="tabpanel" aria-labelledby="rider-route-tab">
            <p className="rider-overline">현재 배송 구역</p>
            <section className="rider-delivery-overview">
              <figure>
                <img
                  src="/assets/rider-delivery-area-seoul.jpg"
                  alt="서울 주거지역의 아파트 건물 전경"
                />
                <figcaption>배송 구역 대표 이미지</figcaption>
              </figure>
              <div className="rider-delivery-copy">
                <span>현재 배송 구역</span>
                <h1>서울시 용산구 한빛아파트</h1>
                <div className="rider-delivery-progress-copy">
                  <span>배송 {deliveryCompletedCount}/{deliveryTotalCount}</span>
                  <strong>{deliveryRate}%</strong>
                </div>
                <div
                  className="rider-delivery-progress"
                  role="progressbar"
                  aria-label="오늘 배송률"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={deliveryRate}
                >
                  <span style={{ width: `${deliveryRate}%` }} />
                </div>
                <dl className="rider-delivery-facts">
                  <div><dt>남은 배송</dt><dd>{remainingStopCount}건</dd></div>
                  <div><dt>예상 완료</dt><dd>{expectedCompletionLabel}</dd></div>
                </dl>
              </div>
            </section>
            <section className="rider-safety-now" aria-label="현재 안전 지원 상태">
              <div>
                <span>내 안전 지원 점수</span>
                <strong>{formatBudget(demoBaselineSnapshot.currentBudget)}</strong>
              </div>
              <div>
                <span>위험 예상</span>
                <strong>{applied ? "해소" : dangerMinutes === undefined ? "확인 중" : `${dangerMinutes}분 뒤`}</strong>
                <small>{applied ? "조정 계획 기준" : dangerStopOrdinal === undefined ? "예측 데이터 확인 중" : `${dangerStopOrdinal}번째 배송지 전`}</small>
              </div>
            </section>
            <button type="button" className="button button-primary button-block rider-support-cta" onClick={() => selectTab("SUPPORT")}>{applied ? "적용 근거 확인" : "안전지원 검토"}</button>
            <section className="rider-danger-demo" aria-label="응급 상황 감지 예시">
              <span>위험 신호 감지</span>
              <strong>매우 위험한 상태 감지</strong>
              <button type="button" onClick={sendDangerDemoSignal}>
                응급 상황 감지 예시
              </button>
              {dangerDemoMessage && (
                <p role="status">
                  {dangerDemoMessage}
                  {dangerDemoMessage.startsWith("관제") && (
                    <a href="/">관제에서 확인</a>
                  )}
                </p>
              )}
            </section>
            <RiderCompactRoute applied={applied} mapModel={mapModel} online={pwa.online} />
            <section className="rider-next-plan">
              <span>{applied ? "적용된 다음 계획" : "검토할 안전지원"}</span>
              <strong>{isRecipient ? "가까운 배송지 8건 수신" : "10분 휴식 + 배송지 8건 이관"}</strong>
              <p>{applied ? "승인된 배송순서와 고객 ETA가 같은 계획 버전에 반영됐습니다." : "검토하기 전에는 배송계획과 고객 ETA가 변경되지 않습니다."}</p>
            </section>
          </section>
        )}

        {tab === "SUPPORT" && (
          <section id={tabContentId} role="tabpanel" aria-labelledby="rider-support-tab">
            <p className="rider-overline">안전지원 · 한 화면에서 결정</p>
            <section className={`rider-hero-card rider-support-hero ${applied ? "is-applied" : ""}`}>
              <span className="rider-hero-label">{applied ? "새 계획이 적용됐어요" : isRecipient ? "함께 안전기준을 확인했어요" : "약 52분 안에 지원이 필요할 수 있어요"}</span>
              <h1>{applied ? "조정된 계획이 적용되었습니다" : isRecipient ? "배송지 8건을 전달받습니다" : "10분 쉬고, 배송지 8건을 이관합니다"}</h1>
              <p>{applied
                ? `현재 남은 배송은 ${remainingStopCount}건입니다. 실제 적용된 계획과 ETA를 기준으로 안내합니다.`
                : isRecipient
                  ? "이관 후에도 안전기준을 통과하는지 전체 계획을 다시 확인했습니다."
                  : "10분 휴식 후 8건을 이관하면 예상 초과를 피할 수 있습니다. 동의 전에는 현재 계획이 바뀌지 않습니다."}</p>
            </section>

            <section className="rider-decision-brief" aria-label="조정 전후와 내 작업 변화 요약">
              <div><span>현재 최소</span><strong>{formatBudget(impact.baselineMinimumBudget)}</strong></div>
              <span className="decision-brief-arrow" aria-label="에서">→</span>
              <div className="is-safe"><span>조정 후</span><strong>{formatBudget(impact.candidateMinimumBudget)}</strong></div>
              <div className="decision-brief-work"><span>내 작업</span><strong>{isRecipient ? "+8건" : "-8건"}</strong><small>{isRecipient ? "기준 45 통과" : "예상 초과 해소"}</small></div>
            </section>

            <div className="rider-response-status" aria-live="polite">
              <StatusPill session={session} />
              <span>{!pwa.online ? "오프라인에서는 동의·수정·거절을 기록하지 않습니다." : canRespond ? "선택 전까지 현재 계획은 변경되지 않습니다." : session.announcement}</span>
            </div>
            <div className="rider-actions" aria-label="조치 응답">
              <button type="button" className="button button-primary" disabled={!canRespond} onClick={() => onResponse("CONSENTED")}>이 조정에 동의</button>
              <button type="button" className="button button-secondary" disabled={!canRespond} onClick={() => onResponse("MODIFICATION_REQUESTED")}>다른 방법 요청</button>
              <button type="button" className="button button-neutral" disabled={!canRespond} onClick={() => onResponse("DECLINED")}>지금은 거절</button>
            </div>
            <p className="nonpunitive-copy">수정하거나 거절해도 불이익은 없습니다. 다른 안전한 방법을 다시 검토합니다.</p>

            <section className="rider-safety-card" aria-labelledby="rider-safety-heading">
              <div className="safety-card-heading"><span className="band-label">{applied ? "조정 완료" : "조정 권장"}</span><span>입력 신뢰도 {demoConfidence}</span></div>
              <h2 id="rider-safety-heading">{isRecipient ? "이관 후 남은 안전여유" : "조정 전후 최소 안전여유"}</h2>
              <div className="before-after">
                <div><span>현재 계획</span><strong>{formatBudget(impact.baselineMinimumBudget)}</strong></div>
                <span className="change-arrow" aria-label="에서">→</span>
                <div className="after"><span>추천 조치 후</span><strong>{formatBudget(impact.candidateMinimumBudget)}</strong></div>
              </div>
              <p className="threshold-note"><span aria-hidden="true">✓</span> {isRecipient ? "수신 기사 최소 기준 45를 통과했습니다." : "임계치 30 아래로 내려가는 예상을 해소합니다."}</p>
            </section>

            <section className="rider-action-card" aria-labelledby="rider-action-heading">
              <p className="section-kicker">추천 조치</p>
              <h2 id="rider-action-heading">{isRecipient ? "가까운 배송지 8건 수신" : "10분 휴식 + 배송지 8건 이관"}</h2>
              <dl>
                <div><dt>내 작업량</dt><dd>{isRecipient ? "+8건" : "-8건"}</dd></div>
                <div><dt>예상 종료</dt><dd>{isRecipient ? "+25분" : "-15분"}</dd></div>
                <div><dt>고객 ETA</dt><dd>{isRecipient ? "인계 계획 반영" : "최대 +10분"}</dd></div>
              </dl>
              <details>
                <summary>왜 이 조치를 추천하나요?</summary>
                <ul>
                  <li>연속작업과 남은 물량 노출을 함께 줄입니다.</li>
                  <li>수신 기사의 안전여유·용량·시간창을 모두 확인했습니다.</li>
                  <li>이 수치는 사고확률이 아닌 안전 지원 점수입니다.</li>
                </ul>
              </details>
            </section>
          </section>
        )}

        {tab === "PROFILE" && (
          <section id={tabContentId} role="tabpanel" aria-labelledby="rider-profile-tab">
            <p className="rider-overline">내 정보</p>
            <h1>필요한 운영 상태만 공유합니다</h1>
            <p className="rider-lead">업무에 필요한 정보만 확인하고 공유 범위를 관리합니다.</p>
            <section className="rider-privacy-visual" aria-label="공유 정보와 기사 권리 요약">
              <div><span aria-hidden="true">◇</span><strong>공유</strong><small>운영 파생 상태</small></div>
              <div><span aria-hidden="true">⊘</span><strong>비공유</strong><small>생체·장기 궤적</small></div>
              <div><span aria-hidden="true">↺</span><strong>기사 권리</strong><small>수정·거절·정정</small></div>
            </section>
            <section className="rider-profile-card">
              <span>관리자에게 보이는 정보</span>
              <strong>날씨·경로·작업량에서 계산한 파생 상태</strong>
              <p>원시 생체정보, 장기 이동궤적과 개인 성과평가는 표시하지 않습니다.</p>
            </section>
            <section className="rider-profile-card">
              <span>이 결정에 사용한 데이터</span>
              <strong>배송·날씨·경로 상태</strong>
              <p>같은 기준 시각의 입력만 사용하며 확인되지 않은 값은 계산에 섞지 않습니다.</p>
            </section>
            <section className="rider-profile-card">
              <span>이의제기와 도움</span>
              <strong>수정·거절·정정 요청에 불이익이 없습니다</strong>
              <p>안전지원 탭의 수정 요청과 거절로 운영팀의 재검토를 요청할 수 있습니다.</p>
            </section>
            <section className="rider-profile-card rider-pwa-card">
              <span>기기 설치와 오프라인</span>
              <strong>{pwa.installStatus === "INSTALLED" ? "이 기기에 설치됨" : pwa.installStatus === "AVAILABLE" ? "이 기기에 설치할 수 있음" : pwa.shellReady ? "오프라인 앱 셸 준비됨" : "설치 조건 확인 중"}</strong>
              <p>마지막 승인·적용 계획만 30분 동안 기기에 최소 필드로 저장합니다. 오프라인에서는 읽기 전용이며 만료 계획을 최신으로 표시하지 않습니다.</p>
              <button
                type="button"
                className="button button-secondary button-block"
                disabled={pwa.installStatus !== "AVAILABLE"}
                onClick={() => void pwa.requestInstall()}
              >{pwa.installStatus === "INSTALLED" ? "설치 완료" : pwa.installStatus === "AVAILABLE" ? "이 기기에 설치" : "브라우저 설치 조건 확인"}</button>
              <small>인증·위치 권한·푸시 알림은 준비 중입니다.</small>
            </section>
            <code className="rider-decision-code">Decision ID · {session.decision.decisionId}</code>
          </section>
        )}

        <nav className="rider-tab-bar" role="tablist" aria-label="기사 모바일 웹 주요 메뉴">
          {([
            ["ROUTE", "운행", "rider-route-tab"],
            ["SUPPORT", "안전지원", "rider-support-tab"],
            ["PROFILE", "내 정보", "rider-profile-tab"],
          ] as const).map(([value, label, id]) => (
            <button
              key={value}
              id={id}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls={`rider-${value.toLowerCase()}-panel`}
              className={tab === value ? "is-active" : undefined}
              onClick={() => selectTab(value)}
            >
              <span aria-hidden="true">{value === "ROUTE" ? "⌖" : value === "SUPPORT" ? "✦" : "◉"}</span>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}

function ApprovalDialog({
  open,
  session,
  onClose,
  onApprove,
  onHold,
  onModification,
}: {
  open: boolean;
  session: DemoSession;
  onClose: () => void;
  onApprove: () => void;
  onHold: () => void;
  onModification: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="approval-dialog" onClose={onClose} aria-labelledby="approval-title">
      <div className="dialog-header">
        <div><p className="section-kicker">관리자 최종 확인</p><h2 id="approval-title">승인 후 계획을 적용할까요?</h2></div>
        <button type="button" className="icon-button" aria-label="승인 창 닫기" onClick={onClose}>×</button>
      </div>
      <p className="dialog-summary">두 기사 동의와 모든 안전 하드 제약을 확인했습니다. 승인 직전에 최신 계획을 다시 검증합니다.</p>
      <div className="dialog-metrics">
        <div><span>원 기사 최소</span><strong>29.9 → 47.2</strong></div>
        <div><span>수신 기사 최소</span><strong>52.5 → 45.0</strong></div>
        <div><span>고객 최대 ETA</span><strong>+10분</strong></div>
        <div><span>예상 초과</span><strong className="text-teal">해소</strong></div>
      </div>
      <section className="dialog-checks" aria-label="승인 조건">
        <h3>승인 조건</h3>
        <ul>
          <li><span aria-hidden="true">✓</span> 원 기사 동의 완료</li>
          <li><span aria-hidden="true">✓</span> 수신 기사 동의 완료</li>
          <li><span aria-hidden="true">✓</span> 수신 기사 최소 안전여유 45.0</li>
          <li><span aria-hidden="true">✓</span> 계획 버전 1.0.0 재검증 예정</li>
        </ul>
      </section>
      <div className="notice-preview">
        <span className="mini-badge">미리보기</span>
        <strong>고객안내</strong>
        <p>안전한 배송운영을 위해 일부 배송순서가 조정됩니다. 실제 적용된 ETA만 안내에 반영됩니다.</p>
      </div>
      <div className="dialog-footer">
        <button type="button" className="button button-neutral" onClick={onHold}>보류</button>
        <button type="button" className="button button-secondary" onClick={onModification}>수정 요청</button>
        <button type="button" className="button button-primary" onClick={onApprove}>승인 및 계획 적용</button>
      </div>
      <code className="dialog-decision-id">Decision ID · {session.decision.decisionId}</code>
    </dialog>
  );
}

export function App({
  initialSession,
  initialExplanation,
  stageMode = false,
  initialRole = "ADMIN",
  initialRiderEntry = false,
}: AppProps) {
  const [role, setRole] = useState<Role>(initialRole);
  const [riderEntry, setRiderEntry] = useState<Record<"SOURCE" | "RECIPIENT", boolean>>({
    SOURCE: initialRiderEntry && initialRole === "SOURCE",
    RECIPIENT: initialRiderEntry && initialRole === "RECIPIENT",
  });
  const [session, setSession] = useState(
    () => initialSession ?? createInitialDemoSession(),
  );
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationResult | null>(
    initialExplanation ?? null,
  );
  const [explanationLoading, setExplanationLoading] = useState(false);
  const pwaRuntime = usePwaRuntime();
  const [cachedPlanState, setCachedPlanState] = useState<CachedApprovedDemoPlanState>(
    () => readCachedApprovedDemoPlan(),
  );
  const riderMapModel = useMemo(() => {
    const fixture = createMultiRegionMapFixture({ primaryDecisionId: session.decision.decisionId });
    const adapter = createFixtureMapAdapter(fixture);
    return createRiderCompactMapModel(adapter, session.decision.decisionId);
  }, [session.decision.decisionId]);

  useEffect(() => {
    const planVersion = session.store.appliedDecisionVersions[session.decision.decisionId];
    if (!planVersion) return;
    const plan = createCachedApprovedDemoPlan({
      decisionId: session.decision.decisionId,
      planId: session.decision.baselinePlanId,
      planVersion,
      couriers: session.store.activePlan.workloads.map((workload) => ({
        courierId: workload.courierId,
        remainingStopCount: workload.remainingLoad.stopCount,
      })),
    });
    setCachedPlanState(writeCachedApprovedDemoPlan(plan)
      ? { status: "FRESH", plan }
      : { status: "INVALID", reason: "STORAGE_UNAVAILABLE" });
  }, [session]);

  useEffect(() => {
    setCachedPlanState(readCachedApprovedDemoPlan());
  }, [pwaRuntime.online]);

  const reset = () => {
    setApprovalOpen(false);
    clearCachedApprovedDemoPlan();
    setCachedPlanState({ status: "EMPTY" });
    setSession(createInitialDemoSession(createResetDemoDecisionId()));
    setExplanation(null);
    setExplanationLoading(false);
    setRiderEntry({ SOURCE: false, RECIPIENT: false });
    setRole("ADMIN");
  };

  const requestExplanation = async (simulateFailure: boolean) => {
    setExplanationLoading(true);
    try {
      setExplanation(await generateDemoAdminExplanation(simulateFailure));
    } finally {
      setExplanationLoading(false);
    }
  };

  const respond = (courierId: string, response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED") => {
    setSession((current) => respondToDemo(current, courierId, response));
  };

  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      {role === "ADMIN" ? (
        <AdminDashboard
          session={session}
          explanation={explanation}
          explanationLoading={explanationLoading}
          stageMode={stageMode}
          role={role}
          onRoleChange={setRole}
          onReset={reset}
          onOpenApproval={() => setApprovalOpen(true)}
          onGenerateExplanation={() => void requestExplanation(false)}
          onFallbackExplanation={() => void requestExplanation(true)}
        />
      ) : riderEntry[role] ? (
        <RiderView
          session={session}
          courierId={role === "SOURCE" ? demoSourceCourierId : demoRecipientCourierId}
          isRecipient={role === "RECIPIENT"}
          role={role}
          onRoleChange={setRole}
          onReset={reset}
          onResponse={(response) => respond(role === "SOURCE" ? demoSourceCourierId : demoRecipientCourierId, response)}
          pwa={{ ...pwaRuntime, cacheState: cachedPlanState }}
          mapModel={riderMapModel}
        />
      ) : (
        <RiderLogin
          isRecipient={role === "RECIPIENT"}
          onEnter={() => setRiderEntry((current) => ({ ...current, [role]: true }))}
          onBack={() => setRole("ADMIN")}
        />
      )}
      <ApprovalDialog
        open={approvalOpen}
        session={session}
        onClose={() => setApprovalOpen(false)}
        onApprove={() => {
          setSession((current) => approveAndApplyDemo(current));
          setApprovalOpen(false);
        }}
        onHold={() => {
          setSession((current) => holdDemoDecision(current));
          setApprovalOpen(false);
        }}
        onModification={() => {
          setSession((current) => requestDemoModification(current));
          setApprovalOpen(false);
        }}
      />
    </>
  );
}
