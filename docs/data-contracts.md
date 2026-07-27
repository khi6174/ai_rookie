# SafeRoute AI 데이터 계약

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-27
- 계약 버전: `contracts-v1.4.0`
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

### 1.1 G5-A decision 공간 장면

`DecisionSpatialSceneSchema`는 관리자 활성 decision의 설명용 2.5D 장면만 표현한다. `decisionId`, `planId`, `routeId`와 네 route point의 좌표·순서는 `MapRenderModel`과 exact equality여야 한다. 각 `SpatialRouteSample`은 0에서 시작해 엄격히 증가하는 거리, 합성 고도·경사, `NORMAL | REST_POINT | SLOPE_EXPOSURE | BREACH_POINT`를 갖고 휴식과 예상 초과 지점은 각각 정확히 하나다.

장면의 `dataMode`는 `DEMO`, renderer는 `DEMO_TWO_POINT_FIVE_D`, 모든 provenance는 `MOCK + isDemo=true`다. 고도·거리·경사와 52분·17번째·29.9→47.2·10분·8건·ETA +8분은 결정론적 코드가 소유하며 AI가 생성하거나 변경하지 않는다. Live 출처, 좌표·식별자 불일치, 거리 역전, 예상 초과 지점 누락, 조정 후 Budget 비개선은 경계에서 거부하고 2D를 유지한다.

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
type RegionId = string;
type HubId = string;
type PositionEventId = string;
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
  sourceUri?: string;
  sourceVersion?: string;
  contentHashSha256?: string;
  isDemo: boolean;
};
```

#### 규칙

- `MOCK`이면 `isDemo`는 반드시 `true`다.
- `LIVE`이면 `isDemo`는 반드시 `false`다.
- `DERIVED`는 하나 이상의 `parentSourceIds`가 있어야 한다.
- `PUBLIC_DATA_DERIVED`는 공식 `sourceUri`, `sourceVersion`, `licenseOrPolicy`, 원본 파일 `contentHashSha256`와 `transformedBy`가 모두 있어야 한다.
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
    | "INCOMPLETE_COVERAGE"
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

### 3.3 날씨 Runtime 선택

Live 날씨 후보가 전체 `WeatherState` 계약을 충족하지 못할 때는 필드 단위 병합을 금지하고 다음 wrapper를 사용한다.

```ts
type WeatherRuntimeSelection = {
  schemaVersion: "weather-runtime-selection-v1";
  active: DataResult<WeatherState[]> & { status: "FALLBACK" };
  liveEvidence: {
    status: "PARTIAL";
    capturedAt: IsoDateTime;
    sourceIds: string[];
    responseHashes: string[];
    readyFields: Array<{ timeScope: string; field: string }>;
    blockingFields: Array<{ timeScope: string; field: string; reason: string }>;
  };
  audit: {
    liveEvidenceUsedForSafety: false;
    fallbackTimelineUsedForSafety: true;
    mixedLiveAndDemoFields: false;
  };
};
```

- `active.fallbackReason.code`는 `INCOMPLETE_COVERAGE`다.
- `active.data` 전체는 하나의 승인된 Demo fixture에서 와야 하며 모든 provenance는 `MOCK`, `isDemo=true`다.
- Live evidence의 수치·해시는 감사용이며 `active.data` 객체와 병합하지 않는다.
- 관리자와 기사 모두 `Demo fixture · Weather Fallback` 상태를 표시한다.

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

#### 다지역 지도 projection

지도 projection은 UI 탐색용 계약이며 Safety Budget·추천·실행 가능성을 계산하지 않는다.

```ts
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

- `receivedAt >= capturedAt`이어야 한다.
- 위치 정확도는 양의 유한수이며 승인 상한 밖이면 `CURRENT`가 될 수 없다.
- 방향은 0 이상 360 미만, 속도는 0 이상의 유한수다.
- Demo와 Live 관측을 같은 stream으로 결합하지 않는다.
- stale·offline·permission denied는 이동 가능한 현재 위치로 표시할 수 없다.
- 정확 좌표를 AI 입력·일반 로그·스크린샷·장기 감사기록에 넣지 않는다.
- 다지역 fixture의 region·hub·courier·plan·decision 참조는 모두 존재하고 유일해야 한다.

