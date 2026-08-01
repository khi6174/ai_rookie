# SafeRoute AI MVP 아키텍처

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-27
- 대상: 2026-08-14 본선 중간 결과물과 이후 1차 결선 데모

## 1. 목적

이 문서는 SafeRoute AI의 Approved 제품·데이터·안전·개입·AI 정책을 구현 가능한 모듈과 데이터 흐름으로 연결한다. 목표는 2인 팀이 단일 폐루프를 재현 가능하게 완성하는 것이며, 대규모 운영 인프라를 미리 설계하는 것이 아니다.

## 2. 아키텍처 원칙

1. 안전 계산과 실행 가능성은 순수한 결정론적 코드가 소유한다.
2. 안전 하드 제약을 통과한 후보만 운영 우선순위 비교 대상이 된다.
3. 기사·관리자·고객 설명은 동일한 불변 결정 스냅샷에서 파생한다.
4. 모든 외부·사용자 입력은 경계에서 검증하고 출처와 상태를 보존한다.
5. Live 실패를 숨기지 않고 명시적인 Mock·Error·Fallback으로 전환한다.
6. 실제 TMS가 없는 MVP에서는 계획 적용을 원자적 데모 스냅샷 교체로 모사한다.
7. 합성·시뮬레이션·데모 결과를 실제 안전효과로 표현하지 않는다.

## 3. 시스템 컨텍스트

```text
공개·합성 입력 ─┐
기사 응답 ──────┼─> 데이터 경계와 Zod 검증
날씨·지도 어댑터 ┘          │
                             v
                 Safety Budget / DSE 엔진
                             │
                             v
                    개입 후보·제약 엔진
                             │
                 ┌───────────┴───────────┐
                 v                       v
          기사 검토·동의             관리자 비교·승인
                 └───────────┬───────────┘
                             v
                 계획 재검증·원자적 적용
                             │
                 ┌───────────┴───────────┐
                 v                       v
          고객안내·Upstage 설명        감사·평가 기록
```

## 4. 배포 단위와 기술 스택

### 4.1 단일 애플리케이션

- UI: React, TypeScript, Vite, CSS custom properties
- 계약 검증: Zod
- 서버 경계: Node 전용 평가·Live smoke 어댑터, 본선 P0 배포 서버 없음
- 단위·계약 테스트: Vitest
- E2E·반응형 검증: Playwright
- MVP 저장: 버전된 JSON fixtures와 실행 중 불변 스냅샷

관리자와 기사 화면은 같은 애플리케이션의 역할 전환형 화면으로 구현한다. G3-B부터 기사 화면은 설치 가능한 PWA app shell을 제공하지만 독립 인증 세션·Live 위치·푸시 알림은 포함하지 않는다. 별도 마이크로서비스, 메시지 브로커, 실시간 데이터베이스는 P0에 도입하지 않는다. 외부 AI·날씨 Live 실행은 브라우저 번들에 포함하지 않고 명시적인 Node smoke 명령에서만 수행한다.

이 문장은 현재 P0 공개 Demo의 배포 경계다. ADR-035의 최종 목표는 아래 단계로 확장한다. G2-A에서는 같은 단일 애플리케이션 안에 공급자 독립 `MapAdapter`, 결정론적 다지역 위치와 기능 목적의 SVG 2D 지도를 추가했다. ADR-043에서는 이 projection 위에 선택적인 Kakao Maps 2D 베이스 레이어를 추가했고 ADR-044에서는 같은 합성 decision route를 기사 compact map에도 표시한다. ADR-045의 G4-A는 고정된 합성 위치 event만 단기 재생하며 실제 위치 stream과 인증 세션은 도입하지 않는다. G3-B에서는 정적 app shell service worker와 최소 승인 Demo 계획 캐시만 추가했다.

### 4.2 공간운영 확장 계층

```text
결정론적 다지역 fixture
→ 위치·지역·허브 Zod 계약
→ 지도 projection·집계
→ MapAdapter
→ 관리자 2D 지도 / 기사 compact map
→ schematic fallback·목록 대안
```

지도 projection은 Domain의 Safety 계산 결과와 식별자를 읽기 전용으로 조합한다. 위치·지도 상태가 Safety Budget, 후보 실행 가능성, 추천 순위와 동의·승인 상태를 변경할 수 없다.

G2-A의 `src/adapters/maps`는 `national`, `region`, `decision` 세 가시 범위를 강제한다. 전국 범위는 지역 집계만 반환하고, 지역 범위는 선택 지역의 허브·기사·경로만, decision 범위는 동일 `decisionId`의 기사·경로만 반환한다. React UI는 이 projection만 렌더링하므로 원본 fixture를 직접 순회해 저배율 개인정보 경계를 우회하지 않는다.

