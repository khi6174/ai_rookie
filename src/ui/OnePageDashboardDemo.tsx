import { useEffect, useMemo, useRef, useState } from "react";
import "./one-page-dashboard.css";

type SupportState = "BREACH" | "SUPPORT" | "CAUTION" | "STABLE";

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

const clusters = [
  { id: "cluster-west", x: 42, y: 42, memberIds: ["R-011", "R-029"] },
  { id: "cluster-east", x: 66, y: 37, memberIds: ["R-003", "R-034", "R-007"] },
  { id: "cluster-south", x: 60, y: 73, memberIds: ["R-018", "R-026", "R-009", "R-032"] },
  { id: "cluster-north", x: 40, y: 23, memberIds: ["R-013", "R-021"] },
];

const clusteredIds = new Set(clusters.flatMap((cluster) => cluster.memberIds));

function supportState(budget: number): SupportState {
  if (budget < 30) return "BREACH";
  if (budget < 45) return "SUPPORT";
  if (budget < 60) return "CAUTION";
  return "STABLE";
}

const stateLabel: Record<SupportState, string> = {
  BREACH: "초과",
  SUPPORT: "지원",
  CAUTION: "주의",
  STABLE: "안정",
};

const stateSymbol: Record<SupportState, string> = {
  BREACH: "!",
  SUPPORT: "◒",
  CAUTION: "△",
  STABLE: "✓",
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
  selected,
  onSelect,
  cardRef,
}: {
  courier: Courier;
  selected: boolean;
  onSelect: () => void;
  cardRef: (node: HTMLButtonElement | null) => void;
}) {
  const state = supportState(courier.budget);
  return (
    <button
      ref={cardRef}
      className={`onepage-courier-card state-${state.toLowerCase()} ${selected ? "is-selected" : ""}`}
      data-courier-card={courier.id}
      aria-pressed={selected}
      aria-label={`${courier.name} 기사, ${stateLabel[state]}, Safety Budget ${courier.budget}`}
      onClick={onSelect}
      type="button"
    >
      <span className="onepage-card-band" aria-hidden="true" />
      <span className="onepage-avatar" aria-hidden="true">{courier.name.slice(0, 1)}</span>
      <span className="onepage-card-copy">
        <span className="onepage-card-name">{courier.name}</span>
        <span className="onepage-card-meta">{courier.id} · {courier.area}</span>
        <span className="onepage-delivery-progress" aria-label={`배송 ${courier.completed}건 완료, 전체 ${courier.total}건`}>
          <span style={{ width: `${(courier.completed / courier.total) * 100}%` }} />
        </span>
      </span>
      <span className="onepage-score">
        <strong>{courier.budget.toFixed(1)}</strong>
        <small><span aria-hidden="true">{stateSymbol[state]}</span> {stateLabel[state]}</small>
      </span>
    </button>
  );
}

function MapMarker({
  courier,
  selected,
  onSelect,
}: {
  courier: Courier;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = supportState(courier.budget);
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
      <span aria-hidden="true">{courier.name.slice(0, 1)}</span>
      <small aria-hidden="true">{courier.budget.toFixed(0)}</small>
    </button>
  );
}

