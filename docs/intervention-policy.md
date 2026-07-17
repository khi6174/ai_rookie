# SafeRoute AI 개입·승인 정책

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-15
- 정책 버전: `intervention-v1.0.0`
- 상위 문서: `AGENTS.md`, `docs/product-spec.md`, `docs/safety-model.md`

## 1. 목적

이 문서는 Safety Budget 예측 결과를 실행 가능한 운영 조치로 바꾸는 규칙을 정의한다. 개입 후보의 생성, 하드 제약, Risk Transfer Guard, 후보 비교와 추천, 기사 동의·수정·거절, 관리자 승인, 계획 적용과 실패 처리를 일관되게 통제한다.

핵심 원칙은 다음과 같다.

> 안전하지 않은 후보를 먼저 제거하고, 안전한 후보 안에서만 안전효과·지연·고객영향·형평성·운영복잡도를 비교한다.

이 정책은 관리자가 기사를 통제하거나 생산성을 평가하기 위한 정책이 아니다. 위험한 배송계획 자체를 변경하기 위한 운영 규칙이다.

## 2. 정책 범위

### 2.1 포함

- 휴식
- 물량이관
- 배송순서 변경
- 안전경로 선택
- Safe Delay
- 호환 가능한 개입 묶음
- 후보 실행 가능성
- 추천 순위
- 영향받는 기사 동의
- 관리자 승인
- 계획 갱신과 고객안내 요청
- 개입 결정 감사기록

### 2.2 제외

- 사고확률 또는 의료적 위험 판정
- 긴급구조·119 신고 판단
- 법정 근로시간 준수의 법률적 보증
- 기사 징계·성과평가·보험·보상 결정
- 관리자에 의한 기사 동의 강제 우회
- 실제 배차·지도 공급자의 최적화 알고리즘
- 실제 고객 메시지 발송
- 비용 절감만을 위한 물량이관

## 3. 핵심 용어

### 3.1 기준 계획

`Baseline Plan`은 개입을 적용하지 않은 현재 확정 배송계획이다. 모든 후보 효과는 동일한 평가시각과 입력 스냅샷의 기준 계획과 비교한다.

### 3.2 개입 후보

`Intervention Candidate`는 하나 이상의 조치를 조합한 아직 평가되지 않은 계획 변경안이다.

### 3.3 평가된 후보

`Intervention Evaluation`은 후보에 안전모델, 운영 제약, 고객영향과 동의 요구사항을 적용한 불변 결과다.

### 3.4 실행 가능성

```ts
type Feasibility =
  | { status: "FEASIBLE"; warnings: PolicyReason[] }
  | { status: "INFEASIBLE"; reasons: PolicyReason[] }
  | { status: "NEEDS_DATA"; blockingInputs: string[] };
```

- `FEASIBLE`: 모든 하드 제약을 통과했다.
- `INFEASIBLE`: 하나 이상의 하드 제약을 위반했다.
- `NEEDS_DATA`: 필수 검사를 수행할 데이터가 없다.

`NEEDS_DATA` 후보를 `FEASIBLE`로 낙관 처리하지 않는다.

### 3.5 추천 후보

모든 하드 제약을 통과한 후보 중 정책의 정렬 규칙에서 첫 번째인 후보다. 추천은 자동 적용을 뜻하지 않으며 동의와 승인을 생략하지 않는다.

## 4. 개입 유형

### 4.1 휴식

#### 입력

- 시작 가능 시각
- 휴식시간
- 휴식장소 ID와 품질
- 현재 위치에서 휴식장소까지의 이동시간

#### v1 후보값

```text
restMinutes ∈ {10, 15, 20, 30}
```

#### 하드 제약

- 휴식장소에 접근할 수 있어야 한다.
- 휴식이 배송작업 또는 주행과 겹치면 안 된다.
- 변경된 배송시간창과 허용 종료시각을 검사해야 한다.
- 휴식장소가 확인되지 않으면 `NEEDS_DATA` 또는 보수적인 장소 가정을 명시한다.

#### 동의

기사의 일정과 작업량에 영향을 주므로 기사 동의가 필요하다. 휴식을 거절했다는 사실을 기사 평가에 사용하지 않는다.

### 4.2 물량이관

#### 입력

- 원 기사와 수신 기사
- 이전할 배송지 목록
- 인계 위치와 예상시각
- 적재량, 배송시간창, 권역·차량 호환성

#### v1 후보값

남은 배송량의 범위 안에서 다음 목표 개수를 생성한다.

```text
transferCounts ∈ {4, 8, 12}
```

실제 후보는 시간창, 지리적 군집과 인계 가능성을 만족하는 연속 또는 근접 배송지 묶음으로 만든다. 단순히 배열 앞에서 N개를 자르지 않는다.

#### 하드 제약

- Risk Transfer Guard 전체를 통과해야 한다.
- 원 기사와 수신 기사 모두 계획 종료까지 임계치를 넘지 않아야 한다.
- 적재·차량·권역·인계 위치와 배송시간창을 지켜야 한다.
- 수신 기사 동의가 필요한 상태라면 동의 없이 적용할 수 없다.

#### 동의

원 기사와 수신 기사 모두의 작업목록이 바뀌므로 양쪽 기사 동의가 필요하다. MVP 데모에서 수신 기사 응답을 자동 동의로 위장하지 않는다. 합성 fixture에서 사전 동의 상태를 사용할 경우 화면과 감사기록에 `Demo pre-consented`를 표시한다.

### 4.3 배송순서 변경

#### 입력

- 재정렬 가능한 배송지 집합
- 고정 배송지와 우선순위
- 배송시간창
- 구간별 ETA와 위험노출

