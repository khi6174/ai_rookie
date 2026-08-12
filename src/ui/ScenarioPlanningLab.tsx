import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  createScenarioPlanningResult,
  defaultScenarioPlanningInput,
} from "../application/scenarioPlanning";
import type { ScenarioPlanningInput, ScenarioPlanningResult } from "../domain/scenario-planning";
import {
  fetchKmaAsosCalendar,
  type KmaAsosCalendar,
  type KmaAsosCalendarFallbackCode,
} from "../adapters/weather";
import "./scenario-planning.css";

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

type ObservedWeatherImpact = {
  observedAt: string;
  changes: Array<{ label: string; before: string; after: string }>;
  minimumBudgetBefore: number;
  minimumBudgetAfter: number;
  breachBefore: string;
  breachAfter: string;
  recommendationBefore: string;
  recommendationAfter: string;
};

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

function breachTimingLabel(result: ScenarioPlanningResult) {
  const { baseline } = result;
  if (baseline.breachStatus === "PREDICTED") {
    return `${Math.round(baseline.timeToBreachMinutes ?? 0)}분 후 · ${baseline.breachStopOrdinal}번째 전`;
  }
  if (baseline.breachStatus === "ALREADY_BREACHED") return "현재 한계 초과";
  if (baseline.breachStatus === "INSUFFICIENT_DATA") return "계산 불가";
  return "계획 종료 전 초과 없음";
}

function recommendationLabel(result: ScenarioPlanningResult) {
  return result.alternatives.find((candidate) => candidate.recommended)?.label
    ?? "안전한 자동 추천 없음";
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

function ScenarioSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  stateLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  stateLabel: string;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="scenario-slider-field">
      <span className="scenario-slider-heading">
        <span>{label}</span>
        <strong>{stateLabel}</strong>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        style={{ "--scenario-range-progress": `${progress}%` } as CSSProperties}
        aria-valuetext={`${stateLabel}, ${value} ${unit}`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span className="scenario-slider-scale" aria-hidden="true">
        <small>낮음</small>
        <output>{value} {unit}</output>
        <small>높음</small>
      </span>
    </label>
  );
}

const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

function rollingCalendarDates(dayCount = 31) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const latest = new Date(Date.now() - 24 * 60 * 60_000);
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(latest);
    date.setUTCDate(date.getUTCDate() - (dayCount - index - 1));
    return formatter.format(date);
  });
}

function plannedParts(plannedAt: string) {
  return { date: plannedAt.slice(0, 10), hour: plannedAt.slice(11, 13) };
}

function plannedAt(date: string, hour: string) {
  return `${date}T${hour}:00:00+09:00`;
}

function calendarColumn(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return ((day + 6) % 7) + 1;
}

function calendarFallbackLabel(code?: KmaAsosCalendarFallbackCode) {
  if (code === "PERMISSION_REQUIRED") return "ASOS 활용신청 대기";
  if (code === "NOT_CONFIGURED") return "ASOS 연결 설정 대기";
  return "기상청 연결 대체 상태";
}

function workState(value: number) {
  if (value < 1.5) return "여유";
  if (value < 2.8) return "보통";
  if (value < 4) return "길음";
  return "포화 근접";
}

function safetyState(value: number) {
  if (value < 35) return "부족";
  if (value < 50) return "주의";
  if (value < 70) return "안전";
  return "여유";
}

function recipientState(value: number) {
  if (value < 55) return "빠듯";
  if (value < 70) return "분담 가능";
  if (value < 85) return "안전";
  return "여유";
}

