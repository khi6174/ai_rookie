# SafeRoute AI G5 공간 시각화 설계안

## 문서 상태

- 상태: Approved — G5-A 공급자 독립 Demo 2.5D 구현 기준
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-20
- 설계 버전: `g5-spatial-design-v1.0.0`
- 상위 문서: `AGENTS.md`, `docs/design-system.md`, `docs/geospatial-pwa-implementation-plan.md`, `docs/architecture.md`, `docs/evals.md`
- 승인 범위: 관리자 활성 decision의 선택형 SVG 2.5D, 기본 2D·기사 PWA 유지

## 1. 결론과 권고안

G5의 첫 구현 후보는 전체 관제 지도를 입체화하는 기능이 아니라, 선택한 지원 decision의 경사·휴식·예상 초과 지점을 같은 경로 위에서 설명하는 **관리자용 2.5D 경사 맥락 보기**로 제한한다.

- 기본 지도는 지금의 Kakao 2D 또는 Fallback 2D다.
- 2.5D는 `decision` scope에서만 사용자가 명시적으로 연다.
- 2D와 2.5D는 같은 `decisionId`, `routeId`, route point, Safety 결과를 읽는다.
- 2.5D 장면은 합성 고도·경사 데이터만 사용하고 `Demo 2.5D`를 고정 표시한다.
- 기사 PWA에는 3D를 추가하지 않는다. 기사 화면은 현재 compact 2D와 구조화 경로가 기본이다.
- 새 지도 공급자, WebGL 라이브러리, DEM·건물 타일, VARCO 에셋은 이 설계 승인만으로 추가하지 않는다.

이 권고안은 3D를 장식으로 사용하지 않으면서 “왜 17번째 배송지 전에 지원이 필요한가?”를 지형 맥락으로 더 빠르게 설명한다. 전체 다기사 디지털 트윈은 실제 위치·지도·타일·성능 계약이 필요한 P2 후속으로 남긴다.

## 2. 대표 장면 선택

| 후보 장면 | 의사결정 기여 | 현재 데이터 적합성 | 접근성·성능 위험 | 판정 |
|---|---:|---:|---:|---|
| 선택 경로의 경사·휴식·예상 초과 지점 | 높음 | 합성 fixture 확장으로 충족 가능 | 낮음 | **G5-A 권고** |
| 여러 경로의 고가·지하·교차 구간 분리 | 중간 | 높이·도로 층위 데이터 없음 | 중간 | 데이터 계약 후 검토 |
| 건물·골목·주차 환경의 실제 3D 도시 장면 | 낮음~중간 | 건물·통행 데이터 없음 | 높음 | P2 보류 |
| 240명 전체 기사 실시간 3D 디지털 트윈 | 장식 위험 큼 | Live 위치·TMS 없음 | 매우 높음 | 현재 금지 |

G5-A의 대표 질문은 다음 하나다.

> 현재 계획이 경사 노출과 연속작업 때문에 어느 구간에서 안전범위를 벗어나며, 휴식·안전경로 대안은 그 구간을 어떻게 바꾸는가?

## 3. 관리자 정보구조