#### v1 후보 생성

- 가까운 고위험 구간을 더 안전한 시각으로 이동
- 저위험·시간창 여유 배송지를 앞당김
- 우천·야간 상호작용이 큰 구간의 노출 순서를 변경

전체 순열을 탐색하지 않고 결정론적 휴리스틱으로 최대 3개 후보를 생성한다.

Demo v1에서는 경로·권역 계층이 현재 남은 배송지 전체를 한 번씩 포함하는 명시적 순서를 제공한다. `ScenarioFixture.interventionInputs.reorderPolicies`는 재정렬 가능 stop과 고정 stop을 구분하며 Domain은 고정 stop의 위치, stop 집합, 시간창과 경로 연결을 검증한다. 실제 휴리스틱은 별도 승인 전까지 Domain에 넣지 않는다.

#### 하드 제약

- 고정 배송지 순서를 바꾸지 않는다.
- 필수 배송시간창을 위반하지 않는다.
- 경로가 단절되거나 이동 불가능한 순서를 만들지 않는다.

#### 동의

배송목록과 예상 종료시각이 유의미하게 바뀌면 기사 동의가 필요하다. ETA 변화가 없고 작업 내용이 동일한 단순 경로 재계산도 MVP에서는 투명성을 위해 기사에게 알린다.

### 4.4 안전경로

#### 입력

- 같은 출발·도착점을 연결하는 경로 대안
- 이동시간, 거리, 통행 가능 여부
- 경사, 좁은 도로, 검증된 지역위험과 날씨노출

#### v1 후보 생성

각 구간에서 가장 빠른 경로 외에 위험노출이 낮은 경로를 최대 2개 비교한다. 외부 지도 API가 없으면 버전이 있는 데모 경로 fixture를 사용한다.

Demo 경로는 `ScenarioFixture.interventionInputs.saferRouteAlternatives`에 교체 대상 구간과 완전한 대체 `RouteSegment`를 함께 저장한다. Domain은 후보 action과 카탈로그가 정확히 일치할 때만 적용하며 현재 구간의 경사·폭·시간을 임의로 보정하지 않는다.

#### 하드 제약

- 차량 통행과 법적 제한을 충족해야 한다.
- 배송시간창과 허용 종료시각을 검사해야 한다.
- 경로 위험 데이터가 없어 비교할 수 없으면 `NEEDS_DATA`다.

#### 동의

ETA 또는 주행경로가 바뀌므로 기사 동의가 필요하다.

### 4.5 Safe Delay

#### 입력

- 지연 가능한 저우선순위 배송지
- 서비스 정책과 최대 지연
- 변경된 ETA
- 고객안내 가능 여부

#### v1 후보값

```text
delayStopCounts ∈ {3, 5, 8}
```

Demo v1의 지연 가능 stop, 최대 지연분과 고객안내 생성 가능 여부는 `ScenarioFixture.interventionInputs.safeDelayPolicies`가 소유한다. Domain은 이 목록 밖의 stop, `NON_DELAYABLE`, 최대 지연 초과 또는 고객안내 불가 후보를 차단한다. 실제 상품·신선도 분류를 추정하지 않는다.

#### 하드 제약

- 의료·신선·시간보장 등 지연 불가 배송지를 포함하지 않는다.
- 서비스 정책의 최대 지연을 넘지 않는다.
- 변경 ETA를 계산할 수 있어야 한다.
- 고객안내 요청을 생성할 수 있어야 한다.

#### 동의

기사의 작업목록 또는 종료시각이 바뀌면 기사 동의가 필요하다. 관리자는 고객영향을 확인하고 승인해야 한다.

### 4.6 묶음 개입

v1에서 생성 가능한 기본 묶음은 다음과 같다.

- 휴식 + 물량이관
- 휴식 + 배송순서 변경
- 휴식 + 안전경로
- 물량이관 + 배송순서 변경
- 휴식 + Safe Delay
- 안전경로 + Safe Delay

v1 묶음의 정규 적용 순서는 다음 부분순서를 따른다.

```text
REST → TRANSFER_STOPS → REORDER_STOPS → SAFER_ROUTE → SAFE_DELAY
```

허용 목록에 실제로 포함된 두 유형만 이 순서에서 선택한다. 따라서 `물량이관 + 배송순서 변경`은 이관을 먼저 적용한 원 기사의 잔여 배송지 집합으로 순서변경을 검사하고, `안전경로 + Safe Delay`는 경로 변경 후 ETA로 지연 한도와 고객영향을 검사한다. 휴식은 이후 일정의 출발시각과 종료시각을 먼저 이동시키며 Safety Budget의 초기 회복으로도 한 번만 반영한다.

다음 묶음은 기본적으로 생성하지 않는다.

- 같은 종류의 중복 조치
- 서로 다른 수신 기사에게 동시에 이관하는 복잡한 다자 조치
- 순서가 정의되지 않은 세 개 이상의 개입
- 한 조치가 다른 조치의 전제조건을 무효화하는 조합

묶음은 구성 조치 각각의 제약과 전체 재계산을 모두 통과해야 한다. 단일 조치의 효과를 단순 합산하지 않고 변경된 계획 전체를 안전모델로 다시 시뮬레이션한다.

조치 배열은 위 정규 순서와 일치해야 한다. 역순, 허용 목록에 없는 두 조치, 서로 다른 원 기사를 대상으로 하는 조합은 계약 경계에서 거절한다. 구성 조치가 필요한 명시적 Demo 카탈로그를 찾지 못하면 묶음 전체를 `NEEDS_DATA`로 반환하며, 앞 조치만 적용된 결과를 실행 가능한 후보로 취급하지 않는다.

