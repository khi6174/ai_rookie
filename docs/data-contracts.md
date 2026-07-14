# SafeRoute AI 데이터 계약

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-14
- 계약 버전: `contracts-v1.0.0`
- 상위 문서: `AGENTS.md`, `docs/product-spec.md`, `docs/safety-model.md`, `docs/intervention-policy.md`

## 1. 목적

이 문서는 SafeRoute AI의 도메인 객체, API 경계, 저장 스냅샷과 결정론적 fixture에 사용하는 필드·타입·단위·검증 규칙을 정의한다.

목표는 다음과 같다.

- 같은 개념이 화면·엔진·API마다 다른 의미로 사용되는 것을 막는다.
- Live, Mock, Loading, Error와 Fallback을 데이터 수준에서 구분한다.
- 단위, 시간대, 출처, 결측과 가정을 항상 추적한다.
- 실제 개인식별정보와 원시 생체정보가 fixtures·로그·관리자 화면으로 유입되는 것을 막는다.
- Safety Budget과 개입 결과를 결정 ID와 버전으로 재현할 수 있게 한다.
- 잘못된 음수 작업량, 불가능한 시간, 무효한 이관을 시스템 경계에서 거부한다.

이 문서의 TypeScript는 구현 계약을 설명하는 기준이며 아직 실제 코드가 아니다. 구현 시 Zod 스키마가 런타임 검증의 단일 소스가 되고 TypeScript 타입은 스키마에서 추론한다.

## 2. 공통 표현 규칙

### 2.1 명명

- JSON 필드: `camelCase`
- enum 값: `SCREAMING_SNAKE_CASE`
- ID: 의미 없는 불투명 문자열
- 버전: 의미적 버전 또는 변경 불가능한 버전 ID
- 수치 필드: 단위를 필드명에 포함

예:

```text
continuousWorkMinutes
rainfallMmPerHour
totalRemainingWeightKg
etaDeltaMinutes
```

`duration`, `weight`, `temperature`처럼 단위가 불명확한 필드는 금지한다.

### 2.2 시간

- 모든 저장·API 시각은 시간대 오프셋을 포함한 ISO 8601 문자열이다.
- 계산 직전 UTC instant로 정규화한다.
- 야간 판정과 사용자 표시에는 `timeZone`의 IANA 이름을 사용한다.
- 시간만 있고 날짜가 없는 값은 허용하지 않는다.
- 종료시각은 시작시각보다 빨라서는 안 된다.
- 예측 결과의 `evaluatedAt` 이후 시각은 과거가 될 수 없다.

```ts
type IsoDateTime = string; // example: 2026-07-14T16:20:00+09:00
type IanaTimeZone = string; // example: Asia/Seoul
```

### 2.3 수치

- `NaN`, `Infinity`, `-Infinity`를 금지한다.
- 카운트는 0 이상의 정수다.
- 지속시간·거리·중량·강수량은 0 이상이다.
- 위도·경도는 별도의 범위 검사를 통과해야 한다.
- Safety Budget은 0~100의 유한수다.
- 신뢰도 점수는 0~100의 유한수다.
- 비율은 별도 명시가 없으면 0~1이다.

### 2.4 ID

MVP의 모든 ID는 최소 3자, 최대 100자의 불투명 문자열이다. 기사 이름, 전화번호, 차량번호, 주소 또는 주민번호를 ID에 포함하지 않는다.

```ts
type CourierId = string;
type StopId = string;
type SegmentId = string;
type RouteId = string;
type PlanId = string;
type DecisionId = string;
type CandidateId = string;
type ReportId = string;
```

fixtures에서는 `courier-a`, `stop-017` 같은 합성 ID를 사용한다.

### 2.5 버전 필드

계산·결정 객체에는 관련 버전을 포함한다.

```ts
type VersionContext = {
  contractsVersion: string;
  safetyModelVersion: string;
  safetyConfigVersion: string;
  interventionPolicyVersion: string;
  planVersion: string;
};
```

버전이 다른 객체를 조용히 결합하지 않는다.

## 3. 출처와 데이터 상태

### 3.1 Provenance

```ts
type ProvenanceKind =
  | "LIVE"
  | "PUBLIC_DATA_DERIVED"
  | "USER_ENTERED"
  | "MOCK"
  | "DERIVED";

type Provenance = {
  kind: ProvenanceKind;
  sourceId: string;
  sourceLabel: string;
  collectedAt: IsoDateTime;
  validAt: IsoDateTime;
  transformedBy?: string;
  parentSourceIds?: string[];
  licenseOrPolicy?: string;
  isDemo: boolean;
};
```

#### 규칙

- `MOCK`이면 `isDemo`는 반드시 `true`다.
- `LIVE`이면 `isDemo`는 반드시 `false`다.
- `DERIVED`는 하나 이상의 `parentSourceIds`가 있어야 한다.
- `validAt`은 해당 값이 나타내는 현실 시각이다.
- `collectedAt`은 시스템이 값을 받은 시각이다.
- 여러 출처를 결합한 객체는 필드별 출처 또는 `parentSourceIds`를 보존한다.

### 3.2 데이터 상태 판별 합집합

모든 외부 데이터와 비동기 계산은 다음 형태를 사용한다.