```text
┌──────────────────── 기존 Calm Control Tower ────────────────────┐
│ 2D 지도 / 지원 큐 / Demo movement / 동일 decision ID           │
│                                                                  │
│ [2D 지도] [입체 경사 보기 · Demo]                                │
│                                                                  │
│  선택 decision 경로                  2.5D 설명 패널               │
│  현재 위치 ─ 휴식 ─ 17번째 지점      경사·구간·근거·수치 목록     │
│                                                                  │
│ [2D로 돌아가기] [같은 decision을 지원 큐에서 보기]               │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 진입 조건

- 관리자 화면의 `decision` scope에서만 `입체 경사 보기 · Demo` 버튼을 제공한다.
- 전국·권역 scope에서는 입체 버튼을 표시하지 않는다.
- 지도 오류, 데이터 결측, reduced-motion, WebGL 미지원 여부와 무관하게 2D가 항상 먼저 완성된다.
- 2.5D를 열어도 선택 decision과 지도 pan·재생 frame은 바뀌지 않는다.

### 3.2 장면 구성

1. 현재 위치, 계획 경로, 휴식 지점, 예상 초과 지점을 하나의 짧은 합성 경로 ribbon에 표시한다.
2. 위험기여는 높이 자체로 표현하지 않고 구간 외곽 패턴과 `강수·경사·연속작업` 문구로 표현한다.
3. 현재 계획과 안전경로는 동일한 거리·고도 축을 사용한다.
4. 세로 과장은 기본 1배다. 필요한 경우 최대 1.5배이며 `세로 1.5배`를 장면 안에 표시한다.
5. 카메라는 고정 pitch 35도, 선택 경로 방향의 고정 bearing을 기본으로 한다.
6. 자동 회전·fly-to·카메라 비행·무한 애니메이션은 사용하지 않는다.
7. `2D로 돌아가기`는 항상 첫 번째 지도 제어로 제공한다.

### 3.3 수치 대안

2.5D 장면 옆에는 같은 내용을 텍스트·표로 제공한다.

- 현재 구간: 합성 경사 %, 남은 거리, 위치 최신성
- 지원 지점: 휴식 지점 또는 조정 시작 지점
- 예상 초과: 시간·배송지 순번·Safety Budget
- 대안 결과: 같은 경로 구간의 조정 전후 Budget과 ETA
- 데이터 상태: `Demo 2.5D`, `Live 0명`, 고도 출처와 기준시각

원근이나 색을 보지 못해도 이 목록만으로 동일 decision을 검토하고 승인할 수 있어야 한다.

## 4. 제안 데이터 계약

아래 계약은 구현 전 별도 승인이 필요한 초안이다.

```ts
type SpatialRouteSample = {
  routePointId: string;
  distanceFromStartMeters: number;
  elevationMeters: number;
  slopePercent: number;
  segmentKind: "NORMAL" | "SLOPE_EXPOSURE" | "REST_POINT" | "BREACH_POINT";
  provenance: Provenance[];
};