## 5. 후보 생성 정책

### 5.1 생성 조건

다음 중 하나일 때 후보를 생성한다.

- 현재 밴드가 `SUPPORT_NEEDED` 또는 `BREACHED`
- 예측 구간 안에 `PREDICTED` 초과가 있음
- 관리자가 설명 가능한 범위에서 수동 비교를 요청함
- 기사가 수정 요청함

현재 결과가 `INSUFFICIENT_DATA`면 차단 입력을 먼저 요청하고 실행 후보를 생성하지 않는다.

### 5.2 생성 상한

화면과 계산 복잡도를 통제하기 위해 v1에서는 다음 상한을 둔다.

```text
singleActionCandidates <= 12
bundleCandidates <= 8
totalCandidates <= 20
```

같은 계획 결과를 만드는 중복 후보는 하나로 합치고 생성 근거를 함께 보존한다.

### 5.3 결정론

동일한 기준 계획, 정책·안전모델 버전과 입력에서 같은 후보 ID, 순서와 평가 결과를 만들어야 한다.

후보 ID는 기사 이름이나 화면 순서가 아닌 정규화된 조치 내용으로 생성한다.

```text
candidateId = hash(decisionId + normalizedActions + policyVersion)
```

v1 구현에서 배송지 군집 자체는 경로·권역 계층이 명시적 ID 집합으로 제공한다. Domain은 허용된 4·8·12건 집합만 정규화하며, 배열 앞에서 N개를 자르거나 승인되지 않은 지리 휴리스틱을 만들지 않는다. 지리 군집 알고리즘이 확정되기 전에도 전체 계획 재계산과 Risk Transfer Guard는 같은 계약으로 검증한다.

### 5.4 후보 다양성

추천안 하나만 생성하지 않는다. 가능한 경우 최소 다음을 포함한다.

- 지연이 가장 작은 실행 가능 후보
- 안전효과가 가장 큰 실행 가능 후보
- 운영복잡도가 가장 낮은 실행 가능 후보
- 정책 종합점수가 가장 높은 후보
- 대표적인 실행 불가 후보와 이유

각 후보의 역할이 같으면 중복 표시하지 않는다.

## 6. 하드 제약 검사 순서

모든 후보는 다음 순서로 검사한다.

1. 스키마와 필수 입력
2. 작업·배송지 존재 및 버전 일치
3. 물리적·차량·권역 호환성
4. 배송시간창·허용 종료시각·지연 정책
5. 모든 영향 기사의 Safety Budget
6. Risk Transfer Guard
7. 동의 가능성과 금지된 응답 상태
8. 계획 적용 가능성

앞 단계가 실패해도 가능한 범위에서 나머지 독립 검사를 수행해 모든 불가능 사유를 반환한다. 다만 필수 데이터가 없어 안전검사를 할 수 없다면 `NEEDS_DATA`로 멈춘다.

### 6.1 공통 안전 하드 제약

모든 영향 기사에 대해 다음을 만족해야 한다.

```text
candidate.breach.status != ALREADY_BREACHED
candidate.breach.status != PREDICTED
candidate.minimumForecastBudget >= breachThreshold
```

Safety Budget 내부값이 정확히 `30.0`이면 임계치 초과는 아니지만 여유가 없으므로 `boundary warning`을 표시한다.

새로운 초과가 없어도 기준 계획보다 최소 Budget이 악화되는 후보는 안전 목적 개입으로 추천하지 않는다. 운영상 필요한 경우 비교용 후보로 남기되 `SAFETY_NOT_IMPROVED` 사유를 표시한다.

### 6.2 안전한 후보가 없는 경우

모든 후보가 불가능하면 가장 덜 위험한 후보를 추천으로 표시하지 않는다. 대신 다음 상태를 반환한다.

```text
NO_SAFE_OPTION
```

UI는 물량감축, 운영중단, 추가 기사 요청 또는 Safe Delay 확대가 필요함을 명시한다. v1 범위를 벗어난 조치를 자동 생성하거나 현재 계획을 안전하다고 표시하지 않는다.

## 7. Risk Transfer Guard

### 7.1 목적

물량이관이 원 기사의 위험을 수신 기사에게 전가하지 않도록 한다. 이 검사는 추천 점수보다 먼저 실행되는 하드 제약이다.

### 7.2 검사 대상

- 원 기사
- 모든 수신 기사
- 인계 과정에 참여하는 기사
- 변경된 경로·시간창·종료시각

### 7.3 v1 하드 조건

모든 물량이관 후보는 다음을 만족해야 한다.

```text
source.minimumForecastBudget >= 30
recipient.minimumForecastBudget >= 45
recipient.breach.status == NO_BREACH_IN_HORIZON
recipient.remainingCapacity >= transferredLoad
recipient.projectedEndAt <= recipient.allowedEndAt
recipient.timeWindowsSatisfied == true
recipient.vehicleCompatible == true
recipient.areaCompatible == true
recipientConsent not in {DECLINED, EXPIRED}
```

수신 기사의 이관 후 최소 Budget에는 `supportThreshold 45`를 사용한다. 단순히 임계치 30만 넘기는 여유 없는 이관을 허용하지 않는다.

### 7.4 기준 대비 악화 제한

수신 기사의 이관 후 최소 Budget 감소량은 다음을 만족해야 한다.

```text
recipientBudgetDrop =
  baselineRecipient.minimumForecastBudget
  - candidateRecipient.minimumForecastBudget

recipientBudgetDrop <= 15
```

15점 이하라도 이관 후 Budget 45 미만이면 불가능하다. 15점은 v1 데모 정책값이며 실제 운영 전 검증이 필요하다.