G2-B의 지도 오류 Fallback도 별도 데이터를 만들거나 Safety 결과를 재계산하지 않는다. 정상 SVG 지도와 구조화 목록은 동일 `MapRenderModel`을 읽으며, 지도 가용성은 UI 표시 상태에만 영향을 준다. 오류 중에도 breadcrumb, 지역·기사·decision 선택과 배송순서 목록, 지원 큐 링크를 사용할 수 있고 복구 후 같은 selection을 유지한다.

ADR-043의 `src/adapters/maps/kakao.ts`는 공식 HTTPS SDK 로딩과 provider 객체의 생명주기만 소유한다. React 지도 계층은 `MapRenderModel.geographicPoint(s)`를 Kakao `Polyline`과 `CustomOverlay`로 변환하고 SDK 원시 데이터나 주소·경로 API 응답을 읽지 않는다. 키가 없거나 `VITE_KAKAO_MAP_ENABLED=false`이면 공급자 독립 schematic 지도를 사용한다. SDK 로드·도메인 인증·네트워크가 실패하면 `ERROR` 상태를 표시하고 같은 schematic 지도와 구조화 목록으로 자동 복귀한다. 지도 공급자 상태는 Safety·개입·결정 상태기계 입력이 아니다.

ADR-044의 `createRiderCompactMapModel`은 같은 `decisionId`의 `MapRenderModel`에서 현재 위치, 휴식 지점, 다음 배송지와 경로만 축소해 기사 프레젠테이션 모델로 만든다. 기사 Kakao 계층은 온라인에서만 이 모델을 렌더링하며 오프라인·SDK 오류·키 미설정 시 기존 CSS schematic과 항상 남아 있는 구조화 목록을 사용한다. ADR-063의 같은-origin `/api/kakao-directions`는 브라우저 좌표를 받지 않고 서버에 고정된 합성 세 지점만 Kakao Mobility Directions에 전달해 정규화된 경로선·거리·시간을 반환한다. 브라우저 Geolocation API, 실제 주소와 위치 저장은 호출하지 않는다.

아틀란 트럭은 이 프레젠테이션 계층의 현장형 지도·경로 UX만 참고한다. 현재 런타임은 합성 위치의 자동차 경로 미리보기와 외부 Kakao Map Demo 길찾기만 제공하며, 화물차 높이·중량·통행제한, 실제 GPS·주소, 오더 배차와 내장 턴바이턴 안내는 입력하거나 제공하지 않는다. 향후 실제 TMS·지도 계약이 승인되면 해당 공급자 응답은 별도 경계 어댑터에서 도메인 계획·차량·경로 계약으로 검증한 뒤 읽기 전용 운행 맥락으로 전달하며, 공급자 추천이 Safety hard constraint를 우회할 수 없다.

KBS 모빌리티 AI 영상과 Riderlog 계열 공개 사례는 예방적 안전 신호의 문제·데이터 경계만 참고한다. 현재 런타임은 모션 센서, 사고 감지, 자동 구조 요청과 운전점수를 수집하거나 제공하지 않는다. 향후 선택형 운전행동 이벤트를 도입하려면 기사 동의, 목적·보존기간, 재확인 상태와 출처를 승인된 데이터 계약에 먼저 추가하고, 검증된 파생 신호만 Safety 입력 후보로 평가한다. 원시 센서와 개인 점수는 관리자 UI, 국내 AI 입력과 기사 평가에 전달하지 않는다.

ADR-045의 `MapMovementTimelineSchema`와 `createMapMovementTimeline`은 24명 합성 fixture를 5초 간격·30초 horizon의 7개 frame으로 변환한다. `applyMapMovementFrame`은 선택 frame의 위치 가용성만 기존 fixture에 적용하고 전체 `MultiRegionMapFixtureSchema`를 다시 검증한다. UI 재생기는 1초마다 다음 수신 frame을 보여주는 가속 Demo일 뿐 중간 위치를 추론하지 않는다. stale은 고정되고 offline은 좌표가 없으며 복구 frame에 새 `CURRENT` 관측이 있을 때만 마커가 다시 나타난다.

ADR-115의 단일 관제 화면은 위 평가 타임라인과 별도로, 20명 합성 기사마다 강남권 육지의 도로 위에 고정한 짧은 합성 경로를 둔다. 브라우저 현재 초를 입력으로 두 경로점 사이를 1초마다 왕복 보간하며, 임의 원형 오프셋은 사용하지 않는다. 이 좌표는 화면 표현 전용이며 위치 관측으로 저장하거나 도메인 입력으로 전달하지 않는다. Kakao 베이스 지도와 Fallback 지도는 같은 경로 진행률을 읽고 지도 가까이에 `위치 시뮬레이션`을 표시한다. 브라우저 Geolocation, 실제 GPS, TMS와 서버 위치 스트림은 계속 호출하지 않는다.