#### G4-A 결정론적 Demo 이동 타임라인

`MapMovementTimeline`은 실제 위치 stream이 아니라 동일 다지역 fixture에서 생성한 30초짜리 합성 이벤트 묶음이다. `dataMode`는 항상 `DEMO`이고 모든 위치 관측은 `MOCK`, `isDemo=true` provenance를 가져야 한다.

- 기본 타임라인은 5초 간격 7개 frame이며 모든 frame이 같은 24개 `courierId`를 포함한다.
- `frameIndex`, `elapsedSeconds`, `evaluatedAt`은 선언된 간격과 정확히 일치해야 한다.
- `CURRENT`만 새로 수신된 Demo 관측점으로 이동할 수 있다.
- `STALE`은 마지막 검증 위치에서 정지하고 `OFFLINE`은 좌표를 제공하지 않는다.
- 연결 복구는 새 `CURRENT` 관측이 포함된 frame 이후에만 표시한다.
- 타임라인을 적용해도 courier·plan·decision membership, Safety 결과와 개입 상태는 바뀌지 않는다.
- 타임라인은 메모리의 단기 Demo 재생에만 사용하며 저장된 개인 이동궤적이나 Live GPS로 표현하지 않는다.

#### G4-B 합성 지도 부하 profile

- 승인된 총 기사 profile은 24·96·240명이며 3개 권역·6개 허브에 균등 배치한다.
- 운영 기본값은 24명이고 96·240명은 `map-load-test` 진단 입력에서만 생성한다.
- 전국 scope는 기사 위치와 경로를 0개 반환하고 권역 집계만 반환한다.
- 승인된 최대 profile에서 권역 viewport는 기사 80명을 포함하며 동시에 렌더링하는 경로는 24개로 제한한다.
- 경로 제한은 decision을 제거하지 않는다. 사용자가 기사를 선택하면 해당 기사 1명의 상세 경로를 별도 decision scope에서 제공한다.
- 240명 초과 또는 허브당 40명 초과 입력은 평가 범위 밖으로 거부한다.
- 모든 profile은 `DEMO`, `MOCK`, `isDemo=true`이며 실제 기사·GPS·TMS·주소를 포함하지 않는다.

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

### 4.3 Kakao Mobility 합성 길찾기 미리보기

`KakaoDirectionsPreview`는 기사 PWA의 합성 경로 설명용 외부 공급자 결과다.

```ts
type KakaoDirectionsPreview = {
  schemaVersion: "kakao-directions-preview-v1";
  status: "LIVE";
  provider: "KAKAO_MOBILITY";
  profile: "rider-demo";
  capturedAt: IsoDateTime;
  distanceMeters: number;
  durationSeconds: number;
  path: GeoPoint[];
  isDemo: true;
  coordinateSource: "DETERMINISTIC_SYNTHETIC_FIXTURE";
  safetyEngineInputApproved: false;
};
```

- 브라우저는 임의 좌표를 전달하지 않고 서버에 고정된 `rider-demo` profile만 요청한다.
- 공급자에는 `MapAdapter`의 결정론적 합성 현재 위치·휴식 지점·다음 배송지만 전달한다.
- 거리·시간은 양의 정수이고 path는 대한민국 범위의 2~501개 점이다.
- 공급자 원문, 요청 ID, 인증키는 응답·로그·산출물에 보존하지 않는다.
- 오류·오프라인·키 미설정에서는 기존 합성 경로와 구조화 목록으로 전환한다.
- 이 결과는 Safety Budget, Time-to-Breach, 개입 순위, 동의·승인 또는 적용 계획을 변경할 수 없다.

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

### 외부 날씨 후보 Gate

외부 API 응답은 이 계약을 부분적으로 채웠다는 이유만으로 `WeatherState`가 되지 않는다. 기상청 `RN1` 구간값은 다음 별도 선택 결과를 거친다.