### 7.5 다중 수신 기사

MVP에서는 하나의 후보가 한 명의 수신 기사만 포함한다. 여러 기사에게 나누는 후보는 P2다. 여러 번의 별도 이관을 연속 적용하려면 매번 최신 확정 계획에서 전체 Guard를 다시 계산한다.

### 7.6 동의 상태

- `NOT_REQUESTED`: 평가 가능하지만 적용 불가
- `PENDING`: 평가·비교 가능하지만 적용 불가
- `CONSENTED`: 적용 조건 충족 가능
- `MODIFICATION_REQUESTED`: 기존 후보 적용 불가, 재계산 필요
- `DECLINED`: 기존 후보 적용 불가
- `EXPIRED`: 기존 후보 적용 불가, 재요청 또는 재계산 필요

데모 fixture의 사전 동의는 실제 동의와 구분한다.

### 7.7 불가능 사유 예시

```text
TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR
TRANSFER_RECIPIENT_BUDGET_DROP_EXCEEDED
TRANSFER_RECIPIENT_BREACH_PREDICTED
TRANSFER_CAPACITY_EXCEEDED
TRANSFER_TIME_WINDOW_VIOLATION
TRANSFER_ALLOWED_END_EXCEEDED
TRANSFER_VEHICLE_INCOMPATIBLE
TRANSFER_AREA_INCOMPATIBLE
TRANSFER_RECIPIENT_DECLINED
TRANSFER_HANDOFF_UNAVAILABLE
```

화면에는 코드가 아니라 평이한 설명을 함께 제공한다.

예:

> 12건을 이관하면 수신 기사의 최소 안전여유가 45 아래로 내려가므로 실행할 수 없습니다.

## 8. 후보 효과 계산

각 후보는 기준 계획과 같은 평가시각, 입력 데이터, 안전모델·설정 버전으로 다시 계산한다.

### 8.1 필수 결과

```ts
type InterventionMetrics = {
  baselineMinimumBudget: number;
  candidateMinimumBudget: number;
  safetyGain: number;
  breachOutcome: "UNCHANGED" | "DELAYED" | "AVOIDED" | "INTRODUCED";
  breachDelayMinutes?: number;
  etaDeltaMinutes: number;
  customerImpact: CustomerImpact;
  operationalComplexity: number;
  fairnessImpact: FairnessImpact;
  affectedCouriers: CourierImpact[];
};
```

### 8.2 Safety Gain

```text
safetyGain =
  candidateMinimumBudget - baselineMinimumBudget
```

기준 계획이 임계치를 넘고 후보가 초과를 제거한 경우에도 동일한 공식을 유지하고 `breachOutcome: AVOIDED`를 별도로 표시한다.

### 8.3 ETA 변화

ETA 변화는 영향을 받는 기사와 고객별로 계산한다. 하나의 평균으로 수신 기사나 지연 고객의 큰 변화를 숨기지 않는다.

### 8.4 운영복잡도

v1 기본 복잡도는 0~100 범위에서 다음 사건 점수를 합산한 뒤 100으로 자른다.

| 사건 | 점수 |
|---|---:|
| 휴식만 추가 | 10 |
| 순서변경 | 15 |
| 안전경로 변경 | 15 |
| Safe Delay | 20 |
| 물량 인계 1회 | 30 |
| 추가 기사 1명 | 15 |
| 고객안내 묶음 | 10 |
| 두 조치 묶음 | 10 추가 |

복잡도는 안전 제약을 완화하지 않으며 실행 가능한 후보 간 비교에만 사용한다.

### 8.5 고객영향

고객영향은 다음을 포함한다.

- 영향받는 배송지 수
- 최대 ETA 증가
- 평균 ETA 증가
- 시간보장 또는 우선배송 영향
- 고객안내 필요 여부

고객영향이 커도 안전 후보를 자동 탈락시키지 않는다. 서비스 정책의 하드 시간창을 위반할 때만 불가능하다.

### 8.6 형평성 영향

형평성은 원 기사만의 개선이 아니라 모든 영향 기사의 최소 Budget과 작업시간 변화로 계산한다.

```text
maxBudgetDropOtherCouriers
maxAddedWorkMinutesOtherCouriers
postActionBudgetSpread
consentCoverage
```

보호특성, 과거 성과, 수락률 또는 거절 횟수는 형평성 점수에 사용하지 않는다.

## 9. 추천 순위

### 9.1 1단계: 안전 가능 집합

추천 순위에는 `FEASIBLE` 후보만 포함한다. `INFEASIBLE`과 `NEEDS_DATA`는 별도 섹션에 이유와 함께 남긴다.

### 9.2 2단계: 기준 계획별 결과 조건

기준 계획에 예상 초과가 있으면, 이를 제거한 후보만 `FEASIBLE` 추천 집합에 들어간다. 초과시점을 늦추기만 한 후보는 비교 화면에 효과와 함께 남기되 `BREACH_REMAINS_PREDICTED` 사유로 실행 불가다.

기준 계획에 예상 초과가 없으면, 새로운 초과를 만들지 않고 최소 Budget을 악화시키지 않는 후보만 추천 집합에 들어간다. 안전효과가 같은 후보 안에서 지연·고객영향·형평성·복잡도를 비교한다.

더 빠르다는 이유로 예상 초과가 남거나 새로 생기는 후보를 추천할 수 없다.

### 9.3 3단계: 정규화 점수

같은 결과 그룹 안에서 0~100 정규화값을 사용한다.

