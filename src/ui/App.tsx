import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  ExplanationResult,
  InterventionCandidate,
  MapSelection,
  MultiRegionMapFixture,
} from "../domain/contracts";
import { createMultiRegionMapFixture } from "../adapters/fixtures";
import {
  createFixtureMapAdapter,
  type MapAdapter,
} from "../adapters/maps";
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
};

const formatBudget = (value: number) => value.toFixed(1);

const confidenceLabels = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
} as const;

const demoConfidence = `${demoBaselineSnapshot.confidenceScore} · ${confidenceLabels[demoBaselineSnapshot.confidence]}`;

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
    <div className="role-switcher" role="tablist" aria-label="Demo 역할 전환">
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
  const riderId = role === "SOURCE" ? "R-017" : "R-024";
  return (
    <details className="rider-role-menu">
      <summary aria-label={`${riderId} · Demo 화면 전환`}>
        <span>{riderId}</span>
        <small>화면</small>
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
          <small>{role === "ADMIN" ? "운영 안전 데모" : "기사 안전배송"}</small>
        </span>
      </div>
      {role === "ADMIN" && <DemoFlowSteps session={session} />}
      {role === "ADMIN"
        ? <RoleSwitcher role={role} onChange={onRoleChange} />
        : <RiderRoleMenu role={role} onChange={onRoleChange} />}
      <div className="header-actions">
        <span className="mode-badge"><span aria-hidden="true">◇</span><span className="mode-label-full">{demoWeatherRuntime.displayLabel}</span><span className="mode-label-short">Demo · Weather Fallback</span></span>
        <button type="button" className="button button-quiet button-small" onClick={onReset}>
          Demo 초기화
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
      <div className="nav-simulation">
        <strong>Simulation result</strong>
        <span>실제 사고감소 효과가 아닙니다.</span>
      </div>
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

function MultiRegionControlMap({
  applied,
  fixture,
  adapter,
  selection,
  mapAvailable,
  onMapAvailabilityChange,
  onSelectionChange,
}: {
  applied: boolean;
  fixture: MultiRegionMapFixture;
  adapter: MapAdapter;
  selection: MapSelection;
  mapAvailable: boolean;
  onMapAvailabilityChange: (available: boolean) => void;
  onSelectionChange: (selection: MapSelection) => void;
}) {
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isMapPanning, setIsMapPanning] = useState(false);
  const mapDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const model = adapter.getModel(selection);
  const selectedRegion = model.selection.regionId
    ? fixture.regions.find((region) => region.regionId === model.selection.regionId)
    : undefined;
  const selectedCourier = model.selection.courierId
    ? fixture.couriers.find(
        (courier) => courier.courierId === model.selection.courierId,
      )
    : undefined;
  const title = model.scope === "NATIONAL"
    ? "3개 합성 권역의 지원 필요 상황"
    : model.scope === "REGION"
      ? `${selectedRegion?.label ?? "선택 권역"}의 기사와 경로`
      : "선택한 지원 decision과 계획 경로";
  const selectDecision = (decisionId: string) => {
    onSelectionChange(adapter.selectionForDecision(decisionId));
  };
  const resetMapPan = () => setMapPan({ x: 0, y: 0 });
  const handleMapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest("button, a, summary, [data-map-overlay]")) return;
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
        <ul className="map-region-list" aria-label="합성 권역 목록">
          {model.regions.map((region) => (
            <li key={region.regionId}>
              <div>
                <strong>{region.label}</strong>
                <span>기사 {region.courierCount}명 · 지원 decision {region.supportDecisionCount}건 · stale/offline {region.staleOrOfflineCount}명</span>
              </div>
              <button type="button" onClick={() => onSelectionChange({ regionId: region.regionId })}>
                {region.label} 목록 보기
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="map-courier-list" aria-label={`${selectedRegion?.label ?? "선택 권역"} 기사와 위치 상태 목록`}>
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
    <section className="panel route-panel linked-decision" id="route-decision" tabIndex={-1} aria-labelledby="route-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">다지역 합성 운영 · 기사 24명 · 허브 6개</p>
          <h2 id="route-heading">{title}</h2>
        </div>
        <div className="route-heading-meta">
          <span className="fallback-map-badge">Demo schematic map</span>
          <span className="legend"><i className="legend-current" /> 현재 계획 <i className="legend-adjusted" /> 적용 계획</span>
          <button
            type="button"
            className="map-error-toggle"
            aria-pressed={!mapAvailable}
            onClick={() => onMapAvailabilityChange(!mapAvailable)}
          >
            {mapAvailable ? "지도 오류 재현" : "지도 복구"}
          </button>
          <button
            type="button"
            className="map-pan-reset"
            disabled={mapPan.x === 0 && mapPan.y === 0}
            onClick={resetMapPan}
          >
            지도 중심 복원
          </button>
        </div>
      </div>
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
              {selectedRegion.label}
            </button>
          </>
        )}
        {selectedCourier && (
          <><span aria-hidden="true">/</span><strong>{selectedCourier.courierId.slice(-10)}</strong></>
        )}
        <button type="button" className="map-reset-camera" onClick={() => {
          resetMapPan();
          onSelectionChange(adapter.resetSelection());
        }}>전체 보기</button>
      </nav>
      <p className="sr-only" aria-live="polite">{mapAvailable ? title : `지도 오류 Fallback · ${title}`}</p>
      {mapAvailable ? <div
        className={`control-map-canvas scope-${model.scope.toLowerCase()} ${isMapPanning ? "is-panning" : ""}`}
        role="group"
        tabIndex={0}
        aria-label="합성 지도 이동 영역"
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
        <p id="map-pan-instructions" className="sr-only">빈 지도 영역을 드래그하거나 방향키로 이동합니다. Home 또는 숫자 0 키로 중심을 복원합니다.</p>
        <div
          className="control-map-pan-surface"
          data-pan-x={Math.round(mapPan.x)}
          data-pan-y={Math.round(mapPan.y)}
        >
          <svg
            className="control-map-svg"
            viewBox="0 0 100 100"
            role="img"
            aria-label={model.scope === "NATIONAL"
              ? "3개 합성 권역과 권역별 기사 8명, 지원 decision 4건을 집계한 지도"
              : `${selectedRegion?.label ?? "선택 권역"}의 합성 허브, 기사 위치 상태와 계획 경로 지도`}
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
              aria-label={`${region.label}, 기사 ${region.courierCount}명, 지원 decision ${region.supportDecisionCount}건`}
              onClick={() => onSelectionChange({ regionId: region.regionId })}
            >
              <span>{region.supportDecisionCount}</span>
              <strong>{region.label}</strong>
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
        <div className="map-data-mode" data-map-overlay><strong>Demo movement 아님</strong><span>결정론적 합성 위치 · Live 0명</span></div>
        <span className="map-pan-hint" data-map-overlay>드래그·방향키로 지도 이동</span>
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
              <p>빈 화면 대신 같은 합성 fixture의 지역·기사·배송순서 목록을 제공합니다. Safety 계산과 현재 결정은 변경되지 않았습니다.</p>
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
        <span><i className="status-dot is-current" />현재 위치 {model.scope === "NATIONAL" ? 18 : model.couriers.filter((courier) => courier.positionStatus === "CURRENT").length}</span>
        <span><i className="status-dot is-stale" />stale {model.scope === "NATIONAL" ? 3 : model.couriers.filter((courier) => courier.positionStatus === "STALE").length}</span>
        <span><i className="status-dot is-offline" />offline {model.scope === "NATIONAL" ? 3 : fixture.couriers.filter((courier) => courier.regionId === model.selection.regionId && courier.position.status === "OFFLINE").length}</span>
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
  return (
    <aside className="panel intervention-queue linked-decision" id="support-queue" tabIndex={-1} aria-labelledby="queue-heading">
      <div className="panel-heading compact">
        <div>
          <p className="section-kicker">{applied ? "완료된 개입 · 1건" : "개입 큐 · 1건"}</p>
          <h2 id="queue-heading">{applied ? "적용된 지원 조치" : "지금 확인할 지원 상황"}</h2>
        </div>
        <StatusPill session={session} />
      </div>
      <article className={`support-card ${applied ? "is-applied" : ""}`}>
        <div className="support-urgency"><span aria-hidden="true">{applied ? "✓" : "◷"}</span> {applied ? "계획 적용 완료" : "60분 안에 지원 필요"}</div>
        <h3>{applied ? "예상 초과를 해소하는 조정 계획이 적용되었습니다." : "현재 계획을 유지하면 안전여유가 임계치 아래로 내려갑니다."}</h3>
        <p>{applied ? "원 기사 9건, 수신 기사 추가 8건과 조정된 ETA를 같은 계획 버전에 반영했습니다." : "연속작업, 남은 물량, 강수·경사 노출이 함께 증가합니다."}</p>
        <dl className="support-facts">
          <div><dt>{applied ? "예상 초과" : "예상 시점"}</dt><dd>{applied ? "해소" : "약 52분 후"}</dd></div>
          <div><dt>{applied ? "적용 결과" : "예상 위치"}</dt><dd>{applied ? "원 기사 9건" : "17번째 배송지"}</dd></div>
          <div><dt>{applied ? "적용 조치" : "추천 조치"}</dt><dd>10분 휴식 + 8건 이관</dd></div>
        </dl>
      </article>
      <div className="consent-grid" aria-label="기사별 동의 상태">
        <div><span>원 기사</span><strong>{consentLabel(sourceStatus)}</strong></div>
        <div><span>수신 기사</span><strong>{consentLabel(recipientStatus)}</strong></div>
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
        <span>Live 부분 증거 미사용 · Demo 타임라인 전체 사용</span>
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
      <span className="weather-fallback-badge">Fallback</span>
      <div className="weather-boundary-copy">
        <strong id="weather-boundary-heading">Safety 계산은 Demo 날씨만 사용합니다.</strong>
        <span>기상청 Live 표본은 부분 검증됐지만 계산 입력과 혼합하지 않았습니다.</span>
      </div>
      <dl aria-label="기상청 Live 날씨 적합성">
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
            ? "Upstage Mock · 검증 통과"
            : result?.status === "FALLBACK"
              ? "Fallback template"
              : "설명 생성 전"}
        </span>
      </div>
      <div className="explanation-body">
        <div className="explanation-copy">
          {result ? (
            <>
              <span className="mode-badge">◇ {result.data.dataModeLabel}</span>
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
            <p>적용된 결정 사실과 허용된 합성문서 인용만 사용해 관리자 메모를 생성합니다. 숫자나 추천은 다시 계산하지 않습니다.</p>
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
  onOpenApproval,
  onGenerateExplanation,
  onFallbackExplanation,
}: {
  session: DemoSession;
  explanation: ExplanationResult | null;
  explanationLoading: boolean;
  onOpenApproval: () => void;
  onGenerateExplanation: () => void;
  onFallbackExplanation: () => void;
}) {
  const applied = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(session.decision.status);
  const currentWeather = demoWeatherRuntime.active.data[0];
  const mapFixture = useMemo(
    () => createMultiRegionMapFixture({ primaryDecisionId: session.decision.decisionId }),
    [session.decision.decisionId],
  );
  const mapAdapter = useMemo(
    () => createFixtureMapAdapter(mapFixture),
    [mapFixture],
  );
  const [mapSelection, setMapSelection] = useState<MapSelection>({});
  const [mapAvailable, setMapAvailable] = useState(true);

  useEffect(() => {
    setMapSelection(mapAdapter.resetSelection());
    setMapAvailable(true);
  }, [mapAdapter]);

  const selectPrimaryDecision = () => {
    setMapSelection(mapAdapter.selectionForDecision(session.decision.decisionId));
  };

  return (
    <div className="admin-layout" id="control-tower">
      <AdminNavigation />
      <main id="main-content" className="admin-main">
        <div className="admin-context">
          <div><p className="section-kicker">2026년 7월 14일 · Asia/Seoul</p><h1>향후 60분 안에 어떤 지원이 필요한가?</h1></div>
          <div className="weather-summary"><span aria-hidden="true">☂</span><span><strong>강수 {currentWeather.rainfallMmPerHour.toFixed(1)} mm/h</strong><small>Demo Fallback · 시정 {(currentWeather.visibilityMeters / 1_000).toFixed(1)} km</small></span></div>
        </div>
        <WeatherDataBoundary />
        <div className="kpi-strip" aria-label="운영 요약">
          <div><span>지원 필요 상황</span><strong>{applied ? "0건" : "1건"}</strong><small>{applied ? "조정 완료" : "현재 선택된 결정"}</small></div>
          <div><span>60분 내 임계치 예상</span><strong>{applied ? "0건" : "1건"}</strong><small>{applied ? "예상 초과 해소" : "약 52분 후"}</small></div>
          <div><span>차단된 대안</span><strong>1건</strong><small>12건 이관</small></div>
          <div><span>승인 대기</span><strong>{session.decision.status === "ADMIN_APPROVAL_REQUIRED" ? "1건" : "0건"}</strong><small>{decisionStatusLabels[session.decision.status]}</small></div>
        </div>
        <div className="admin-grid">
          <MultiRegionControlMap
            applied={applied}
            fixture={mapFixture}
            adapter={mapAdapter}
            selection={mapSelection}
            mapAvailable={mapAvailable}
            onMapAvailabilityChange={setMapAvailable}
            onSelectionChange={setMapSelection}
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

function RiderCompactRoute({ applied }: { applied: boolean }) {
  const currentWeather = demoWeatherRuntime.active.data[0];
  return (
    <section className={`rider-compact-map ${applied ? "is-applied" : ""}`} aria-label="현재 위치, 휴식 지점과 다음 배송지를 나타내는 합성 경로 요약">
      <div className="compact-map-heading">
        <div><span>현재 운행 경로</span><strong>{applied ? "휴식 후 조정 순서" : "17번째 배송지 전 지원"}</strong></div>
        <span className="fallback-map-badge">Fallback map</span>
      </div>
      <div className="compact-map-stage">
        <div className="compact-map-context" aria-label="합성 위치와 날씨 상태">
          <span><i aria-hidden="true">⌖</i> 합성 현재 위치</span>
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
        <div className="login-hero">
          <div className="login-brand"><span aria-hidden="true">SR</span><strong>SafeRoute</strong></div>
          <div className="login-route-art" aria-hidden="true"><i /><i /><i /><b /></div>
          <p>오늘의 배송을 시작하기 전에</p>
          <h1 id="rider-login-title">안전한 운행을<br />함께 준비합니다.</h1>
        </div>
        <div className="login-panel">
          <span className="fixture-pill">Demo fixture</span>
          <h2>기사 계정 확인</h2>
          <p>배정된 허브와 차량을 확인하고 업무 화면으로 이동합니다.</p>
          <dl>
            <div><dt>기사 ID</dt><dd>{isRecipient ? "R-024" : "R-017"}</dd></div>
            <div><dt>배정 허브</dt><dd>관악 합성 허브</dd></div>
            <div><dt>차량</dt><dd>{isRecipient ? "EV-31" : "EV-24"} · 확인됨</dd></div>
          </dl>
          <button type="button" className="button button-primary button-block login-primary" onClick={onEnter}>데모 계정으로 시작</button>
          <button type="button" className="button button-quiet button-block login-back" onClick={onBack}>관리자 화면으로 돌아가기</button>
          <small>실제 개인정보나 로그인 정보는 사용하지 않습니다.</small>
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
        <div><strong>온라인 · Demo session</strong><small>{shellReady ? "오프라인 앱 셸 준비됨" : "앱 셸 확인 중"}</small></div>
      </section>
    );
  }

  if (cacheState.status === "FRESH") {
    return (
      <section className="rider-pwa-status is-offline" aria-live="polite">
        <span aria-hidden="true">↓</span>
        <div>
          <strong>오프라인 · 마지막 승인 Demo 계획</strong>
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
  onResponse,
  pwa,
}: {
  session: DemoSession;
  courierId: string;
  isRecipient: boolean;
  onResponse: (response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED") => void;
  pwa: {
    online: boolean;
    shellReady: boolean;
    installStatus: PwaInstallStatus;
    requestInstall: () => Promise<"accepted" | "dismissed" | "UNAVAILABLE">;
    cacheState: CachedApprovedDemoPlanState;
  };
}) {
  const [tab, setTab] = useState<RiderTab>("ROUTE");
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
  const tabContentId = `rider-${tab.toLowerCase()}-panel`;
  const selectTab = (nextTab: RiderTab) => {
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <main id="main-content" className="rider-stage">
      <div className="rider-phone">
        <div className="rider-topline">
          <span className="mode-badge"><span aria-hidden="true">◇</span> {demoWeatherRuntime.displayLabel}</span>
          <span className="stopped-badge">정차 확인</span>
        </div>
        <div className="rider-route-bar">
          <div><span>관악 합성 권역</span><strong>{tab === "ROUTE" ? "오늘의 운행" : tab === "SUPPORT" ? "안전지원 검토" : "내 정보"}</strong></div>
          <div><span>배송 진행</span><strong>{isRecipient ? "9 / 24" : "14 / 31"}</strong></div>
        </div>
        {(!pwa.online || tab === "PROFILE") && (
          <RiderPwaStatus online={pwa.online} shellReady={pwa.shellReady} cacheState={pwa.cacheState} />
        )}

        {tab === "ROUTE" && (
          <section id={tabContentId} role="tabpanel" aria-labelledby="rider-route-tab">
            <p className="rider-overline">오늘의 안전배송 · {isRecipient ? "수신 기사" : "원 기사"}</p>
            <section className={`rider-hero-card ${applied ? "is-applied" : ""}`}>
              <span className="rider-hero-label">{applied ? "새 계획이 적용됐어요" : "지원 계획이 도착했어요"}</span>
              <h1>{applied ? "조정된 계획으로 운행합니다" : "약 16:20, 17번째 배송지 전까지 안전한 범위입니다"}</h1>
              <p>{applied
                ? `현재 남은 배송은 ${remainingStopCount}건이며 승인된 순서와 ETA가 적용되었습니다.`
                : "약 16:20까지 안전한 범위입니다. 비와 경사 구간, 남은 작업량이 겹쳐 정차 후 지원 계획을 확인해 주세요."}</p>
              <div className="rider-hero-metrics" aria-label="현재 운행 핵심 상태">
                <div><span>Safe-until</span><strong>{applied ? "초과 예상 해소" : "약 52분"}</strong></div>
                <div><span>다음 배송</span><strong>14번째 · 약 6분</strong></div>
              </div>
            </section>
            <section className="rider-route-summary" aria-label="오늘 배송 진행과 안전 상태">
              <div><span>배송 진행</span><strong>14 / 31</strong><small>{remainingStopCount}건 남음</small></div>
              <div><span>Safe-until</span><strong>{applied ? "초과 예상 해소" : "약 52분"}</strong><small>{applied ? "조정 계획 기준" : "17번째 배송지"}</small></div>
            </section>
            <RiderCompactRoute applied={applied} />
            <button type="button" className="button button-primary button-block rider-support-cta" onClick={() => selectTab("SUPPORT")}>{applied ? "적용 근거 확인" : "안전지원 검토"}</button>
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
                  <li>이 수치는 사고확률이 아닌 Demo 운영 위험지수입니다.</li>
                </ul>
              </details>
            </section>
          </section>
        )}

        {tab === "PROFILE" && (
          <section id={tabContentId} role="tabpanel" aria-labelledby="rider-profile-tab">
            <p className="rider-overline">내 정보 · Demo 안내</p>
            <h1>필요한 운영 상태만 공유합니다</h1>
            <p className="rider-lead">실제 인증이나 개인정보를 사용하지 않는 합성 기사 계정 화면입니다.</p>
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
              <strong>결정론적 합성 fixture · 날씨 Fallback</strong>
              <p>기상청 Live 부분 표본은 Safety 계산에 섞지 않았으며 전체 Demo 날씨 타임라인을 사용했습니다.</p>
            </section>
            <section className="rider-profile-card">
              <span>이의제기와 도움</span>
              <strong>수정·거절·정정 요청에 불이익이 없습니다</strong>
              <p>현재 데모에서는 안전지원 탭의 수정 요청과 거절로 운영팀의 재검토를 요청할 수 있습니다.</p>
            </section>
            <section className="rider-profile-card rider-pwa-card">
              <span>기기 설치와 오프라인</span>
              <strong>{pwa.installStatus === "INSTALLED" ? "이 기기에 설치됨" : pwa.installStatus === "AVAILABLE" ? "이 기기에 설치할 수 있음" : pwa.shellReady ? "오프라인 앱 셸 준비됨" : "설치 조건 확인 중"}</strong>
              <p>마지막 승인·적용 Demo 계획만 30분 동안 기기에 최소 필드로 저장합니다. 오프라인에서는 읽기 전용이며 만료 계획을 최신으로 표시하지 않습니다.</p>
              <button
                type="button"
                className="button button-secondary button-block"
                disabled={pwa.installStatus !== "AVAILABLE"}
                onClick={() => void pwa.requestInstall()}
              >{pwa.installStatus === "INSTALLED" ? "설치 완료" : pwa.installStatus === "AVAILABLE" ? "이 기기에 설치" : "브라우저 설치 조건 확인"}</button>
              <small>실제 인증·위치 권한·푸시 알림은 포함하지 않습니다.</small>
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

export function App({ initialSession, initialExplanation }: AppProps) {
  const [role, setRole] = useState<Role>("ADMIN");
  const [riderEntry, setRiderEntry] = useState<Record<"SOURCE" | "RECIPIENT", boolean>>({
    SOURCE: false,
    RECIPIENT: false,
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
      {role === "ADMIN" || riderEntry[role] ? (
        <>
          <AppHeader role={role} session={session} onRoleChange={setRole} onReset={reset} />
          <div className="global-announcement" aria-live="polite">
            <StatusPill session={session} />
            <span>{session.announcement}</span>
            <code>{session.decision.decisionId}</code>
          </div>
        </>
      ) : null}
      {role === "ADMIN" ? (
        <AdminDashboard
          session={session}
          explanation={explanation}
          explanationLoading={explanationLoading}
          onOpenApproval={() => setApprovalOpen(true)}
          onGenerateExplanation={() => void requestExplanation(false)}
          onFallbackExplanation={() => void requestExplanation(true)}
        />
      ) : riderEntry[role] ? (
        <RiderView
          session={session}
          courierId={role === "SOURCE" ? demoSourceCourierId : demoRecipientCourierId}
          isRecipient={role === "RECIPIENT"}
          onResponse={(response) => respond(role === "SOURCE" ? demoSourceCourierId : demoRecipientCourierId, response)}
          pwa={{ ...pwaRuntime, cacheState: cachedPlanState }}
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
