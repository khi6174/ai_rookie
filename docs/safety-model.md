# SafeRoute AI Safety Budget 모델 명세

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-14
- 모델 버전: `dse-v1.0.0`
- 상위 문서: `AGENTS.md`, `docs/product-spec.md`

## 1. 목적

이 문서는 SafeRoute AI MVP에서 사용하는 Dynamic Safety Envelope와 Safety Budget의 의미, 입력 방향성, 계산 순서, 위험 밴드, Time-to-Breach, 기여도, 신뢰도와 검증 기준을 정의한다.

모델의 목적은 사고확률을 예측하는 것이 아니라 다음 운영 질문에 일관되고 재현 가능한 답을 제공하는 것이다.

> 현재 남은 배송계획을 유지할 때 안전여유가 어느 순서로 소진되며, 최초 임계치 초과가 언제·어디서 예상되고, 어떤 입력과 개입이 그 결과에 기여하는가?

## 2. 해석 경계

### 2.1 이 모델이 의미하는 것

- 남은 계획을 비교하기 위한 결정론적 운영 위험지수
- 작업 지속에 따른 안전여유의 상대적 변화
- 같은 입력·설정에서 재현 가능한 시뮬레이션 결과
- 개입 전후의 상대적 안전효과
- 데이터 완전성과 최신성을 반영한 운영상 신뢰도

### 2.2 이 모델이 의미하지 않는 것

- 사고가 발생할 확률
- 의학적 피로도 또는 건강 진단
- 기사 개인의 안전성·능력·성과 점수
- 징계, 보상, 보험 또는 고용 판단의 근거
- 실제 사고 감소를 보증하는 예측
- 현장 실증 없이 보정된 절대적 안전 기준

UI, 보고서, 발표와 AI 설명에서 `%` 기호를 Safety Budget에 사용할 수 있으나 반드시 `안전여유 지수`임을 함께 표시한다. `사고확률`, `사고 가능성 78%`, `안전도 순위` 같은 표현은 금지한다.

## 3. 핵심 정의

### 3.1 Dynamic Safety Envelope

`Dynamic Safety Envelope(DSE)`는 기사 상태, 작업 부하, 경로·지역, 날씨와 회복 행동에 따라 시간 및 배송순서별로 변하는 안전 가능영역이다.

### 3.2 Safety Budget

`Safety Budget B(t)`는 특정 시점의 남은 운영상 안전여유를 0에서 100 사이로 표현한 값이다. 값이 높을수록 현재 계획을 수행할 여유가 크다.

```text
0 <= B(t) <= 100
```

값은 표시 편의를 위해 정수로 반올림할 수 있지만, 엔진 내부 계산과 임계치 판정에는 반올림 전 실수를 사용한다.

### 3.3 Exposure와 Recovery

- `Exposure`: 작업 지속으로 Budget을 감소시키는 비음수 값
- `Recovery`: 검증된 휴식으로 Budget을 증가시키는 비음수 값

```text
B(t+1) = clip(B(t) - Exposure(t, t+1) + Recovery(t, t+1), 0, 100)
```

Exposure는 네 범주로 분리한다.

```text
Exposure = DriverExposure
         + TaskExposure
         + RouteExposure
         + WeatherExposure
         + InteractionExposure
```

기여도에는 각 범주와 상호작용을 별도 항목으로 보존한다. 같은 노출을 두 범주에 중복 계산하지 않는다.

## 4. 모델 처리 흐름

### 4.1 현재 Budget 계산

현재 Budget은 근무 시작 시점의 기준값에서 검증 가능한 작업 이력의 노출과 회복을 시간순으로 적용해 계산한다.

```text
B_shift_start = 100
B_current = simulate(shift history, B_shift_start)
```

근무 시작 전 이력이 없거나 이력 데이터가 불완전하면 임의의 개인별 초기값을 만들지 않는다. MVP에서는 기준값 100을 사용하고 신뢰도를 낮추며 누락된 이력을 `missingInputs`에 기록한다.