type DecisionSpatialScene = {
  schemaVersion: "decision-spatial-scene-v1";
  sceneId: string;
  decisionId: DecisionId;
  planId: PlanId;
  routeId: string;
  dataMode: "DEMO";
  rendererMode: "TWO_D" | "DEMO_TWO_POINT_FIVE_D";
  verticalExaggeration: 1 | 1.5;
  samples: SpatialRouteSample[];
  generatedAt: IsoDateTime;
  provenance: Provenance[];
};
```

### 4.1 불변조건

- `decisionId`, `planId`, `routeId`는 현재 `MapRenderModel`과 정확히 일치한다.
- `distanceFromStartMeters`는 0 이상이며 엄격히 증가한다.
- 고도·경사·거리 수치는 결정론적 코드가 소유하며 생성형 AI가 만들거나 수정하지 않는다.
- G5-A의 모든 provenance는 `MOCK`, `isDemo=true`다.
- `BREACH_POINT`는 Safety 엔진이 이미 확정한 예상 초과 배송지와 일치해야 한다.
- `REST_POINT`와 안전경로는 승인된 개입 후보에 존재할 때만 표시한다.
- 2D와 2.5D의 route point 집합, 순서, decision 상태와 표시 수치가 하나라도 다르면 2.5D를 차단한다.
- 고도·경사 결측 또는 계약 실패 시 `2.5D 데이터 없음`을 표시하고 기존 2D로 복귀한다.

## 5. 렌더링 선택지

### 선택지 A — 공급자 독립 2.5D 경사 장면

- 기존 React·TypeScript·CSS/SVG 계층에서 선택 경로만 렌더링한다.
- 새 외부 의존성·타일·지도 계약이 없다.
- Kakao 실패와 오프라인에서도 같은 Demo 장면을 재현할 수 있다.
- 2D와 수치 대안을 가장 쉽게 동일하게 유지한다.
- **결선용 권고안이다.**

### 선택지 B — Kakao 2D 지형도 + 2.5D 경사 장면

- Kakao `TERRAIN` 오버레이를 2D 배경 맥락으로 사용하고 선택 경로의 입체 설명은 별도 공급자 독립 장면이 담당한다.
- Kakao Web API 공식 문서에는 `TERRAIN` overlay와 Roadview가 있지만 현재 공개 `Map` 메서드 목록에서 pitch·bearing·3D terrain/extrusion 제어는 확인되지 않았다.
- 따라서 Kakao 지형도를 `3D 지도`로 표시하지 않는다.
- Kakao overlay 사용 범위와 공개 Demo 정책 확인 후 별도 승인한다.

### 선택지 C — MapLibre 기반 실제 WebGL 3D

- MapLibre GL JS는 공식 예제에서 raster DEM 기반 3D terrain, building extrusion, pitch·bearing과 WebGL 렌더링을 제공한다.
- 그러나 지도 style, vector/raster tile, DEM 공급자와 attribution·라이선스·쿼터·국외 전송 경계를 새로 승인해야 한다.
- 번들·GPU·배터리·저사양·WebGL 오류와 2D fallback 평가 비용이 커진다.
- G5-A가 실제 사용자 이해를 개선한다는 증거가 나온 뒤 P2에서만 검토한다.

## 6. 성능·접근성 Gate

G4-B의 2D Gate는 어떤 경우에도 약화하지 않는다. 2.5D는 lazy render하며 닫혀 있을 때 초기 지도 성능에 영향을 주지 않아야 한다.

| Gate | 제안 기준 |
|---|---:|
| 2.5D 첫 표시 | 1,000ms 이하 |
| 2D ↔ 2.5D 전환 | 300ms 이하 |
| decision 선택 반응 | 300ms 이하 |
| rAF gap P95 / 최대 | 100ms / 250ms 이하 |
| 추가 gzip JS | 선택지 A 기준 50KiB 이하 |
| 2D·2.5D 식별자·수치 불일치 | 0건 |
| WebGL·데이터 오류 후 2D 복귀 | 100% |
| 키보드로 2D 복귀 | 100% |

- `prefers-reduced-motion`에서는 전환 애니메이션과 위치 보간을 제거한다.
- screen reader에는 2.5D canvas 자체가 아니라 구조화 수치 대안을 제공한다.
- 1280×720에서 지도·지원 큐·2D 복귀 행동이 첫 작업면에 남아야 한다.
- 기사 390×844·360×800 화면은 변경하지 않아야 한다.

## 7. 평가 설계

### 7.1 자동 검증

1. 같은 입력에서 `DecisionSpatialScene` JSON과 SHA-256 재현
2. 2D·2.5D의 decision·plan·route·point 순서·표시 수치 exact equality
3. 결측, invalid elevation, 잘못된 breach point, Live 혼합 100% 거부
4. 2.5D 열기·2D 복귀·키보드·reduced-motion·Fallback E2E
5. G4-B 24·96·240명 2D 성능과 기존 폐루프 회귀 0건
6. 지정 관리자 해상도와 가로 overflow 검증

### 7.2 사람 이해 확인

최소 3명의 독립 검토자가 2D와 2.5D를 각각 보고 다음 질문에 답한다.

- 예상 초과는 몇 분 후, 몇 번째 배송지인가?
- 경사 노출이 집중되는 구간은 어디인가?
- 추천 조치가 원 기사와 수신 기사에게 미치는 영향은 무엇인가?
- 2.5D가 2D보다 빠르게 이해되는가, 아니면 혼란을 늘리는가?

수치·추천 오답 또는 원근으로 인한 경로 우선순위 오인이 1건이라도 있으면 공개 기본 기능으로 승격하지 않는다.

## 8. 국내 AI 트랙 경계

- G5-A geometry, 고도, 경사와 카메라는 결정론적 코드가 소유하며 국내외 생성형 AI를 런타임 결정에 사용하지 않는다.
- A.X·K-EXAONE·Upstage는 기존 설명 경계를 유지하고 3D 수치나 경로를 생성하지 않는다.
- 선택지 A는 별도 3D 에셋이 없어 VARCO를 사용하지 않는다.
- 향후 VARCO 에셋을 사용하려면 정확한 제품 API, 입력 보존정책, 라이선스, 생성 사실과 결과 평가를 별도 승인하고 국내 AI 성과 범위를 명시한다.
- MapLibre는 지도 렌더링 라이브러리이지 AI 모델이 아니며, 사용 시에도 국내 AI 활용 성과로 세지 않는다.

## 9. 구현 결과와 후속 승인 지점

1. **G5-A 구현 완료:** 활성 지원 decision에만 `입체 경사 보기 · Demo`를 제공한다.
2. **자동 Gate 편입:** 계약·SHA-256 재현·2D 의미 일치·성능·키보드·reduced-motion·Fallback을 전체 릴리스 Gate에서 검증한다.
3. **공개 Demo 반영:** 사용자가 승인한 기존 공개 범위에서 기본 2D를 유지하고 선택형 2.5D만 추가한다.
4. **사람 이해 확인:** `docs/g5-spatial-comprehension-test.md`의 고정 자극·익명 계약·자동 판정 하네스를 준비했다. 최소 3명의 실제 독립 검토 결과는 아직 대기 중이며 G5-B로 별도 보존한다.
5. **P2 재검토:** 선택지 B 지형 overlay 또는 선택지 C 실제 WebGL 3D는 별도 재승인 전 구현하지 않는다.

## 10. 승인되어 구현된 항목

- 대표 장면은 `선택 decision의 경사·휴식·예상 초과 설명`으로 고정한다.
- 관리자 전용·활성 decision scope·사용자 선택형으로 제한한다.
- 기본 2D와 기사 compact map은 변경하지 않는다.
- 새 의존성이 없는 공급자 독립 SVG 2.5D를 사용한다.
- 합성 고도 42·49.5·72·88.2m와 거리 0·750·1,650·2,550m는 계약 fixture이며 실제 지형으로 표현하지 않는다.
- 52분·17번째·29.9→47.2·10분 휴식·8건 이관·ETA +8분은 기존 결정론적 Demo 수치와 exact equality를 강제한다.

## 11. 비목표

- 전체 기사 실시간 3D 디지털 트윈
- 실제 건물·도로·고도·교통 데이터 수집
- 실제 GPS·TMS·주소·길찾기·내비게이션
- 기사 PWA의 운전 중 3D 조작
- 자동 카메라·장식용 건물·날씨 효과
- 3D 높이로 Safety Budget이나 위험도를 표현
- 실제 지도 공급자 없이 합성 장면을 Live 3D로 표시

## 12. 공식 기술 근거

- [Kakao 지도 Web API 문서](https://apis.map.kakao.com/web/documentation/)
- [Kakao 지도 지형도 오버레이 예제](https://apis.map.kakao.com/web/sample/addTerrainOverlay/)
- [MapLibre GL JS 공식 예제 목록](https://maplibre.org/maplibre-gl-js/docs/examples/)
- [MapLibre 3D terrain 예제](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)
- [MapLibre 3D building extrusion 예제](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/)

## 13. 수용기준

- 이 문서는 구현된 G5-A 장면, 데이터, UI, 기술 선택, 위험과 Gate를 설명한다.
- 기존 2D·Fallback·기사 권리·Safety·국내 AI 경계를 약화하지 않는다.
- 현재 기술로 확인되지 않은 Kakao 기능을 3D로 주장하지 않는다.
- G5-B 사람 이해 확인과 P2 실제 3D는 별도 승인 전 확장하지 않는다.