ADR-046의 G4-B 부하 계층은 같은 생성기를 허브당 4·16·40명으로 확장해 총 24·96·240명 profile을 만든다. `MapAdapter`는 전국에서 개별 기사·경로를 반환하지 않고, 권역에서 최대 80명과 최대 24개 경로만 렌더 모델에 포함한다. 선택된 decision scope는 제한과 무관하게 해당 기사 경로 1개를 반환한다. 브라우저 성능 증거는 외부 네트워크를 끈 Fallback 2D에서 생성하며 Kakao 공급자 지연이나 실제 장치 성능으로 일반화하지 않는다.

ADR-047의 G5-A는 `DecisionSpatialSceneSchema`와 `createDecisionSpatialScene`을 지도 표시 어댑터에 추가한다. 활성 지원 decision의 기존 네 route point에만 결정론적 합성 거리·고도·경사를 결합하고 `validateSpatialSceneAgainstMapModel`이 decision·plan·route·좌표 순서의 exact equality를 확인한 경우에만 React SVG 2.5D 장면을 연다. 장면은 Safety·개입·결정 상태를 계산하지 않으며 새 지도 공급자·WebGL·DEM·건물 타일·런타임 의존성을 사용하지 않는다. 불일치·지도 오류에서는 UI mode를 2D로 되돌리고 같은 구조화 목록을 유지한다.

G3-A는 배포 단위나 런타임 능력을 바꾸지 않는 UI 계층 변경이다. 기사 모바일의 합성 위치·날씨·경로는 기존 Demo fixture와 Weather Fallback만 읽으며 브라우저 위치 API, service worker, 캐시, 설치 manifest, 실제 인증을 호출하지 않는다. 운행·안전지원·내 정보는 동일 `DemoSession`의 상태와 decision ID를 유지하므로 시각 순서 변경이 동의·승인 상태기계에 영향을 주지 않는다.

G3-B의 `public/sw.js`는 같은 origin의 정적 app shell만 버전된 Cache Storage에 저장한다. `src/pwa/approvedPlanCache.ts`는 `APPROVED + APPLIED`된 합성 계획의 decision·plan 버전과 기사별 남은 건수만 localStorage에 30분 TTL로 저장한다. 캐시는 Safety 계산·추천·동의·승인 상태를 만들거나 변경할 수 없고 오프라인에서는 모든 응답 행동을 비활성화한다. 만료·손상·저장소 차단은 각각 명시적 상태로 전환하며 최신 계획으로 승격하지 않는다.

### 4.2 권장 디렉터리

```text
src/
  domain/
    contracts/          # Zod와 TypeScript 도메인 계약
    safety/             # Safety Budget, 기여도, 신뢰도, Time-to-Breach
    interventions/      # 후보 생성, 하드 제약, 추천 순위
    decisions/          # 상태 전이와 불변 결정 스냅샷
  application/
    evaluate-plan/      # 기준 계획 평가 유스케이스
    compare-actions/    # 개입 비교 유스케이스
    consent/            # 기사·수신 기사 응답
    approval/           # 관리자 승인과 재검증
    apply-plan/         # 원자적 계획 적용과 롤백
    notices/            # 고객안내 요청
  adapters/
    fixtures/           # 대표 시나리오와 변형
    weather/            # Live·Mock·Error·Fallback 어댑터
    maps/               # 다지역 projection, Demo 경로와 향후 지도 공급자 경계
    positions/          # Demo·Live 위치 관측과 최신성 판별 경계
    upstage/            # Parse·Extract·Solar 어댑터
    domestic-ai/        # A.X·K-EXAONE 공통 텍스트 평가와 향후 승인된 에셋 도구 경계
    audit/              # 감사 이벤트 저장 경계
  ui/
    admin/              # Control Tower와 승인 흐름
    courier/            # 설치 가능한 기사 PWA UI와 향후 Near-miss
    shared/             # 동일 수치·상태 표현 컴포넌트
  demo/
    controller/         # 단계 전환, reset, fallback
    fixtures/           # 고정 데모 manifest
  pwa/                  # service worker 등록, 설치 상태와 최소 승인 Demo 계획 캐시
server/                 # Sites Worker 서버 전용 런타임
  operations-session-store.mjs  # D1 세션 저장·복구·낙관적 동시성
  upstage-explanation-proxy.mjs # strict 합성 결정 설명 프록시
tests/
  fixtures/
  contract/
  e2e/
```