```ts
type DataResult<T> =
  | {
      status: "LOADING";
      requestedAt: IsoDateTime;
      previous?: T;
    }
  | {
      status: "LIVE";
      data: T;
      receivedAt: IsoDateTime;
      provenance: Provenance;
    }
  | {
      status: "MOCK";
      data: T;
      fixtureId: string;
      provenance: Provenance;
    }
  | {
      status: "FALLBACK";
      data: T;
      fallbackReason: DataError;
      fixtureId: string;
      provenance: Provenance;
    }
  | {
      status: "ERROR";
      error: DataError;
      lastSuccessfulAt?: IsoDateTime;
    };
```

```ts
type DataError = {
  code:
    | "NETWORK_ERROR"
    | "TIMEOUT"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | "MALFORMED_RESPONSE"
    | "SCHEMA_VALIDATION_FAILED"
    | "NOT_FOUND"
    | "STALE_DATA"
    | "UNKNOWN";
  message: string;
  retryable: boolean;
  occurredAt: IsoDateTime;
  sourceId?: string;
};
```

#### 규칙

- `FALLBACK`은 `MOCK`과 동일한 fixture를 사용할 수 있지만 실패 이유를 반드시 포함한다.
- `ERROR`에 정상 데이터 필드를 넣지 않는다.
- `LOADING.previous`는 화면 연속성에만 사용할 수 있으며 새 계산의 현재 입력으로 조용히 사용하지 않는다.
- UI는 `status`를 통해 Live와 Demo를 항상 구분한다.

## 4. 공통 값 객체

### 4.1 결측 입력

```ts
type MissingInput = {
  field: string;
  category: "BLOCKING" | "REQUIRED" | "OPTIONAL";
  reason: "ABSENT" | "STALE" | "INVALID" | "NOT_COLLECTED";
  assumptionUsed?: string;
  confidencePenalty: number;
};
```

선택형 웨어러블·DMS 정보가 수집되지 않은 경우 `OPTIONAL`, `NOT_COLLECTED`, 감점 `0`으로 기록하거나 사용자 화면에서는 `사용하지 않음`으로 분리한다.

### 4.2 위치

```ts
type GeoPoint = {
  latitude: number;  // -90..90
  longitude: number; // -180..180
};

type CoarseLocation = {
  geohash: string;
  precision: number;
  areaId: string;
};
```

관리자 Near-miss 화면과 감사기록에는 원칙적으로 `CoarseLocation`을 사용한다. 정확한 `GeoPoint`는 경로계산의 일시적 입력으로만 사용할 수 있으며 보존정책은 `privacy-and-ai-policy.md`에서 정한다.

### 4.3 시간창

```ts
type TimeWindow = {
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  kind: "HARD" | "SOFT";
};
```

- `endsAt > startsAt`
- `HARD` 위반 후보는 실행 불가다.
- `SOFT` 위반은 고객영향과 경고에 반영한다.

### 4.4 용량

```ts
type Load = {
  stopCount: number;
  totalWeightKg?: number;
  totalVolumeLiters?: number;
};

type Capacity = {
  maxStops?: number;
  maxWeightKg?: number;
  maxVolumeLiters?: number;
};
```

존재하는 용량 차원은 모두 검사한다. 중량 데이터가 없다고 적재 가능으로 단정하지 않는다.

## 5. CourierState

기사 개인의 현재 운영상 상태를 나타낸다. 실제 이름, 연락처, 고용평가와 원시 생체정보를 포함하지 않는다.

```ts
type CourierState = {
  courierId: CourierId;
  stateVersion: string;
  evaluatedAt: IsoDateTime;
  timeZone: IanaTimeZone;

  shiftStartedAt: IsoDateTime;
  allowedShiftEndAt: IsoDateTime;
  continuousWorkStartedAt: IsoDateTime;
  lastConfirmedRest?: {
    startedAt: IsoDateTime;
    endedAt: IsoDateTime;
    quality: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  };

  areaFamiliarity: "FAMILIAR" | "PARTIAL" | "UNFAMILIAR" | "UNKNOWN";
  vehicleClass: "WALK" | "BICYCLE" | "MOTORCYCLE" | "VAN" | "TRUCK";
  capacity: Capacity;

  optionalDerivedSignals?: {
    selfCheckFactor?: number; // 0..1, higher means more exposure
    dmsEventFactor?: number;  // 0..1, derived only
    wearableStateFactor?: number; // 0..1, derived only
  };

  consentCapabilities: {
    canReceivePrompt: boolean;
    isStopped: boolean;
    offline: boolean;
  };

  provenance: Provenance[];
};
```

### 검증

- `shiftStartedAt <= continuousWorkStartedAt <= evaluatedAt`
- `allowedShiftEndAt > shiftStartedAt`
- 마지막 휴식의 종료는 시작보다 늦고 `evaluatedAt`보다 늦을 수 없다.
- 파생 신호는 0~1이다.
- 원시 심박, HRV, 수면단계, 얼굴영상 필드는 허용하지 않는다.
- `isStopped: false`이면 긴 동의 입력과 Near-miss 텍스트 입력을 시작할 수 없다.

### 필드 근거

- `continuousWorkStartedAt`: 연속작업 노출 계산
- `allowedShiftEndAt`: 개입 후 종료시각 하드 제약
- `areaFamiliarity`: 낯선 권역 시나리오
- `optionalDerivedSignals`: 선택형 파생값만 허용하는 개인정보 경계
- `consentCapabilities`: 정차·오프라인 상태에서 안전한 상호작용 제어

## 6. WorkloadState

현재 확정 계획에 남은 작업량과 기사별 적재 상태를 나타낸다.

