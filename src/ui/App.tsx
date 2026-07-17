import { useEffect, useRef, useState } from "react";
import type {
  ExplanationResult,
  InterventionCandidate,
} from "../domain/contracts";
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

function AppHeader({
  role,
  onRoleChange,
  onReset,
}: {
  role: Role;
  onRoleChange: (role: Role) => void;
  onReset: () => void;
}) {
  return (
    <header className="app-header">
      <div className="brand-lockup" aria-label="SafeRoute AI">
        <span className="brand-mark" aria-hidden="true">SR</span>
        <span>
          <strong>SafeRoute AI</strong>
          <small>안전운영 코파일럿</small>
        </span>
      </div>
      <RoleSwitcher role={role} onChange={onRoleChange} />
      <div className="header-actions">
        <span className="mode-badge"><span aria-hidden="true">◇</span> {demoWeatherRuntime.displayLabel}</span>
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
      ? "purple"
      : status === "RIDER_DECLINED"
        ? "neutral"
        : "pending";
  return <span className={`status-pill status-${tone}`}>{decisionStatusLabels[status]}</span>;
}

function AdminNavigation() {
  return (
    <nav className="admin-nav" aria-label="관리자 주요 메뉴">
      <p className="nav-label">운영</p>
      <a className="nav-item is-current" href="#control-tower" aria-current="page">
        <span aria-hidden="true">⌂</span><span>Control Tower</span>
      </a>
      {[
        ["경로", "준비 중"],
        ["기사", "준비 중"],
        ["개입안", "1건 대기"],
      ].map(([label, meta]) => (
        <span className="nav-item is-muted" key={label}>
          <span aria-hidden="true">·</span><span>{label}<small>{meta}</small></span>
        </span>
      ))}
      <p className="nav-label nav-label-later">책임과 기록</p>
      <a className="nav-item" href="#audit"><span aria-hidden="true">≡</span><span>Privacy / Audit</span></a>
      <div className="nav-simulation">
        <strong>Simulation result</strong>
        <span>실제 사고감소 효과가 아닙니다.</span>
      </div>
    </nav>
  );
}

function RouteSchematic({ applied }: { applied: boolean }) {
  return (
    <section className="panel route-panel" aria-labelledby="route-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">합성 관악 허브 · 우천 경사 권역</p>
          <h2 id="route-heading">남은 배송계획과 예상 초과 지점</h2>
        </div>
        <span className="legend"><i className="legend-current" /> 현재 계획 <i className="legend-adjusted" /> 조정 계획</span>
      </div>
      <div className="route-canvas" role="img" aria-label={applied
        ? "8건 이관이 적용되어 원 기사 배송지가 9건으로 조정된 개략 경로"
        : "17번째 배송지에서 52분 후 임계치 초과가 예상되는 개략 경로"}
      >
        <div className={`route-line ${applied ? "is-applied" : ""}`} />
        {demoFixture.stops.map((stop, index) => (
          <span
            key={stop.stopId}
            className={`route-stop ${index >= 9 && applied ? "is-transferred" : ""} ${index === 16 && !applied ? "is-breach" : ""}`}
            title={index >= 9 && applied
              ? `${index + 1}번째 배송지 · 수신 기사로 이관`
              : `${index + 1}번째 배송지`}
          >
            {index + 1}
          </span>
        ))}
        <div className="route-callout">
          <strong>{applied ? "조정 계획 적용" : "약 52분 후"}</strong>
          <span>{applied ? "원 기사 9건 · 수신 기사 +8건" : "17번째 배송지 · 임계치 초과 예상"}</span>
        </div>
      </div>
      <div className="timeline-summary">
        <div><span>현재 안전여유</span><strong>54.7</strong></div>
        <div><span>{applied ? "조정 전 계획 최소" : "현재 계획 최소"}</span><strong className={applied ? undefined : "text-red"}>29.9</strong></div>
        <div><span>{applied ? "적용 계획 최소" : "추천안 적용 후"}</span><strong className="text-teal">47.2</strong></div>
        <div><span>입력 신뢰도</span><strong>{demoConfidence}</strong></div>
      </div>
    </section>
  );
}

function InterventionQueue({ session, onOpenApproval }: { session: DemoSession; onOpenApproval: () => void }) {
  const sourceStatus = consentStatusFor(session, demoSourceCourierId);
  const recipientStatus = consentStatusFor(session, demoRecipientCourierId);
  const approvalReady = session.decision.status === "ADMIN_APPROVAL_REQUIRED";
  const applied = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(session.decision.status);
  return (
    <aside className="panel intervention-queue" aria-labelledby="queue-heading">
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
          <RouteSchematic applied={applied} />
          <InterventionQueue session={session} onOpenApproval={onOpenApproval} />
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

function RiderView({
  session,
  courierId,
  isRecipient,
  onResponse,
}: {
  session: DemoSession;
  courierId: string;
  isRecipient: boolean;
  onResponse: (response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED") => void;
}) {
  const consentStatus = consentStatusFor(session, courierId);
  const canRespond = session.decision.status === "RIDER_RESPONSE_PENDING" && consentStatus === "PENDING";
  const applied = ["APPLIED", "NOTICE_RECORDED", "CLOSED"].includes(session.decision.status);
  const sourceImpact = demoRecommendedEvaluation.courierImpacts.find((impact) => impact.role === "SOURCE")!;
  const recipientImpact = demoRecommendedEvaluation.courierImpacts.find((impact) => impact.role === "RECIPIENT")!;
  const impact = isRecipient ? recipientImpact : sourceImpact;
  const activeWorkload = session.store.activePlan.workloads.find((workload) => workload.courierId === courierId)!;
  return (
    <main id="main-content" className="rider-stage">
      <div className="rider-phone">
        <div className="rider-topline">
          <span className="mode-badge"><span aria-hidden="true">◇</span> {demoWeatherRuntime.displayLabel}</span>
          <span className="stopped-badge"><span aria-hidden="true">✓</span> 정차 상태 확인됨</span>
        </div>
        <p className="rider-overline">오늘의 안전배송 · {isRecipient ? "수신 기사" : "원 기사"}</p>
        <h1>{applied ? "조정된 계획이 적용되었습니다" : isRecipient ? "8건 이관 요청을 검토해 주세요" : "약 52분 안에 계획 조정이 필요합니다"}</h1>
        <p className="rider-lead">{applied
          ? `현재 남은 배송은 ${activeWorkload.remainingLoad.stopCount}건입니다. 실제 적용된 계획과 ETA를 기준으로 안내합니다.`
          : isRecipient
            ? "이관 후에도 안전기준을 통과하는지 전체 계획을 다시 확인했습니다."
            : "10분 휴식 후 8건을 이관하면 예상 초과를 피할 수 있습니다."}</p>

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

        <div className="rider-response-status" aria-live="polite">
          <StatusPill session={session} />
          <span>{canRespond ? "선택 전까지 현재 계획은 변경되지 않습니다." : session.announcement}</span>
        </div>
        <div className="rider-actions" aria-label="조치 응답">
          <button type="button" className="button button-primary" disabled={!canRespond} onClick={() => onResponse("CONSENTED")}>동의</button>
          <button type="button" className="button button-purple" disabled={!canRespond} onClick={() => onResponse("MODIFICATION_REQUESTED")}>수정 요청</button>
          <button type="button" className="button button-neutral" disabled={!canRespond} onClick={() => onResponse("DECLINED")}>거절</button>
        </div>
        <p className="nonpunitive-copy">수정하거나 거절해도 불이익은 없습니다. 다른 안전한 방법을 다시 검토합니다.</p>
        <details className="data-scope">
          <summary>이 결정에 사용된 데이터</summary>
          <p>합성 근무시간, 남은 작업량, Demo 강수·경사와 검증된 경로 특징만 사용했습니다. 기상청 Live 부분 표본은 Safety 계산에 섞지 않았습니다. 원시 생체정보와 정밀 이동궤적은 관리자에게 제공하지 않습니다.</p>
        </details>
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
        <button type="button" className="button button-purple" onClick={onModification}>수정 요청</button>
        <button type="button" className="button button-primary" onClick={onApprove}>승인 및 계획 적용</button>
      </div>
      <code className="dialog-decision-id">Decision ID · {session.decision.decisionId}</code>
    </dialog>
  );
}

export function App({ initialSession, initialExplanation }: AppProps) {
  const [role, setRole] = useState<Role>("ADMIN");
  const [session, setSession] = useState(
    () => initialSession ?? createInitialDemoSession(),
  );
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationResult | null>(
    initialExplanation ?? null,
  );
  const [explanationLoading, setExplanationLoading] = useState(false);

  const reset = () => {
    setApprovalOpen(false);
    setSession(createInitialDemoSession(createResetDemoDecisionId()));
    setExplanation(null);
    setExplanationLoading(false);
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
      <AppHeader role={role} onRoleChange={setRole} onReset={reset} />
      <div className="global-announcement" aria-live="polite">
        <StatusPill session={session} />
        <span>{session.announcement}</span>
        <code>{session.decision.decisionId}</code>
      </div>
      {role === "ADMIN" ? (
        <AdminDashboard
          session={session}
          explanation={explanation}
          explanationLoading={explanationLoading}
          onOpenApproval={() => setApprovalOpen(true)}
          onGenerateExplanation={() => void requestExplanation(false)}
          onFallbackExplanation={() => void requestExplanation(true)}
        />
      ) : (
        <RiderView
          session={session}
          courierId={role === "SOURCE" ? demoSourceCourierId : demoRecipientCourierId}
          isRecipient={role === "RECIPIENT"}
          onResponse={(response) => respond(role === "SOURCE" ? demoSourceCourierId : demoRecipientCourierId, response)}
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