실제 구현 시 파일 수를 불필요하게 늘리지 않고 한 책임이 커질 때만 분리한다.

## 5. 계층별 책임

### 5.1 Domain

- 브라우저, React, 네트워크와 저장소에 의존하지 않는다.
- 같은 입력·설정 버전·기준시각에서 같은 결과를 반환한다.
- 외부에서 검증된 도메인 객체만 받는다.
- Safety Budget, 개입 효과와 추천에 LLM 결과를 입력으로 사용하지 않는다.

### 5.2 Application

- 도메인 함수를 폐루프 상태 전이에 맞게 조합한다.
- 결정 ID와 입력·출력·버전을 하나의 스냅샷으로 묶는다.
- 기사 동의와 관리자 승인을 검증하고 적용 직전 최신 입력으로 재검증한다.
- 실패를 성공 상태로 바꾸지 않으며 마지막 확정 계획을 유지한다.

### 5.3 Adapters

- 외부 응답을 원본 상태 그대로 도메인에 전달하지 않는다.
- Zod 검증, 시간대 정규화, 출처·최신성·결측 메타데이터를 추가한다.
- Live·Mock·Loading·Error·Fallback을 판별 합집합으로 반환한다.
- API 키, 원시 생체값, 정밀 위치와 불필요한 개인정보를 로그에 남기지 않는다.

기상청 DS-001 어댑터는 API허브 4.1 초단기실황과 4.2 초단기예보를 별도 endpoint·스키마로 검증한다. 실황은 현재 기온·강수·습도·풍속·강수형태 후보, 예보는 발표시각부터 최대 6시간의 시간순 기온·강수·습도·풍속·강수형태·하늘·낙뢰 후보로 정규화한다. 원본 hash와 공식 URI·버전·이용정책을 provenance에 기록하지만, `WeatherState` 필수 필드가 모두 충족되지 않아 `safeForSafetyEngine=false`로 격리한다. 이 후보는 추가 출처와 승인된 매핑 없이 Domain 계층으로 전달할 수 없다. 계약용 가짜 응답은 별도의 Demo `MOCK` provenance를 사용한다.

`KMA candidate → coverage Gate → WeatherState` 경계는 강수 정확값·구간값, 체감온도, 시정, 시간당 적설과 노면 상태를 각각 판정한다. 강수 구간은 모델 포화 상한을 이용한 보수적 경계만 허용하고 가정을 기록한다. 체감온도·시정·시간당 적설이 없으면 Gate가 `BLOCKED`를 반환하며, UI와 Safety 엔진은 기존 Demo/Fallback 상태를 유지한다.

DS-005의 1.3 어댑터는 exact endpoint에서 공개 대표점의 현재 `ta_chi`와 `vs`를 읽고 `vs`만 km에서 m로 변환한다. `sd_3hr`는 3시간 신적설 후보로 별도 보존하며 시간당 값으로 나누지 않는다. DS-006의 4.3 어댑터는 최신 공개 발표시각을 선택하고 현재부터 120분 범위의 `SNO·TMP·REH·WSD`를 추출한다. 적설 구간은 중간값 대신 모델 3cm/h 포화 상한에 대한 보수적 경계로 선택하고, 체감온도는 기상청 공식 계절별 식과 적용조건으로만 산출한다. 4.3 최신성은 3시간 발표주기와 제공지연을 반영한 210분으로 별도 검증한다. 이 보완 계층도 미래 시정과 현재 시간당 적설이 없으므로 `safeForSafetyEngine=false`를 유지한다. 원문·인증키·대표점 위경도는 산출물에 저장하지 않는다.

DS-003의 `src/adapters/traffic/taas.ts`는 한국도로교통공단 TAAS의 화물차 다발지역과 지자체 대상 교통사고 통계를 별도 REST JSON endpoint와 API별 승인 권한으로 검증한다. 포털에서 두 API를 한 인증키에 등록한 경우 `TAAS_API_KEY`를 공유하고, 별도 키가 발급된 경우 API별 환경변수로 덮어쓴다. 화물차 응답은 공개 중심점과 발생·사상자 집계만 정규화하고 polygon 원문을 산출물에 보존하지 않는다. 지자체 통계는 연도·지역이 일치하는 사고유형별 사고·사망·부상·치명률만 허용한다. `NODATA_ERROR`는 실패나 0위험이 아니라 검증된 `NO_DATA` 상태다. 두 후보는 `PUBLIC_DATA_DERIVED` provenance와 원문 SHA-256을 가지지만 개인 기사 위험 라벨이 아니며 Domain Safety 계산에 전달되지 않는다.