현재 Budget을 fixture에 직접 제공하는 경우 다음을 모두 만족해야 한다.

- 출처가 `mock`임을 표시한다.
- `derivedFromHistory: false`를 표시한다.
- 신뢰도는 `HIGH`가 될 수 없다.
- 데모 초기화 외의 Live 계산에서는 사용하지 않는다.

### 4.2 미래 Budget 계산

남은 경로를 이동구간과 배송작업 이벤트의 시간순 목록으로 변환한다.

```text
current state
→ travel segment 1
→ service at stop 1
→ travel segment 2
→ service at stop 2
→ ...
```

각 이벤트에 예상 지속시간, 작업·경로·날씨 입력과 예정 휴식을 적용한 뒤 Budget을 갱신한다. 이벤트 중간에 임계치를 넘을 수 있으므로 5분 이하의 계산 간격으로 분할한다.

MVP 기본 계산 간격은 `5 minutes`다. 이벤트가 5분보다 짧으면 이벤트 전체를 한 간격으로 계산한다.

### 4.3 모델 출력

모든 계산은 최소 다음을 반환한다.

```ts
type SafetyBudgetResult = {
  modelVersion: string;
  configVersion: string;
  evaluatedAt: string;
  currentBudget: number;
  currentBand: RiskBand;
  forecast: SafetyBudgetPoint[];
  breach: BreachPrediction;
  contributions: RiskContribution[];
  confidence: ConfidenceLevel;
  confidenceScore: number;
  missingInputs: MissingInput[];
  assumptions: ModelAssumption[];
  provenance: ProvenanceSummary;
};
```

정확한 스키마는 `docs/data-contracts.md`에서 고정한다. 이 문서의 필드 의미와 방향성을 바꾸어서는 안 된다.

## 5. v1 노출 계산

### 5.1 설계 원칙

- 모든 원시 입력은 먼저 명시된 범위의 정규화 특징으로 변환한다.
- 정규화 함수와 가중치는 버전이 있는 설정파일에서 관리한다.
- 위험 입력이 증가할 때 해당 특징과 최종 Exposure가 감소하지 않아야 한다.
- 범위를 벗어난 값은 조용히 자르지 않고 검증 오류 또는 명시적인 보정 기록을 남긴다.
- 과학적 근거가 없는 개인별 보정이나 보호특성을 사용하지 않는다.
- 가중치는 사고확률 계수가 아니라 MVP 운영 시뮬레이션 계수다.

### 5.2 시간 단위

모든 노출률은 `Budget points per hour`로 정의하고 실제 간격에 비례 적용한다.

```text
exposureForInterval = exposureRatePerHour × intervalMinutes / 60
```

배송 한 건처럼 사건 단위의 노출은 해당 서비스 이벤트에 한 번만 적용한다.

노출률은 이벤트 종류에 따라 다음처럼 적용한다.

| 노출 범주 | 이동 | 배송작업 | 유효한 휴식 |
|---|---:|---:|---:|
| DriverExposure | 적용 | 적용 | 미적용 |
| TaskExposure 시간률 | 적용 | 적용 | 미적용 |
| RouteExposure | 적용 | 주차·접근 특징만 적용 | 미적용 |
| WeatherExposure | 적용 | 적용 | 미적용, 휴식 품질에 반영 |
| InteractionExposure | 해당 특징이 존재할 때 적용 | 해당 특징이 존재할 때 적용 | 미적용 |

이동과 배송작업에 같은 사건 노출을 중복 적용하지 않는다.

### 5.3 DriverExposure

DriverExposure는 누적·연속 작업과 검증된 선택형 상태 신호를 다룬다.

#### 연속작업 특징

```text
continuousWorkFactor = clamp(
  (continuousWorkMinutes - 120) / 240,
  0,
  1
)
```