```ts
type RainfallSelection =
  | {
      status: "READY";
      selectedMmPerHour: number;
      mode: "EXACT_SOURCE_VALUE" | "CONSERVATIVE_NORMALIZATION_BOUND";
      assumptionCode?: "KMA_RAIN_RANGE_CONSERVATIVE_NORMALIZATION_BOUND";
    }
  | {
      status: "BLOCKED";
      reason: "MISSING_RAINFALL" | "UNBOUNDED_BELOW_NORMALIZATION_CAP";
    };
```

4.3 단기예보의 `SNO`에는 같은 원칙을 적용한다.

```ts
type SnowfallSelection =
  | {
      status: "READY";
      selectedCmPerHour: number;
      mode: "EXACT_SOURCE_VALUE" | "CONSERVATIVE_NORMALIZATION_BOUND";
      assumptionCode?: "KMA_SNOW_RANGE_CONSERVATIVE_NORMALIZATION_BOUND";
    }
  | {
      status: "BLOCKED";
      reason: "MISSING_SNOWFALL" | "UNBOUNDED_BELOW_NORMALIZATION_CAP";
    };
```

- 정확값은 그대로 보존한다.
- 유한 구간은 중간값이 아니라 상한을 사용하고, 현재 모델의 20mm/h 정규화 상한에서 자른다.
- 상한 없는 구간은 하한이 20mm/h 이상일 때만 포화값 20을 사용할 수 있다.
- 적설 정확값은 그대로 보존한다. `0.5cm 미만`은 `0.1 <= x < 0.5`, `5.0cm 이상`은 `x >= 5`로 보존한다.
- 적설 유한 상한 또는 모델 포화 하한은 3cm/h 정규화 상한에서 보수적으로 선택하며 중간값을 만들지 않는다.
- 고해상도 격자 1.3의 `ta_chi`는 °C, `vs`는 km이므로 시정만 m로 1,000배 단위 변환한다. `sd_3hr`는 3시간 신적설로 별도 보존하며 3으로 나누지 않는다.
- 4.3 미래 체감온도는 같은 발표·발효시각의 `TMP`·`REH`·`WSD`만 사용한다. 5∼9월은 공식 습구온도·습도식, 10월∼다음 해 4월은 `TMP <= 10°C`이고 `WSD >= 1.3m/s`일 때만 공식 풍속식을 적용한다.
- 4.3 발표 최신성은 3시간 발표주기와 제공지연을 포함한 210분 이내여야 하며, 발효시각은 현재부터 120분 범위만 선택한다.
- 체감온도 파생값에는 `KMA_SUMMER_HUMIDITY_FORMULA_2025` 또는 `KMA_WINTER_WIND_FORMULA_2025`와 원본 세 필드를 기록한다. 적용조건 밖이나 결측이면 값을 만들지 않는다.
- `roadSurface`는 출처가 없으면 `UNKNOWN`이며 강수형태로 추정하지 않는다.
- 현재 시간당 적설과 미래 시정이 없으면 전체 `WeatherState` 변환을 차단한다. 공식 체감온도 입력이나 계절별 적용조건이 충족되지 않은 시점도 별도로 차단한다.
- 관측값을 미래 예보값으로 자동 복제하지 않는다.

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
- 두 조치 묶음은 `REST+TRANSFER_STOPS`, `REST+REORDER_STOPS`, `REST+SAFER_ROUTE`, `TRANSFER_STOPS+REORDER_STOPS`, `REST+SAFE_DELAY`, `SAFER_ROUTE+SAFE_DELAY`만 허용한다.
- 묶음의 actions 배열은 `REST → TRANSFER_STOPS → REORDER_STOPS → SAFER_ROUTE → SAFE_DELAY` 정규 부분순서와 일치해야 한다.
- `TRANSFER_STOPS+REORDER_STOPS`는 transfer 원 기사와 reorder 기사가 같아야 하고, `SAFER_ROUTE+SAFE_DELAY`도 같은 기사에 대한 조치여야 한다.
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
  | "RIDER_CONSENT_EXPIRED"
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
- 기사·관리자 actor의 event에는 actorId가 필요하다.
- 여러 기사 중 일부 동의만 완료되면 `RIDER_RESPONSE_PENDING → RIDER_RESPONSE_PENDING` 감사 전이를 허용한다.
- `RIDER_CONSENT_EXPIRED`는 새 후보 생성 또는 취소로만 이동한다.
- 적용 직전 계획 버전 충돌은 `APPLYING_PLAN → REVALIDATION_REQUIRED`로 이동하며 활성 계획을 바꾸지 않는다.
- `APPLIED`는 고객안내 요청이 기록된 뒤에만 `NOTICE_RECORDED`로 이동하고, 이후 `CLOSED`가 된다.