Runtime 선택기는 `safeForSafetyEngine=false`인 KMA evidence와 Demo fixture를 받으면 일부 필드를 섞지 않고 Demo `WeatherState[]` 전체를 `FALLBACK`으로 선택한다. Live evidence는 출처·해시·준비/차단 필드만 별도 보존하고 Safety 엔진에는 전달하지 않는다. 이 선택 결과는 관리자·기사 공통 배지와 감사 패널에 노출되며, 계산 모드는 계속 Demo다.

### 5.4 UI

- 도메인 계산을 다시 구현하지 않는다.
- 관리자와 기사가 동일한 결정 스냅샷을 조회한다.
- 화면은 상태 전이 명령만 요청하고 승인·동의 조건을 우회하지 않는다.
- 색상 외 텍스트·아이콘·수치범위로 상태를 표현한다.

## 6. 핵심 도메인 파이프라인

### 6.1 입력 정규화

1. 원본 데이터와 `Provenance`를 수집한다.
2. Zod 계약으로 타입·범위·시간·참조 무결성을 검증한다.
3. 결측·최신성·출처 상태를 계산한다.
4. 위험 관련 결측은 낙관적 최솟값으로 대체하지 않는다.
5. 검증 실패는 입력 오류 상태로 반환하고 마지막 결과를 현재 Live 결과처럼 재사용하지 않는다.

### 6.2 Safety Budget 평가

1. 현재 Budget과 향후 최대 120분 타임라인을 계산한다.
2. Driver·Task·Route·Weather·Interaction 노출과 유효 Recovery를 분리한다.
3. 반올림 전 값으로 밴드와 첫 초과 시각·배송지를 판정한다.
4. 정렬된 기여도, 신뢰도, 결측과 모델·설정 버전을 반환한다.

### 6.3 개입 비교

1. 휴식, 물량이관, 순서변경, 안전경로, Safe Delay와 호환 묶음을 생성한다.
2. 각 후보의 전체 계획을 다시 평가한다.
3. 안전·용량·시간창·호환성·동의 하드 제약을 검사한다.
4. 불가능 후보에 안정적인 reason code와 사용자 설명을 붙인다.
5. 실행 가능 집합 안에서만 추천 점수를 계산한다.

### 6.4 동의·승인·적용

```text
BASELINE_EVALUATED
→ CANDIDATES_GENERATED
→ CANDIDATES_EVALUATED
→ RIDER_REVIEW_REQUIRED
→ RIDER_CONSENTED
→ ADMIN_APPROVAL_REQUIRED
→ APPROVED
→ REVALIDATING
→ APPLYING_PLAN
→ APPLIED
→ NOTICE_RECORDED
→ CLOSED
```

수정·거절·만료·보류·재검증 요구·적용 실패는 `docs/intervention-policy.md`의 분기 상태를 따른다. UI가 다음 화면으로 이동했다는 이유로 상태를 건너뛰지 않는다.

## 7. 결정 스냅샷과 감사 이벤트

### 7.1 불변 스냅샷

한 결정 ID는 최소 다음을 묶는다.

- 입력 데이터와 provenance 요약
- 모델·설정·계약 버전
- 기준 계획 평가
- 생성된 모든 후보와 불가능 사유
- 기사·수신 기사 응답과 시각
- 관리자 결정과 시각
- 적용 전 재검증 결과
- 적용된 계획과 ETA
- 고객안내와 Upstage 출력 검증 결과
- 전후 지표와 실패·fallback 이벤트

### 7.2 MVP 원자적 적용

`applyPlan`은 승인된 스냅샷 버전과 현재 계획 버전이 일치할 때만 실행한다. 경로·배송순서·기사별 작업목록·ETA를 새 계획 객체로 완성한 뒤 한 번에 활성 계획 참조를 교체한다. 중간 실패 시 기존 활성 계획을 유지하고 `APPLY_FAILED`를 기록한다.

운영 서비스의 경로 비교 프레젠테이션은 별도 계획을 계산하지 않는다. 기준선은 `DailyOperationsSnapshot.fixture`, 적용 결과는 `OperationsDecisionWorkspace.store.activePlan`에서 읽고, 동일 기사 workload의 `remainingStopIds`, `projectedEndAt`, `planVersion`을 그대로 비교한다. 합성 지도 좌표는 원본 stop ID에 결정론적으로 결속해 순서변경·이관 후에도 같은 배송지가 같은 위치를 유지한다. `planVersion`이 같으면 적용 전 상태, 다르면 승인 적용 상태로 표시한다.