```ts
type WorkloadState = {
  courierId: CourierId;
  planId: PlanId;
  planVersion: string;
  evaluatedAt: IsoDateTime;

  remainingStopIds: StopId[];
  completedStopCount: number;
  failedStopCount: number;
  remainingLoad: Load;
  onboardLoad: Load;
  stairStopsRemaining?: number;
  atRiskHardTimeWindowCount: number;
  atRiskSoftTimeWindowCount: number;
  projectedEndAt: IsoDateTime;

  provenance: Provenance[];
};
```

### 검증

- 모든 카운트와 Load 값은 0 이상이다.
- `remainingLoad.stopCount === remainingStopIds.length`
- 같은 `stopId`가 중복되면 안 된다.
- `stairStopsRemaining <= remainingStopIds.length`
- `projectedEndAt >= evaluatedAt`
- `failedStopCount`를 남은 작업으로 자동 재포함하지 않는다.

### 필드 근거

- 배열과 카운트를 함께 두어 외부 시스템 불일치를 검증한다.
- `onboardLoad`는 물량이관의 현재 적재 가능성을 검사한다.
- 시간창 위험 카운트는 작업압박 특징과 개입 경고에 사용한다.

## 7. WeatherState

현재 또는 특정 예측 시각의 환경 상태다.

```ts
type WeatherState = {
  areaId: string;
  observedOrForecastAt: IsoDateTime;
  kind: "OBSERVATION" | "FORECAST";

  rainfallMmPerHour: number;
  snowfallCmPerHour: number;
  feelsLikeCelsius: number;
  visibilityMeters: number;
  windSpeedMetersPerSecond?: number;
  roadSurface: "DRY" | "WET" | "SNOW" | "ICE" | "UNKNOWN";

  provenance: Provenance;
};
```

### 검증

- 강수·적설·시정·풍속은 0 이상이다.
- 체감온도는 v1 허용 범위 `-40..60°C`다. 벗어나면 오류다.
- `visibilityMeters`의 v1 상한은 100000이다.
- `FORECAST`를 관측값으로 표시하지 않는다.

### 필드 근거

현재 날씨 하나를 전체 미래에 복제하지 않고 시각별 배열로 제공할 수 있도록 단일 시점 객체로 정의한다.

## 8. AreaRiskProfile

개인 궤적이 아닌 지역·구간 단위의 검증된 위험 특징이다.

```ts
type AreaRiskProfile = {
  areaId: string;
  profileVersion: string;
  validFrom: IsoDateTime;
  validUntil?: IsoDateTime;

  narrowRoadFactor: number;      // 0..1
  parkingDifficultyFactor: number; // 0..1
  incidentFactor: number;        // 0..1
  backwardManeuverFactor?: number; // 0..1

  nearMissMemory?: {
    validatedReportCount: number;
    decayedRiskFactor: number; // 0..1
    lastValidatedAt?: IsoDateTime;
    weatherInteractionTags: Array<"RAIN" | "SNOW" | "HEAT" | "NIGHT">;
  };

  provenance: Provenance[];
};
```

### 검증

- 모든 factor는 0~1이다.
- `validUntil`이 있으면 `validUntil > validFrom`이다.
- `validatedReportCount`는 0 이상의 정수다.
- 검증되지 않은 신고는 `incidentFactor`에 포함하지 않는다.
- 신고자 ID나 정확한 궤적을 포함하지 않는다.

## 9. RouteSegment

두 지점 사이의 이동 구간과 해당 구간의 위험 특징을 나타낸다.

```ts
type RouteSegment = {
  segmentId: SegmentId;
  routeId: RouteId;
  sequence: number;
  fromStopId?: StopId;
  toStopId: StopId;

  expectedStartAt: IsoDateTime;
  expectedEndAt: IsoDateTime;
  durationMinutes: number;
  distanceMeters: number;

  uphillGradePct: number;
  roadWidthClass: "WIDE" | "NORMAL" | "NARROW" | "VERY_NARROW";
  areaRiskProfileId: string;
  legalForVehicleClasses: CourierState["vehicleClass"][];
  routeAlternativeKind: "FASTEST" | "SAFER" | "CURRENT";

  provenance: Provenance[];
};
```

### 검증

- `sequence`는 0 이상의 정수다.
- `expectedEndAt > expectedStartAt`
- `durationMinutes > 0`, `distanceMeters >= 0`
- 타임스탬프 차이와 `durationMinutes`의 오차는 v1에서 1분 이하여야 한다.
- `uphillGradePct`는 `-30..30`이다. 안전모델 v1은 양의 오르막만 slope 특징으로 사용한다.
- 허용 차량 목록은 비어 있을 수 없다.
- 같은 경로의 sequence는 중복될 수 없다.

## 10. DeliveryStop

배송작업 한 건의 운영 속성을 나타낸다. 실제 고객 이름, 전화번호와 전체 주소는 포함하지 않는다.

```ts
type DeliveryStop = {
  stopId: StopId;
  planId: PlanId;
  assignedCourierId: CourierId;
  sequence: number;

  areaId: string;
  coarseLocation: CoarseLocation;
  expectedArrivalAt: IsoDateTime;
  expectedServiceMinutes: number;
  timeWindow?: TimeWindow;

  load: {
    weightKg?: number;
    volumeLiters?: number;
  };
  access: {
    floor?: number;
    elevator: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
    parkingDifficultyFactor: number;
  };
  priority: "LOW" | "NORMAL" | "HIGH" | "NON_DELAYABLE";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "DELAYED" | "TRANSFERRED";

  provenance: Provenance[];
};
```

### 검증