### 결정 명령과 Demo 적용 결과

모든 명령은 기존 `DecisionRecord`를 변경하지 않고 새 레코드와 감사 event를 반환한다. 허용되지 않은 상태, 행위자 권한, candidate·plan version 불일치는 안정적인 오류 코드로 거절한다.

```ts
type DemoPlanStore = {
  activePlan: ScenarioFixture;
  appliedDecisionVersions: Record<DecisionId, string>;
  pendingCustomerNoticeIds: Record<DecisionId, string[]>;
};

type AtomicApplyResult =
  | { status: "APPLIED"; decision: DecisionRecord; store: DemoPlanStore }
  | { status: "ALREADY_APPLIED"; decision: DecisionRecord; store: DemoPlanStore }
  | { status: "REVALIDATION_REQUIRED"; decision: DecisionRecord; store: DemoPlanStore }
  | { status: "FAILED"; decision: DecisionRecord; store: DemoPlanStore; rollbackStatus: "UNCHANGED" };
```

`APPLIED`와 `ALREADY_APPLIED` 외 결과의 store는 입력 store와 구조적으로 같아야 한다. `proposedPlan`의 기준 plan ID와 선택 평가의 plan version이 일치해야 하며, 고객안내 요청 ID는 실제 교체 성공 시에만 pending 목록에 기록한다.

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

## 17. ExplanationInput·Output·Result

Upstage에는 전체 결정 객체가 아니라 역할별 최소 사실과 허용된 인용만 전달한다. 실제 공급자 모델명·endpoint·quota는 아직 계약에 고정하지 않는다.

```ts
type ExplanationInput = {
  requestId: string;
  role: "COURIER" | "ADMIN" | "CUSTOMER" | "REPORT";
  language: "ko";
  dataMode: "DEMO" | "LIVE_PILOT";
  numericFacts: Array<{
    factId: string;
    label: string;
    value: number;
    unit: string;
    displayValue: string;
  }>;
  stateFacts: Array<{ factId: string; label: string; value: string }>;
  allowedCitations: Array<{
    citationId: string;
    documentTitle: string;
    page?: number;
    section?: string;
    excerpt: string;
  }>;
  allowedActions: string[];
  prohibitedTopics: string[];
};

type ExplanationOutput = {
  requestId: string;
  role: ExplanationInput["role"];
  summary: string;
  actions?: string[];
  citedFactIds: string[];
  citationIds: string[];
  uncertaintyStatement?: string;
  dataModeLabel: string;
};

type ExplanationResult =
  | { status: "LIVE"; provider: "UPSTAGE"; data: ExplanationOutput }
  | { status: "MOCK"; provider: "UPSTAGE_MOCK"; data: ExplanationOutput }
  | {
      status: "FALLBACK";
      provider: "TEMPLATE";
      attemptedProvider: "UPSTAGE";
      data: ExplanationOutput;
      fallbackReason: DataError;
    };
```

### 검증