```text
safetyGainScore = clamp(safetyGain / 30, 0, 1) × 100
delayCostScore = clamp(maxEtaDelayMinutes / 60, 0, 1) × 100
customerImpactScore = configured customer impact in [0, 100]
fairnessPenaltyScore = configured fairness impact in [0, 100]
complexityScore = operational complexity in [0, 100]

recommendationScore =
    0.50 × safetyGainScore
  - 0.15 × delayCostScore
  - 0.10 × customerImpactScore
  - 0.15 × fairnessPenaltyScore
  - 0.10 × complexityScore
```

점수는 설명용 운영 우선순위이며 안전성을 확률로 나타내지 않는다. 가중치는 버전 설정으로 관리한다.

### 9.4 동점 처리

추천 점수 차이가 `0.5` 이하이면 동점으로 보고 다음 순서로 결정한다.

1. 모든 영향 기사 중 최소 Budget이 높은 후보
2. 다른 기사 Budget 감소가 작은 후보
3. 최대 고객 ETA 증가가 작은 후보
4. 운영복잡도가 낮은 후보
5. 동의가 필요한 사람 수가 적은 후보
6. 정규화된 candidate ID 오름차순

마지막 ID 정렬은 재현성을 위한 것이며 의미 있는 우선순위가 아니다.

### 9.5 추천 설명

추천 결과는 최소 다음을 설명한다.

- 어떤 안전 제약을 통과했는지
- 예상 초과를 제거·지연하는지
- 기준 계획 대비 최소 Budget 개선
- ETA와 고객영향
- 다른 기사에게 미치는 최대 영향
- 필요한 동의와 승인
- 가장 빠른 후보를 추천하지 않았다면 그 이유

## 10. 기사 동의 정책

### 10.1 동의 전 제공 정보

기사에게 다음을 제공하기 전에는 동의를 요청하지 않는다.

- 현재 계획의 예상 초과 시각·배송지
- 주요 원인 3개, 신뢰도와 결측
- 제안된 행동과 예상 안전효과
- 본인 작업량·경로·ETA 변화
- 물량이관 시 수신 기사 Guard 통과 여부
- 데이터 사용범위
- 동의·수정·거절 후 다음 단계

### 10.2 동의 유효성

동의는 다음 값에 묶인다.

```text
decisionId
candidateId
planVersion
safetyModelVersion
policyVersion
consentedAt
```

다음 중 하나가 바뀌면 기존 동의는 만료된다.

- 작업목록 또는 이관 배송지
- 휴식시간이 5분 이상 변경
- ETA 영향이 5분 이상 증가
- 수신 기사 또는 수신 기사 영향
- 안전 밴드 또는 예상 초과 결과
- 중요 결측·가정

문구만 다듬고 수치·조치·영향이 바뀌지 않으면 재동의가 필요하지 않다.

### 10.3 수정 요청

기사는 v1에서 다음 구조화 요청을 선택할 수 있다.

- 휴식시간 조정
- 이관 건수 축소
- 이관 대신 다른 조치 요청
- 특정 배송지 유지 요청
- 안전경로 우선 요청
- 직접 입력한 짧은 사유

수정 요청은 새 후보를 생성하며 기존 동의를 재사용하지 않는다.

### 10.4 거절

- 거절 사유는 선택 입력이다.
- 거절한 동일 후보를 자동 재요청하지 않는다.
- 거절 횟수와 사유를 성과평가나 추천 불이익에 사용하지 않는다.
- 시스템은 거절 조건을 반영해 다른 실행 가능 후보를 재계산한다.
- 다른 안전 후보가 없으면 `NO_SAFE_OPTION`을 관리자에게 알리고 원래 계획을 안전하다고 표시하지 않는다.

### 10.5 응답 대기와 만료

MVP 기본 동의 유효시간은 `10분`이다. 시간이 지나면 `EXPIRED`로 전환하고 최신 입력으로 다시 계산한다.

결정 레코드에서는 이 분기를 `RIDER_CONSENT_EXPIRED`로 기록한다. 여러 기사 동의가 필요한 후보에서 일부 기사만 응답한 경우 결정 상태는 `RIDER_RESPONSE_PENDING`을 유지하되 각 응답을 별도 감사 이벤트로 남긴다. 만료 후에는 관리자 승인을 허용하지 않고 새 후보·평가·동의를 생성한다.

응답 대기 중 계획을 자동 변경하지 않는다. 임계치가 가까워지면 비징벌적 재알림을 최대 1회 제공한다. 긴급상황 강제정책은 MVP에 포함하지 않는다.

## 11. 관리자 승인 정책

### 11.1 승인 전 필수 확인

관리자는 다음을 한 화면에서 확인해야 한다.

- 기준 계획과 후보의 전후 Safety Budget
- 예상 초과 제거·지연 여부
- ETA와 고객영향
- 모든 영향 기사의 Budget과 Guard 결과
- 기사별 동의 상태
- 신뢰도, 결측과 가정
- 고객안내 초안
- 결정론적 계산과 정책 버전

### 11.2 승인 가능 조건

```text
candidate.feasibility == FEASIBLE
allRequiredConsents == CONSENTED
candidate.planVersion == currentPlanVersion
candidate.inputSnapshot is not stale
no new blocking data error
```

하나라도 충족하지 않으면 승인 버튼을 비활성화하고 이유를 표시한다.

### 11.3 관리자 행동

- 승인: 후보 스냅샷을 잠그고 적용 시작
- 보류: 계획을 유지하고 사유 기록
- 수정 요청: 변경사항을 구조화해 후보 재계산
- 취소: 결정 세션 종료, 계획 유지

관리자가 안전 하드 제약을 수동으로 해제하는 기능은 제공하지 않는다.

## 12. 계획 적용 정책