- `sequence`는 0 이상의 정수다.
- 예상 서비스시간은 `1..180분`이다.
- 중량·부피는 있으면 0 이상이다.
- `floor`는 `-5..100` 범위의 정수다.
- 주차 난이도는 0~1이다.
- `NON_DELAYABLE`은 Safe Delay 대상이 될 수 없다.
- `COMPLETED` 배송지는 남은 계획과 이관 후보에 포함될 수 없다.
- 고객 개인식별정보와 전체 주소를 금지한다.

## 11. SafetyBudgetSnapshot

특정 계획·시점에 대한 안전모델의 불변 출력이다.

```ts
type RiskBand = "STABLE" | "CAUTION" | "SUPPORT_NEEDED" | "BREACHED";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

type SafetyBudgetPoint = {
  at: IsoDateTime;
  budget: number;
  band: RiskBand;
  eventType: "CURRENT" | "TRAVEL" | "SERVICE" | "REST" | "PLAN_END";
  stopId?: StopId;
  segmentId?: SegmentId;
};

type BreachPrediction =
  | {
      status: "PREDICTED";
      timeToBreachMinutes: number;
      predictedAt: IsoDateTime;
      stopIndex: number;
      stopId: StopId;
      segmentId?: SegmentId;
      budgetAtBreach: number;
    }
  | {
      status: "NO_BREACH_IN_HORIZON";
      forecastEndAt: IsoDateTime;
      minimumForecastBudget: number;
    }
  | {
      status: "ALREADY_BREACHED";
      detectedAt: IsoDateTime;
      currentBudget: number;
    }
  | {
      status: "INSUFFICIENT_DATA";
      blockingInputs: string[];
    };

type SafetyBudgetSnapshot = {
  snapshotId: string;
  courierId: CourierId;
  planId: PlanId;
  evaluatedAt: IsoDateTime;
  versionContext: VersionContext;

  currentBudget: number;
  currentBand: RiskBand;
  minimumForecastBudget?: number;
  forecast: SafetyBudgetPoint[];
  breach: BreachPrediction;
  contributions: RiskContribution[];

  confidenceScore: number;
  confidence: ConfidenceLevel;
  missingInputs: MissingInput[];
  assumptions: string[];
  provenance: Provenance[];
};
```

### 검증

- 모든 Budget은 0~100이다.
- 밴드는 반올림 전 Budget과 safety-model의 경계에 일치해야 한다.
- forecast 시각은 오름차순이며 첫 점은 `evaluatedAt`보다 빠르지 않다.
- `minimumForecastBudget`은 forecast의 최솟값과 허용 오차 안에서 일치한다.
- `PREDICTED`의 `predictedAt`은 forecast 구간 안에 있다.
- `NO_BREACH_IN_HORIZON`이면 forecast에 30 미만 값이 없어야 한다.
- `ALREADY_BREACHED`이면 `currentBudget < 30`이다.
- `INSUFFICIENT_DATA`이면 `blockingInputs`가 비어 있을 수 없다.
- `confidenceScore`와 라벨은 안전모델 경계에 일치한다.

## 12. RiskContribution

Budget 소진 또는 회복의 결정론적 분해다.

```ts
type RiskContribution = {
  contributionId: string;
  category: "DRIVER" | "TASK" | "ROUTE" | "WEATHER" | "INTERACTION" | "RECOVERY";
  code: string;
  labelKey: string;
  interval: "CURRENT" | "FORECAST" | "INTERVENTION_DELTA";

  budgetPointsConsumed: number;
  budgetPointsRecovered: number;
  rawInputs: Array<{
    field: string;
    value: number | string | boolean;
    unit?: string;
  }>;
  rationale: string;
  provenanceIds: string[];
};
```

### 검증

- 소진·회복점수는 0 이상이다.
- 한 항목에서 소진과 회복을 동시에 0보다 크게 둘 수 없다.
- `RECOVERY`가 아닌 항목은 기본적으로 회복점수가 0이다.
- `RECOVERY` 항목은 소진점수가 0이다.
- 기여도 합은 snapshot 총 Exposure·Recovery와 반올림 오차 안에서 일치해야 한다.
- `rationale`은 설정 근거이며 LLM이 생성한 자유문이 아니다.

## 13. InterventionCandidate

아직 평가되지 않은 정규화된 조치 조합이다.

```ts
type InterventionAction =
  | {
      type: "REST";
      restMinutes: 10 | 15 | 20 | 30;
      restLocationId: string;
      plannedStartAt: IsoDateTime;
    }
  | {
      type: "TRANSFER_STOPS";
      sourceCourierId: CourierId;
      recipientCourierId: CourierId;
      stopIds: StopId[];
      handoffLocationId: string;
      plannedHandoffAt: IsoDateTime;
    }
  | {
      type: "REORDER_STOPS";
      courierId: CourierId;
      orderedStopIds: StopId[];
    }
  | {
      type: "SAFER_ROUTE";
      courierId: CourierId;
      replacementRouteId: RouteId;
      replacedSegmentIds: SegmentId[];
    }
  | {
      type: "SAFE_DELAY";
      courierId: CourierId;
      stopIds: StopId[];
      delayedUntil: IsoDateTime;
    };

type InterventionCandidate = {
  candidateId: CandidateId;
  decisionId: DecisionId;
  baselinePlanId: PlanId;
  baselinePlanVersion: string;
  generatedAt: IsoDateTime;
  generatorVersion: string;

  actions: InterventionAction[];
  affectedCourierIds: CourierId[];
  affectedStopIds: StopId[];
  generationReasons: string[];
};
```

### 검증