- 입력·출력은 strict schema이며 알 수 없는 개인정보·좌표·원시 생체 필드를 거부한다.
- 숫자가 있는 상태는 반드시 `numericFacts`와 승인된 `displayValue`로 제공한다.
- 출력 숫자는 승인된 `displayValue`와 정확히 일치해야 하며 반올림·재계산·새 숫자를 거부한다.
- fact ID와 citation ID는 입력의 허용 목록에 있어야 한다.
- 출력 행동은 `allowedActions`의 부분집합이고 기사 역할은 한 번에 하나만 표시한다.
- 역할·request ID·Demo/Live 라벨 불일치와 비난·순위·과실 문구를 거부한다.
- 검증 실패·timeout·네트워크 오류는 결정론적 `FALLBACK`으로 전환하며 도메인 결정 객체와 병합하지 않는다.
- 합성 안전문서 추출 규칙은 허용 hazard·condition·action과 페이지 또는 섹션 인용을 요구한다.

## 18. CustomerNotice

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

## 19. ScenarioFixture

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

  initialSafetyStates?: Array<{
    courierId: CourierId;
    currentBudget: number;
    derivedFromHistory: false;
    rationale: string;
    provenance: Provenance;
  }>;

  interventionInputs?: {
    reorderPolicies: Array<{
      courierId: CourierId;
      reorderableStopIds: StopId[];
      fixedStopIds: StopId[];
      maxCandidates: 3;
      provenance: Provenance;
    }>;
    saferRouteAlternatives: Array<{
      courierId: CourierId;
      replacementRouteId: RouteId;
      replacedSegmentIds: SegmentId[];
      replacementSegments: RouteSegment[];
      provenance: Provenance;
    }>;
    safeDelayPolicies: Array<{
      courierId: CourierId;
      delayableStopIds: StopId[];
      maximumDelayMinutes: number;
      customerNoticeAvailable: boolean;
      provenance: Provenance;
    }>;
  };

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
- 현재 세 대표 fixture의 모든 provenance는 Mock이며 실제 개인정보를 포함하지 않는다.
- 원본 증거가 없는 합성 날씨·권역·경로 특징을 public-derived로 표시하지 않는다.
- `initialSafetyStates`는 Demo fixture의 `MOCK` provenance에서만 사용할 수 있다.
- 직접 제공한 현재 Budget은 `derivedFromHistory: false`와 근거를 포함하고 신뢰도 `HIGH`를 만들 수 없다.
- `interventionInputs`는 Demo `MOCK` provenance만 허용하며 실제 공급자 결과처럼 표시할 수 없다.
- reorder policy의 재정렬·고정 stop은 해당 기사의 현재 남은 stop 집합 안에 있고 서로 겹치지 않는다.
- 안전경로 대체 구간은 교체 대상과 같은 목적지 집합을 가지며 `SAFER`와 동일 replacementRouteId를 사용한다.
- Safe Delay 목록은 해당 기사의 현재 남은 stop만 참조하고 최대 지연은 0보다 크다.
- expectedAssertions는 엔진 출력을 입력으로 재사용하지 않는다.
- 정확한 기대값을 맞추기 위한 시나리오별 숨은 가중치를 금지한다.

## 20. 대표 시나리오 A 예시

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

## 21. 교차 객체 불변조건

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

## 22. API 경계 규칙

### 22.1 입력 검증

- 사용자 입력, 외부 API, 문서 추출 JSON과 저장소 읽기 결과를 모두 검증한다.
- 검증 실패 시 부분 객체를 도메인 엔진에 전달하지 않는다.
- 알 수 없는 필드는 외부 경계에서 기본적으로 거부한다.
- 문자열은 앞뒤 공백과 제어문자를 처리하되 의미가 바뀌는 자동수정을 하지 않는다.

### 22.2 출력 검증

- 안전모델, 개입엔진과 Upstage 결과도 저장·응답 전에 검증한다.
- 계산 결과가 계약을 위반하면 fallback 숫자를 만들지 않고 명시적 오류로 전환한다.
- LLM 응답은 전용 출력 스키마를 사용하고 도메인 객체와 병합하지 않는다.

### 22.3 낙관적 기본값 금지

다음 기본값을 금지한다.

