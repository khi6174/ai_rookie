import { useEffect, useMemo, useState } from "react";
import {
  parseShadowLiveJson,
  validateShadowLiveBatch,
  type ShadowLiveValidationResult,
} from "../domain/operations/shadowLive";
import {
  createSyntheticShadowStreamFrame,
  recentSyntheticShadowStreamEvents,
  syntheticShadowStreamCourierCount,
  SYNTHETIC_SHADOW_STREAM_INTERVAL_MS,
  SYNTHETIC_SHADOW_STREAM_MAX_TICK,
} from "../domain/operations/syntheticShadowStream";
import "./shadow-live-setup.css";

const sampleBatch = {
  schemaVersion: "shadow-live-progress-batch-v1",
  dataMode: "LIVE_PILOT",
  source: {
    kind: "READ_ONLY_CONNECTOR",
    connectionId: "shadow-pilot-01",
    generatedAt: "2026-08-07T12:00:10+09:00",
  },
  events: [
    {
      eventId: "event-0001",
      sequence: 1,
      occurredAt: "2026-08-07T12:00:00+09:00",
      eventType: "STOP_PROGRESS",
      courierRef: "anon-rider-001",
      planRef: "plan-route-001",
      completedStopCount: 6,
      totalStopCount: 14,
      coarseZone: "북부권역 A구역",
    },
    {
      eventId: "event-0002",
      sequence: 2,
      occurredAt: "2026-08-07T12:00:05+09:00",
      eventType: "STOP_PROGRESS",
      courierRef: "anon-rider-002",
      planRef: "plan-route-002",
      completedStopCount: 8,
      totalStopCount: 15,
      coarseZone: "남부권역 B구역",
    },
  ],
} as const;

function resultLabel(result: ShadowLiveValidationResult | undefined) {
  if (!result) return "연결 전";
  return result.status === "ACCEPTED" ? "계약 검증 통과" : "입력 차단";
}

type SyntheticStreamStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETE";

function syntheticStreamStatusLabel(status: SyntheticStreamStatus) {
  if (status === "RUNNING") return "재생 중";
  if (status === "PAUSED") return "일시정지";
  if (status === "COMPLETE") return "재생 완료";
  return "시작 전";
}

function syntheticEventLabel(eventType: string) {
  if (eventType === "SHIFT_STARTED") return "운행 시작";
  if (eventType === "PLAN_DELAYED") return "계획 지연";
  if (eventType === "SHIFT_ENDED") return "배송 완료";
  return "배송 진행";
}