### 12.1 적용 전 재검증

승인 직전에 다음을 재검증한다.

- 계획 버전 충돌
- 새 배송 또는 취소
- 기사·날씨·경로 상태의 중요 변화
- 동의 만료
- 수신 기사 Guard

중요 변화가 있으면 적용하지 않고 `REVALIDATION_REQUIRED`로 전환한다.

### 12.2 원자적 적용

다음 변경은 하나의 논리적 트랜잭션으로 취급한다.

- 기사별 배송목록
- 배송순서
- 경로 선택
- 휴식 일정
- 고객 ETA
- 고객안내 요청

일부만 적용된 상태를 성공으로 표시하지 않는다. 외부 시스템 때문에 원자적 적용이 불가능하면 보상 작업과 상태를 명시한다.

MVP Demo store에서는 검증된 새 계획 스냅샷, 적용된 decision ID·plan version과 고객안내 요청 ID를 새 store 객체로 모두 만든 뒤 활성 참조를 한 번에 교체한다. 검증 실패나 의도된 실패 주입 시 기존 store 객체를 그대로 반환한다. 외부 TMS 트랜잭션과 보상 작업은 이 범위에 포함하지 않는다.

### 12.3 적용 결과

```ts
type ApplyResult =
  | { status: "APPLIED"; newPlanVersion: string; appliedAt: string }
  | { status: "REVALIDATION_REQUIRED"; reasons: PolicyReason[] }
  | { status: "FAILED"; reasons: PolicyReason[]; rollbackStatus: string };
```

### 12.4 고객안내

고객안내에는 실제 적용된 새 ETA만 사용한다. 후보 ETA나 적용 실패한 계획의 ETA를 발송 결과로 표시하지 않는다.

## 13. 상태 전이

```text
BASELINE_EVALUATED
→ CANDIDATES_GENERATED
→ CANDIDATES_EVALUATED
→ RIDER_REVIEW_REQUIRED
→ RIDER_CONSENTED | MODIFICATION_REQUESTED | RIDER_DECLINED | EXPIRED
→ ADMIN_APPROVAL_REQUIRED
→ APPROVED | ADMIN_HELD | ADMIN_MODIFICATION_REQUESTED | CANCELLED
→ REVALIDATING
→ APPLYING_PLAN | REVALIDATION_REQUIRED
→ APPLIED | APPLY_FAILED
→ NOTICE_RECORDED
→ CLOSED
```

허용된 전이만 상태기계로 구현한다. 화면이 다음 단계로 이동했다는 이유로 도메인 상태를 건너뛰지 않는다.

위 흐름의 `EXPIRED` 결정 상태명은 `RIDER_CONSENT_EXPIRED`다. 승인 후 재검증을 통과해야만 `APPLYING_PLAN`으로 이동하며, 재검증과 실제 교체 사이에 계획 버전이 바뀐 경우에도 `REVALIDATION_REQUIRED`로 돌아간다. `APPLIED`는 고객안내 기록을 건너뛰고 `CLOSED`로 이동할 수 없다.

## 14. 불가능·경고 사유 체계

모든 사유는 코드, 사용자 메시지, 영향 대상과 근거 필드를 가진다.

```ts
type PolicyReason = {
  code: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  subjectType: "COURIER" | "STOP" | "ROUTE" | "CUSTOMER" | "SYSTEM";
  subjectId?: string;
  messageKey: string;
  evidenceFields: string[];
};
```

### 14.1 공통 차단 코드

```text
MISSING_REQUIRED_INPUT
STALE_PLAN_VERSION
NO_SAFE_OPTION
BREACH_REMAINS_PREDICTED
NEW_BREACH_INTRODUCED
MINIMUM_BUDGET_BELOW_THRESHOLD
TIME_WINDOW_VIOLATION
ALLOWED_END_TIME_EXCEEDED
ROUTE_UNAVAILABLE
CONSENT_REQUIRED
CONSENT_DECLINED
CONSENT_EXPIRED
PLAN_APPLY_UNAVAILABLE
```

### 14.2 표시 원칙

- 코드를 그대로 사용자에게 보여주지 않는다.
- 기사 탓이나 수신 기사 탓으로 표현하지 않는다.
- 불가능 후보를 숨기지 않는다.
- 안전상 불가능과 데이터 부족을 구분한다.
- 같은 원인의 중복 메시지를 합친다.

## 15. 감사기록

각 결정은 하나의 `decisionId` 아래 다음을 기록한다.

- 기준 계획·입력 스냅샷과 버전
- 안전모델·설정·정책 버전
- 생성된 모든 후보
- 각 후보의 안전결과와 제약 결과
- 불가능·경고 사유
- 추천 점수 구성요소와 동점 처리
- 기사별 제공 정보와 응답
- 관리자 확인 정보와 결정
- 적용 전 재검증 결과
- 적용·롤백·고객안내 결과
- 조정 전후 지표

감사기록은 판단의 재현을 위한 것이며 기사 성과 프로파일을 만드는 데 사용하지 않는다.

## 16. 필수 테스트 하네스

### 16.1 후보 생성

- 동일 입력에서 후보 ID와 순서가 동일함
- 생성 상한 준수
- 중복 후보 제거
- 다섯 개 유형과 허용 묶음 생성
- 금지된 묶음 미생성

### 16.2 하드 제약

- 가장 빠르지만 초과가 남는 후보 차단
- 시간창 위반 차단
- 종료시각 위반 차단
- 데이터 부족을 실행 가능으로 처리하지 않음
- 안전 후보가 없을 때 `NO_SAFE_OPTION`

### 16.3 Risk Transfer Guard