- 결측 날씨를 맑음으로 처리
- 결측 경로위험을 0으로 처리
- 결측 수신 기사 용량을 무제한으로 처리
- 응답 없는 동의를 동의로 처리
- 실패한 Live 요청을 배지 없는 Mock으로 처리

## 23. 개인정보와 로그 제한

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

## 24. 필수 계약 테스트

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

### Upstage 설명

- 입력에 PII·정확 좌표·알 수 없는 필드 거부
- strict 출력, 숫자 불변, 허용 인용과 행동 검증
- role·data mode 불일치와 비난·순위 문구 거부
- malformed·timeout·잘못된 인용 시 템플릿 Fallback
- 설명 전후 selected candidate·계획·ETA 불변

## 25. CachedApprovedDemoPlan

G3-B의 기기 로컬 캐시는 서버 기록이나 실제 배송계획이 아니라 마지막 승인·적용 합성 계획을 제한 시간 동안 읽기 전용으로 보여주는 최소 계약이다.

```ts
type CachedApprovedDemoPlan = {
  schemaVersion: "cached-approved-demo-plan-v1";
  dataMode: "DEMO";
  approvalState: "APPROVED_APPLIED";
  decisionId: DecisionId;
  planId: PlanId;
  planVersion: string;
  storedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  couriers: Array<{
    courierId: CourierId;
    remainingStopCount: number;
  }>;
};
```

### 검증

- strict schema이며 알 수 없는 이름·전화번호·주소·좌표·생체·고객 필드를 거부한다.
- `expiresAt`은 `storedAt`보다 늦어야 하고 v1 TTL은 30분이다.
- 정확히 `expiresAt`부터 `EXPIRED`이며 최신 계획·온라인 성공 상태로 사용할 수 없다.
- malformed JSON·schema 오류·storage unavailable을 구분하고 도메인 계획으로 병합하지 않는다.
- `APPROVED_APPLIED` 외 상태를 저장하지 않는다.

## 26. 확정된 결정

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
- Upstage 설명은 도메인 객체와 분리된 strict 결과이며 검증 실패 시 템플릿으로 전환한다.
- 다지역 지도 projection은 검증된 식별자·위치 상태만 표현하며 Safety 계산에 참여하지 않는다.
- G1 위치는 모두 결정론적 Demo MOCK이며 Live와 혼합하지 않는다.

## 27. 미결사항

- ID 생성방식과 해시 알고리즘
- API 전송 시간대를 항상 UTC `Z`로 고정할지 여부
- GeoHash 정밀도와 관리자 Near-miss 공간 단위
- 기사 상태·경로·날씨·위치별 최신성 허용시간의 계약 위치
- 차량 종류와 용량 차원의 최종 enum
- 배송지 우선순위와 지연 불가 분류 출처
- 정확 위치의 메모리 보존시간과 삭제 방식
- DecisionRecord 저장소와 이벤트 불변성 방식
- 외부 지도·날씨 응답 어댑터 계약
- Upstage Live 모델명·endpoint·quota·timeout·retry 계약
- 완전한 세 대표 fixture와 정확 기대값
- 오프라인 기사 응답의 서버 동기화·충돌 해결 규칙. G3-B는 오프라인 응답을 저장하지 않는다.

위 미결 필드명과 enum은 별도 Approved 결정이 기록되기 전까지 구현의 확정 계약이 아니다.

## 28. DailyOperationsPackage와 DailyOperationsSnapshot

2026-08-14 합성 운영 서비스는 문서 파일 자체와 Safety 엔진 입력을 직접 연결하지 않는다. 등록된 문서는 먼저 strict 입력 패키지로 정규화하고, 교차 참조 검증을 통과한 경우에만 불변 스냅샷으로 승격한다.