function SyntheticShadowStreamPanel() {
  const [status, setStatus] = useState<SyntheticStreamStatus>("IDLE");
  const [tick, setTick] = useState(0);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const frame = useMemo(
    () => createSyntheticShadowStreamFrame({ tick, startedAt }),
    [startedAt, tick],
  );
  const validation = useMemo(
    () => validateShadowLiveBatch(frame.batch),
    [frame.batch],
  );
  const recentEvents = useMemo(
    () =>
      status === "IDLE"
        ? []
        : recentSyntheticShadowStreamEvents({ tick, startedAt, limit: 8 }),
    [startedAt, status, tick],
  );
  const courierCount = syntheticShadowStreamCourierCount();
  const processedEventCount = status === "IDLE" ? 0 : (tick + 1) * courierCount;
  const completedStopCount = frame.batch.events.reduce(
    (total, event) => total + event.completedStopCount,
    0,
  );
  const totalStopCount = frame.batch.events.reduce(
    (total, event) => total + event.totalStopCount,
    0,
  );

  useEffect(() => {
    if (status !== "RUNNING") return;
    const timer = window.setInterval(() => {
      setTick((current) =>
        Math.min(SYNTHETIC_SHADOW_STREAM_MAX_TICK, current + 1),
      );
    }, SYNTHETIC_SHADOW_STREAM_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "RUNNING" && frame.finished) setStatus("COMPLETE");
  }, [frame.finished, status]);

  const start = () => {
    if (status === "COMPLETE") {
      setStartedAt(new Date().toISOString());
      setTick(0);
    }
    setStatus("RUNNING");
  };
  const step = () => {
    if (status === "IDLE") {
      setStatus("PAUSED");
      return;
    }
    setStatus("PAUSED");
    setTick((current) =>
      Math.min(SYNTHETIC_SHADOW_STREAM_MAX_TICK, current + 1),
    );
  };
  const reset = () => {
    setStatus("IDLE");
    setTick(0);
    setStartedAt(new Date().toISOString());
  };

  return (
    <section className="shadow-live-simulator" aria-labelledby="synthetic-stream-title">
      <div className="shadow-live-simulator-heading">
        <div>
          <span className="shadow-live-mode-badge">합성 실시간 재생 · 실제 TMS 아님</span>
          <h2 id="synthetic-stream-title">합성 배송 진행 재생</h2>
          <p>가명 기사 6명의 배송 진행을 2초 간격으로 재현합니다.</p>
        </div>
        <strong className={`shadow-live-simulator-state is-${status.toLowerCase()}`} role="status">
          {syntheticStreamStatusLabel(status)}
        </strong>
      </div>

      <div className="shadow-live-simulator-controls" aria-label="합성 실시간 재생 제어">
        {status !== "RUNNING" ? (
          <button type="button" className="is-primary" onClick={start}>
            {status === "COMPLETE" ? "다시 재생" : "재생 시작"}
          </button>
        ) : (
          <button type="button" className="is-primary" onClick={() => setStatus("PAUSED")}>
            일시정지
          </button>
        )}
        <button type="button" onClick={step} disabled={status === "RUNNING" || status === "COMPLETE"}>
          한 단계
        </button>
        <button type="button" onClick={reset}>초기화</button>
        <span>{String(frame.elapsedSeconds).padStart(2, "0")}초 / 48초</span>
      </div>

      <dl className="shadow-live-simulator-summary">
        <div><dt>가명 기사</dt><dd>{courierCount}명</dd></div>
        <div><dt>처리 이벤트</dt><dd>{processedEventCount}건</dd></div>
        <div><dt>배송 진행</dt><dd>{completedStopCount}/{totalStopCount}건</dd></div>
        <div><dt>계약 상태</dt><dd>{validation.status === "ACCEPTED" ? "검증 통과" : "재생 차단"}</dd></div>
        <div><dt>서버·D1 전송</dt><dd>없음</dd></div>
      </dl>

      <div className="shadow-live-simulator-grid">
        <div className="shadow-live-courier-progress" aria-label="가명 기사별 배송 진행">
          {frame.batch.events.map((event) => (
            <article key={event.courierRef}>
              <div>
                <strong>{event.courierRef}</strong>
                <span>{event.coarseZone}</span>
              </div>
              <progress
                max={event.totalStopCount}
                value={event.completedStopCount}
                aria-label={`${event.courierRef} 배송 진행 ${event.completedStopCount}/${event.totalStopCount}`}
              />
              <b>{event.completedStopCount}/{event.totalStopCount}</b>
            </article>
          ))}
        </div>

        <aside className="shadow-live-recent-events" aria-live="polite">
          <h3>최근 합성 이벤트</h3>
          {recentEvents.length === 0 ? (
            <p>재생 시작 또는 한 단계를 선택하면 이벤트가 표시됩니다.</p>
          ) : (
            <ol>
              {recentEvents.map((event) => (
                <li key={event.eventId}>
                  <span>{syntheticEventLabel(event.eventType)}</span>
                  <strong>{event.courierRef}</strong>
                  <b>{event.completedStopCount}/{event.totalStopCount}</b>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  );
}

export function ShadowLiveSetup() {
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<ShadowLiveValidationResult>();
  const resultClass = useMemo(
    () =>
      result?.status === "ACCEPTED"
        ? "is-accepted"
        : result?.status === "REJECTED"
          ? "is-rejected"
          : "is-idle",
    [result],
  );

  const validate = () => setResult(parseShadowLiveJson(draft));
  const loadSample = () => {
    setDraft(JSON.stringify(sampleBatch, null, 2));
    setResult(undefined);
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setDraft(await file.text());
    setResult(undefined);
  };

  return (
    <main className="shadow-live-page">
      <header className="shadow-live-header">
        <div>
          <a href="/">← Safety Control Tower</a>
          <span>SafeRoute AI · Shadow Live v1</span>
        </div>
        <div className="shadow-live-header-statuses">
          <strong className="shadow-live-mode-badge">합성 실시간 재생 · 실제 TMS 아님</strong>
          <strong className={`shadow-live-status ${resultClass}`}>
            {resultLabel(result)}
          </strong>
        </div>
      </header>

      <section className="shadow-live-hero" aria-labelledby="shadow-live-title">
        <div>
          <span className="shadow-live-kicker">합성 스트림 실습 + 읽기 전용 연결 준비</span>
          <h1 id="shadow-live-title">합성 배송 진행을 재생하고 실제 연결 계약을 검증합니다.</h1>
          <p>
            합성 재생과 가명 이벤트 검사는 이 브라우저 탭에서만 실행됩니다. 원문과 재생
            상태를 서버·D1·AI로 전송하거나 저장하지 않습니다.
          </p>
        </div>
        <dl className="shadow-live-boundaries">
          <div><dt>허용</dt><dd>가명 ID · 진행 수 · 거친 권역 · 시각</dd></div>
          <div><dt>차단</dt><dd>이름 · 연락처 · 주소 · GPS · 생체정보</dd></div>
          <div><dt>권한</dt><dd>읽기 전용 · Safety 계산 미반영</dd></div>
        </dl>
      </section>

      <SyntheticShadowStreamPanel />

      <section className="shadow-live-workspace" aria-labelledby="shadow-input-title">
        <div className="shadow-live-editor">
          <div className="shadow-live-section-heading">
            <div>
              <span>STEP 2</span>
              <h2 id="shadow-input-title">가명 이벤트 계약 검사</h2>
            </div>
            <button type="button" onClick={loadSample}>합성 예시 불러오기</button>
          </div>
          <label htmlFor="shadow-live-json">JSON 이벤트 묶음</label>
          <textarea
            id="shadow-live-json"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setResult(undefined);
            }}
            placeholder="가명 처리된 Shadow Live JSON을 붙여 넣으세요."
            spellCheck={false}
          />
          <div className="shadow-live-editor-actions">
            <label className="shadow-live-file-button">
              JSON 파일 선택
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => void readFile(event.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              className="shadow-live-validate"
              disabled={draft.trim().length === 0}
              onClick={validate}
            >
              로컬에서 검증
            </button>
          </div>
          <small>파일 내용은 이 브라우저 탭의 메모리에만 머뭅니다.</small>
        </div>

        <aside className={`shadow-live-result ${resultClass}`} aria-live="polite">
          <span>STEP 3</span>
          <h2>{resultLabel(result)}</h2>
          {!result && (
            <p>입력 계약을 검사하면 허용 범위와 차단 사유를 여기서 확인할 수 있습니다.</p>
          )}
          {result?.status === "ACCEPTED" && (
            <>
              <p>Shadow Live 읽기 전용 계약으로 사용할 수 있는 형식입니다.</p>
              <dl>
                <div><dt>이벤트</dt><dd>{result.summary.eventCount}건</dd></div>
                <div><dt>가명 기사</dt><dd>{result.summary.courierCount}명</dd></div>
                <div><dt>최근 시각</dt><dd>{result.summary.latestOccurredAt}</dd></div>
                <div><dt>서버 전송</dt><dd>없음</dd></div>
                <div><dt>Safety 반영</dt><dd>없음</dd></div>
              </dl>
            </>
          )}
          {result?.status === "REJECTED" && (
            <>
              <p>원문을 저장하지 않았습니다. 아래 필드를 수정한 뒤 다시 검사하세요.</p>
              <ul>
                {result.issues.slice(0, 8).map((issue, index) => (
                  <li key={`${issue.fieldPath}-${index}`}>
                    <strong>{issue.fieldPath}</strong>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </section>

      <section className="shadow-live-next" aria-labelledby="shadow-next-title">
        <span>STEP 4 · 서버 수신 Gate 준비 완료</span>
        <h2 id="shadow-next-title">공개 수신은 비활성 상태이며 승인된 설정이 모두 있어야 열립니다.</h2>
        <p>
          공급자 독립 webhook과 D1 파생 상태 구조는 준비했습니다. 현재 endpoint는 연결 ID,
          32자 이상 서버 토큰, 1~24시간 보존값 중 하나라도 없으면 입력을 읽기 전에 503으로
          차단합니다.
        </p>
        <ol>
          <li><strong>원천</strong><span>TMS/WMS 읽기 전용 이벤트 명세 확정 필요</span></li>
          <li><strong>접근</strong><span>연결별 서버 토큰·운영사 권한 승인 필요</span></li>
          <li><strong>보존</strong><span>원문 미저장·파생 상태 TTL·삭제 SLA 승인 필요</span></li>
          <li><strong>수신</strong><span>중복은 멱등 처리, 충돌·역순 이벤트는 409 차단</span></li>
        </ol>
      </section>
    </main>
  );
}