export function OnePageDashboardDemo() {
  const [selectedId, setSelectedId] = useState(couriers[0].id);
  const [simulationMinute, setSimulationMinute] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardRailRef = useRef<HTMLDivElement>(null);

  const selectedCourier =
    couriers.find((courier) => courier.id === selectedId) ?? couriers[0];
  const urgentCouriers = useMemo(
    () => couriers.filter((courier) => courier.budget < 45),
    [],
  );

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!playing || reduceMotion) return;
    const interval = window.setInterval(() => {
      setSimulationMinute((minute) => (minute >= 60 ? 0 : minute + 1));
    }, 420);
    return () => window.clearInterval(interval);
  }, [playing]);

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

  const selectedIsClustered = clusteredIds.has(selectedId);

  return (
    <main className={`onepage-demo ${timelineOpen ? "" : "is-timeline-collapsed"}`}>
      <header className="onepage-header">
        <div className="onepage-brand" aria-label="SafeRoute AI">
          <span aria-hidden="true">S</span>
          <strong>SafeRoute</strong>
        </div>
        <h1>Safety Control Tower</h1>
        <div className="onepage-header-status">
          <span className="onepage-demo-badge">합성 Demo</span>
          <span className="onepage-live-badge"><i aria-hidden="true" /> Live 0</span>
          <time dateTime="2026-07-30T14:32:00+09:00">14:32</time>
        </div>
      </header>

      <section className="onepage-courier-section" aria-labelledby="courier-section-title">
        <div className="onepage-section-rail">
          <div>
            <span className="onepage-section-icon" aria-hidden="true">●</span>
            <h2 id="courier-section-title">기사 20</h2>
          </div>
          <div className="onepage-scroll-controls">
            <button type="button" aria-label="이전 기사 카드" onClick={() => scrollCards(-1)}>‹</button>
            <button type="button" aria-label="다음 기사 카드" onClick={() => scrollCards(1)}>›</button>
          </div>
        </div>
        <div className="onepage-card-rail" ref={cardRailRef}>
          {couriers.map((courier) => (
            <CourierCard
              key={courier.id}
              courier={courier}
              selected={selectedId === courier.id}
              onSelect={() => selectCourier(courier.id)}
              cardRef={(node) => {
                if (node) cardRefs.current.set(courier.id, node);
                else cardRefs.current.delete(courier.id);
              }}
            />
          ))}
        </div>
      </section>

      <section className="onepage-map-section" aria-label="기사 합성 위치 지도">
        <div className="onepage-map-toolbar">
          <div>
            <strong>강남 허브</strong>
            <span>합성 위치 · 14:32</span>
          </div>
          <div className="onepage-map-legend" aria-label="지도 상태 범례">
            <span><i className="legend-breach" /> 초과 3</span>
            <span><i className="legend-support" /> 지원 6</span>
            <span><i className="legend-caution" /> 주의 7</span>
            <span><i className="legend-stable" /> 안정 4</span>
          </div>
        </div>
        <div className="onepage-map-canvas">
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
          <span className="onepage-hub" aria-label="강남 합성 허브">
            <b aria-hidden="true">H</b>
          </span>

          {couriers
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
                <small>{priority.budget.toFixed(0)}</small>
              </button>
            );
          })}

          {selectedIsClustered ? (
            <MapMarker
              courier={selectedCourier}
              selected
              onSelect={() => selectCourier(selectedCourier.id, true)}
            />
          ) : null}

          <div className="onepage-selected-strip" aria-live="polite">
            <span className={`onepage-selected-state state-${supportState(selectedCourier.budget).toLowerCase()}`}>
              {stateSymbol[supportState(selectedCourier.budget)]}
            </span>
            <strong>{selectedCourier.name}</strong>
            <span>{selectedCourier.id}</span>
            <b>{selectedCourier.budget.toFixed(1)}</b>
            <span>{selectedCourier.completed}/{selectedCourier.total}</span>
          </div>
        </div>
      </section>

      <section className="onepage-timeline-section" aria-labelledby="timeline-title">
        <div className="onepage-timeline-header">
          <div>
            <button
              className="onepage-simulation-toggle"
              type="button"
              aria-label={playing ? "60분 시뮬레이션 일시정지" : "60분 시뮬레이션 재생"}
              aria-pressed={playing}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <h2 id="timeline-title">향후 60분</h2>
            <output aria-label={`시뮬레이션 ${simulationMinute}분`}>+{simulationMinute}분</output>
          </div>
          <div className="onepage-timeline-actions">
            <span><i className="timeline-support-swatch" /> 45↓</span>
            <span><i className="timeline-breach-swatch" /> 30↓</span>
            <button
              type="button"
              aria-expanded={timelineOpen}
              aria-controls="onepage-timeline-content"
              aria-label={timelineOpen ? "60분 시뮬레이션 접기" : "60분 시뮬레이션 펼치기"}
              onClick={() => setTimelineOpen((value) => !value)}
            >
              {timelineOpen ? "⌄" : "⌃"}
            </button>
          </div>
        </div>

        <div id="onepage-timeline-content" className="onepage-timeline-content">
          <div className="onepage-timeline-axis" aria-hidden="true">
            <span>지금</span><span>+15</span><span>+30</span><span>+45</span><span>+60</span>
          </div>
          <div className="onepage-timeline-grid">
            <span className="onepage-timeline-overlay" aria-hidden="true">
              <span
                className="onepage-playhead"
                style={{ left: `${simulationMinute * (100 / 60)}%` }}
              />
              {[0, 25, 50, 75, 100].map((left) => (
                <span key={left} className="onepage-gridline" style={{ left: `${left}%` }} />
              ))}
            </span>
            {urgentCouriers.map((courier) => {
              const state = supportState(courier.budget);
              const criticalStart = courier.criticalMinute ?? 60;
              const selected = selectedId === courier.id;
              return (
                <div
                  key={courier.id}
                  className={`onepage-timeline-row ${selected ? "is-selected" : ""}`}
                  data-timeline-row={courier.id}
                  aria-label={`${courier.name}, ${stateLabel[state]}, ${
                    criticalStart === 0 ? "현재 한계 초과" : `${criticalStart}분 후 한계 초과 예상`
                  }`}
                >
                  <span className="onepage-row-name">{courier.name}</span>
                  <span className="onepage-row-track">
                    {criticalStart > 0 ? (
                      <i className="onepage-support-segment" style={{ width: `${(criticalStart / 60) * 100}%` }} />
                    ) : null}
                    <i
                      className="onepage-breach-segment"
                      style={{
                        left: `${(criticalStart / 60) * 100}%`,
                        width: `${100 - (criticalStart / 60) * 100}%`,
                      }}
                    />
                  </span>
                  <b>{criticalStart === 0 ? "현재" : `${criticalStart}분`}</b>
                </div>
              );
            })}
          </div>
          <div className="onepage-stable-summary">
            <span aria-hidden="true">✓</span>
            11
          </div>
        </div>
      </section>
    </main>
  );
}