- 120분 이하는 추가 연속작업 노출이 0이다.
- 120분부터 360분 사이에서 선형 증가한다.
- 360분 이상은 v1 정규화 상한 1을 유지한다.
- 이 기준은 법적·의학적 안전선이 아니라 MVP 시뮬레이션 구간이다.

#### 누적근무 특징

```text
shiftDurationFactor = clamp(
  (shiftElapsedMinutes - 360) / 240,
  0,
  1
)
```

- 6시간 이후 추가 노출이 시작되고 10시간에 정규화 상한에 도달한다.
- 이 기준은 근로시간 준수 판정과 별개다.

#### 선택형 상태 신호

DMS 이벤트, 자기점검 또는 웨어러블 파생상태는 존재할 때만 검증된 정규화 특징으로 사용할 수 있다. 원시 심박, 수면단계 또는 의료 추론값은 v1 입력으로 직접 사용하지 않는다.

```text
driverRate =
  2.0
  + 6.0 × continuousWorkFactor
  + 4.0 × shiftDurationFactor
  + 3.0 × optionalStateFactor
```

`2.0`은 작업 중 시간 경과에 따른 기본 노출률이다. 예정 휴식 중에는 적용하지 않는다.

### 5.4 TaskExposure

TaskExposure는 남은 작업량과 현재 배송 이벤트의 신체·운영 부하를 다룬다.

```text
remainingStopsFactor = clamp(remainingStops / 50, 0, 1)
weightFactor         = clamp(totalRemainingWeightKg / 250, 0, 1)
stairsFactor         = clamp(stairStopsRemaining / 20, 0, 1)
timePressureFactor   = clamp(atRiskTimeWindows / 10, 0, 1)
```

```text
taskRate =
  1.0
  + 2.5 × remainingStopsFactor
  + 2.0 × weightFactor
  + 2.5 × stairsFactor
  + 1.5 × timePressureFactor
```

배송지 서비스 이벤트에는 다음 사건 노출을 추가할 수 있다.

```text
stopEventExposure =
  0.10
  + 0.35 × normalizedStopWeight
  + 0.35 × normalizedFloorWithoutElevator
  + 0.20 × normalizedParkingDifficulty
```

남은 작업량 특징은 계획 전반의 부담을, 사건 노출은 해당 배송지의 실제 작업을 나타낸다. 두 값의 의미를 문서와 UI에서 구분한다.

### 5.5 RouteExposure

RouteExposure는 현재 이동구간의 도로·지역 노출을 다룬다.

```text
slopeFactor       = clamp(max(uphillGradePct, 0) / 12, 0, 1)
narrowRoadFactor  = enum(WIDE=0, NORMAL=0.25, NARROW=0.7, VERY_NARROW=1)
incidentFactor    = validated localized risk in [0, 1]
unfamiliarFactor  = enum(FAMILIAR=0, PARTIAL=0.5, UNFAMILIAR=1)
nightFactor       = 1 when local time is within configured night window, else 0
```

```text
routeRate =
  0.5
  + 2.5 × slopeFactor
  + 2.0 × narrowRoadFactor
  + 2.0 × incidentFactor
  + 1.5 × unfamiliarFactor
  + 1.0 × nightFactor
```

경사 방향은 MVP에서 오르막의 작업부하를 중심으로 사용한다. 내리막·미끄럼 위험은 별도의 노면 상호작용으로 다루며 절댓값을 무조건 동일한 위험으로 해석하지 않는다.

Near-miss 기반 `incidentFactor`는 검증된 집계값만 사용한다. 신고 직후 신고 기사에게 적용하지 않는다.

### 5.6 WeatherExposure

```text
rainFactor       = clamp(rainfallMmPerHour / 20, 0, 1)
snowFactor       = clamp(snowfallCmPerHour / 3, 0, 1)
heatFactor       = clamp((feelsLikeCelsius - 28) / 10, 0, 1)
coldFactor       = clamp((5 - feelsLikeCelsius) / 15, 0, 1)
lowVisibility    = clamp((1000 - visibilityMeters) / 800, 0, 1)
```