- actions는 1개 이상, v1에서 최대 2개다.
- 같은 유형을 중복할 수 없다.
- 영향을 받는 ID 집합은 actions에서 계산한 집합과 일치한다.
- 이관 stopIds는 비어 있을 수 없고 중복될 수 없다.
- 이관 원 기사와 수신 기사는 달라야 한다.
- 순서변경 목록은 기준 계획의 같은 배송지 집합이어야 한다.
- Safe Delay는 `delayedUntil`이 기존 ETA보다 늦어야 한다.
- 후보 ID는 정규화 actions와 정책 버전에서 결정론적으로 생성한다.

## 14. InterventionEvaluation

후보의 안전·운영·동의 평가 결과다.

```ts
type PolicyReason = {
  code: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  subjectType: "COURIER" | "STOP" | "ROUTE" | "CUSTOMER" | "SYSTEM";
  subjectId?: string;
  messageKey: string;
  evidenceFields: string[];
};

type Feasibility =
  | { status: "FEASIBLE"; warnings: PolicyReason[] }
  | { status: "INFEASIBLE"; reasons: PolicyReason[] }
  | { status: "NEEDS_DATA"; blockingInputs: string[] };

type CourierImpact = {
  courierId: CourierId;
  role: "SOURCE" | "RECIPIENT" | "AFFECTED";
  baselineMinimumBudget: number;
  candidateMinimumBudget: number;
  budgetDelta: number;
  workMinutesDelta: number;
  stopCountDelta: number;
  projectedEndAt: IsoDateTime;
  breach: BreachPrediction;
};

type ConsentRequirement = {
  courierId: CourierId;
  required: boolean;
  status: "NOT_REQUESTED" | "PENDING" | "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED" | "EXPIRED";
  respondedAt?: IsoDateTime;
  candidateId: CandidateId;
};

type InterventionEvaluation = {
  evaluationId: string;
  candidateId: CandidateId;
  decisionId: DecisionId;
  evaluatedAt: IsoDateTime;
  versionContext: VersionContext;

  feasibility: Feasibility;
  baselineSnapshotId: string;
  candidateSnapshotIds: string[];

  safetyGain: number;
  breachOutcome: "UNCHANGED" | "DELAYED" | "AVOIDED" | "INTRODUCED";
  breachDelayMinutes?: number;
  etaDeltaMinutes: number;
  maxCustomerEtaDeltaMinutes: number;
  affectedCustomerCount: number;
  operationalComplexity: number;
  fairnessPenaltyScore: number;
  customerImpactScore: number;
  recommendationScore?: number;
  rank?: number;

  courierImpacts: CourierImpact[];
  consentRequirements: ConsentRequirement[];
  reasons: PolicyReason[];
};
```

### 검증

- Budget, 복잡도, 형평성, 고객영향 점수는 각각 정의된 범위다.
- `recommendationScore`와 `rank`는 `FEASIBLE` 후보에만 존재한다.
- `INFEASIBLE`은 최소 한 개의 `BLOCKING` reason을 가진다.
- `NEEDS_DATA`의 blockingInputs는 비어 있을 수 없다.
- 초과가 남으면 `FEASIBLE`이 될 수 없다.
- 이관 수신 기사의 최소 Budget은 45 이상, 기준 대비 감소는 15 이하이어야 한다.
- 모든 영향 기사는 courierImpacts에 정확히 한 번 등장한다.
- `breachOutcome: DELAYED`이지만 초과가 남으면 실행 불가다.

## 15. DecisionRecord

히어로 루프의 전체 상태와 감사정보를 연결하는 레코드다.

```ts
type DecisionStatus =
  | "BASELINE_EVALUATED"
  | "CANDIDATES_GENERATED"
  | "CANDIDATES_EVALUATED"
  | "RIDER_REVIEW_REQUIRED"
  | "RIDER_RESPONSE_PENDING"
  | "RIDER_CONSENTED"
  | "MODIFICATION_REQUESTED"
  | "RIDER_DECLINED"
  | "ADMIN_APPROVAL_REQUIRED"
  | "ADMIN_HELD"
  | "ADMIN_MODIFICATION_REQUESTED"
  | "APPROVED"
  | "REVALIDATING"
  | "REVALIDATION_REQUIRED"
  | "APPLYING_PLAN"
  | "APPLIED"
  | "APPLY_FAILED"
  | "NOTICE_RECORDED"
  | "CANCELLED"
  | "CLOSED";

type DecisionEvent = {
  eventId: string;
  at: IsoDateTime;
  actor: "SYSTEM" | "COURIER" | "ADMIN";
  actorId?: string;
  fromStatus?: DecisionStatus;
  toStatus: DecisionStatus;
  reasonCode: string;
  evidenceIds: string[];
};

type DecisionRecord = {
  decisionId: DecisionId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  status: DecisionStatus;
  dataMode: "LIVE" | "MOCK" | "FALLBACK";

  baselinePlanId: PlanId;
  baselinePlanVersion: string;
  baselineSnapshotIds: string[];
  candidateIds: CandidateId[];
  evaluationIds: string[];
  selectedCandidateId?: CandidateId;

  consentRequirements: ConsentRequirement[];
  approvedByAdminId?: string;
  approvedAt?: IsoDateTime;
  appliedPlanVersion?: string;
  customerNoticeIds: string[];

  versionContext: VersionContext;
  events: DecisionEvent[];
};
```

### 검증

