import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createMultiRegionMapFixture } from "../adapters/fixtures";
import {
  createFixtureMapAdapter,
  createKakaoMapDemoDirectionsUrl,
  createRiderCompactMapModel,
  fetchKakaoDirectionsPreview,
  KakaoDirectionsClientError,
  type GeographicPoint,
  type KakaoDirectionsPreview,
  type RiderCompactMapModel,
} from "../adapters/maps";
import {
  loadKakaoMapsSdk,
  type KakaoMapInstance,
  type KakaoMapOverlay,
} from "../adapters/maps/kakao";
import { createInitialDemoSession } from "./demoSession";

type PreviewScreen =
  | "admin-support"
  | "admin-route"
  | "admin-interventions"
  | "admin-applied"
  | "admin-audit"
  | "rider-login"
  | "rider-route"
  | "rider-support-source"
  | "rider-support-recipient"
  | "rider-profile"
  | "rider-applied";

type DesignMarker = {
  label: string;
  point: GeographicPoint;
  tone?: "blue" | "green" | "amber" | "red";
};

const previewLabels: Record<PreviewScreen, string> = {
  "admin-support": "관리자 · 지원상황",
  "admin-route": "관리자 · 경로",
  "admin-interventions": "관리자 · 개입 검토",
  "admin-applied": "관리자 · 계획 적용 완료",
  "admin-audit": "관리자 · 감사기록",
  "rider-login": "기사 · 로그인",
  "rider-route": "기사 · 운행 홈",
  "rider-support-source": "기사 · R-017 지원 검토",
  "rider-support-recipient": "기사 · R-024 지원 검토",
  "rider-profile": "기사 · 내 정보",
  "rider-applied": "기사 · 지원 적용 완료",
};

function hashFor(screen: PreviewScreen) {
  return `#${screen}`;
}

function screenFromHash(): PreviewScreen {
  const candidate = window.location.hash.slice(1) as PreviewScreen;
  return Object.hasOwn(previewLabels, candidate) ? candidate : "admin-support";
}

function DataBadges() {
  return (
    <div className="rd-badges" aria-label="데이터 상태">
      <span className="is-blue">◇ Demo fixture</span>
      <span className="is-amber">⛅ Weather Fallback</span>
      <span>● Live 0명</span>
    </div>
  );
}

function DesignKakaoMap({
  ariaLabel,
  markers,
  paths,
  className = "",
}: {
  ariaLabel: string;
  markers: DesignMarker[];
  paths?: GeographicPoint[][];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"LOADING" | "LIVE" | "FALLBACK">("LOADING");
  const key = import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? "";

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !key || markers.length === 0) {
      setStatus("FALLBACK");
      return;
    }
    let disposed = false;
    let map: KakaoMapInstance | undefined;
    const overlays: KakaoMapOverlay[] = [];
    void loadKakaoMapsSdk(key)
      .then((maps) => {
        if (disposed) return;
        const center = new maps.LatLng(
          markers[0].point.latitude,
          markers[0].point.longitude,
        );
        map = new maps.Map(container, { center, level: 5 });
        const bounds = new maps.LatLngBounds();
        const allPoints = [
          ...markers.map((marker) => marker.point),
          ...(paths ?? []).flat(),
        ];
        allPoints.forEach((point) => {
          bounds.extend(new maps.LatLng(point.latitude, point.longitude));
        });
        (paths ?? []).forEach((path, index) => {
          if (path.length < 2 || !map) return;
          overlays.push(new maps.Polyline({
            map,
            path: path.map((point) => new maps.LatLng(point.latitude, point.longitude)),
            strokeWeight: index === 0 ? 5 : 3,
            strokeColor: index === 0 ? "#2563eb" : "#0b8f43",
            strokeOpacity: 0.88,
            strokeStyle: index === 0 ? "solid" : "shortdash",
            zIndex: 4,
          }));
        });
        markers.forEach((marker) => {
          if (!map) return;
          const content = document.createElement("div");
          content.className = `rd-map-marker is-${marker.tone ?? "blue"}`;
          content.textContent = marker.label;
          overlays.push(new maps.CustomOverlay({
            map,
            position: new maps.LatLng(marker.point.latitude, marker.point.longitude),
            content,
            xAnchor: 0.5,
            yAnchor: 1,
            zIndex: 8,
          }));
        });
        map.setBounds(bounds, 48, 48, 48, 48);
        setStatus("LIVE");
      })
      .catch(() => {
        if (!disposed) setStatus("FALLBACK");
      });
    return () => {
      disposed = true;
      overlays.forEach((overlay) => overlay.setMap(null));
      map = undefined;
    };
  }, [key, markers, paths]);

  return (
    <div className={`rd-map ${className}`} role="img" aria-label={ariaLabel}>
      <div ref={containerRef} className="rd-map-canvas" />
      {status !== "LIVE" && (
        <div className="rd-map-fallback">
          <div className="rd-map-fallback-road" />
          {markers.slice(0, 4).map((marker, index) => (
            <span
              key={`${marker.label}-${index}`}
              className={`rd-map-fallback-pin pin-${index + 1} is-${marker.tone ?? "blue"}`}
            >
              {marker.label}
            </span>
          ))}
        </div>
      )}
      <span className={`rd-map-status is-${status.toLowerCase()}`}>
        {status === "LIVE"
          ? "Kakao map · Demo overlay"
          : status === "LOADING"
            ? "Kakao map 불러오는 중"
            : "Kakao 오류 · Fallback map"}
      </span>
    </div>
  );
}