- 8건 이관 허용 fixture
- 12건 이관의 수신 기사 Budget 차단 fixture
- 이관 후 Budget 45 경계값
- Budget 감소 15점 경계값
- 적재량·시간창·종료시각·호환성 위반
- 수신 기사 거절·만료
- 원 기사만 개선되고 수신 기사 초과가 생기는 후보 차단

### 16.4 추천 순위

- 초과 제거 후보가 더 빠르지만 초과가 남는 후보보다 우선
- 안전효과·지연·형평성·복잡도 점수
- 점수 동점의 결정론적 처리
- 불가능 후보가 추천 목록에 들어가지 않음
- 추천 이유에 수치와 제약 근거 포함

### 16.5 묶음 개입

- 단일 효과 합산이 아니라 전체 재계산
- 조치 순서가 결과에 반영됨
- 구성 조치 하나가 불가능하면 묶음도 불가능
- 추천 묶음이 가장 빠른 후보보다 우선되는 이유 스냅샷

### 16.6 동의와 승인

- 동의 없는 관리자 승인 차단
- 수정 요청 후 새 candidate ID와 재동의
- 거절 후보 자동 재요청 금지
- 동의 만료
- ETA·수신 기사 영향 변경 시 기존 동의 만료
- 문구만 변경됐을 때 동의 유지
- 관리자의 하드 제약 우회 불가

### 16.7 적용과 복구

- 최신 계획 버전 충돌 시 재검증
- 부분 적용을 성공으로 표시하지 않음
- 적용 실패 시 원래 계획 유지 또는 보상 상태
- 실제 적용 ETA만 고객안내에 사용
- 같은 결정의 중복 적용 방지

### 16.8 현재 구현 회귀값

`scenario-rain-hill-longshift-v1`, `dse-v1.0.0`, `intervention-v1.0.0`에서 명시적 후반부 군집을 사용한 시뮬레이션 회귀값이다.

| 후보 | 원 기사 최소 Budget | 수신 기사 최소 Budget | 결과 |
|---|---:|---:|---|
| 10분 휴식 | 36.420011 | 해당 없음 | FEASIBLE |
| 8건 이관 | 41.817875 | 45.012761 | FEASIBLE |
| 12건 이관 | 47.750764 | 40.566386 | INFEASIBLE · 수신 기사 45 바닥 위반 |
| 10분 휴식 + 8건 이관 | 47.186417 | 45.012761 | FEASIBLE · 추천 순위 1 |

정확값, 45·15점 경계, 용량·시간창·차량·권역·종료시각과 안전 후보 없음 처리는 `tests/interventions.test.ts`가 검증한다. 이는 Demo 시뮬레이션이며 실제 사고감소 또는 현장 최적화 결과가 아니다.

나머지 단일 개입의 명시적 Demo 입력 회귀값은 다음과 같다.

| fixture·후보 | 기준 최소 Budget | 후보 최소 Budget | 최대 고객 ETA 증가 | 결과 |
|---|---:|---:|---:|---|
| 야간·낯선 권역 · 순서변경 | 29.970894 | 30.023044 | 6분 | FEASIBLE · 초과 제거 |
| 야간·낯선 권역 · 안전경로 | 29.970894 | 30.193571 | 2분 | FEASIBLE · 초과 제거 |
| 폭염·중량·계단 · 3건 Safe Delay | 29.9278 | 33.863225 | 43분 | FEASIBLE · 초과 제거 |

`tests/remaining-interventions.test.ts`는 정확값과 함께 고정 stop, stop 집합, 대체구간, 종료시각, `SAFETY_NOT_IMPROVED`, 지연 가능 목록, 최대 60분, 고객안내와 `NEEDS_DATA`를 검증한다.

허용 묶음의 정규 순차 재계산 회귀값은 다음과 같다. 각 최소 Budget은 두 조치를 단일 효과로 합산하지 않고 마지막 전체 계획을 다시 평가한 값이다.

| fixture·묶음 | 후보 최소 Budget | 원 기사 ETA 변화 | 최대 고객 ETA 증가 | 복잡도 | 결과 |
|---|---:|---:|---:|---:|---|
| 우천·경사 · 휴식 + 8건 이관 | 47.186417 | -15분 | 10분 | 65 | FEASIBLE · 초과 제거 |
| 야간·낯선 권역 · 휴식 + 순서변경 | 34.703044 | +10분 | 16분 | 35 | FEASIBLE · 초과 제거 |
| 야간·낯선 권역 · 휴식 + 안전경로 | 34.899404 | +12분 | 12분 | 35 | FEASIBLE · 초과 제거 |
| 우천·경사 · 8건 이관 + 순서변경 | 41.817875 | -25분 | 0분 | 70 | FEASIBLE · 초과 제거 |
| 폭염·중량·계단 · 휴식 + 3건 Safe Delay | 38.816767 | +10분 | 43분 | 40 | FEASIBLE · 초과 제거 |
| 폭염·중량·계단 · 안전경로 + 3건 Safe Delay | 33.81491 | +9.75분 | 43분 | 45 | FEASIBLE · 초과 제거 |

`tests/intervention-bundles.test.ts`는 허용 목록 6종, 정규 순서, 동일 기사 조건, 이관 후 stop 집합, 경로 변경 후 ETA, 카탈로그 결측과 기준 fixture 불변성을 검증한다.

### 16.9 현재 결정 폐루프 회귀

`tests/decision-workflow.test.ts`는 시나리오 A의 실행 가능한 8건 이관 후보를 사용해 다음 하나의 불변 event 체인을 검증한다.