```text
weatherRate =
  3.0 × rainFactor
  + 4.0 × snowFactor
  + 3.0 × heatFactor
  + 2.0 × coldFactor
  + 2.0 × lowVisibility
```

날씨값은 예측 시각별 값을 사용한다. 현재 날씨 하나를 남은 전체 경로에 복제한 경우 `assumptions`에 기록하고 신뢰도 감점을 적용한다.

### 5.7 InteractionExposure

상호작용은 동일 입력의 단순 중복이 아니라 결합 시 추가되는 노출만 표현한다.

```text
rainSlopeInteraction = 2.0 × rainFactor × slopeFactor
rainNarrowInteraction = 1.5 × rainFactor × narrowRoadFactor
heatStairsInteraction = 2.0 × heatFactor × stairsFactor
nightUnfamiliarInteraction = 1.5 × nightFactor × unfamiliarFactor
```

```text
interactionRate =
  rainSlopeInteraction
  + rainNarrowInteraction
  + heatStairsInteraction
  + nightUnfamiliarInteraction
```

새로운 상호작용을 추가하려면 입력 의미, 단조성, 중복계산 여부, 시나리오 근거와 테스트를 함께 추가해야 한다.

## 6. 회복 계산

### 6.1 휴식 인정 조건

Recovery는 다음을 모두 만족하는 예정 또는 확인된 휴식에만 적용한다.

- 작업·주행 이벤트와 겹치지 않는다.
- 시작·종료시각이 존재한다.
- 지속시간이 5분 이상이다.
- 동일 시간구간에 중복 적용되지 않는다.

### 6.2 v1 회복 함수

```text
effectiveRestMinutes = clamp(restMinutes - 5, 0, 25)
recovery = 0.9 × effectiveRestMinutes
```

예시:

- 5분 휴식: `0` 회복점
- 10분 휴식: `4.5` 회복점
- 15분 휴식: `9.0` 회복점
- 30분 이상 휴식: 최대 `22.5` 회복점

휴식 중에는 작업 Exposure를 적용하지 않는다. 다만 폭염·한파에서 적절한 휴식장소가 확인되지 않으면 회복에 환경 보정계수를 적용한다.

```text
recoveryAdjusted = recovery × restQualityFactor
restQualityFactor ∈ {0.5, 0.75, 1.0}
```

휴식장소 품질이 결측이면 `0.75`를 사용하고 가정을 표시하며 신뢰도를 감점한다. 회복은 Budget을 100보다 높일 수 없다.

이 함수는 임상적 회복 모델이 아니라 개입 비교를 위한 보수적 v1 규칙이다.

## 7. 위험 밴드와 임계치

v1 기본 밴드는 다음과 같다.

| 내부 Budget | 밴드 코드 | 사용자 표현 | 기본 색상 역할 | 의미 |
|---:|---|---|---|---|
| `B >= 60` | `STABLE` | 안정 | 틸/중립 | 현재 계획에 상대적 여유가 있음 |
| `45 <= B < 60` | `CAUTION` | 주의 | 앰버 약 | 추세와 결측 확인 필요 |
| `30 <= B < 45` | `SUPPORT_NEEDED` | 지원 필요 | 앰버 강 | 가까운 시간 안의 개입 검토 필요 |
| `B < 30` | `BREACHED` | 임계치 초과 | 빨강 | 현재 계획은 안전 가능영역 밖으로 판정 |

핵심 임계치는 다음과 같다.

```text
breachThreshold = 30
supportThreshold = 45
```

임계치 판정은 반올림 전 Budget으로 수행한다. 예를 들어 내부값 `29.96`은 표시가 `30`이어도 `BREACHED`다. UI는 이런 모순을 피하기 위해 Budget을 범위 또는 소수점 한 자리와 밴드로 표시한다.

이 경계는 법적·의학적 기준이 아니라 MVP 운영 규칙이며 실제 현장 적용 전 보정과 검증이 필요하다.

## 8. Time-to-Breach