- `updatedAt >= createdAt`
- event 시각은 오름차순이다.
- 각 `fromStatus`는 직전 event의 `toStatus`와 일치한다.
- 허용되지 않은 상태 전이를 거부한다.
- 선택 후보는 candidateIds에 존재해야 한다.
- `APPROVED` 이후에는 선택 후보와 필수 동의가 모두 있어야 한다.
- `APPLIED` 이후에는 appliedPlanVersion이 있어야 한다.
- `NOTICE_RECORDED` 이후에는 고객안내 ID가 최소 하나 있어야 한다.
- Demo 사전동의는 actor와 reasonCode로 실제 동의와 구분한다.

## 16. NearMissReport

정차 상태에서 제출되는 근접사고 신고와 검증 상태다.

```ts
type NearMissReport = {
  reportId: ReportId;
  reportedAt: IsoDateTime;
  reporterCourierId: CourierId;
  decisionId?: DecisionId;

  category:
    | "SLIP"
    | "NARROW_ROAD"
    | "BACKWARD_MANEUVER"
    | "PARKING_CONFLICT"
    | "STAIRS"
    | "VISIBILITY"
    | "VEHICLE_CONFLICT"
    | "OTHER";
  severity: "LOW" | "MEDIUM" | "HIGH";
  note?: string;
  location: CoarseLocation;
  weatherTag?: "RAIN" | "SNOW" | "HEAT" | "NIGHT" | "NONE";

  submittedWhileStopped: boolean;
  offlineCreated: boolean;
  syncedAt?: IsoDateTime;
  moderationStatus: "PENDING" | "VALIDATED" | "DUPLICATE" | "REJECTED" | "LOW_CONFIDENCE";
  moderatedAt?: IsoDateTime;
  moderationReasonCode?: string;

  provenance: Provenance;
};
```

### 검증

- `submittedWhileStopped`가 false면 텍스트 note를 포함한 제출을 거부한다.
- note는 선택이며 300자 이하, HTML과 제어문자를 제거한다.
- 위치는 coarse location만 저장한다.
- 오프라인 생성이면 syncedAt은 나중 시각이어야 한다.
- moderation 상태가 `PENDING`이 아니면 moderatedAt이 필요하다.
- `VALIDATED`만 미래 지역위험에 반영할 수 있다.
- reporterCourierId는 관리자 집계 응답에서 제거한다.
- 신고 직후 신고 기사의 현재 Budget이나 평가에 반영하지 않는다.

## 17. CustomerNotice

실제 적용된 계획의 ETA를 바탕으로 한 고객안내 결과다.

```ts
type CustomerNotice = {
  noticeId: string;
  decisionId: DecisionId;
  stopId: StopId;
  appliedPlanVersion: string;
  generatedAt: IsoDateTime;

  channel: "SMS_PREVIEW" | "ALIMTALK_PREVIEW" | "IN_APP_PREVIEW";
  previousEta?: IsoDateTime;
  updatedEta: IsoDateTime;
  reasonCode: "SAFE_OPERATION_ADJUSTMENT";
  message: string;
  generationMode: "TEMPLATE" | "UPSTAGE_LIVE" | "UPSTAGE_FALLBACK";
  citationIds: string[];

  deliveryStatus: "PREVIEW_ONLY" | "QUEUED" | "SENT" | "FAILED";
  provenance: Provenance[];
};
```

### 검증

- MVP에서는 기본 deliveryStatus가 `PREVIEW_ONLY`다.
- updatedEta는 실제 appliedPlanVersion에 존재하는 ETA와 일치해야 한다.
- 적용 실패한 후보 ETA를 사용할 수 없다.
- message에는 기사 ID, 이름, 건강정보, 거절·동의 내용이 포함될 수 없다.
- 기사 과실·책임을 암시하는 표현을 금지한다.
- LLM 생성문도 updatedEta를 변경할 수 없다.

## 18. ScenarioFixture

대표 데모와 회귀 테스트를 재현하는 최상위 묶음이다.

```ts
type ScenarioFixture = {
  fixtureId: string;
  fixtureVersion: string;
  title: string;
  scenario: "RAINY_HILLY_LONG_SHIFT" | "HEAT_HEAVY_STAIRS" | "NOVICE_NIGHT_UNFAMILIAR";
  description: string;
  timeZone: IanaTimeZone;
  evaluatedAt: IsoDateTime;

  couriers: CourierState[];
  workloads: WorkloadState[];
  weatherTimeline: WeatherState[];
  areaRiskProfiles: AreaRiskProfile[];
  routeSegments: RouteSegment[];
  stops: DeliveryStop[];

  expectedAssertions: {
    currentBudgetRange?: { min: number; max: number };
    breachStatus: BreachPrediction["status"];
    timeToBreachMinutesRange?: { min: number; max: number };
    breachStopId?: StopId;
    feasibleCandidateKinds: string[];
    infeasibleReasonCodes: string[];
    recommendedActionKinds?: string[];
  };

  provenance: Provenance[];
};
```

### 검증

- 모든 참조 ID가 fixture 내부에 존재한다.
- 기사별 WorkloadState가 정확히 하나 존재한다.
- 계획의 배송지 순서와 구간 연결이 일관된다.
- 날씨 타임라인은 예측 구간을 덮는다.
- 모든 provenance는 Mock 또는 public-derived이며 실제 개인정보를 포함하지 않는다.
- expectedAssertions는 엔진 출력을 입력으로 재사용하지 않는다.
- 정확한 기대값을 맞추기 위한 시나리오별 숨은 가중치를 금지한다.

## 19. 대표 시나리오 A 예시