function DirectionsCard({ model }: { model: RiderCompactMapModel }) {
  const [preview, setPreview] = useState<KakaoDirectionsPreview | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchKakaoDirectionsPreview({ signal: controller.signal })
      .then((result) => {
        setPreview(result);
        setFallback(null);
      })
      .catch((error) => {
        setPreview(null);
        setFallback(error instanceof KakaoDirectionsClientError ? error.code : "NETWORK_ERROR");
      });
    return () => controller.abort();
  }, []);

  const minutes = preview ? Math.max(1, Math.round(preview.durationSeconds / 60)) : null;
  const kilometers = preview ? (preview.distanceMeters / 1_000).toFixed(1) : null;
  return (
    <section className="rd-directions-card" aria-label="Kakao Demo 길찾기">
      <div>
        <span>자동차 길찾기 · 합성 세 지점</span>
        <strong>{preview ? `${kilometers} km · 약 ${minutes}분` : "Demo 경로로 계속"}</strong>
      </div>
      <span className={preview ? "is-live" : "is-fallback"}>
        {preview ? "Kakao Mobility 연결" : `Fallback · ${fallback ?? "확인 중"}`}
      </span>
      <a
        href={createKakaoMapDemoDirectionsUrl(model)}
        target="_blank"
        rel="noreferrer"
      >
        카카오맵에서 Demo 길찾기
      </a>
      <small>합성 위치 표시 전용 · Safety 계산과 배송순서를 변경하지 않습니다.</small>
    </section>
  );
}