### 8.1 정의

예측 시작 이후 Budget이 처음으로 `B < breachThreshold`가 되는 시점까지의 시간이다.

```text
breachIndex = first forecast point where B < 30
```

### 8.2 반환 상태

```ts
type BreachPrediction =
  | {
      status: "PREDICTED";
      timeToBreachMinutes: number;
      predictedAt: string;
      stopIndex: number;
      stopId: string;
      segmentId?: string;
      budgetAtBreach: number;
    }
  | {
      status: "NO_BREACH_IN_HORIZON";
      forecastEndAt: string;
      minimumForecastBudget: number;
    }
  | {
      status: "ALREADY_BREACHED";
      detectedAt: string;
      currentBudget: number;
    }
  | {
      status: "INSUFFICIENT_DATA";
      blockingInputs: string[];
    };
```

### 8.3 시점 보간

5분 간격 사이에서 임계치가 교차하면 두 점 사이를 선형 보간하여 예상 시각을 계산한다. 배송지 순번은 교차 시점에 진행 중이거나 다음으로 예정된 배송지에 연결한다. UI에는 `약 52분 후`처럼 불확실성을 반영한 표현을 사용한다.

예측 구간은 기본적으로 남은 배송계획 종료 또는 최대 120분 중 먼저 도달하는 시점까지다. 120분 이후는 `NO_BREACH_IN_HORIZON`의 판단 대상이 아니다.

## 9. 위험 기여도

### 9.1 목적

기여도는 최종 Budget을 설명하기 위한 결정론적 분해다. 인과관계나 사고 원인을 증명하지 않는다.

### 9.2 계산 범위

- `currentContributions`: 근무 시작부터 현재까지 Budget 소진 기여
- `forecastContributions`: 현재부터 예측 종료 또는 최초 초과까지의 추가 소진 기여
- `interventionDeltaContributions`: 기준 계획과 개입 계획의 범주별 차이

### 9.3 출력 규칙

- Budget 소진에 기여한 값은 양수 `budgetPointsConsumed`로 표시한다.
- Recovery는 별도 음수 기여가 아니라 `budgetPointsRecovered`로 구분한다.
- 기여도 합은 반올림 오차를 제외하고 총 Exposure 또는 Recovery와 일치해야 한다.
- UI는 상위 3개를 기본 표시하되 전체 내역을 확인할 수 있어야 한다.
- 기사 설명은 `연속작업`, `우천·경사`, `남은 작업량`처럼 구조적 표현을 사용한다.

### 9.4 정렬

기본 정렬은 절대 Budget 영향이 큰 순서다. 동률이면 고정된 범주 순서로 정렬해 동일 입력에서 순서가 바뀌지 않게 한다.

```text
DRIVER → TASK → ROUTE → WEATHER → INTERACTION → RECOVERY
```

## 10. 신뢰도와 결측 처리

### 10.1 신뢰도의 의미

신뢰도는 예측 정확률이 아니라 다음 네 요소를 합친 입력 품질 지수다.

- 완전성: 필수·권장 입력이 존재하는가
- 최신성: 입력이 허용된 시간 안에 갱신되었는가
- 출처 품질: Live, public-derived, user-entered, mock 중 무엇인가
- 예측 범위: 가까운 시점인가, 먼 시점인가

### 10.2 기본 점수

```text
confidenceScore = 100
                - missingPenalty
                - stalenessPenalty
                - provenancePenalty
                - horizonPenalty
```

점수는 0~100으로 자른다.

### 10.3 결측 감점

| 결측 그룹 | 감점 | 차단 여부 |
|---|---:|---|
| 현재 시각 또는 기사/계획 식별 | 100 | 계산 차단 |
| 남은 배송지·예상시간 | 100 | 미래 예측 차단 |
| 연속작업시간 | 20 | 계산 가능, 명시 |
| 누적근무시간 | 15 | 계산 가능, 명시 |
| 현재·예측 날씨 | 15 | 계산 가능, 보수적 가정 |
| 경로 위험·경사 | 10 | 계산 가능, 기본 경로값 |
| 남은 중량·계단 정보 | 8 | 계산 가능, 작업량만 사용 |
| 권역 익숙도 | 5 | 계산 가능, 중립값 사용 |
| 선택형 DMS·웨어러블 | 0 | 결측으로 감점하지 않음 |