## 8. 국내 AI 트랙 아키텍처

### 8.1 오프라인 합성데이터 계층

| 모델 | 기본 역할 | 입력 | 출력 | 채택 통제 |
|---|---|---|---|---|
| SKT A.X | 공통 텍스트 평가 후 구조화 운영 시나리오 후보 | seed specification·검증된 설명 입력 | strict JSON 후보 | Zod·불변조건·표시값 Gate |
| LG K-EXAONE | 공통 텍스트 평가 후 경계·반례·충돌 변형 | 동일 12과업·검증된 parent record | strict JSON·challenge mutation | 참조·시간·안전·표시값 Gate |
| NC VARCO | P0 관련 사용처 승인 후의 downstream 에셋 후보 | 승인된 텍스트·사실 hash | 3D·이미지/텍스처·음성/사운드 등 해당 제품 에셋 | 제품별 계약·Synthetic 라벨·사실 불변 Gate |
| Upstage | 문서 왕복 검증 | 합성 문서·스키마 | Parse·Extract 결과 | Zod·source citation 검증 |

생성 AI는 정답 Safety Budget, 추천 후보와 합격 라벨을 만들지 않는다. 결정론 엔진이 채택된 입력을 라벨링한다. 모든 산출물에는 모델, 프롬프트 버전, seed, parent ID, 검증 결과와 거절 사유를 기록한다. 대회 제공 가이드에서 동일한 OpenAI-compatible 텍스트 계약이 확인된 A.X K1과 K-EXAONE만 공통 12과업으로 비교하며, VARCO를 텍스트 LLM으로 추정하지 않는다.

### 8.2 제품 런타임 Upstage 계층

```text
합성 안전문서
→ Document Parse
→ 허용 필드 Information Extract
→ Zod 검증 + 출처 페이지/섹션 고정
→ 결정론적 결과 JSON과 결합
→ Solar 역할별 strict JSON 설명
→ 숫자 불변·인용·금지문구 검증
→ UI 또는 결정론적 템플릿 fallback
```

Solar 출력은 설명문만 제공하며 Safety Budget, 실행 가능성, 추천과 적용 상태를 변경할 권한이 없다.

현재 MVP 구현은 합성 안전문서 fixture, strict 설명 계약, Upstage Mock 어댑터와 timeout·malformed·무결성 실패용 결정론적 템플릿 Fallback을 포함한다. 서버 전용 Live 어댑터는 공식 HTTPS chat endpoint와 모델 식별자를 exact 계약으로 고정하고 API 키·timeout·크기 제한을 명시적으로 주입받으며 브라우저 실행을 차단한다. Upstage `solar-pro3` Live 12과업은 11건을 승인하고 malformed 1건을 Fallback으로 전환했다. 문서 왕복 기반은 합성 Markdown 60쌍의 strict 기대 규칙·원문 근거·비신뢰 지시·비저장 경계를 Mock 60/60으로 검증했다. 별도 `synthetic-operations-documents-v1.0.0`은 25개 구조화 상위 레코드에서 작업표·근무표·경로표·사고예방 보고서 100개를 생성하고 parent record 단위로 60/20/20 분할한다. 2026-07-27에는 이 중 고정 합성 상위 레코드 한 건을 4쪽 PDF로 렌더링해 Upstage Document Parse `200`, 필수 표식 14/14, Solar strict 추출 exact match와 비신뢰 지시 비수용을 실제 호출로 확인했다. 원문·공급자 원응답은 증거에 저장하지 않는다. K-EXAONE은 Live 12/12를 통과했다. A.X는 2026-07-21 공개 gateway의 401 안전 Fallback을 불변 보존한 뒤, 공급자 수정 후 2026-07-23 같은 exact 계약의 Live 12과업을 12/12·Fallback 0건으로 통과했다. 두 Hosted 모델은 설명 Gate 뒤의 선택적 근거 계층이며 P0 폐루프나 Safety 판정의 의존성이 아니다. Mock을 Live로 표시하지 않는다.

### 8.3 연구인프라 활용

- 국내 AI API: 동일한 10~20개 smoke 과업으로 구조 유효성, 제약 위반, 지연, 비용과 중복을 비교한다.
- A100: 로컬 오픈 웨이트 생성 기준선, 임베딩 기반 중복·커버리지 분석을 우선한다.
- 조건부 학습: 데이터량과 검증셋이 충분하고 기준선 대비 개선을 측정할 수 있을 때만 수행한다.
- 증빙: 실행 명령, 환경, 모델·프롬프트 버전, 사용량, 결과 CSV와 실패 로그를 보존한다.