function SafetyTrack({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  return (
    <div className="rd-safety-track" aria-label={`안전여유 ${before}에서 ${after}로 변경`}>
      <div className="rd-safety-values">
        <span><small>현재 계획</small><strong className="is-before">{before}</strong></span>
        <i aria-hidden="true">→</i>
        <span><small>조정 후</small><strong className="is-after">{after}</strong></span>
      </div>
      <div className="rd-track-bar"><i style={{ left: `${Math.min(100, Number(after))}%` }} /></div>
      <div className="rd-track-labels"><span>30 한계</span><span>45 기준</span><span>60 정상</span></div>
    </div>
  );
}

function AdminNav({
  screen,
  navigate,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
}) {
  const items: Array<[PreviewScreen, string, string]> = [
    ["admin-support", "▤", "지원 상황"],
    ["admin-route", "◈", "경로"],
    ["admin-interventions", "⚖", "개입 검토"],
    ["admin-audit", "▤", "감사기록"],
  ];
  const activeScreen = screen === "admin-applied" ? "admin-support" : screen;
  return (
    <aside className="rd-admin-nav">
      <div className="rd-brand"><span>SR</span><div><strong>SafeRoute AI</strong><small>운영 안전 코파일럿</small></div></div>
      <nav aria-label="새 관리자 화면">
        {items.map(([value, icon, label]) => (
          <button
            type="button"
            className={activeScreen === value ? "is-active" : undefined}
            key={value}
            onClick={() => navigate(value)}
          >
            <span aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
      </nav>
      <div className="rd-simulation-note">
        <strong>Simulation result</strong>
        <span>실제 사고감소 효과가 아닙니다. 합성 fixture 기반 결정론적 시뮬레이션입니다.</span>
      </div>
    </aside>
  );
}

function AdminFrame({
  screen,
  navigate,
  children,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
  children: ReactNode;
}) {
  return (
    <div className="rd-admin-shell">
      <AdminNav screen={screen} navigate={navigate} />
      <main className="rd-admin-main">
        {children}
      </main>
    </div>
  );
}

function AdminHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="rd-admin-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <DataBadges />
    </header>
  );
}

function KpiStrip({ applied = false }: { applied?: boolean }) {
  const cards = [
    ["지원 필요 상황", applied ? "0" : "1", applied ? "조정 완료" : "52분 후"],
    ["60분 내 임계치 예상", applied ? "0" : "1", applied ? "초과 해소" : "17번째 전"],
    ["차단된 대안", "1", "기준 45 미달"],
    ["승인 대기", applied ? "0" : "1", applied ? "적용 완료" : "검토 필요"],
  ];
  return (
    <section className="rd-kpi-strip" aria-label="운영 요약">
      {cards.map(([label, value, detail]) => (
        <article key={label}><span>{label}</span><strong>{value}<small>건</small></strong><p>{detail}</p></article>
      ))}
    </section>
  );
}

function AdminSupportScreen({
  nationalMarkers,
  navigate,
  openApproval,
}: {
  nationalMarkers: DesignMarker[];
  navigate: (screen: PreviewScreen) => void;
  openApproval: () => void;
}) {
  return (
    <>
      <AdminHeader
        title="향후 60분 안에 어떤 지원이 필요한가?"
        subtitle="2026년 7월 14일 · Asia/Seoul · 입력 신뢰도 60 보통"
      />
      <div className="rd-stepper" aria-label="결정 진행 단계">
        {["판단", "기사 검토", "관리자 승인", "계획 적용"].map((label, index) => (
          <span key={label} className={index === 1 ? "is-current" : index === 0 ? "is-done" : undefined}><i>{index === 0 ? "✓" : index + 1}</i>{label}</span>
        ))}
      </div>
      <KpiStrip />
      <section className="rd-admin-decision-grid">
        <div className="rd-decision-column">
          <article className="rd-card rd-question-card">
            <div className="rd-card-topline"><span>지금 답할 질문</span><b>승인 대기 · 신뢰도 60</b></div>
            <h2>약 52분 후 17번째 배송지 전에,<br />10분 휴식과 배송 8건 이관이 필요합니다</h2>
            <p>Safe-until 16:20 · 화면 연결 미리보기에서는 계획을 변경하지 않습니다.</p>
          </article>
          <article className="rd-card">
            <div className="rd-card-topline"><strong>R-017 안전여유</strong><b>29.9 → 47.2</b></div>
            <SafetyTrack before="29.9" after="47.2" />
          </article>
          <div className="rd-impact-grid">
            <article className="rd-card"><span className="rd-avatar is-blue">R-017</span><h3>지원받는 기사</h3><strong>29.9 → 47.2</strong><p>담당 배송 17건 → 9건</p></article>
            <article className="rd-card"><span className="rd-avatar is-green">R-024</span><h3>배송을 나눠 맡는 기사</h3><strong>52.5 → 45.0</strong><p>담당 배송 +8건</p></article>
          </div>
          <article className="rd-card rd-route-ribbon">
            <div className="rd-card-topline"><strong>경로 리본 · 배송 순서</strong><b>휴식이 경사 구간보다 먼저입니다</b></div>
            <div className="rd-ribbon-line"><span>지금 · 14번째</span><span>☕ 10분 휴식</span><span>⛰ 경사 구간</span><span>📦 17번째 배송지</span></div>
          </article>
        </div>
        <article className="rd-card rd-map-column">
          <div className="rd-card-topline"><strong>다지역 합성 운영 지도</strong><b>권역 보기</b></div>
          <DesignKakaoMap
            ariaLabel="Kakao 기반 세 합성 권역 지원 상황 지도"
            markers={nationalMarkers}
            className="rd-admin-overview-map"
          />
          <div className="rd-blocked-note">12건 이관은 기준 45 미달로 화면상 차단 상태입니다.</div>
          <button type="button" className="rd-primary-button" onClick={openApproval}>승인 검토 열기</button>
          <button type="button" className="rd-link-button" onClick={() => navigate("admin-route")}>상세 경로에서 보기 →</button>
        </article>
      </section>
    </>
  );
}

function AdminRouteScreen({
  markers,
  path,
}: {
  markers: DesignMarker[];
  path: GeographicPoint[];
}) {
  return (
    <>
      <AdminHeader title="경로 · 계획 vs 적용" subtitle="합성 북부권역 / R-017 / decision-scenario-a-ui-v1" />
      <KpiStrip />
      <section className="rd-route-grid">
        <article className="rd-card">
          <div className="rd-card-topline"><strong>선택한 지원 decision과 계획 경로</strong><b>Kakao map · Demo overlay</b></div>
          <DesignKakaoMap
            ariaLabel="Kakao 기반 현재 위치, 휴식 지점과 17번째 배송지 경로"
            markers={markers}
            paths={[path]}
            className="rd-admin-route-map"
          />
        </article>
        <div className="rd-route-side">
          <article className="rd-card">
            <div className="rd-card-topline"><strong>Safety Budget 변화</strong><b>100에서 시작해 줄어듦</b></div>
            <SafetyTrack before="29.9" after="47.2" />
            <div className="rd-mini-chart" aria-label="계획 전후 Safety Budget 도식"><i /><i /><i /><i /><i /></div>
          </article>
          <article className="rd-card rd-next-segments">
            <strong>다음 구간</strong>
            <span><b>14번째</b> 현재 배송 구간</span>
            <span><b>휴식</b> 10분 안전 거점</span>
            <span><b>17번째 전</b> 약 52분 후 지원 기준</span>
          </article>
        </div>
      </section>
    </>
  );
}

function AdminInterventionsScreen({ openApproval }: { openApproval: () => void }) {
  const candidates = [
    ["10분 휴식 + 8건 이관", "47.2", "+10분", "45.0", "추천"],
    ["10분 휴식", "37.8", "+10분", "—", "초과 잔존"],
    ["8건 이관", "42.1", "-15분", "45.0", "검토"],
    ["12건 이관", "49.4", "-22분", "40.6", "실행 불가"],
  ];
  return (
    <>
      <AdminHeader title="개입 검토 · 어떤 지원을 승인할까?" subtitle="안전한 후보를 먼저 남기고 운영 영향을 비교합니다." />
      <section className="rd-intervention-cards">
        {candidates.map(([name, budget, eta, recipient, result], index) => (
          <article className={`rd-card ${index === 0 ? "is-recommended" : index === 3 ? "is-blocked" : ""}`} key={name}>
            <span>{result}</span><h2>{name}</h2><strong>{budget}</strong><p>종료 {eta} · 수신 기사 {recipient}</p>
          </article>
        ))}
      </section>
      <section className="rd-intervention-grid">
        <article className="rd-card rd-table-card">
          <div className="rd-card-topline"><strong>전체 계획 비교</strong><b>화면 연결용 고정 Demo 수치</b></div>
          <table>
            <thead><tr><th>조정안</th><th>원 기사 최소</th><th>종료 영향</th><th>수신 기사 최소</th><th>결과</th></tr></thead>
            <tbody>{candidates.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
          </table>
          <div className="rd-blocked-note is-danger">12건 이관은 수신 기사 40.6으로 기준 45를 통과하지 못합니다.</div>
        </article>
        <article className="rd-card rd-guard-card">
          <span className="rd-guard-icon">✓</span><h2>Risk Transfer Guard</h2>
          <p>R-024가 배송 8건을 받은 뒤에도 최소 안전여유 45.0을 유지하는 화면 상태입니다.</p>
          <ul><li>용량 조건 통과</li><li>시간창 조건 통과</li><li>권역 호환 통과</li></ul>
          <button type="button" className="rd-primary-button" onClick={openApproval}>승인 검토</button>
        </article>
      </section>
    </>
  );
}

function AdminAppliedScreen({ navigate }: { navigate: (screen: PreviewScreen) => void }) {
  return (
    <>
      <AdminHeader title="지원 계획 적용이 완료되었습니다" subtitle="Demo 화면 전환 결과 · 실제 배송계획은 변경하지 않습니다." />
      <div className="rd-stepper is-complete">{["판단", "기사 검토", "관리자 승인", "계획 적용"].map((label) => <span className="is-done" key={label}><i>✓</i>{label}</span>)}</div>
      <KpiStrip applied />
      <section className="rd-applied-grid">
        <article className="rd-card rd-applied-hero"><span className="rd-success-mark">✓</span><h2>10분 휴식과 배송 8건 이관</h2><p>경로·순서·작업목록·ETA가 함께 갱신된 디자인 상태입니다.</p><button type="button" className="rd-primary-button" onClick={() => navigate("rider-applied")}>기사 적용 화면 보기</button></article>
        <article className="rd-card"><div className="rd-card-topline"><strong>두 기사 결과</strong><b>기준 통과</b></div><div className="rd-impact-grid"><div><span>R-017</span><strong>29.9 → 47.2</strong><p>배송 8건 감소</p></div><div><span>R-024</span><strong>52.5 → 45.0</strong><p>배송 8건 추가</p></div></div><SafetyTrack before="29.9" after="47.2" /></article>
      </section>
    </>
  );
}

function AdminAuditScreen() {
  const events = [
    ["15:28", "계획 평가", "52분 후 17번째 배송지 전 예상"],
    ["15:31", "후보 비교", "10분 휴식 + 8건 이관 선택"],
    ["15:34", "기사 응답", "R-017 / R-024 화면 확인"],
    ["15:36", "관리자 검토", "승인 화면 연결"],
    ["15:37", "계획 적용", "화면 상태 전환 완료"],
  ];
  return (
    <>
      <AdminHeader title="감사기록 · 결정 추적" subtitle="decision-scenario-a-ui-v1 · Simulation result" />
      <section className="rd-audit-grid">
        <article className="rd-card rd-audit-timeline">
          <div className="rd-card-topline"><strong>결정 타임라인</strong><b>Demo</b></div>
          <ol>{events.map(([time, title, detail]) => <li key={time}><time>{time}</time><div><strong>{title}</strong><span>{detail}</span></div></li>)}</ol>
          <div className="rd-blocked-note">실제 사고감소 효과가 아닌 합성 화면 연결 결과입니다.</div>
        </article>
        <article className="rd-card rd-audit-table">
          <div className="rd-card-topline"><strong>감사 로그</strong><b>읽기 전용</b></div>
          <table><thead><tr><th>시각</th><th>역할</th><th>상태</th></tr></thead><tbody>{events.map(([time, title]) => <tr key={time}><td>{time}</td><td>Demo</td><td>{title}</td></tr>)}</tbody></table>
          <section className="rd-evidence-card"><span>Upstage 근거 설명</span><strong>이번 미리보기에서는 연결하지 않음</strong><p>Kakao 지도·길찾기 외 기능은 디자인 확정 후 다시 연결합니다.</p></section>
        </article>
      </section>
    </>
  );
}

function ApprovalPreviewDialog({
  open,
  close,
  apply,
}: {
  open: boolean;
  close: () => void;
  apply: () => void;
}) {
  if (!open) return null;
  return (
    <div className="rd-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="rd-dialog" role="dialog" aria-modal="true" aria-labelledby="rd-dialog-title">
        <header><div><span>관리자 최종 확인</span><h2 id="rd-dialog-title">승인 후 계획을 적용할까요?</h2></div><button type="button" aria-label="승인 창 닫기" onClick={close}>×</button></header>
        <p>두 기사 영향과 화면의 안전기준을 확인했습니다. 이 미리보기에서는 실제 계획을 저장하지 않습니다.</p>
        <div className="rd-dialog-metrics"><div><span>원 기사 최소</span><strong>29.9 → 47.2</strong></div><div><span>수신 기사 최소</span><strong>52.5 → 45.0</strong></div><div><span>고객 최대 ETA</span><strong>+10분</strong></div><div><span>예상 초과</span><strong>해소</strong></div></div>
        <section className="rd-dialog-checks"><strong>승인 조건</strong><span>✓ R-017 화면 확인</span><span>✓ R-024 화면 확인</span><span>✓ 수신 기사 기준 45.0</span><span>✓ Demo 화면 전환</span></section>
        <section className="rd-notice-preview"><span>미리보기</span><strong>고객안내</strong><p>안전한 배송운영을 위해 일부 배송순서가 조정됩니다.</p></section>
        <footer><button type="button" onClick={close}>보류</button><button type="button" onClick={close}>수정 요청</button><button type="button" className="is-primary" onClick={apply}>승인 및 계획 적용</button></footer>
      </section>
    </div>
  );
}

function MobileStatus() {
  return <div className="rd-mobile-status" aria-hidden="true"><span>10:21</span><span>▂▄▆█　5G　▰</span></div>;
}

function RiderTabs({
  screen,
  navigate,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
}) {
  const routeActive = screen === "rider-route" || screen === "rider-applied";
  const supportActive = screen.startsWith("rider-support");
  return (
    <nav className="rd-rider-tabs" aria-label="기사 화면">
      <button type="button" className={routeActive ? "is-active" : undefined} onClick={() => navigate("rider-route")}><span>🚚</span>운행</button>
      <button type="button" className={supportActive ? "is-active" : undefined} onClick={() => navigate("rider-support-source")}><span>🛟</span>안전지원</button>
      <button type="button" className={screen === "rider-profile" ? "is-active" : undefined} onClick={() => navigate("rider-profile")}><span>👤</span>내 정보</button>
    </nav>
  );
}

function RiderFrame({
  screen,
  navigate,
  title,
  children,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="rd-rider-stage">
      <section className="rd-phone">
        <MobileStatus />
        <header className="rd-rider-header"><div className="rd-brand"><span>SR</span><div><strong>{title}</strong><small>합성 Demo 화면</small></div></div><a href="/">기존 화면</a></header>
        <div className="rd-rider-scroll">{children}</div>
        <RiderTabs screen={screen} navigate={navigate} />
      </section>
    </main>
  );
}

function RiderLoginScreen({ navigate }: { navigate: (screen: PreviewScreen) => void }) {
  return (
    <main className="rd-rider-stage">
      <section className="rd-phone rd-login">
        <MobileStatus />
        <div className="rd-login-hero"><div className="rd-brand"><span>SR</span><strong>SafeRoute AI</strong></div><div className="rd-login-route-art"><i /><i /><i /><b /></div><p>오늘의 배송을 시작하기 전에</p><h1>안전한 운행을<br />함께 준비합니다.</h1></div>
        <div className="rd-login-panel"><span className="rd-fixture-pill">◇ Demo fixture</span><h2>기사 계정 확인</h2><p>배정된 허브와 차량을 확인하고 업무 화면으로 이동합니다.</p><dl><div><dt>기사 ID</dt><dd>R-017</dd></div><div><dt>배정 허브</dt><dd>관악 합성 허브</dd></div><div><dt>차량</dt><dd>EV-24 · 확인됨</dd></div></dl><button type="button" className="rd-primary-button" onClick={() => navigate("rider-route")}>데모 계정으로 시작</button><a href="/">관리자 화면으로 돌아가기</a><small>실제 개인정보나 로그인 정보는 사용하지 않습니다.</small></div>
      </section>
    </main>
  );
}

function RiderRouteScreen({
  screen,
  navigate,
  riderModel,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
  riderModel: RiderCompactMapModel;
}) {
  const markers: DesignMarker[] = [
    { label: "현재", point: riderModel.current, tone: "blue" },
    { label: "휴식", point: riderModel.rest, tone: "amber" },
    { label: "17번째", point: riderModel.next, tone: "green" },
  ];
  return (
    <RiderFrame screen={screen} navigate={navigate} title="SafeRoute AI">
      <section className="rd-rider-hero">
        <div><span>좋은 아침입니다</span><h1>R-017 기사님,<br />안전한 하루 되세요</h1></div>
        <div className="rd-truck-art" aria-hidden="true"><i /><b /></div>
      </section>
      <div className="rd-rider-content">
        <div className="rd-mobile-two"><article className="rd-card"><span className="rd-safe-text">● 운행 중</span><strong>14 <small>/31 배송</small></strong><div className="rd-progress"><i /></div></article><article className="rd-card"><span>데이터 상태</span><DataBadges /></article></div>
        <article className="rd-card rd-rider-safety"><div className="rd-gauge"><strong>54.7</strong><span>주의 구간</span></div><div><span>내 안전여유</span><b>Safe-until 16:20</b><small>약 52분 · 45~60 주의 구간</small></div></article>
        <article className="rd-card"><div className="rd-card-topline"><strong>오늘 경로</strong><b>합성 Demo 경로 · GPS 길안내 아님</b></div><DesignKakaoMap ariaLabel="기사의 합성 현재 위치, 휴식과 17번째 배송지 Kakao 지도" markers={markers} paths={[riderModel.path]} className="rd-rider-map" /></article>
        <DirectionsCard model={riderModel} />
        <article className="rd-card rd-recommend-card"><span>◈ 권장 지원 화면</span><h2>10분 휴식 + 배송 8건 이관</h2><p>안전여유 <b>29.9 → 47.2</b> · 정차 후 검토</p><button type="button" className="rd-primary-button" onClick={() => navigate("rider-support-source")}>안전지원 검토하기</button></article>
      </div>
    </RiderFrame>
  );
}

function RiderSupportScreen({
  screen,
  navigate,
  recipient,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
  recipient: boolean;
}) {
  const before = recipient ? "52.5" : "29.9";
  const after = recipient ? "45.0" : "47.2";
  return (
    <RiderFrame screen={screen} navigate={navigate} title="안전지원 검토">
      <div className="rd-support-header"><strong>◈ 안전지원 검토</strong><span>정차 확인됨</span><DataBadges /></div>
      <div className="rd-rider-content">
        <article className="rd-card rd-support-hero"><span>{recipient ? "함께 안전기준을 확인했어요" : "약 52분 안에 지원이 필요할 수 있어요"}</span><h1>{recipient ? "배송지 8건을 전달받습니다" : <>10분 쉬고,<br />배송지 8건을 이관합니다</>}</h1><p>{recipient ? "R-024 · 배송 9/24 · 이관 후 기준 45 통과" : "R-017 · 배송 14/31 · 17번째 배송지 전 · Safe-until 16:20"}</p></article>
        <article className="rd-card"><div className="rd-card-topline"><strong>내 안전여유가 이렇게 바뀝니다</strong><b>{before} → {after}</b></div><SafetyTrack before={before} after={after} /></article>
        <article className="rd-card rd-support-copy"><span>조정 권장 · 입력 신뢰도 60 보통</span><p>{recipient ? "배송 8건을 받은 뒤에도 최소 기준 45를 유지하는 화면 상태입니다." : "10분 휴식 후 8건을 이관하면 예상 초과를 피하는 화면 상태입니다."} <strong>아직 실제 계획은 바뀌지 않습니다.</strong></p></article>
        <div className="rd-equal-actions"><button type="button" onClick={() => navigate(recipient ? "admin-support" : "rider-support-recipient")}>이 조정에 동의</button><button type="button">다른 방법 요청</button><button type="button">지금은 거절</button></div>
        <p className="rd-nonpunitive">거절해도 불이익 없음 · 현재는 화면 연결 미리보기입니다.</p>
      </div>
    </RiderFrame>
  );
}

function RiderProfileScreen({
  screen,
  navigate,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
}) {
  return (
    <RiderFrame screen={screen} navigate={navigate} title="내 정보">
      <section className="rd-profile-hero"><span>내 정보 · Demo 안내</span><h1>필요한 운영 상태만 공유합니다</h1><p>실제 인증이나 개인정보를 사용하지 않는 합성 기사 계정 화면입니다.</p></section>
      <div className="rd-rider-content">
        <div className="rd-profile-icons"><article><span>◇</span><strong>공유</strong><small>운영 파생 상태</small></article><article><span>⊘</span><strong>비공유</strong><small>생체·장기 궤적</small></article><article><span>↺</span><strong>기사 권리</strong><small>수정·거절·정정</small></article></div>
        <section className="rd-profile-list"><article><span>관리자에게 보이는 정보</span><strong>날씨·경로·작업량의 파생 상태</strong></article><article><span>이 결정에 사용한 데이터</span><strong>결정론적 합성 fixture</strong></article><article><span>현재 연결 기능</span><strong>Kakao 지도·길찾기</strong></article></section>
        <div className="rd-blocked-note">실제 인증·위치 권한·푸시 알림은 포함하지 않습니다.</div>
      </div>
    </RiderFrame>
  );
}

function RiderAppliedScreen({
  screen,
  navigate,
}: {
  screen: PreviewScreen;
  navigate: (screen: PreviewScreen) => void;
}) {
  return (
    <RiderFrame screen={screen} navigate={navigate} title="지원 적용 완료">
      <section className="rd-applied-mobile-hero"><span className="rd-success-mark">✓</span><p>새 계획 화면이 준비됐어요</p><h1>10분 휴식 후<br />배송을 이어갑니다</h1></section>
      <div className="rd-rider-content">
        <article className="rd-card"><div className="rd-card-topline"><strong>내 변화</strong><b>적용 완료</b></div><SafetyTrack before="29.9" after="47.2" /></article>
        <div className="rd-mobile-two"><article className="rd-card"><span>담당 배송</span><strong>17 → 9건</strong><p>8건 감소</p></article><article className="rd-card"><span>Safe-until</span><strong>초과 예상 해소</strong><p>조정 계획 기준</p></article></div>
        <article className="rd-card rd-next-action"><span>다음 행동</span><h2>안전한 위치에서 10분 휴식</h2><p>휴식 후 조정된 배송순서 화면을 확인합니다.</p><button type="button" className="rd-primary-button" onClick={() => navigate("rider-route")}>운행 화면으로 이동</button></article>
        <p className="rd-nonpunitive">화면 연결 미리보기 · 실제 계획 적용 아님</p>
      </div>
    </RiderFrame>
  );
}

export function RedesignPreview() {
  const [screen, setScreen] = useState<PreviewScreen>(() => screenFromHash());
  const [approvalOpen, setApprovalOpen] = useState(false);
  const session = useMemo(() => createInitialDemoSession(), []);
  const mapData = useMemo(() => {
    const fixture = createMultiRegionMapFixture({
      primaryDecisionId: session.decision.decisionId,
    });
    const adapter = createFixtureMapAdapter(fixture);
    const national = adapter.getModel();
    const decision = adapter.getModel(
      adapter.selectionForDecision(session.decision.decisionId),
    );
    const rider = createRiderCompactMapModel(
      adapter,
      session.decision.decisionId,
    );
    return { national, decision, rider };
  }, [session.decision.decisionId]);

  useEffect(() => {
    const onHashChange = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next: PreviewScreen) => {
    setApprovalOpen(false);
    if (window.location.hash !== hashFor(next)) {
      window.location.hash = hashFor(next);
    } else {
      setScreen(next);
    }
  };

  const nationalMarkers = mapData.national.regions.map<DesignMarker>((region, index) => ({
    label: `${region.label} ${region.supportDecisionCount}`,
    point: region.geographicPoint,
    tone: index === 0 ? "red" : "green",
  }));
  const selectedPath = mapData.decision.routes[0]?.geographicPoints ?? mapData.rider.path;
  const decisionMarkers: DesignMarker[] = [
    { label: "현재", point: mapData.rider.current, tone: "blue" },
    { label: "10분 휴식", point: mapData.rider.rest, tone: "amber" },
    { label: "17번째 전", point: mapData.rider.next, tone: "red" },
  ];

  const adminScreens = screen.startsWith("admin-");
  let content: ReactNode;
  if (screen === "admin-support") {
    content = <AdminSupportScreen nationalMarkers={nationalMarkers} navigate={navigate} openApproval={() => setApprovalOpen(true)} />;
  } else if (screen === "admin-route") {
    content = <AdminRouteScreen markers={decisionMarkers} path={selectedPath} />;
  } else if (screen === "admin-interventions") {
    content = <AdminInterventionsScreen openApproval={() => setApprovalOpen(true)} />;
  } else if (screen === "admin-applied") {
    content = <AdminAppliedScreen navigate={navigate} />;
  } else if (screen === "admin-audit") {
    content = <AdminAuditScreen />;
  } else if (screen === "rider-login") {
    return <RiderLoginScreen navigate={navigate} />;
  } else if (screen === "rider-route") {
    return <RiderRouteScreen screen={screen} navigate={navigate} riderModel={mapData.rider} />;
  } else if (screen === "rider-support-source") {
    return <RiderSupportScreen screen={screen} navigate={navigate} recipient={false} />;
  } else if (screen === "rider-support-recipient") {
    return <RiderSupportScreen screen={screen} navigate={navigate} recipient />;
  } else if (screen === "rider-profile") {
    return <RiderProfileScreen screen={screen} navigate={navigate} />;
  } else {
    return <RiderAppliedScreen screen={screen} navigate={navigate} />;
  }

  return (
    <>
      {adminScreens && <AdminFrame screen={screen} navigate={navigate}>{content}</AdminFrame>}
      <ApprovalPreviewDialog
        open={approvalOpen}
        close={() => setApprovalOpen(false)}
        apply={() => navigate("admin-applied")}
      />
    </>
  );
}