```text
BASELINE_EVALUATED → CANDIDATES_GENERATED → CANDIDATES_EVALUATED
→ RIDER_REVIEW_REQUIRED → RIDER_RESPONSE_PENDING
→ RIDER_CONSENTED → ADMIN_APPROVAL_REQUIRED → APPROVED
→ REVALIDATING → APPLYING_PLAN → APPLIED
→ NOTICE_RECORDED → CLOSED
```

두 기사 중 첫 응답 뒤 pending 유지, actor 권한, 정확히 10분인 동의 만료, 수정·거절·관리자 보류, 승인 전후 plan version 충돌, 실패 주입 시 원래 store 유지, 같은 decision ID의 멱등 적용을 함께 검증한다. 이는 Demo 계획 스냅샷 적용 증거이며 외부 TMS 연동 성공을 의미하지 않는다.

### 16.10 현재 UI Demo 세션 회귀

`tests/ui-demo-session.test.ts`는 관리자, 원 기사와 수신 기사가 `decision-scenario-a-ui-v1`과 같은 추천 후보를 공유하는지 검증한다. 두 기사 동의 전 관리자 승인 잠금, 동의 후 승인·재검증·원자 적용·고객안내 기록, 수정·거절·보류 시 기존 계획 유지, reset 결정성과 fixture 불변성을 포함한다. 정적 서버 렌더 검사는 Demo 배지, 역할 탭, decision ID, 12건 이관 불가능 사유와 동의 상태를 확인한다. 적용 후에는 지원 필요·임계치 예상 0건, 이관된 배송지와 초과 해소 상태를 표시하고 현재 임계 강조를 제거하는지도 잠근다. 이는 세션·마크업 회귀 증거이며 지속 가능한 키보드 E2E나 외부 TMS E2E를 대신하지 않는다.

## 17. UI 표현 규칙

### 17.1 비교 화면

각 후보에 다음을 같은 순서로 표시한다.

1. 조치 요약
2. 예상 초과 제거·지연 여부
3. 조정 전후 최소 Budget과 밴드
4. ETA 변화
5. 다른 기사 최대 영향
6. 고객영향
7. 동의 상태
8. 실행 가능성 또는 불가능 이유

추천 후보만 강조하되 나머지 후보의 정보를 숨기지 않는다.

### 17.2 금지 표현

- `최하위 기사에게 이관`
- `거절 3회`
- `성과가 낮아 휴식 필요`
- `기사 B가 문제라 이관 불가`
- `AI가 명령한 최적안`
- 안전 제약을 통과하지 않은 `가장 효율적인 대안`

### 17.3 권장 표현

- `현재 계획에서는 약 52분 후 지원이 필요할 것으로 예상됩니다.`
- `12건 이관은 수신 기사의 최소 안전여유 기준을 충족하지 못합니다.`
- `이 조합은 예상 초과를 해소하면서 모든 영향 기사의 기준을 통과했습니다.`
- `동의 후 관리자가 최종 영향을 확인합니다.`

## 18. 실패와 폴백

- 지도·ETA API 실패: 버전이 있는 데모 경로와 ETA를 사용하고 배지 표시
- 안전모델 실패: 후보 추천·승인 차단
- 일부 후보 계산 실패: 해당 후보를 `NEEDS_DATA` 또는 오류로 표시, 나머지 평가 유지
- Upstage 실패: 결정론적 템플릿 설명 사용, 수치·추천 유지
- 동의 전달 실패: `PENDING_DELIVERY`로 표시하고 승인 차단
- 계획 적용 실패: `APPLY_FAILED`, 고객안내 발송 차단

Fallback은 하드 제약을 약화하거나 동의를 자동 생성하지 않는다.

## 19. 확정된 결정

- 안전 하드 제약을 ETA·비용·복잡도보다 먼저 검사한다.
- 불가능 후보는 이유와 함께 화면에 남긴다.
- 실행 가능한 후보 안에서만 추천 점수를 계산한다.
- 초과 제거 여부를 점수보다 먼저 적용한다.
- 수신 기사 이관 후 최소 Budget 하드 바닥은 45다.
- 수신 기사 최소 Budget 감소는 최대 15점이다.
- 물량이관은 원 기사와 수신 기사 양쪽 동의를 요구한다.
- 묶음 효과는 단일 효과의 합이 아니라 전체 계획 재계산으로 구한다.
- 기사 수정 요청은 새 후보와 새 동의를 만든다.
- 기사 거절은 비징벌적이며 동일 후보를 자동 재요청하지 않는다.
- 관리자는 안전 하드 제약을 우회할 수 없다.
- 승인 직전에 최신 데이터로 재검증한다.
- 실제 적용된 ETA만 고객안내에 사용한다.

## 20. 미결사항

- 실제 수신 기사 동의를 데모에서 어떻게 표현할지
- 휴식장소 데이터와 휴식 시작 가능시각 계산
- 배송지 군집과 이관 후보 생성 알고리즘
- 실제 배송순서 휴리스틱의 정확한 규칙
- 실제 안전경로 공급자와 응답 계약
- 실제 지연 불가 배송 분류와 서비스 정책 연동
- 고객영향·형평성 정규화 공식
- 추천 가중치의 민감도 분석
- 동의 만료 전 재알림 방식
- 관리자 보류·취소 후 결정 세션 보존기간
- 외부 배차시스템의 원자적 적용·롤백 방식
- 수신 기사 화면의 실제 인증·푸시 전달 방식

위 미결 동의·군집·외부연동 항목은 별도 Approved 결정이 기록되기 전까지 구현의 확정 기준이 아니다. v1의 45 바닥값, 15점 감소 상한과 추천 가중치는 ADR-004·005 및 이 문서의 확정된 결정에 따른다.