## 9. 오류와 Fallback

| 실패 | 사용자 상태 | 도메인 행동 |
|---|---|---|
| 필수 입력 검증 실패 | `DATA_ERROR` | 계산 차단, 누락·오류 목록 제공 |
| 일부 결측 | 낮은 신뢰도와 결측 표시 | 보수적 대체와 가정 기록 또는 계산 차단 |
| 개입 생성 실패 | `OPTIONS_ERROR` | 기준 예측 유지, 계획 미변경 |
| 안전 후보 없음 | `NO_SAFE_OPTION` | Safe Delay·물량감축 요청, 강제 추천 금지 |
| Upstage 실패 | `FALLBACK` | 수치·추천 유지, 템플릿 설명 사용 |
| 계획 적용 실패 | `APPLY_FAILED` | 마지막 확정 계획 유지 |
| Live 데모 실패 | `DEMO_FALLBACK` | 고정 fixture로 전환하고 배지 유지 |

## 10. 보안·개인정보 경계

- 비밀정보는 서버 함수 환경변수에 두고 브라우저 번들·로그·fixture에 넣지 않는다.
- 관리자에게 원시 심박·수면·정밀 이동궤적을 제공하지 않는다.
- Near-miss는 거친 위치와 검증 상태만 관리자 화면에 제공한다.
- 자유문은 보존 전 개인정보 검사를 거치며 데모에는 합성 텍스트만 사용한다.
- Upstage 입력은 허용 목록 방식으로 구성하고 불필요한 식별자를 제거한다.

## 11. 테스트 경계

- Domain: 정확값, 경계, 단조성, 메타모픽, Risk Transfer Guard
- Contracts: 잘못된 범위·시간·참조·판별 상태 거절
- Application: 허용 상태 전이, 재동의, 승인 직전 재검증, 원자적 적용
- AI adapters: malformed·timeout·prompt injection·숫자 불변·인용 검증
- UI/E2E: 동일 결정 ID, 키보드, 모바일 터치, 오류·fallback·reset
- Geospatial: region·hub·courier·plan 참조, Demo/Live 분리, 집계 일치, stale 정지, 지도·큐 동일 decision
- PWA: manifest·app shell, 실제 offline reload, 승인 계획 TTL·만료·손상, 오프라인 명령 차단
- Demo: clean start에서 동일 시나리오 3회 연속 통과

구체적인 지표와 통과 기준은 `docs/evals.md`가 소유한다.

## 12. 구현 순서

1. 프로젝트 골격과 계약 스키마
2. 세 대표 fixtures와 manifest
3. Safety Budget·Time-to-Breach 엔진
4. 개입 엔진과 Risk Transfer Guard
5. 결정 상태기계와 원자적 적용
6. 관리자 폐루프
7. 기사 동의 폐루프
8. Upstage 문서·설명 계층
9. 평가 하네스와 국내 AI benchmark
10. 데모 모드·접근성·독립 검증
11. G0 위치·지도·PWA 계약 승인
12. G1 다지역 합성 fixture와 공급자 독립 projection
13. G2 2D 지도 → G3 기사 PWA → G4 Demo 이동 → 조건부 G5 3D
14. 합성 운영 패키지 검증과 불변 일일 스냅샷
15. 전체 기사 Safety 평가와 복수 지원 decision orchestration
16. 운영 상태 영속성·내보내기와 배포 복구

### 12.1 합성 운영 서비스 계층

`DailyOperationsDocumentBundle`은 UI 업로드 또는 번들 샘플에서 Ingestion 계층으로 들어온다. Ingestion은 네 종류 합성 원문의 SHA-256·상위 레코드·문서 종류·핵심 참조·PII와 strict 추출 레코드를 검증하고 원문을 저장하지 않은 채 `DailyOperationsPackage`로 정규화한다. Contracts 계층이 package schema·참조·시간·합계를 다시 검증하고, 통과한 패키지만 Domain `ScenarioFixture`로 투영한다. 원문 문서나 LLM 출력은 Domain 입력이 아니다.

`OperationsSnapshotService`는 package hash와 설정 버전을 포함한 불변 `DailyOperationsSnapshot`을 만든다. `FleetEvaluationService`는 스냅샷의 모든 활성 기사를 평가하고 임계치 초과가 예측되거나 승인된 지원 규칙에 해당하는 기사마다 별도 decision을 만든다. `DecisionWorkspaceService`는 열린 decision 간 수신 기사·계획·스냅샷 충돌을 확인한다.

