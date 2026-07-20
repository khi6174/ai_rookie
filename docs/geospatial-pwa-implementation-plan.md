# SafeRoute AI 다지역 지도·기사 PWA 구현계획

## 문서 상태

- 상태: Approved through G4-B deterministic Fallback 2D load budget
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-20
- 계획 버전: `geospatial-pwa-plan-v1.8.0`
- 상위 문서: `AGENTS.md`, `docs/design-system.md`, `docs/decisions.md`
- 관련 승인 문서: `docs/product-spec.md`, `docs/data-contracts.md`, `docs/privacy-and-ai-policy.md`, `docs/architecture.md`, `docs/evals.md`

## 1. 목적

이 문서는 `design-v2.0.0`과 ADR-035에서 승인된 `다지역·다기사 지리공간 Control Tower + 현장형 기사 PWA`를 현재 검증된 SafeRoute 폐루프를 훼손하지 않고 구현하는 순서와 승인 Gate로 연결한다.

현재 공개 Demo는 단일 합성 시나리오, 선택적 Kakao Maps 2D 베이스 레이어, schematic `Fallback map`과 설치 가능한 정적 PWA app shell이다. Kakao 레이어에도 결정론적 합성 위치만 표시하며 실제 인증·실시간 위치·푸시·서버 동기화는 포함하지 않는다.

## 2. 작업 원칙

1. 지도는 안전 판정 엔진이 아니라 검증된 도메인 결과를 공간적으로 탐색하는 UI다.
2. 실제 위치보다 결정론적 다지역 합성 fixture를 먼저 구현한다.
3. 2D에서 전체 폐루프와 접근성을 완성한 뒤 2.5D·3D를 점진적으로 추가한다.
4. 움직이는 마커는 검증된 Live 또는 명시적 Demo timeline이 있을 때만 사용한다.
5. 기사 위치는 성과평가·징계·순위·생산성 압박에 사용하지 않는다.
6. 현재 P0 계산, Risk Transfer Guard, 동의·승인 상태기계와 국내 AI 경계를 변경하지 않는다.
7. 지도 공급자, 위치 수집과 PWA 보안은 각각 별도 승인 Gate를 통과한다.

## 3. 목표 사용자 흐름

### 3.1 관리자

```text
전국·권역 개요
→ 지역·허브 선택
→ 지원 필요 군집 확인
→ 기사·decision 선택
→ 현재 계획과 대안 경로 비교
→ 기사 동의 상태 확인
→ 관리자 승인
→ 계획·ETA·고객안내·감사기록 갱신
```

지도와 지원 큐는 같은 `regionId`, `hubId`, `courierId`, `planId`, `decisionId`를 공유한다. 지도에서 선택한 상황과 큐에서 선택한 상황이 달라질 수 없다.

### 3.2 기사

```text
PWA 진입
→ 현재 위치·다음 배송지·Safe-until 확인
→ 안전지원 알림
→ 정차 후 조정 전후 검토
→ 동의·수정 요청·거절
→ 승인 대기
→ 적용된 새 경로·배송순서·ETA 확인
```

위치 권한 거절, 오프라인과 지도 실패는 기사 권리 행사나 서비스 이용 실패로 표현하지 않는다. 마지막 승인 계획과 schematic route로 같은 의사결정을 완료할 수 있어야 한다.

## 4. 단계별 구현 루프

### G0 — 계약·개인정보·평가 승인

작업:

- 지역·허브·위치 관측·최신성·지도 feature 계약 정의
- 역할별 위치 노출, 메모리 보존과 삭제 정책 정의
- 지도 공급자와 PWA 런타임의 trust boundary 정의
- 다기사 지도 성능·접근성·Fallback 평가 기준 정의

종료조건:

- 관련 다섯 승인 문서의 변경안과 ADR 승인
- 실제 기사·고객 데이터가 없는 상태 유지
- 구현할 지도 공급자와 PWA 범위 승인

### G1 — 다지역·다기사 결정론적 합성 데이터

작업:

- 최소 3개 지역, 지역별 8명 이상, 총 24명 이상의 합성 기사 fixture
- 서로 다른 날씨·도로·작업량·신뢰도·지원 상태 구성
- 지역·허브·기사·계획·decision 참조 무결성 검증
- 같은 seed와 기준시각에서 같은 위치·경로·상태 재현
- 기존 대표 시나리오 A·B·C를 다지역 fixture의 불변 parent로 포함

종료조건:

- 실제 주소·기사 이름·차량번호·전화번호 0건
- 유효 fixture 100% parse, invalid fixture 100% reject
- 저배율 집계 건수와 상세 기사·decision 수가 정확히 일치
- 기존 Safety·개입·동의·승인 테스트 회귀 0건

### G2 — 공급자 독립 2D 지도 계층

실행 상태:

- `G2-A` 완료: 외부 지도 SDK 없이 동작하는 `MapAdapter`, 3개 지역·24명 합성 projection, 전국→지역→기사·decision 드릴다운, breadcrumb·전체 보기, 지도→decision과 지원 큐→동일 decision 연결을 구현했다.
- 전국 화면은 지역 집계만 노출하고 개별 기사·정밀 위치를 표시하지 않는다. 지역 화면은 해당 지역의 8명만, decision 화면은 선택 기사 1명만 표시한다.
- 위치는 정지된 결정론적 `Demo fixture`이며 `Live 0명`, stale·offline 상태를 텍스트와 함께 표시한다. 실제 이동·지도 공급자·위치 스트림을 암시하지 않는다.
- `G2-B` 완료: 지도 오류를 명시적으로 재현·복구하고, 오류 시 같은 projection을 읽는 지역→기사→decision 목록과 배송순서 Fallback을 자동 제공한다. 평상시에도 키보드로 펼칠 수 있는 구조화 대안을 유지한다.
- 지도→지원 큐→지도 왕복, 키보드 전용 목록 탐색, 1440×900·1280×720·390×844·360×800, 기존 두 기사 동의→관리자 승인 폐루프를 Playwright 12/12로 재검증했다.
- G2 종료: 외부 지도 공급자와 Live 위치 없이 공급자 독립 2D 탐색·오류 복구·접근 가능한 의사결정 대안을 완성했다. Fallback 2D 성능 예산은 G4-B에서 고정했고 실제 지도 SDK의 공급자별 성능은 별도 Gate로 남긴다.
- 후속 표시 어댑터 완료: 사용자 승인과 도메인 제한 JavaScript 키를 전제로 Kakao Maps 2D 베이스 레이어를 선택적으로 추가했다. SDK는 기존 `MapRenderModel`의 합성 WGS84 좌표만 렌더링하며 실패 시 G2 schematic 지도·구조화 목록으로 자동 복귀한다. 실제 GPS·주소·길찾기·Live stream은 추가하지 않았다.

작업:

- 지도 SDK와 분리된 `MapAdapter` 인터페이스
- 전국·권역 → 지역·허브 → 기사·decision 드릴다운
- 군집, 경로, 위험구간, 날씨, Near-miss, 지원 상태 레이어
- 지도·지원 큐 양방향 선택과 breadcrumb·카메라 초기화
- schematic fallback과 배송순서 목록 대안

종료조건:

- 지도 공급자 없이도 전체 폐루프 재현
- 지도·큐의 식별자·수치·상태 불일치 0건
- 저배율 개별 기사·정밀 위치 노출 0건
- 키보드와 screen reader 대안으로 같은 decision 선택 가능

### G3 — 기사 PWA 시각 구조

실행 상태:

- `G3-A` 완료: 기존 역할 전환형 반응형 모바일 웹 안에서 `운행 / 안전지원 / 내 정보` 3탭을 유지하고 Field-first 시각 계층을 적용했다.
- 운행 첫 화면은 Safe-until, 다음 배송, 합성 현재 위치, 강수·경사 맥락, 휴식 지점과 구조화 경로, 큰 `안전지원 검토` 행동 순서로 재배치했다.
- 안전지원은 조정 전후, 내 작업 변화, 현재 계획 불변 안내와 동의·수정·거절을 상세 설명보다 먼저 표시한다. 내 정보에는 공유·비공유·기사 권리를 시각 요약한다.
- 390×844·360×800에서 현재 위치 맥락과 주요 행동이 하단 탭 위 첫 화면에 들어오고, 주요 행동 48px·나머지 터치 대상 44px를 유지한다.
- 외부 이미지·아이콘·지도 SDK·비국내 AI 생성 에셋은 추가하지 않았다. 기능 목적의 CSS schematic route와 한국어 구조화 목록으로 같은 과업을 완료한다.
- `G3-B` 완료: manifest·192/512 아이콘·install prompt 상태·버전된 정적 app shell service worker를 구현했다. 마지막 `APPROVED + APPLIED` 합성 계획은 식별자·버전·남은 건수만 30분 TTL로 저장하며 오프라인에서 읽기 전용으로 제공한다.
- 실제 offline reload에서 app shell과 마지막 승인 계획을 표시하고, 만료·빈·손상 캐시는 최신 계획으로 사용하지 않는다. 오프라인 동의·수정·거절·승인·적용은 성공으로 기록하지 않는다.
- 기사 지도 표시 어댑터 완료: 온라인 공개 Demo는 같은 decision의 합성 현재 위치·휴식 지점·다음 배송지를 Kakao 2D compact map으로 표시한다. 오프라인·SDK 오류·키 미설정에서는 기존 schematic과 구조화 경로 목록으로 복귀하며 실제 GPS·위치 권한·주소·길찾기는 사용하지 않는다.
- 실제 위치 권한·푸시·독립 인증·서버 동기화는 G3-B 범위 밖이며 별도 사용자 승인 Gate를 유지한다.

작업:

- `운행 / 안전지원 / 내 정보` 3탭 유지
- 현재 위치·다음 배송지·휴식 지점 지도 작업면
- Safe-until·배송 진행·적용 계획의 시각 계층 개선
- 날씨·노면·휴식·경로변경을 설명하는 라이선스 확인 시각 자산
- manifest·install prompt·service worker 도입 여부를 승인 범위에 맞게 구현
- 위치 권한 거절·stale·오프라인·캐시 만료 화면

종료조건:

- 390×844·360×800에서 첫 화면에 현재 위치 맥락과 주요 행동 표시
- 주요 행동 최소 48px, 나머지 터치 대상 최소 44px
- 이미지가 실패해도 대체 텍스트와 구조화 경로로 과업 완료
- 운전 중 긴 입력·복잡한 다기사 지도 차단
- 캐시가 만료된 계획을 최신 계획처럼 표시한 건수 0건

### G4 — Demo 실시간 이동과 부하 검증

실행 상태:

- `G4-A` 완료: 24명 합성 fixture에서 5초 간격·30초 horizon·7개 frame의 결정론적 위치 event timeline을 생성한다.
- 현재 관측 기사만 새 Demo event에 따라 이동하고 stale 3명은 고정, offline 3명은 좌표 없이 유지한다. 북부권역 합성 기사 1명은 두 frame 연결 끊김 후 새 관측으로 복구한다.
- 관리자는 재생·일시정지·다음 5초·처음으로를 사용할 수 있고 화면은 `Demo movement`와 `Live 0명`을 고정 표시한다.
- 동일 입력 SHA-256, cadence·Demo/Live 혼합 거부, stale/offline 정지, 연결 복구와 기존 지도·폐루프 E2E를 검증한다.
- `G4-B` 완료: 24·96·240명 합성 fixture를 전국 집계와 권역 viewport에서 검증했다. 전국은 개별 기사 0명, 최대 부하는 권역 80명이며 권역 경로는 24개까지만 동시에 렌더링하고 기사 선택 시 해당 상세 경로를 제공한다.
- 승인 예산은 5초 이상 위치 갱신, 첫 지도 준비 5,000ms, 권역 drill-down·frame 갱신 각 1,000ms, pan 500ms, requestAnimationFrame gap P95 100ms·최대 250ms다. Windows 로컬 headless Chromium 1440×900 Fallback 2D에서 세 profile이 모두 통과했다.
- 이 결과는 합성 Fallback 2D 기준선이다. Kakao SDK의 네트워크·타일·쿼터 지연, 실제 발표 PC·배터리·현장망과 240명 초과 규모는 통과로 주장하지 않는다.

작업:

- seed가 고정된 합성 위치 event timeline
- 최신 위치 보간, stale 정지, 연결 끊김과 복구
- viewport 기반 로딩, 군집과 선택 경로 단순화
- Demo movement·Live·Fallback 상태를 명확히 분리

종료조건:

- 동일 seed·기준시각에서 위치 event hash 재현
- 수신하지 않은 경로를 Live처럼 보간한 건수 0건
- stale 이후 움직이는 마커 0건
- 합의된 기사 수·갱신주기·프레임·상호작용 지연 예산 통과

### G5 — 조건부 2.5D·3D

작업:

- 지형·도심 구조·겹친 경로를 설명하는 승인된 장면만 3D 제공
- 기본 2D, 한 번에 2D 복귀, reduced-motion과 저사양 fallback
- 자동 회전·카메라 비행·장식용 3D 차트 차단

종료조건:

- 3D가 없는 환경에서도 모든 핵심 과업 완료
- 2D와 3D에서 decision·경로·수치 일치
- 원근으로 거리·위험·추천 의미를 오인하는 사용자 평가 실패 0건

### G6 — Live 파일럿 준비

실제 기사 위치나 TMS 연결은 다음을 모두 통과한 뒤에만 시작한다.

- 법률·노무·개인정보·보안 검토
- 기사 고지·권리·정정·철회 절차
- 역할별 권한과 별도 인증 세션
- 수집주기·정밀도·보존기간·삭제·내보내기 승인
- 지도·위치·TMS 공급자 처리조건과 장애 계약
- 파일럿 중단·삭제·침해대응 계획

환경변수나 UI 토글만으로 이 Gate를 해제하지 않는다.

## 5. 제안 데이터 계약

아래 계약은 `contracts-v1.0.0`을 바꾸기 전 검토할 초안이다. 구현 코드는 승인된 Zod 스키마에서 타입을 추론해야 한다.

```ts
type RegionId = string;
type HubId = string;
type PositionEventId = string;

type PositionObservation = {
  positionEventId: PositionEventId;
  courierId: CourierId;
  regionId: RegionId;
  hubId: HubId;
  planId: PlanId;
  capturedAt: IsoDateTime;
  receivedAt: IsoDateTime;
  point: GeoPoint;
  accuracyMeters: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
  sourceMode: "LIVE" | "DEMO";
  provenance: Provenance[];
};

type PositionAvailability =
  | { status: "CURRENT"; observation: PositionObservation }
  | { status: "STALE"; lastObservation: PositionObservation; staleSince: IsoDateTime }
  | { status: "OFFLINE"; lastApprovedPlanId: PlanId; disconnectedAt: IsoDateTime }
  | { status: "PERMISSION_DENIED"; lastApprovedPlanId: PlanId }
  | { status: "UNAVAILABLE"; reason: "NOT_COLLECTED" | "INVALID" | "PROVIDER_ERROR" };

type MapSelection = {
  regionId?: RegionId;
  hubId?: HubId;
  courierId?: CourierId;
  planId?: PlanId;
  decisionId?: DecisionId;
};
```

검증 초안:

- ID는 개인 이름·전화번호·차량번호·주소를 포함하지 않는 불투명 문자열이다.
- `receivedAt >= capturedAt`이며 허용 가능한 전송 지연은 공급자 계약에서 확정한다.
- `accuracyMeters`는 양의 유한수다. 승인된 상한을 넘으면 `CURRENT`가 될 수 없다.
- 방향은 `0 <= headingDegrees < 360`, 속도는 0 이상의 유한수다.
- `DEMO`와 `LIVE` event를 같은 이동 stream으로 결합하지 않는다.
- `planId`가 현재 활성 계획과 다르면 지도에 과거 현재위치처럼 표시하지 않는다.
- `STALE`, `OFFLINE`, `PERMISSION_DENIED`에서는 움직이는 마커를 제공하지 않는다.
- 정확 좌표는 AI 프롬프트, 일반 로그, 스크린샷과 장기 감사기록에 포함하지 않는다.

## 6. 개인정보·권한 초안

