import { useRef, useState } from "react";
import "./one-page-dashboard.css";

type SupportState = "BREACH" | "SUPPORT" | "CAUTION" | "STABLE";
type CourierFilter = "ALL" | "SUPPORT" | "CAUTION" | "STABLE";

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
  onSelect,
  cardRef,
}: {
  courier: Courier;
  photoIndex: number;
  selected: boolean;
  onSelect: () => void;
  cardRef: (node: HTMLButtonElement | null) => void;
}) {
  const photoColumn = photoIndex % 5;
  const photoRow = Math.floor(photoIndex / 5);
  const state = supportState(courier.budget);
  return (
    <button
      ref={cardRef}
      className={`onepage-courier-card ${selected ? "is-selected" : ""}`}
      data-courier-card={courier.id}
      aria-pressed={selected}
      aria-label={`${courier.name} 기사, 지정구역 ${courier.area}, 안전여유 ${courier.budget}, ${stateLabel[state]}`}
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
        <small>안전여유</small>
        <span className="onepage-card-safety-value">
          <b>{courier.budget.toFixed(1)}</b>
          <em>{stateLabel[state]}</em>
        </span>
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
  const [filter, setFilter] = useState<CourierFilter>("ALL");
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardRailRef = useRef<HTMLDivElement>(null);

  const selectedCourier =
    couriers.find((courier) => courier.id === selectedId) ?? couriers[0];
  const selectedIndex = couriers.findIndex(
    (courier) => courier.id === selectedCourier.id,
  );
  const urgentCouriers = couriers.filter((courier) => courier.budget < 45);
  const filteredCouriers = couriers.filter((courier) => {
    const state = supportState(courier.budget);
    if (filter === "ALL") return true;
    if (filter === "SUPPORT") return state === "BREACH" || state === "SUPPORT";
    return state === filter;
  });

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
    const nextCouriers = couriers.filter((courier) => {
      const state = supportState(courier.budget);
      if (nextFilter === "ALL") return true;
      if (nextFilter === "SUPPORT") return state === "BREACH" || state === "SUPPORT";
      return state === nextFilter;
    });
    if (!nextCouriers.some((courier) => courier.id === selectedId)) {
      setSelectedId(nextCouriers[0]?.id ?? couriers[0].id);
    }
  };

  const selectedIsClustered = clusteredIds.has(selectedId);

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
          <small>Safety Control Tower</small>
          <h1>향후 60분 지원 관제</h1>
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
            <h2 id="courier-section-title">기사 상태</h2>
            <small>지원 판단용 · 순위 아님</small>
          </div>
          <div className="onepage-filter-tabs" aria-label="기사 상태 필터">
            {([
              ["ALL", "전체", 20],
              ["SUPPORT", "지원", 9],
              ["CAUTION", "주의", 7],
              ["STABLE", "안정", 4],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
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
              onSelect={() => selectCourier(courier.id)}
              cardRef={(node) => {
                if (node) cardRefs.current.set(courier.id, node);
                else cardRefs.current.delete(courier.id);
              }}
            />
          ))}
        </div>
      </section>

      <section className="onepage-workspace" aria-label="지도와 안전지원 큐">
        <div className="onepage-map-section" aria-label="기사 합성 위치 지도">
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
              <small>현재 선택</small>
              <h2 id="support-panel-title">안전지원 판단</h2>
            </div>
            <span>{urgentCouriers.length}명 확인</span>
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
                <small>임계치</small>
                <strong>
                  {selectedCourier.criticalMinute === null
                    ? "예상 없음"
                    : selectedCourier.criticalMinute === 0
                      ? "현재 초과"
                      : `+${selectedCourier.criticalMinute}분`}
                </strong>
              </div>
            </div>
            <p>
              승인 전까지 현재 계획 유지
              <span>배송 {selectedCourier.completed}/{selectedCourier.total}</span>
            </p>
            <a href="/operations">개입 검토 열기</a>
          </div>

          <div className="onepage-support-queue">
            <div className="onepage-support-queue-title">
              <strong>지원 큐</strong>
              <small>임계치 45 미만</small>
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
    </main>
  );
}
