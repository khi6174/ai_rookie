import { useMemo, useState, type FormEvent } from "react";
import {
  createScenarioPlanningResult,
  defaultScenarioPlanningInput,
  scenarioPlanningPresets,
} from "../application/scenarioPlanning";
import type { ScenarioPlanningInput, ScenarioPlanningResult } from "../domain/scenario-planning";
import "./scenario-planning.css";

const presetLabels = {
  RAIN_HILL: "우천·경사",
  HEAT_STAIRS: "폭염·계단",
  NIGHT_UNFAMILIAR: "야간·낯선 권역",
} as const;

const bandLabels = {
  STABLE: "안정",
  CAUTION: "주의",
  SUPPORT_NEEDED: "지원 필요",
  BREACHED: "현재 한계 초과",
} as const;

const confidenceLabels = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" } as const;
const contributionLabels = {
  DRIVER: "연속 작업",
  TASK: "남은 작업량",
  ROUTE: "경로 조건",
  WEATHER: "기상 조건",
  INTERACTION: "복합 영향",
  RECOVERY: "회복",
} as const;

function predictedSummary(result: ScenarioPlanningResult) {
  const { baseline } = result;
  if (baseline.breachStatus === "PREDICTED") {
    return `${Math.round(baseline.timeToBreachMinutes ?? 0)}분 후 · ${baseline.breachStopOrdinal}번째 배송지 전에 안전한계를 초과할 수 있습니다.`;
  }
  if (baseline.breachStatus === "ALREADY_BREACHED") {
    return "현재 이미 안전한계를 초과했습니다. 계획 실행보다 즉시 지원 확인이 우선입니다.";
  }
  if (baseline.breachStatus === "INSUFFICIENT_DATA") {
    return "필수 입력이 부족해 초과 시점을 계산하지 못했습니다.";
  }
  return "현재 입력 범위에서는 계획 종료 전 안전한계 초과가 예상되지 않습니다.";
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="scenario-field">
      <span>{label}</span>
      <span className="scenario-input-wrap">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          required
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

export function ScenarioPlanningLab() {
  const [input, setInput] = useState<ScenarioPlanningInput>(defaultScenarioPlanningInput);
  const [result, setResult] = useState(() => createScenarioPlanningResult(defaultScenarioPlanningInput));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recommended = useMemo(
    () => result.alternatives.find((candidate) => candidate.recommended) ?? null,
    [result],
  );

  const changeNumber = (
    key: keyof Pick<
      ScenarioPlanningInput,
      | "remainingStopCount"
      | "shiftElapsedHours"
      | "continuousWorkHours"
      | "currentSafetyBudget"
      | "recipientSafetyBudget"
      | "rainfallMmPerHour"
      | "feelsLikeCelsius"
      | "visibilityMeters"
      | "uphillGradePct"
      | "narrowRoadFactor"
      | "parkingDifficultyFactor"
      | "stairStopRatio"
    >,
    value: number,
  ) => {
    setInput((current) => ({ ...current, preset: "CUSTOM", [key]: value }));
    setDirty(true);
  };

  const applyPreset = (key: keyof typeof scenarioPlanningPresets) => {
    setInput(scenarioPlanningPresets[key]);
    setDirty(true);
    setError(null);
  };

  const runPrediction = (event: FormEvent) => {
    event.preventDefault();
    try {
      setResult(createScenarioPlanningResult(input));
      setDirty(false);
      setError(null);
    } catch (caught) {
      const issues = (caught as { issues?: Array<{ message?: string }> } | null)?.issues;
      setError(
        issues?.find((issue) => issue.message)?.message ??
          (caught instanceof Error && !caught.message.trim().startsWith("[")
            ? caught.message
            : "입력값을 확인해 주세요."),
      );
    }
  };

  return (
    <main className="scenario-page">
      <header className="scenario-hero">
        <div>
          <span className="scenario-kicker">Scenario-driven Safety Copilot</span>
          <h1>상황을 입력하면 현재 계획을 다시 예측합니다.</h1>
          <p>
            고정 장면을 재생하지 않습니다. 입력된 운영조건을 검증한 뒤 Safety Budget,
            Time-to-Breach와 실행 가능한 개입안을 현재 결정론 엔진으로 다시 계산합니다.
          </p>
        </div>
        <nav aria-label="화면 이동">
          <a href="/">운영 관제</a>
          <a href="/closed-loop-demo">고정 폐루프</a>
        </nav>
      </header>

      <section className="scenario-boundary" aria-label="현재 계산 경계">
        <strong>현재 계산</strong>
        <span>사용자 입력 운영조건</span>
        <span>결정론적 합성 기준계획</span>
        <span>외부 쓰기 없음</span>
        <small>기상청 공개데이터 연동 근거는 문맥으로만 표시하며, 불완전한 필드는 Safety 계산에 섞지 않습니다.</small>
      </section>

      <div className="scenario-layout">
        <form className="scenario-form" noValidate onSubmit={runPrediction} aria-labelledby="scenario-input-heading">
          <div className="scenario-section-heading">
            <div>
              <span>01 · 운영상황</span>
              <h2 id="scenario-input-heading">예측 조건 입력</h2>
            </div>
            {dirty && <em role="status">입력 변경됨</em>}
          </div>

          <div className="scenario-presets" aria-label="상황 예시">
            {Object.entries(presetLabels).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={input.preset === key}
                onClick={() => applyPreset(key as keyof typeof scenarioPlanningPresets)}
              >
                {label}
              </button>
            ))}
          </div>

          <fieldset>
            <legend>업무와 안전여유</legend>
            <div className="scenario-field-grid">
              <NumberField label="남은 배송" value={input.remainingStopCount} min={4} max={40} step={1} unit="건" onChange={(value) => changeNumber("remainingStopCount", value)} />
              <NumberField label="총 근무" value={input.shiftElapsedHours} min={1} max={11} step={0.1} unit="시간" onChange={(value) => changeNumber("shiftElapsedHours", value)} />
              <NumberField label="연속 작업" value={input.continuousWorkHours} min={0.25} max={5} step={0.1} unit="시간" onChange={(value) => changeNumber("continuousWorkHours", value)} />
              <NumberField label="현재 안전여유" value={input.currentSafetyBudget} min={25} max={90} step={0.1} unit="점" onChange={(value) => changeNumber("currentSafetyBudget", value)} />
              <NumberField label="분담 기사 안전여유" value={input.recipientSafetyBudget} min={45} max={95} step={0.1} unit="점" onChange={(value) => changeNumber("recipientSafetyBudget", value)} />
              <label className="scenario-field">
                <span>권역 숙련도</span>
                <select
                  value={input.areaFamiliarity}
                  onChange={(event) => {
                    setInput((current) => ({ ...current, preset: "CUSTOM", areaFamiliarity: event.currentTarget.value as ScenarioPlanningInput["areaFamiliarity"] }));
                    setDirty(true);
                  }}
                >
                  <option value="FAMILIAR">익숙함</option>
                  <option value="PARTIAL">일부 익숙함</option>
                  <option value="UNFAMILIAR">낯선 권역</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>기상과 경로</legend>
            <div className="scenario-field-grid">
              <NumberField label="시간당 강수" value={input.rainfallMmPerHour} min={0} max={20} step={0.5} unit="mm/h" onChange={(value) => changeNumber("rainfallMmPerHour", value)} />
              <NumberField label="체감온도" value={input.feelsLikeCelsius} min={-15} max={45} step={1} unit="°C" onChange={(value) => changeNumber("feelsLikeCelsius", value)} />
              <NumberField label="시정" value={input.visibilityMeters} min={500} max={20000} step={100} unit="m" onChange={(value) => changeNumber("visibilityMeters", value)} />
              <NumberField label="오르막 경사" value={input.uphillGradePct} min={0} max={20} step={1} unit="%" onChange={(value) => changeNumber("uphillGradePct", value)} />
              <NumberField label="좁은 도로" value={input.narrowRoadFactor} min={0} max={1} step={0.01} unit="0~1" onChange={(value) => changeNumber("narrowRoadFactor", value)} />
              <NumberField label="주차 난이도" value={input.parkingDifficultyFactor} min={0} max={1} step={0.01} unit="0~1" onChange={(value) => changeNumber("parkingDifficultyFactor", value)} />
              <NumberField label="계단 배송 비율" value={input.stairStopRatio} min={0} max={1} step={0.01} unit="0~1" onChange={(value) => changeNumber("stairStopRatio", value)} />
            </div>
          </fieldset>

          {error && <p className="scenario-error" role="alert">{error}</p>}
          <button className="scenario-submit" type="submit">이 조건으로 다시 예측</button>
          <p className="scenario-form-note">이름·주소·연락처·GPS를 입력하거나 저장하지 않습니다.</p>
        </form>

        <section className="scenario-results" aria-labelledby="scenario-result-heading" aria-live="polite">
          <div className="scenario-section-heading">
            <div>
              <span>02 · 예상 결과</span>
              <h2 id="scenario-result-heading">현재 계획 유지 시</h2>
            </div>
            <small>{result.scenarioId}</small>
          </div>

          <article className={`scenario-forecast band-${result.baseline.currentBand.toLowerCase()}`}>
            <span>{bandLabels[result.baseline.currentBand]}</span>
            <h3>{predictedSummary(result)}</h3>
            <dl>
              <div><dt>현재 안전여유</dt><dd>{result.baseline.currentBudget.toFixed(1)}</dd></div>
              <div><dt>예상 최저</dt><dd>{result.baseline.minimumForecastBudget.toFixed(1)}</dd></div>
              <div><dt>신뢰도</dt><dd>{confidenceLabels[result.baseline.confidence]} · {result.baseline.confidenceScore.toFixed(0)}</dd></div>
            </dl>
          </article>

          <section className="scenario-contributions" aria-labelledby="scenario-factor-heading">
            <h3 id="scenario-factor-heading">주요 위험 기여요인</h3>
            <ul>
              {result.baseline.contributions.filter((item) => item.consumed > 0).map((item) => (
                <li key={item.category}>
                  <span>{contributionLabels[item.category]}</span>
                  <strong>-{item.consumed.toFixed(1)}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="scenario-recommendation" aria-labelledby="scenario-recommendation-heading">
            <div className="scenario-section-heading compact">
              <div>
                <span>03 · 개입 비교</span>
                <h2 id="scenario-recommendation-heading">안전 제약 통과안</h2>
              </div>
            </div>
            {recommended ? (
              <article className="scenario-recommended-card">
                <span>추천</span>
                <h3>{recommended.label}</h3>
                <p>
                  예상 최저 {recommended.candidateMinimumBudget.toFixed(1)} · ETA {recommended.etaDeltaMinutes >= 0 ? "+" : ""}{recommended.etaDeltaMinutes.toFixed(0)}분
                  {recommended.recipientMinimumBudget !== undefined
                    ? ` · 분담 기사 ${recommended.recipientMinimumBudget.toFixed(1)}`
                    : ""}
                </p>
              </article>
            ) : (
              <article className="scenario-no-option"><strong>안전한 자동 추천 없음</strong><p>현재 계획을 적용하지 말고 사람 검토가 필요합니다.</p></article>
            )}

            <div className="scenario-alternative-list">
              {result.alternatives.slice(0, 6).map((alternative) => (
                <article key={alternative.candidateId} className={alternative.feasibility === "FEASIBLE" ? "is-feasible" : "is-blocked"}>
                  <div>
                    <span>{alternative.feasibility === "FEASIBLE" ? "실행 가능" : "차단"}</span>
                    <h4>{alternative.label}</h4>
                  </div>
                  <dl>
                    <div><dt>예상 최저</dt><dd>{alternative.candidateMinimumBudget.toFixed(1)}</dd></div>
                    <div><dt>ETA</dt><dd>{alternative.etaDeltaMinutes >= 0 ? "+" : ""}{alternative.etaDeltaMinutes.toFixed(0)}분</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>

      <section className="scenario-resources" aria-labelledby="scenario-resource-heading">
        <div className="scenario-section-heading">
          <div><span>04 · 현재 자원</span><h2 id="scenario-resource-heading">무엇을 계산에 사용했는가</h2></div>
        </div>
        <div className="scenario-resource-grid">
          <article><span>사용자 입력</span><strong>Safety 입력</strong><p>업무·기상·경로 조건을 이 세션에서만 계산합니다.</p></article>
          <article><span>결정론 엔진</span><strong>수치·추천 소유</strong><p>Safety Budget, Time-to-Breach, Risk Transfer Guard를 계산합니다.</p></article>
          <article><span>기상청 연동 근거</span><strong>8개 준비 · 2개 차단</strong><p>미래 시정과 현재 시간당 적설이 부족해 문맥으로만 표시합니다.</p></article>
          <article><span>지도·생성 AI</span><strong>수치 계산 미사용</strong><p>지도는 표현, AI는 검증된 설명에만 사용합니다.</p></article>
        </div>
        <p className="scenario-limitations">
          실제 TMS·기사 계정·GPS·주소·고객 발송은 연결되지 않았습니다. 이 결과는 사고확률이 아니라 입력 상황에 대한 운영 위험 예측입니다.
        </p>
      </section>
    </main>
  );
}