다음은 계약 형태를 보여주는 축약 예시다. 아직 승인된 fixture 값이나 엔진 예상 출력이 아니다.

```json
{
  "fixtureId": "rainy-hilly-v1",
  "fixtureVersion": "1.0.0-draft",
  "title": "우천·경사 빌라·장시간 작업",
  "scenario": "RAINY_HILLY_LONG_SHIFT",
  "description": "관악구를 모사한 합성 배송 시나리오",
  "timeZone": "Asia/Seoul",
  "evaluatedAt": "2026-07-14T15:28:00+09:00",
  "couriers": [
    {
      "courierId": "courier-a",
      "stateVersion": "state-a-001",
      "evaluatedAt": "2026-07-14T15:28:00+09:00",
      "timeZone": "Asia/Seoul",
      "shiftStartedAt": "2026-07-14T06:04:00+09:00",
      "allowedShiftEndAt": "2026-07-14T19:00:00+09:00",
      "continuousWorkStartedAt": "2026-07-14T11:18:00+09:00",
      "areaFamiliarity": "PARTIAL",
      "vehicleClass": "VAN",
      "capacity": {
        "maxStops": 70,
        "maxWeightKg": 300,
        "maxVolumeLiters": 1200
      },
      "consentCapabilities": {
        "canReceivePrompt": true,
        "isStopped": true,
        "offline": false
      },
      "provenance": [
        {
          "kind": "MOCK",
          "sourceId": "fixture-rainy-v1",
          "sourceLabel": "SafeRoute deterministic demo fixture",
          "collectedAt": "2026-07-14T15:28:00+09:00",
          "validAt": "2026-07-14T15:28:00+09:00",
          "isDemo": true
        }
      ]
    }
  ],
  "workloads": [
    {
      "courierId": "courier-a",
      "planId": "plan-rainy-baseline",
      "planVersion": "1",
      "evaluatedAt": "2026-07-14T15:28:00+09:00",
      "remainingStopIds": ["stop-001", "stop-002", "stop-003"],
      "completedStopCount": 28,
      "failedStopCount": 0,
      "remainingLoad": { "stopCount": 3, "totalWeightKg": 21 },
      "onboardLoad": { "stopCount": 3, "totalWeightKg": 21 },
      "stairStopsRemaining": 2,
      "atRiskHardTimeWindowCount": 0,
      "atRiskSoftTimeWindowCount": 1,
      "projectedEndAt": "2026-07-14T18:12:00+09:00",
      "provenance": []
    }
  ],
  "weatherTimeline": [
    {
      "areaId": "area-gwanak-demo-01",
      "observedOrForecastAt": "2026-07-14T15:30:00+09:00",
      "kind": "FORECAST",
      "rainfallMmPerHour": 12,
      "snowfallCmPerHour": 0,
      "feelsLikeCelsius": 29,
      "visibilityMeters": 700,
      "roadSurface": "WET",
      "provenance": {
        "kind": "MOCK",
        "sourceId": "fixture-weather-rainy-v1",
        "sourceLabel": "Synthetic weather timeline",
        "collectedAt": "2026-07-14T15:28:00+09:00",
        "validAt": "2026-07-14T15:30:00+09:00",
        "isDemo": true
      }
    }
  ],
  "areaRiskProfiles": [],
  "routeSegments": [],
  "stops": [],
  "expectedAssertions": {
    "currentBudgetRange": { "min": 30, "max": 40 },
    "breachStatus": "PREDICTED",
    "timeToBreachMinutesRange": { "min": 45, "max": 60 },
    "feasibleCandidateKinds": ["REST", "TRANSFER_STOPS"],
    "infeasibleReasonCodes": ["TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR"]
  },
  "provenance": []
}
```

빈 배열은 축약을 위한 것이므로 이 JSON은 실제 `ScenarioFixture` 검증을 통과하지 않는다. 완전한 fixture인 것처럼 복사해 사용하지 않는다.

## 20. 교차 객체 불변조건

런타임 스키마의 개별 필드 검사만으로 부족한 규칙은 도메인 검증기로 검사한다.

1. 모든 참조 ID가 존재한다.
2. 같은 계획에서 기사별 배송지 sequence가 중복되지 않는다.
3. RouteSegment의 연결 순서가 DeliveryStop 순서와 일치한다.
4. WorkloadState의 남은 배송지 집합이 PENDING·IN_PROGRESS 배송지 집합과 일치한다.
5. 완료 배송지는 이관·지연·재정렬할 수 없다.
6. 기사와 계획의 평가시각·버전이 호환된다.
7. 후보는 생성 당시 baseline planVersion과 일치한다.
8. 평가 결과는 동일 candidateId와 versionContext를 사용한다.
9. 이관 배송지는 원 기사에게 할당되어 있고 수신 기사에게 중복 할당되지 않는다.
10. 이관 후 모든 기사 Load·Capacity 차원을 검사한다.
11. 이관 후 수신 기사 최소 Budget은 45 이상, 감소는 15 이하이다.
12. 모든 필수 동의는 동일 candidateId에 묶인다.
13. 승인 시 현재 planVersion과 후보 baselinePlanVersion이 일치한다.
14. APPLIED 계획의 ETA만 CustomerNotice에 사용한다.
15. Near-miss 검증 결과가 신고자의 현재 snapshot을 소급 변경하지 않는다.
16. Mock과 Live 데이터를 섞으면 결과 상태는 Live가 될 수 없다.

## 21. API 경계 규칙

### 21.1 입력 검증