초기 서비스 저장은 정규화 패키지·스냅샷·decision·감사 이벤트를 구조화 저장소에 보존한다. 합성 원문 업로드 바이트 저장은 별도 보존 승인이 있기 전까지 하지 않는다. 브라우저 저장소는 화면 선택과 임시 작성 상태만 소유하며 권위 있는 운영 상태가 될 수 없다.

관리자와 기사 UI는 이 Application 서비스의 projection만 읽는다. 기존 `DemoSession`은 회귀·복구 시나리오로 유지하지만 신규 운영 화면의 권위 소스가 아니다.

### 12.2 배포 런타임 경계

- `/api/operations/sessions/:workspaceId`: 합성 운영 세션 GET/PUT, D1 영속화, 2MB 제한, PII 패턴 거부, 낙관적 동시성 충돌 응답
- `/api/upstage-explanation`: 검증된 합성 결정 사실만 Upstage로 전달하고 공급자 원문 대신 strict JSON만 반환
- Upstage Document Parse·Extract Live 평가는 합성 PDF와 strict exact-match Gate로 분리한다. 승인되지 않은 유료 호출은 실행하지 않고 `CONFIGURED_NOT_RUN`으로 남기며, 원문과 raw 공급자 응답을 증거에 저장하지 않는다.
- `/api/kakao-directions`: 고정 Demo 또는 `deterministic-synthetic-operations`로 표시된 국내 범위 합성 좌표만 Kakao Mobility에 전달
- `/operations`: 관리자 전체 운영·지원 큐·승인·내보내기
- `/operations/rider`: 동일 decision의 별도 기사 응답 화면

배포 완료는 Worker 패키지 생성이나 D1 binding 선언만으로 판정하지 않는다. 공개 URL의 고정 합성 smoke workspace에서 저장·재조회·snapshot 복구·stale 쓰기 `409 SESSION_CONFLICT`가 확인되어야 한다.

## 13. 심사기준과 아키텍처 증거

| 기준 | 설계 대응 | 구현 후 필요한 증거 |
|---|---|---|
| 창의성 | Time-to-Breach·반사실적 개입·Two-Key Control | 한 결정 ID의 전체 폐루프 영상 |
| 혁신성 | 안전 하드 제약·Risk Transfer Guard·LLM 권한 분리 | 빠르지만 불안전한 후보 차단 테스트 |
| 추진성 | 단일 배포 단위·단계별 구현 순서 | 주차별 커밋, 빌드, 테스트 결과 |
| 성장성 | 어댑터 경계·모델 benchmark·versioned config | 국내 AI 비교 CSV와 향후 Live 교체 경로 |
| 실효성 | 원자적 계획 적용·동일 근거 UI | 기사 동의 후 경로·ETA 갱신 E2E |
| 가치성 | 비징벌성·형평성·개인정보 최소화 | 안전·지연·형평성·감사 지표 |

## 14. 수용기준

- 모든 핵심 수치와 추천은 Domain 계층에서만 생성된다.
- 기사와 관리자는 같은 결정 ID와 평가 스냅샷을 사용한다.
- 안전 하드 제약을 UI·관리자·LLM이 우회할 수 없다.
- 계획 적용은 전부 성공하거나 기존 계획을 유지한다.
- 외부 어댑터는 출처와 Live·Mock·Error·Fallback 상태를 잃지 않는다.
- 국내 AI와 A100 사용에는 재현 명령과 품질·비용·실패 증거가 남는다.
- 아키텍처가 `docs/product-spec.md`의 AC-01~AC-10을 추적할 수 있다.

## 15. 비목표

- 실제 TMS·WMS·고객 메시징 연동
- 대규모 다허브 최적화와 실시간 스트리밍 인프라
- 실제 사고확률·의료 진단 모델
- 완전한 인증·권한·법적 준수 구현
- 독자 지도·내비게이션 엔진
- 검증 목적이 없는 장식성 모델 학습

## 16. 미결사항

- Kakao Maps 공개 Demo 도메인·쿼터·정책의 지속 운영 점검과 후속 3D 범위
- 위치 최신성·정확도·갱신주기와 메모리 보존시간
- 기사 PWA 실제 인증·위치 권한·푸시 알림과 서버 동기화 계약
- 실제 파일럿 D1 보존기간·백업·삭제 운영정책
- 공개 Sites 사용자 인증을 도입할 경우의 역할·세션 계약
- 공급자별 국내 AI 모델명·엔드포인트·쿼터
- Upstage 반복 부하에서의 retry·회로차단 운영 수치
- Near-miss GeoHash 정밀도와 검증 워크플로
- 외부 TMS 연결 시 원자적 적용·보상 트랜잭션