export function ScenarioPlanningLab() {
  const [input, setInput] = useState<ScenarioPlanningInput>(defaultScenarioPlanningInput);
  const [result, setResult] = useState(() => createScenarioPlanningResult(defaultScenarioPlanningInput));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherCalendar, setWeatherCalendar] = useState<KmaAsosCalendar>();
  const [weatherCalendarStatus, setWeatherCalendarStatus] = useState<
    { status: "LOADING" } | { status: "LIVE" } | { status: "FALLBACK"; code: KmaAsosCalendarFallbackCode }
  >({ status: "LOADING" });
  const [observedWeatherImpact, setObservedWeatherImpact] = useState<ObservedWeatherImpact>();
  const recommended = useMemo(
    () => result.alternatives.find((candidate) => candidate.recommended) ?? null,
    [result],
  );
  const selectedPlanned = plannedParts(input.plannedAt);
  const calendarDates = weatherCalendar?.days.map((day) => day.date) ?? rollingCalendarDates();
  const selectedWeatherDay = weatherCalendar?.days.find((day) => day.date === selectedPlanned.date);
  const selectedWeatherPoint = selectedWeatherDay?.points.find(
    (point) => point.observedAt.slice(11, 13) === selectedPlanned.hour,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchKmaAsosCalendar({ signal: controller.signal })
      .then((calendar) => {
        setWeatherCalendar(calendar);
        setWeatherCalendarStatus({ status: "LIVE" });
        const latest = calendar.days.at(-1);
        if (latest && !calendar.days.some((day) => day.date === plannedParts(input.plannedAt).date)) {
          setInput((current) => ({ ...current, plannedAt: plannedAt(latest.date, plannedParts(current.plannedAt).hour) }));
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setWeatherCalendarStatus({
          status: "FALLBACK",
          code: (caught as { code?: KmaAsosCalendarFallbackCode } | null)?.code ?? "NETWORK_ERROR",
        });
      });
    return () => controller.abort();
  }, []);

  const changeNumber = (
    key: keyof Pick<
      ScenarioPlanningInput,
      | "remainingStopCount"
      | "shiftElapsedHours"
      | "continuousWorkHours"
      | "currentSafetyBudget"
      | "recipientSafetyBudget"
    >,
    value: number,
  ) => {
    setInput((current) => ({ ...current, preset: "CUSTOM", [key]: value }));
    setDirty(true);
  };

  const changePlannedAt = (date: string, hour = selectedPlanned.hour) => {
    setInput((current) => ({ ...current, plannedAt: plannedAt(date, hour) }));
    setDirty(true);
    setObservedWeatherImpact(undefined);
  };

  const applyObservedWeather = () => {
    if (!selectedWeatherPoint) return;
    const nextInput: ScenarioPlanningInput = {
      ...input,
      ...(selectedWeatherPoint.rainfallMmPerHour !== undefined
        ? { rainfallMmPerHour: Math.min(20, selectedWeatherPoint.rainfallMmPerHour) }
        : {}),
      ...(selectedWeatherPoint.visibilityMeters !== undefined
        ? { visibilityMeters: Math.max(500, Math.min(20_000, selectedWeatherPoint.visibilityMeters)) }
        : {}),
    };
    try {
      const before = createScenarioPlanningResult(input);
      const after = createScenarioPlanningResult(nextInput);
      const changes: ObservedWeatherImpact["changes"] = [];
      if (selectedWeatherPoint.rainfallMmPerHour !== undefined) {
        changes.push({
          label: "시간당 강수",
          before: `${input.rainfallMmPerHour.toFixed(1)}mm/h`,
          after: `${nextInput.rainfallMmPerHour.toFixed(1)}mm/h`,
        });
      }
      if (selectedWeatherPoint.visibilityMeters !== undefined) {
        changes.push({
          label: "시정",
          before: `${(input.visibilityMeters / 1_000).toFixed(1)}km`,
          after: `${(nextInput.visibilityMeters / 1_000).toFixed(1)}km`,
        });
      }
      setInput(nextInput);
      setResult(after);
      setObservedWeatherImpact({
        observedAt: selectedWeatherPoint.observedAt,
        changes,
        minimumBudgetBefore: before.baseline.minimumForecastBudget,
        minimumBudgetAfter: after.baseline.minimumForecastBudget,
        breachBefore: breachTimingLabel(before),
        breachAfter: breachTimingLabel(after),
        recommendationBefore: recommendationLabel(before),
        recommendationAfter: recommendationLabel(after),
      });
      setDirty(false);
      setError(null);
    } catch (caught) {
      const issues = (caught as { issues?: Array<{ message?: string }> } | null)?.issues;
      setError(issues?.find((issue) => issue.message)?.message ?? "입력값을 확인해 주세요.");
    }
  };

  useEffect(() => {
    if (selectedWeatherPoint) applyObservedWeather();
  }, [selectedWeatherPoint?.observedAt]);

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
          <h1>상황에 맞게 현재 계획을 예측합니다.</h1>
          <p>
            입력된 운영조건을 검증한 뒤 Safety Budget, Time-to-Breach와 실행 가능한
            개입안을 현재 결정론 엔진으로 다시 계산합니다.
          </p>
        </div>
        <nav aria-label="화면 이동">
          <a href="/">운영 관제</a>
        </nav>
      </header>

      <div className="scenario-layout">
        <form className="scenario-form" noValidate onSubmit={runPrediction} aria-labelledby="scenario-input-heading">
          <div className="scenario-section-heading">
            <div>
              <span>01 · 예측 조건</span>
              <h2 id="scenario-input-heading">예측 조건 입력</h2>
            </div>
            {dirty && <em role="status">입력 변경됨</em>}
          </div>

          <section className="scenario-weather-calendar" aria-labelledby="scenario-calendar-heading">
            <div className="scenario-calendar-heading">
              <div>
                <span>1-1 · 관측 시점 선택</span>
                <h3 id="scenario-calendar-heading">날짜·시간과 기상 관측</h3>
                <p>언제의 관측을 참고할지 선택합니다. 업무·안전여유 조건은 바뀌지 않습니다.</p>
              </div>
              <strong className={`is-${weatherCalendarStatus.status.toLowerCase()}`}>
                {weatherCalendarStatus.status === "LOADING"
                  ? "기상청 확인 중"
                  : weatherCalendarStatus.status === "LIVE"
                    ? "기상청 ASOS 관측"
                    : calendarFallbackLabel(weatherCalendarStatus.code)}
              </strong>
            </div>
            <div className="scenario-calendar-weekdays" aria-hidden="true">
              {['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="scenario-calendar-days" role="group" aria-label="예측 기준일 선택">
              {calendarDates.map((date, index) => {
                const day = weatherCalendar?.days.find((candidate) => candidate.date === date);
                const rainy = (day?.summary.maximumRainfallMmPerHour ?? 0) > 0;
                const hot = (day?.summary.averageAirTemperatureCelsius ?? 0) >= 30;
                return (
                  <button
                    key={date}
                    type="button"
                    className={rainy ? "has-rain" : hot ? "has-heat" : ""}
                    style={index === 0 ? { gridColumnStart: calendarColumn(date) } : undefined}
                    aria-pressed={date === selectedPlanned.date}
                    aria-label={`${date}${rainy ? ", 비 관측" : hot ? ", 고온 관측" : ""}`}
                    onClick={() => changePlannedAt(date)}
                  >
                    <span>{Number(date.slice(8, 10))}</span>
                    <small>{date.slice(5, 7)}월</small>
                  </button>
                );
              })}
            </div>
            <div className="scenario-calendar-selection">
              <label>
                <span>선택 시간</span>
                <select value={selectedPlanned.hour} onChange={(event) => changePlannedAt(selectedPlanned.date, event.currentTarget.value)}>
                  {hourOptions.map((hour) => <option key={hour} value={hour}>{hour}:00</option>)}
                </select>
              </label>
              <div className="scenario-weather-observation" aria-live="polite">
                <span>{selectedPlanned.date} {selectedPlanned.hour}:00</span>
                {selectedWeatherPoint ? (
                  <p>
                    관측 기온 {selectedWeatherPoint.airTemperatureCelsius?.toFixed(1) ?? "결측"}°C · 강수 {selectedWeatherPoint.rainfallMmPerHour?.toFixed(1) ?? "결측"}mm/h · 시정 {selectedWeatherPoint.visibilityMeters !== undefined ? `${(selectedWeatherPoint.visibilityMeters / 1_000).toFixed(1)}km` : "결측"}
                  </p>
                ) : (
                  <p>이 시점은 임의 운영조건을 직접 설정해 예측합니다.</p>
                )}
              </div>
            </div>
            <p className="scenario-calendar-note">
              관측 값을 설정했습니다. 업무 및 안전여유를 입력해주세요.
            </p>
          </section>

          <section className="scenario-assumptions" aria-labelledby="scenario-assumptions-heading">
            <div className="scenario-assumptions-heading">
              <div>
                <span>1-2 · 업무 및 안전여유</span>
                <h3 id="scenario-assumptions-heading">업무 및 안전여유 입력</h3>
                <p>관측 기상은 자동으로 사용하고 현재 업무 조건만 입력합니다.</p>
              </div>
              {observedWeatherImpact ? <strong>ASOS 관측 기반</strong> : <strong>시연 기준계획</strong>}
            </div>
            {observedWeatherImpact ? (
              <section className="scenario-weather-impact" aria-live="polite" data-observed-weather-impact>
                <div>
                  <span>1-2에 반영된 관측 결과</span>
                  <strong>{observedWeatherImpact.observedAt.slice(0, 16).replace("T", " ")}</strong>
                </div>
                {observedWeatherImpact.changes.length > 0 ? (
                  <ul aria-label="반영된 입력값">
                    {observedWeatherImpact.changes.map((change) => (
                      <li key={change.label}>
                        <span>{change.label}</span>
                        <strong>{change.before} → {change.after}</strong>
                      </li>
                    ))}
                  </ul>
                ) : <p>이 시점에는 반영 가능한 강수·시정 관측값이 없습니다.</p>}
                <dl>
                  <div>
                    <dt>예상 최저</dt>
                    <dd>{observedWeatherImpact.minimumBudgetBefore.toFixed(1)} → {observedWeatherImpact.minimumBudgetAfter.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>안전한계 시점</dt>
                    <dd>{observedWeatherImpact.breachBefore} → {observedWeatherImpact.breachAfter}</dd>
                  </div>
                  <div>
                    <dt>추천 변화</dt>
                    <dd>{observedWeatherImpact.recommendationBefore} → {observedWeatherImpact.recommendationAfter}</dd>
                  </div>
                </dl>
                <p>관측 기온은 체감온도로 임의 변환하지 않아 계산에 반영하지 않았습니다.</p>
              </section>
            ) : null}
          <fieldset>
            <legend>업무와 안전여유</legend>
            <div className="scenario-field-grid">
              <NumberField label="남은 배송" value={input.remainingStopCount} min={4} max={40} step={1} unit="건" onChange={(value) => changeNumber("remainingStopCount", value)} />
              <NumberField label="총 근무" value={input.shiftElapsedHours} min={1} max={11} step={0.1} unit="시간" onChange={(value) => changeNumber("shiftElapsedHours", value)} />
              <ScenarioSlider label="연속 작업" value={input.continuousWorkHours} min={0.25} max={5} step={0.1} unit="시간" stateLabel={workState(input.continuousWorkHours)} onChange={(value) => changeNumber("continuousWorkHours", value)} />
              <ScenarioSlider label="현재 안전여유" value={input.currentSafetyBudget} min={25} max={90} step={1} unit="점" stateLabel={safetyState(input.currentSafetyBudget)} onChange={(value) => changeNumber("currentSafetyBudget", value)} />
              <ScenarioSlider label="분담 기사 여유" value={input.recipientSafetyBudget} min={45} max={95} step={1} unit="점" stateLabel={recipientState(input.recipientSafetyBudget)} onChange={(value) => changeNumber("recipientSafetyBudget", value)} />
            </div>
          </fieldset>

          {error && <p className="scenario-error" role="alert">{error}</p>}
          <button className="scenario-submit" type="submit">이 조건으로 다시 예측</button>
          <p className="scenario-fixed-note">경로 조건과 체감온도는 시연 기준계획의 고정값을 사용합니다.</p>
          <p className="scenario-form-note">이름·주소·연락처·GPS를 입력하거나 저장하지 않습니다.</p>
          </section>
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
          <article><span>사용자 입력</span><strong>Safety 입력</strong><p>업무 조건과 선택 시점 관측을 이 세션에서만 계산합니다.</p></article>
          <article><span>결정론 엔진</span><strong>수치·추천 소유</strong><p>시연 기준계획의 Safety Budget, Time-to-Breach, Risk Transfer Guard를 계산합니다.</p></article>
          <article>
            <span>기상청 관측 문맥</span>
            <strong>{weatherCalendarStatus.status === "LIVE" ? "서울 ASOS · 최근 31일" : "31일 ASOS · 승인 대기"}</strong>
            <p>{weatherCalendarStatus.status === "LIVE" ? "날짜·시간별 관측을 보고 시뮬레이션 조건을 선택합니다." : "연동 승인 전에는 날짜를 고른 뒤 임의 조건을 직접 설정합니다."}</p>
          </article>
          <article><span>지도·생성 AI</span><strong>수치 계산 미사용</strong><p>지도는 표현, AI는 검증된 설명에만 사용합니다.</p></article>
        </div>
      </section>
    </main>
  );
}