선택하지 않은 생체·DMS 정보가 없다는 이유로 기사의 신뢰도를 낮추지 않는다.

### 10.4 최신성 감점

| 입력 | 정상 최신성 | 초과 시 감점 |
|---|---|---:|
| 기사·작업 상태 | 5분 이내 | 10 |
| 경로·ETA | 10분 이내 | 10 |
| 날씨 | 30분 이내 | 5 |
| 정적 지역위험 | 설정된 버전 유효기간 | 5 |

### 10.5 출처 감점

- Live 또는 검증된 public-derived: 0
- user-entered: 입력별 0~5, 검증 수준에 따름
- mock이 일부 혼합됨: 15
- 전체 Demo fixture: 최소 25를 감점하고 `DEMO` 라벨을 별도 표시

Mock 여부를 신뢰도 라벨만으로 숨기지 않는다.

### 10.6 예측범위 감점

```text
0–30 minutes: 0
31–60 minutes: 5
61–90 minutes: 10
91–120 minutes: 15
```

### 10.7 신뢰도 라벨

| 점수 | 라벨 |
|---:|---|
| `80–100` | `HIGH` |
| `60–79` | `MEDIUM` |
| `0–59` | `LOW` |

Demo fixture는 입력이 완전하더라도 화면에서 `Live HIGH`처럼 표현하지 않는다. 계산 일관성의 신뢰도와 실제 데이터 출처를 별도 표시한다.

### 10.8 결측 대체 원칙

- 대체 가능한 입력만 설정파일의 명시된 값으로 대체한다.
- 대체값, 이유와 영향 범주를 `assumptions`에 기록한다.
- 위험 관련 결측을 낙관적인 최솟값으로 대체하지 않는다.
- 결측이 계산을 차단하면 마지막 정상 결과를 현재 결과처럼 재사용하지 않는다.

## 11. 개입 평가에 제공하는 값

안전모델은 각 후보 계획에 대해 다음 값을 동일한 방식으로 계산한다.

```text
postActionCurrentBudget
minimumForecastBudget
postActionBand
breachPrediction
safetyGain = candidate minimum budget - baseline minimum budget
breachDelayMinutes
contributionDelta
confidence
```

`safetyGain`이 양수면 기준 계획보다 최소 Budget이 개선된 것이다. 후보가 예측 초과를 없애면 `breachDelayMinutes`를 임의의 무한값으로 만들지 않고 `BREACH_AVOIDED` 상태로 표시한다.

후보 실행 가능성과 추천 순위는 `docs/intervention-policy.md`가 소유한다. 안전모델은 ETA·운영복잡도·동의 상태로 후보를 추천하지 않는다.

## 12. 설정 버전 관리

실제 구현에서는 다음 값을 코드와 분리한 버전 설정파일로 관리한다.

- Budget 초기값과 임계치
- 위험 밴드 경계
- 정규화 범위
- 범주별 가중치
- 상호작용 가중치
- 회복 함수와 상한
- 최신성 허용시간과 신뢰도 감점
- 예측 구간과 계산 간격

설정파일은 최소 다음 메타데이터를 포함한다.

```ts
type SafetyModelConfigMetadata = {
  modelVersion: string;
  configVersion: string;
  status: "draft" | "approved" | "superseded";
  effectiveFrom: string;
  rationale: string;
  limitations: string[];
};
```

가중치나 임계치를 변경하면 모델 버전 또는 설정 버전을 올리고 세 대표 fixture의 회귀 결과를 검토한다. 데모 숫자를 맞추기 위해 설명 없이 개별 fixture에 예외 가중치를 넣지 않는다.