```ts
type DailyOperationsPackage = {
  schemaVersion: "daily-operations-package-v1";
  packageId: string;
  operationDate: string;
  evaluatedAt: IsoDateTime;
  timeZone: "Asia/Seoul";
  dataMode: "SYNTHETIC";
  source: "BUNDLED_SAMPLE" | "USER_UPLOADED";
  records: SyntheticOperationsParentRecord[];
};

type OperationsValidationIssue = {
  issueId: string;
  severity: "ERROR" | "WARNING";
  code:
    | "SCHEMA_INVALID"
    | "DATE_MISMATCH"
    | "DUPLICATE_ID"
    | "MISSING_REFERENCE"
    | "TIME_ORDER_INVALID"
    | "COUNT_MISMATCH"
    | "LOAD_MISMATCH"
    | "UNSUPPORTED_DATA_MODE";
  recordId?: string;
  fieldPath?: string;
  message: string;
};

type DailyOperationsSnapshot = {
  schemaVersion: "daily-operations-snapshot-v1";
  snapshotId: string;
  snapshotVersion: string;
  packageId: string;
  packageHash: string;
  operationDate: string;
  evaluatedAt: IsoDateTime;
  timeZone: "Asia/Seoul";
  dataMode: "SYNTHETIC";
  status: "ACTIVE" | "SUPERSEDED";
  courierIds: CourierId[];
  planIds: PlanId[];
  fixture: ScenarioFixture;
  createdAt: IsoDateTime;
  provenance: Provenance[];
};
```

### 28.1 패키지 검증

- 패키지는 strict schema이며 `SYNTHETIC`만 허용한다.
- `operationDate`는 모든 record의 근무·계획 기준일과 일치해야 한다.
- `parentRecordId`, 기사·근무·계획·차량·배송지 ID는 패키지 안에서 중복될 수 없다.
- 근무 시작 ≤ 평가시각 < 예정 종료이고, 모든 남은 배송 ETA는 평가시각 이후여야 한다.
- 전체·완료·남은 배송 수와 남은 중량은 배송지 목록에서 재계산한 값과 일치해야 한다.
- 오류가 하나라도 있으면 스냅샷을 만들지 않는다. 경고는 표시하고 감사기록에 포함한다.
- 문서 추출 결과는 이 계약을 통과하기 전까지 Safety 엔진에 전달하지 않는다.

### 28.2 스냅샷 불변성

- `packageHash`는 정규화된 전체 패키지에서 계산한 SHA-256이다.
- 같은 package hash·설정 버전·평가시각은 같은 fixture와 Safety 결과를 만든다.
- 새 업로드는 기존 스냅샷을 수정하지 않고 새 `snapshotVersion`을 만든다.
- decision은 생성 당시 `snapshotId`, `snapshotVersion`, `planVersion`을 보존한다.
- 적용 직전 활성 스냅샷 또는 계획 버전이 달라지면 `REVALIDATION_REQUIRED`로 전환한다.

### 28.3 개인정보와 저장

- 합성 ID·거친 구역·합성 좌표만 허용한다.
- 이름·전화번호·이메일·전체 주소·정밀 GPS·생체정보 필드를 거부한다.
- 원문 파일 저장은 별도 R2·보존 승인이 있기 전까지 수행하지 않는다.
- 서비스 저장소에는 정규화 패키지, 스냅샷, 결정 상태, 감사 이벤트와 내보내기 메타데이터만 둔다.

### 28.4 운영 세션과 동시성

- `OperationsPersistedSession`은 원본 합성 패키지, 스냅샷 해시·버전, 지원 큐, 결정 상태, 현재 적용 계획과 감사 이벤트를 저장한다.
- 원본 스냅샷 평가는 패키지와 해시로 재생성하고 중복 저장하지 않는다.
- 브라우저에는 무작위 합성 `workspaceId`만 보존하며 운영 상태는 Sites D1 또는 개발 메모리 어댑터가 보존한다.
- PUT은 `X-SafeRoute-Base-Saved-At`를 사용한다. 저장된 `updated_at`과 다르면 `409 SESSION_CONFLICT`로 거부하고 최신 상태 재로딩을 요구한다.
- 기사 응답과 관리자 승인은 같은 세션·decision ID를 사용하며 stale 화면의 last-write-wins 덮어쓰기를 허용하지 않는다.