| 데이터 | 기사 본인 | 허브 관리자 | 중앙 관리자 | 일반 로그 | 장기 보존 |
|---|---:|---:|---:|---:|---:|
| 본인 현재 위치 | 허용 | 현재 지원에 필요할 때만 | 집계 우선 | 금지 | 금지 |
| 다른 기사 정밀 위치 | 금지 | 기본 금지 | 금지 | 금지 | 금지 |
| 지역·허브 집계 | 허용 | 허용 | 허용 | 비식별 집계만 | 정책 승인 시 |
| 현재·대안 경로 | 본인 계획만 | 해당 decision 범위 | 해당 운영 범위 | ID·상태만 | 결정 스냅샷은 좌표 최소화 |
| 장기 개인 이동궤적 | 금지 | 금지 | 금지 | 금지 | 금지 |
| Near-miss | 본인 신고 상태 | 최소 집계만 | 최소 집계만 | 신고자·좌표 금지 | coarse aggregate만 |

정확 위치의 메모리 보존시간, 관리자에게 필요한 지도 정밀도와 최소 군집 인원은 아직 승인하지 않는다. 이 세 값은 실제 지도 공급자와 파일럿 운영 범위를 확인한 뒤 별도 ADR로 확정한다.

## 7. 지도·PWA 아키텍처 경계

### 7.1 지도 공급자 독립 인터페이스

```ts
type MapAdapter = {
  renderRegions(input: RegionMapModel): void;
  renderCouriers(input: CourierMapModel): void;
  renderDecision(input: DecisionMapModel): void;
  setSelection(selection: MapSelection): void;
  setDataMode(mode: "DEMO" | "LIVE" | "FALLBACK"): void;
  resetCamera(scope: "NATIONAL" | "REGION" | "DECISION"): void;
  destroy(): void;
};
```

UI는 공급자 객체나 원시 API 응답을 직접 읽지 않는다. 어댑터는 입력 검증, 출처·최신성, 좌표 최소화, 오류 상태와 정리를 소유하고 도메인 계산에는 관여하지 않는다.

### 7.2 PWA 경계

- service worker는 Safety 계산 결과를 새로 만들거나 변경하지 않는다.
- 오프라인에서는 마지막 `APPROVED + APPLIED` 계획만 읽기 전용으로 제공한다.
- 동의·승인·계획 적용 명령은 서버·연결 계약 없이 오프라인 성공으로 기록하지 않는다.
- 캐시 키에는 실제 이름·전화번호·전체 주소를 넣지 않는다.
- 앱 제거·로그아웃·세션 만료 시 승인된 정책에 따라 캐시를 삭제한다.
- 위치·알림 권한은 각각 설명하고 묶음 동의를 사용하지 않는다.

## 8. 평가 초안

### 8.1 계약

- 유효 위치·지역·허브 fixture 100% parse
- 범위 밖 좌표·음수 정확도·미래 capturedAt·끊어진 참조 100% reject
- Demo·Live 혼합 stream 100% reject
- stale·offline에서 이동 명령 100% reject
- 비밀정보·정밀 위치가 로그·AI 입력·일반 감사 산출물에 남은 건수 0

### 8.2 지도 UX

- 지도와 지원 큐의 `decisionId` 불일치 0
- 전국 → 지역 → 기사 drill-down과 breadcrumb 복귀 E2E
- 저배율 개별 기사 ID·정밀 위치 노출 0
- map error·position denied·stale·offline·fallback 전 상태 E2E
- 키보드로 지역·지원상황·decision 선택과 2D 복귀 가능

### 8.3 PWA

- 390×844·360×800, 200% zoom과 긴 한국어
- install 가능/불가능 상태를 실제 manifest·service worker 상태와 일치
- offline에서 마지막 승인 계획과 저장시각 표시
- 오래된 캐시로 동의·승인·적용 성공을 표시한 건수 0
- 이미지·지도 로드 실패에도 핵심 과업 완료

### 8.4 성능

Fallback 2D의 성능 수치는 G4-B에서 고정했다. 실제 지도 SDK의 네트워크·타일·쿼터 지연은 별도 공급자 평가 전까지 이 수치에 포함하지 않는다. 최소 측정 항목은 다음과 같다.