## 13. 필수 불변조건

다음 조건은 모든 입력과 개입 계산에서 유지되어야 한다.

1. Budget은 항상 0~100 범위다.
2. Exposure와 Recovery는 음수가 아니다.
3. 동일 조건에서 연속작업시간 증가는 Budget을 개선하지 않는다.
4. 동일 조건에서 누적근무시간 증가는 Budget을 개선하지 않는다.
5. 동일 조건에서 남은 작업량 증가는 Budget을 개선하지 않는다.
6. 동일 조건에서 강수·적설·폭염·저시정 증가는 Budget을 개선하지 않는다.
7. 동일 조건에서 경사·좁은 도로·검증된 지역위험 증가는 Budget을 개선하지 않는다.
8. 동일 조건에서 권역 익숙도 감소는 Budget을 개선하지 않는다.
9. 유효한 휴식시간 증가는 Recovery를 감소시키지 않는다.
10. 결측 입력 증가는 신뢰도를 높이지 않는다.
11. 표시 반올림은 임계치 판정을 바꾸지 않는다.
12. 설명 계층의 문구 변화는 Budget·기여도·초과예측을 바꾸지 않는다.
13. 이벤트 분할 방식이 동일한 총 지속시간과 특징에서 유의미하게 다른 결과를 만들지 않는다.
14. 미래 정보를 현재 Budget 계산에 누출하지 않는다.

## 14. 필수 테스트 하네스

### 14.1 단위 테스트

- `clip` 경계 0과 100
- 각 정규화 함수의 최소·경계·최대·범위 밖 값
- 위험 밴드 경계 `60`, `45`, `30`
- 5분·10분·15분·30분 휴식 회복값
- Time-to-Breach 교차와 보간
- 무초과·이미 초과·계산불가 상태
- 기여도 합계 보존
- 신뢰도 감점과 라벨 경계

### 14.2 단조성 속성 테스트

각 위험 입력을 하나씩 증가시키며 Budget이 증가하지 않는지 반복 검증한다. 휴식은 반대 방향을 검증한다.

### 14.3 메타모픽 테스트

- 같은 60분 이벤트를 12×5분과 6×10분으로 나눠도 허용 오차 안에서 결과가 같다.
- 동일 계획의 표시 언어를 바꿔도 계산 결과가 같다.
- 배송지 이름과 기사 가명 변경이 결과를 바꾸지 않는다.
- 선택형 생체 입력을 제거해도 신뢰도 감점이 발생하지 않는다.

### 14.4 시나리오 회귀 테스트

- 시나리오 A: 우천·경사·장시간 작업과 첫 예상 초과
- 시나리오 B: 폭염·중량·계단과 휴식 회복
- 시나리오 C: 야간·낯선 권역과 안전경로 효과

정확한 예상값은 `docs/data-contracts.md`의 fixtures가 확정된 뒤 이 문서와 `docs/evals.md`에 기록한다.

### 14.5 민감도 분석

세 대표 시나리오에서 한 번에 하나의 입력만 변화시키고 Budget, 최소 예측 Budget과 Time-to-Breach 변화를 표 또는 차트로 생성한다.

최소 분석 입력:

- 연속작업시간
- 강수량
- 남은 배송건수
- 계단 배송건수
- 휴식시간
- 수신 기사에게 이관하는 배송건수

결과는 `simulation`으로 표시하고 실제 사고위험 변화로 해석하지 않는다.

## 15. UI 표현 규칙

- 현재 Budget만 큰 숫자로 단독 표시하지 않는다.
- Budget 범위, 밴드, Safe-until, 예상 초과 배송지와 신뢰도를 함께 표시한다.
- `34%`를 표시할 경우 `안전여유 지수 34/100` 또는 동등한 설명을 제공한다.
- 기여도는 비난이 아닌 작업·환경 중심 문구로 표시한다.
- 신뢰도 옆에 결측 입력과 데이터 모드를 확인할 수 있는 경로를 둔다.
- 임계치 초과 예상은 현재 이미 위험하다는 표현과 구분한다.
- 빨강은 내부 Budget이 실제로 30 미만인 상태에만 사용한다.
- Demo fixture 결과에는 지속적으로 Mock/Demo 배지를 표시한다.

