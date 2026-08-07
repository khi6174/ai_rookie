import { useMemo, useState } from "react";
import {
  parseShadowLiveJson,
  type ShadowLiveValidationResult,
} from "../domain/operations/shadowLive";
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
        <strong className={`shadow-live-status ${resultClass}`}>
          {resultLabel(result)}
        </strong>
      </header>

      <section className="shadow-live-hero" aria-labelledby="shadow-live-title">
        <div>
          <span className="shadow-live-kicker">읽기 전용 연결 준비</span>
          <h1 id="shadow-live-title">실제 운영 진행 이벤트를 안전하게 연결합니다.</h1>
          <p>
            가명 기사 ID와 배송 진행 수만 검사합니다. 이 화면의 검증은 브라우저 안에서만
            실행되며 원문을 서버·D1·AI로 전송하거나 저장하지 않습니다.
          </p>
        </div>
        <dl className="shadow-live-boundaries">
          <div><dt>허용</dt><dd>가명 ID · 진행 수 · 거친 권역 · 시각</dd></div>
          <div><dt>차단</dt><dd>이름 · 연락처 · 주소 · GPS · 생체정보</dd></div>
          <div><dt>권한</dt><dd>읽기 전용 · Safety 계산 미반영</dd></div>
        </dl>
      </section>

      <section className="shadow-live-workspace" aria-labelledby="shadow-input-title">
        <div className="shadow-live-editor">
          <div className="shadow-live-section-heading">
            <div>
              <span>STEP 1</span>
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
          <span>STEP 2</span>
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
        <span>STEP 3 · 실제 연결 전 필수</span>
        <h2 id="shadow-next-title">원천 시스템과 인증이 정해지면 서버 연결을 활성화합니다.</h2>
        <ol>
          <li><strong>원천</strong><span>TMS/WMS webhook 또는 읽기 전용 API 선택</span></li>
          <li><strong>접근</strong><span>운영사 인증·역할·테넌트 분리 승인</span></li>
          <li><strong>보존</strong><span>원문 미저장·파생 진행상태 TTL·삭제 SLA 확정</span></li>
          <li><strong>검증</strong><span>독립 관리자·기사 검토 후 Shadow Pilot 시작</span></li>
        </ol>
      </section>
    </main>
  );
}