- 총 기사·활성 기사·화면 내 feature 수
- 위치 event 갱신주기와 지연
- 첫 지도 표시시간과 상호작용 가능시간
- pan·zoom·군집 전환·선택 반응시간
- 2D·3D 프레임 안정성, 메모리와 배터리
- 저사양·reduced-motion·오프라인 fallback

## 9. 데이터·AI 활용 경계

- 지도와 위치 표시는 학습된 모델이 아니라 계약 검증·집계·렌더링 코드로 구현한다.
- 다기사 위치·경로 fixture는 우선 결정론적으로 생성하며 실제 기사 궤적을 학습자료로 사용하지 않는다.
- 공공 데이터는 이용조건·갱신주기·공간 정밀도와 provenance를 확인한 뒤 지역·날씨·도로 레이어 후보로만 사용한다.
- A.X·K-EXAONE·Upstage는 승인된 설명·문서 과업 경계를 유지하며 위치·경로·Safety 수치를 결정하지 않는다.
- 이미지·3D 에셋에 국내 AI를 사용하려면 구체적 제품 API, 입력 보존정책, 라이선스와 평가 계약을 먼저 승인한다.
- 외국 AI 서비스에서 생성한 자산을 국내 AI 활용 성과로 주장하지 않는다.

## 10. 구현 순서와 승인 지점

| 순서 | 작업 | 사용자 승인 필요 |
|---:|---|---|
| 1 | 이 계획과 제안 계약 검토 | 필요 |
| 2 | 관련 다섯 문서의 Proposed 변경 작성 | 계획 승인 후 진행 |
| 3 | 지도 공급자·PWA 범위 후보 비교 | 후보와 비용·라이선스 확인 후 필요 |
| 4 | G1 다지역 합성 fixture 구현 | 계약 승인 후 진행 |
| 5 | G2 공급자 독립 2D 지도 구현 | 의존성 추가 전 필요 |
| 6 | G3 기사 PWA 구현 | G3-B app shell·Demo 캐시 완료; 실제 권한·인증은 후속 승인 |
| 7 | G4 Demo 이동·부하 검증 | G4-A·G4-B 완료; 공급자별 성능은 별도 |
| 8 | G5 조건부 3D | 2D 수용기준 통과 후 별도 필요 |
| 9 | G6 Live 파일럿 | 법률·노무·보안 검토 없이는 금지 |

## 11. 수용기준

- 현재 검증된 P0 폐루프와 공개 Demo의 의미를 바꾸지 않는다.
- 최종 디자인의 모든 화면 요소가 데이터 계약·출처·최신성 상태에 연결된다.
- 실제 위치 없이 Live 이동을 표현하지 않는다.
- 지도·PWA 실패 시 마지막 승인 계획과 명시적 fallback으로 복구한다.
- 관리자 화면이 기사 순위·성과평가·장기 감시로 변하지 않는다.
- 기사에게 위치 권한 거절, 수정·거절과 이의제기 권리를 제공한다.
- 실제 데이터 도입 전 파일럿 잠금을 해제하지 않는다.

## 12. 비목표

- 현재 단계에서 실제 기사 위치 수집
- 독자 지도·내비게이션 엔진 개발
- 대규모 TMS·WMS·실시간 메시지 인프라 구축
- 기사 개인별 장기 궤적 학습
- 지도 위치로 기사 성과·속도·순위 평가
- 2D 폐루프 이전의 장식용 3D 구현
- 지도·위치 데이터를 국내 AI 모델의 학습 성과로 포장

## 13. 미결사항

- Kakao Maps 공개 Demo 도메인·쿼터·정책의 지속 운영 점검과 향후 3D 필요성
- 설치형 PWA의 실제 인증 방식, 서버 동기화와 푸시 알림 범위
- 위치 정확도 상한, 최신성 한도와 갱신주기
- 정확 위치의 메모리 보존시간과 삭제 검증 방식
- 저배율 군집의 최소 기사 수와 지도 정밀도
- 240명 초과 성능 fixture와 실제 발표·현장 목표 기기
- G5에서 3D가 실제로 필요한 대표 장면
- 시각 자산 제작 도구와 국내 AI 트랙 귀속
- Live 파일럿의 법률·노무·보안 승인 주체