- 사용자 입력, 외부 API, 문서 추출 JSON과 저장소 읽기 결과를 모두 검증한다.
- 검증 실패 시 부분 객체를 도메인 엔진에 전달하지 않는다.
- 알 수 없는 필드는 외부 경계에서 기본적으로 거부한다.
- 문자열은 앞뒤 공백과 제어문자를 처리하되 의미가 바뀌는 자동수정을 하지 않는다.

### 21.2 출력 검증

- 안전모델, 개입엔진과 Upstage 결과도 저장·응답 전에 검증한다.
- 계산 결과가 계약을 위반하면 fallback 숫자를 만들지 않고 명시적 오류로 전환한다.
- LLM 응답은 전용 출력 스키마를 사용하고 도메인 객체와 병합하지 않는다.

### 21.3 낙관적 기본값 금지

다음 기본값을 금지한다.

- 결측 날씨를 맑음으로 처리
- 결측 경로위험을 0으로 처리
- 결측 수신 기사 용량을 무제한으로 처리
- 응답 없는 동의를 동의로 처리
- 실패한 Live 요청을 배지 없는 Mock으로 처리

## 22. 개인정보와 로그 제한

### 허용

- 합성 기사 ID
- 비식별 계획·배송지·구간 ID
- 거친 위치와 지역 ID
- 파생된 선택형 상태 factor
- 결정 재현에 필요한 비식별 스냅샷

### 금지

- 실제 이름, 전화번호, 주민번호, 계좌, 전체 주소
- 원시 심박, HRV, 수면단계, 얼굴·음성·주행 영상
- 정밀 개인 이동궤적의 장기 보존
- 기사별 거절 횟수나 성과 프로파일
- 고객 메시지에 기사 상태·건강·동의 내용 포함

로그에는 자유문 note와 LLM 원문을 기본적으로 남기지 않는다. 필요 시 마스킹·보존기간을 `docs/privacy-and-ai-policy.md`에서 정한다.

## 23. 필수 계약 테스트

### 공통

- 모든 정상 예시 통과
- 알 수 없는 필드 거부
- 잘못된 enum 거부
- NaN·Infinity·음수 카운트 거부
- 불가능한 타임스탬프 거부
- Mock/Live provenance 불일치 거부

### 기사·작업

- 근무 시작보다 빠른 평가시각 거부
- 휴식 종료가 시작보다 빠른 값 거부
- remainingStopIds와 stopCount 불일치 거부
- 중복 배송지 ID 거부
- 원시 생체 필드 거부

### 경로·배송

- 구간 duration과 timestamps 불일치 거부
- 중복 sequence 거부
- 완료 배송지 이관 거부
- 지연 불가 배송지 Safe Delay 거부
- 차량 호환성이 없는 경로 거부

### 안전결과

- Budget과 신뢰도 범위
- Budget과 밴드 불일치 거부
- forecast 시간 역전 거부
- PREDICTED·NO_BREACH·ALREADY_BREACHED 불변조건
- 기여도 합계

### 개입·결정

- 빈 후보와 중복 action 거부
- 원 기사와 수신 기사가 같은 이관 거부
- 수신 기사 Budget 45 미만 거부
- 수신 기사 Budget 감소 15 초과 거부
- 동의 없는 승인 거부
- 무효한 상태 전이 거부
- planVersion 충돌 거부

### Near-miss·고객안내

- 주행 중 긴 note 제출 거부
- 정확 위치 필드 거부
- 검증되지 않은 신고의 위험반영 거부
- 적용되지 않은 ETA 고객안내 거부
- 메시지 내 개인식별정보 패턴 거부

## 24. 확정된 결정

- 구현은 Zod 스키마를 런타임 단일 소스로 사용하고 TypeScript 타입을 추론한다.
- 수치 필드명에 단위를 포함한다.
- 시간은 오프셋을 포함한 ISO 8601, 지역 시간대는 IANA 이름을 사용한다.
- 모든 데이터는 출처와 Demo 여부를 가진다.
- Live/Mock/Loading/Error/Fallback은 판별 합집합이다.
- 외부 경계에서 알 수 없는 필드를 기본 거부한다.
- 기사 데이터에는 원시 생체정보와 실제 개인식별정보를 포함하지 않는다.
- 관리자 Near-miss에는 거친 위치만 사용한다.
- Safety Budget·개입·동의·결정은 버전과 ID로 연결한다.
- 후보 결과는 불변 평가 객체로 저장한다.
- 개별 스키마와 별도로 교차 객체 도메인 검증을 수행한다.
- Mock과 Live가 혼합된 결과를 Live로 표시하지 않는다.
- 실제 적용된 계획 ETA만 고객안내에 사용한다.

## 25. 미결사항

- ID 생성방식과 해시 알고리즘
- API 전송 시간대를 항상 UTC `Z`로 고정할지 여부
- GeoHash 정밀도와 관리자 Near-miss 공간 단위
- 기사 상태·경로·날씨별 최신성 허용시간의 계약 위치
- 차량 종류와 용량 차원의 최종 enum
- 배송지 우선순위와 지연 불가 분류 출처
- 정확 위치의 메모리 보존시간과 삭제 방식
- DecisionRecord 저장소와 이벤트 불변성 방식
- LLM 설명 전용 입력·출력 계약
- 외부 지도·날씨·Upstage 응답 어댑터 계약
- 완전한 세 대표 fixture와 정확 기대값
- 오프라인 기사 응답의 충돌 해결 규칙

이 문서가 `Approved`가 되기 전까지 필드명과 enum은 구현의 확정 계약이 아니다.