권장 예시:

> 현재 안전여유는 `지원 필요` 범위입니다. 현재 계획을 유지하면 약 52분 후 17번째 남은 배송지에서 임계치를 넘을 것으로 예상됩니다. 입력 신뢰도는 중간이며 수면 데이터는 사용하지 않았습니다.

수면·웨어러블이 선택형인 정책이 확정되면 이를 `결측`이 아니라 `사용하지 않은 선택 데이터`로 표현한다.

## 16. 감사와 재현 정보

각 계산 결과에는 최소 다음을 저장한다.

- 평가 시각과 기준 시간대
- 모델·설정 버전
- 입력 데이터 버전 또는 해시
- 입력별 출처와 최신시각
- 적용한 대체값과 가정
- 계산 간격과 예측 구간
- 현재 및 미래 Budget
- 기여도와 Recovery
- 임계치·밴드 판정
- 신뢰도 계산 내역

원시 개인정보 대신 재현에 필요한 비식별 입력 스냅샷 또는 안전한 해시를 사용한다.

## 17. 모델 한계

- v1 가중치와 임계치는 현장 사고 라벨로 보정되지 않았다.
- 기사 개인별 신체 차이와 장기 적응을 모델링하지 않는다.
- 교통·날씨·배송시간 예측 오차가 미래 Budget에 전파된다.
- 작업 부하의 중량·계단 정보가 없으면 추정 오차가 커질 수 있다.
- Near-miss 집계는 신고 편향과 검증 지연을 포함할 수 있다.
- Time-to-Breach는 계획과 입력이 유지된다는 조건부 예측이다.
- Budget 차이는 실제 사고위험 차이로 직접 변환할 수 없다.
- v1의 수치는 대안 비교와 폐루프 검증을 위한 시뮬레이션 값이다.

이 한계는 결과 화면, 평가 보고서와 발표자료에서 숨기지 않는다.

## 18. 확정된 결정

- Budget은 높을수록 안전여유가 큰 0~100 운영지수다.
- 근무 시작 기준값은 v1에서 100이다.
- 핵심 임계치는 내부 Budget 30 미만이다.
- 30~45는 `지원 필요`, 45~60은 `주의`, 60 이상은 `안정`으로 시작한다.
- 계산 간격은 최대 5분이며 예측 구간은 최대 120분이다.
- 연속작업·누적근무·작업·경로·날씨·상호작용을 분리한다.
- 유효한 휴식만 Recovery로 처리한다.
- 선택형 DMS·웨어러블 부재는 신뢰도를 낮추지 않는다.
- 신뢰도는 사고예측 정확도가 아니라 입력 품질을 나타낸다.
- 임계치 판정에는 반올림 전 값을 사용한다.
- 가중치와 임계치는 코드 밖의 버전 설정으로 관리한다.

## 19. 미결사항

- v1 정규화 범위와 가중치의 최종 승인
- 5분 계산 간격에서 사건 노출을 배분하는 정확한 방식
- 시간창 압박 특징의 정의와 중복계산 방지
- 휴식장소 품질을 확인하는 데이터 출처
- 내리막·미끄럼·후진 위험을 분리할지 여부
- 기상 예측의 공간·시간 보간 방식
- 실제 데이터가 있을 때 기준값 100을 유지할지 여부
- 시나리오 A의 `현재 34`, `52분`, `17번째 배송지` 재현 fixture
- 시나리오별 기대 기여도와 개입 후 결과
- 현장 전문가 검토와 사용자에게 가장 이해하기 쉬운 밴드 명칭

이 문서가 `Approved`가 되기 전까지 수치와 가중치는 구현의 확정 기준이 아니다.
