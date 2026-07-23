# SafeRoute AI 합성데이터·국내 AI 활용 계획

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-23
- 계획 버전: `synthetic-data-v1.2.0`
- 목표 환경: NVIDIA A100 GPU, LG K-EXAONE API, Upstage API, Live 12과업 계약을 통과한 SKT A.X Hosted API, 필요성 승인 후 NC VARCO 에셋 API
- 상위 문서: `AGENTS.md`, `docs/product-spec.md`, `docs/data-contracts.md`, `docs/safety-model.md`, `docs/intervention-policy.md`, `docs/privacy-and-ai-policy.md`

## 1. 목적

이 문서는 실제 택배 운영·사고 라벨이 부족한 본선 MVP에서 검증 가능한 합성데이터를 만드는 방법과 A100 및 국내 AI의 역할을 정의한다. 2026-07-17 대회 제공 활용 가이드를 재검토해 A.X·K-EXAONE의 공통 텍스트 생성과 VARCO의 후속 에셋 생성 역할을 분리했으며, 자세한 대체 결정은 ADR-021을 따른다.

목표는 많은 데이터를 만드는 것이 아니라 다음 조건을 만족하는 재현 가능한 데이터 공장을 만드는 것이다.

- 현실적으로 가능한 운영 입력을 생성한다.
- 임계치·시간창·위험전가 같은 어려운 경계조건을 충분히 포함한다.
- 한국어 안전문서와 현장보고의 표현 다양성을 만든다.
- Upstage 문서 파싱·추출·설명을 왕복 검증한다.
- 생성모델이 정답·Safety Budget·추천안을 결정하지 못하게 한다.
- 모든 레코드의 생성 모델·버전·프롬프트·seed·검증 결과를 추적한다.
- 합성 결과를 실제 사고감소나 현실 분포로 과장하지 않는다.

## 2. 핵심 원칙

### 2.1 생성 AI는 후보 입력을 만들고 코드가 채택을 결정한다

```text
AI-generated candidate
→ schema validation
→ referential validation
→ temporal/physical constraints
→ privacy validation
→ safety invariants
→ duplication/coverage checks
→ accepted dataset
```

생성 AI의 자기평가나 다른 LLM의 찬성만으로 데이터를 채택하지 않는다.

### 2.2 정답 누출 금지

생성 프롬프트에 목표 Safety Budget, 목표 추천안 또는 정확한 최종 점수를 넣지 않는다. 생성기는 입력 상태와 제약만 만든다.

다음은 Safety Budget·개입 엔진이 생성 후 계산한다.

- currentBudget
- minimumForecastBudget
- riskBand
- Time-to-Breach
- 위험 기여도
- 개입 실행 가능성
- Risk Transfer Guard
- 추천 candidateId

경계값 테스트처럼 의도적으로 특정 조건을 만들 때도 `수신 기사 최소 Budget을 44.9로 만들어라`라고 직접 요구하지 않는다. 입력을 탐색·변형하고 엔진 결과가 목표 범위에 들어온 레코드를 별도 `boundary-search` 과정으로 채택한다.

### 2.3 합성은 현실 증명이 아니다

- 합성데이터는 제품 논리·견고성·재현성을 검증한다.
- 합성 결과를 실제 사고율·현장 안전효과로 해석하지 않는다.
- 실제 운영 분포와 닮았다는 주장은 공개 근거와 통계 검증이 있을 때만 한다.
- API 합성데이터로 학습한 모델은 `합성 시나리오 확장 모델`로 부른다.

### 2.4 결정론적 seed와 불변 manifest

모든 생성 작업은 seed와 manifest를 가진다. API가 seed를 지원하지 않거나 완전 결정론적이지 않으면 동일 요청의 재생산 가능 범위를 별도로 기록한다.

## 3. AI별 역할

역할은 초기 가설이며 실제 지원 API의 모델명·버전·기능·이용조건과 소규모 벤치마크를 확인한 뒤 확정한다.

### 3.1 SKT A.X — 구조화 운영 시나리오 생성

#### 책임

- CourierState 초안
- WorkloadState 초안
- DeliveryStop·RouteSegment 초안
- 날씨·지역위험 조건과 연결된 배송계획 초안
- 시나리오별 구조화 JSON 변형

#### 출력 원칙

- strict JSON
- `docs/data-contracts.md` 허용 필드만 사용
- 계산 결과·추천·사고확률 생성 금지
- 실제 이름·주소·연락처 생성 금지

#### 목표

일반적인 운영 조합의 폭과 시나리오 다양성을 확보한다.

### 3.2 LG EXAONE — 경계·반례·충돌 시나리오 생성

#### 책임

- 배송시간창과 휴식 충돌
- 용량·종료시각·권역 호환성 충돌
- 결측·오래된 데이터 조합
- 8건과 12건 이관 사이에서 결과가 달라질 수 있는 입력 변형
- 승인 직전 계획 버전 변경
- 가장 빠른 후보와 안전한 후보가 다른 입력
- Safety Budget 임계치 주변을 탐색할 후보 입력

#### 출력 원칙

- `expected result`가 아니라 `challenge intent`를 기록한다.
- 최종 통과·차단 정답은 코드가 결정한다.
- 불가능한 데이터 자체와 유효하지만 정책상 불가능한 후보를 구분한다.

#### 목표

정상 사례만으로는 발견하기 어려운 P0 실패와 정책 경계를 확보한다.

### 3.3 NC VARCO — 후속 에셋 API, P0 연동 보류

#### 확인된 역할

대회 제공 NC 가이드는 다른 LLM이 기획·로직·텍스트를 만든 뒤 VARCO API가 3D, 이미지·텍스처, 음성·사운드, 번역 등 에셋을 구현하는 흐름을 제시한다. 따라서 VARCO를 OpenAI-compatible 텍스트 LLM이나 한국어 현장문서 생성기로 추정하지 않는다.

#### 적용 원칙

- P0 폐루프에 필요한 구체적 에셋 사용처와 해당 제품 계약을 먼저 승인한다.
- 장식용 이미지·음성·3D 기능 때문에 P0 일정이나 개인정보 범위를 늘리지 않는다.
- 사용할 경우 구조화 사건과 승인 문구를 바꾸지 않는 downstream 표현 계층으로만 둔다.
- 생성 파일에는 Synthetic·Demo 라벨, 공급자 제품·버전과 원본 사실 hash를 기록한다.

#### 현재 목표

연동하지 않는 이유와 재검토 조건을 명확히 남긴다. 한국어 비정형 문서 다양성은 규칙 생성기, 수작업 고정 문서와 A.X·K-EXAONE 비교 세트로 검증한다.

### 3.4 Upstage — 문서 처리와 제품 런타임 설명

#### 책임

- Document Parse로 합성 문서 구조화
- Information Extract로 허용된 안전규칙·보고필드 추출
- 출처 페이지·섹션·인용 연결
- 검증된 결정론적 JSON 기반 기사·관리자·고객 설명

#### 금지

- 합성 운영 입력의 최종 채택 결정
- Safety Budget·Time-to-Breach 계산
- 개입 실행 가능성·추천 변경
- 입력에 없는 숫자·인용 생성

#### 목표

SafeRoute 제품 안에서 근거 문서와 운영결정을 연결하는 국내 AI 런타임 계층을 검증한다.

## 4. A100 역할

API 호출은 공급자 인프라에서 계산되므로 API만 사용할 경우 A100은 직접 생성 연산을 수행하지 않는다. A100은 다음 오프라인 작업에 사용한다.

### 4.1 우선순위 1 — 로컬 오픈 웨이트 생성 기준선

라이선스·배포조건과 지원 환경이 허용하면 A.X 또는 EXAONE의 오픈 웨이트 모델을 로컬 기준선으로 실행한다.

목적:

- API 모델과 로컬 모델의 구조화 JSON 유효성 비교
- 같은 prompt family의 생성 다양성 비교
- API 장애 시 오프라인 데이터 생성
- GPU 사용성과 배치 추론 증거 확보

모델명·정밀도·양자화·컨텍스트 길이는 A100 메모리와 지원 라이선스를 확인한 뒤 결정한다.

2026-07-16 첫 로컬 기준선은 ADR-020에 따라 `skt/A.X-4.0-Light` revision `ba21c20ea1b31ded1ec3e2fb432335077dc4be98`, BF16·비양자화·batch size 1로 고정했다. 서버에서 Hugging Face가 timeout되므로 접근 가능한 로컬 호스트에서 약 13.53GB snapshot과 체크섬을 만든 뒤 서버에 복사해 오프라인으로 실행한다. 이 선택은 benchmark 전용이며 제품의 안전 수치나 결정을 소유하지 않는다.

### 4.2 우선순위 2 — 합성 데이터 품질 분석

- 문서·레코드 임베딩
- 의미 중복·근접 중복 탐지
- 시나리오 클러스터링
- 커버리지·희귀조합 분석
- 비정상 텍스트 후보 탐지

최종 중복 제거 기준은 결정론적 임계치와 샘플 검토로 승인한다.

### 4.3 우선순위 3 — 조건부 시나리오 확장 실험

공개 분포 또는 충분히 검증된 레코드가 확보된 경우에만 조건부 tabular·시계열 생성모델을 실험한다.

가능한 실험:

- 조건부 tabular generator
- 배송 이벤트 시퀀스 모델
- 날씨·작업량·경로 노출의 시계열 변형
- 희귀 조합 oversampling

API 합성 결과만 학습한 모델은 현실 생성모델로 부르지 않는다. 검증된 데이터가 부족하면 이 단계는 건너뛴다.

### 4.4 우선순위 4 — 좁은 멀티모달 보조모델

AI Hub 등 사용 가능한 데이터가 적합할 때만 다음 중 하나를 좁게 실험한다.

- 좁은 도로·주차 곤란 특징
- 우천·저시정 도로 특징
- 후진·골목 위험 장면 특징

출력은 0~1의 검증된 파생 factor여야 하며 사고확률이나 기사평가를 만들지 않는다. P0 폐루프를 늦추면 P2로 미룬다.

## 5. 데이터 제품군

### 5.1 Structured Operations

`ScenarioFixture`를 구성하는 구조화 운영 입력이다.

- CourierState
- WorkloadState
- WeatherState
- AreaRiskProfile
- RouteSegment
- DeliveryStop

생성 주체: 규칙 생성기 + A.X, 필요 시 EXAONE 변형

### 5.2 Boundary and Adversarial Cases

정책·모델 경계와 실패를 검증하는 데이터다.

- 시간 역전·중복 참조 같은 스키마 실패
- 임계치 근처의 유효 입력
- Risk Transfer Guard 경계
- 계획 버전 충돌
- 동의 만료·재동의
- Live/Mock 혼합
- 결측·오래된 입력
- Upstage malformed·unsupported number·wrong citation

생성 주체: EXAONE + 결정론적 boundary search

### 5.3 Unstructured Korean Documents

- 합성 안전운영 매뉴얼
- 작업표·점검표
- Near-miss 보고서
- 관리자 상황보고
- 기사 수정·이의제기
- 고객 문의

생성 주체: 규칙 생성기·수작업 고정 문서 + A.X·K-EXAONE 비교 세트. VARCO는 P0 관련 에셋 사용처 승인 전에는 사용하지 않는다.

### 5.4 Round-trip Pairs

구조화 사건과 그 사건에서 생성된 비정형 문서, Upstage가 다시 추출한 JSON을 묶는다.

```text
source structured event
↔ generated document
↔ Upstage parsed text
↔ extracted structured event
```

### 5.5 Fixed Demo Fixtures

세 대표 시나리오의 완전한 입력과 기대 결과다. 생성 데이터셋과 분리해 버전으로 동결한다.

## 6. 생성 레코드 메타데이터

모든 AI 생성 산출물은 다음 메타데이터를 가진다.

```ts
type SyntheticGenerationMetadata = {
  recordId: string;
  batchId: string;
  createdAt: string;

  generator:
    | "RULE_ENGINE"
    | "SKT_AX_API"
    | "LG_EXAONE_API"
    | "NC_VARCO_API"
    | "LOCAL_OPEN_WEIGHT"
    | "HUMAN_AUTHORED";
  provider: string;
  modelId: string;
  modelVersion?: string;
  endpointVersion?: string;

  promptFamily: string;
  promptVersion: string;
  seed?: number;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;

  parentRecordIds: string[];
  scenario: string;
  challengeIntent?: string;
  dataMode: "SYNTHETIC";

  validationStatus: "PENDING" | "ACCEPTED" | "REJECTED" | "QUARANTINED";
  validationReportId?: string;
};
```

API 응답 전체를 장기 저장하지 않는다. 채택된 산출물과 재현에 필요한 비밀정보 없는 요청 설정만 저장한다.

## 7. 공급자 프로필

구현 전에 실제 지원받은 각 API를 다음 형식으로 등록한다.

```ts
type ProviderProfile = {
  provider: "SKT" | "LG_AI_RESEARCH" | "NC_AI" | "UPSTAGE";
  productName: string;
  modelId: string;
  endpointBase: string;
  endpointVersion?: string;
  authenticationMethod: string;
  supportsStructuredOutput: boolean;
  supportsSeed: boolean;
  supportsBatch: boolean;
  contextLimit?: number;
  outputLimit?: number;
  rateLimit?: string;
  quotaOrCredits?: string;
  dataRetentionSetting?: string;
  trainingUseSetting?: string;
  licenseOrTermsReference: string;
  confirmedAt: string;
};
```

제품 브랜드만 보고 기능을 가정하지 않는다. 정확한 API 문서·계정 화면·지원 안내를 확인해 프로필을 채운 후 호출한다.

## 8. 생성 단계

### 8.1 단계 0 — Seed Specification

사람이 승인한 시나리오 조건과 허용 범위를 작성한다.

```ts
type ScenarioSeedSpec = {
  seedSpecId: string;
  scenario: string;
  timeZone: string;
  courierCountRange: { min: number; max: number };
  stopCountRange: { min: number; max: number };
  shiftMinutesRange: { min: number; max: number };
  weatherRanges: Record<string, { min: number; max: number }>;
  routeFeatureRanges: Record<string, { min: number; max: number }>;
  workloadRanges: Record<string, { min: number; max: number }>;
  requiredInteractions: string[];
  forbiddenFields: string[];
};
```

### 8.2 단계 1 — 결정론적 Skeleton

코드가 다음을 먼저 만든다.

- 불투명 ID
- 기준 시각·시간대
- 기사·계획·배송지 참조 구조
- 배송지 sequence
- 경로 연결 구조
- 허용 값 범위

LLM은 ID 관계나 시간 순서를 자유롭게 새로 만들지 않고 Skeleton의 허용 슬롯만 채운다.

### 8.3 단계 2 — A.X 기본 생성

A.X가 seed spec과 skeleton을 받아 일반 운영 입력을 채운다. 결과는 JSON 스키마를 통과하기 전까지 후보일 뿐이다.

### 8.4 단계 3 — EXAONE Challenge Mutation

검증된 기본 레코드를 입력으로 받아 한 번에 하나의 challenge intent만 변형한다.

예:

- `increase continuous work while preserving all other fields`
- `create a transfer capacity conflict`
- `remove one non-blocking weather input`
- `make plan version stale`

한 번에 여러 변수를 바꿔 원인을 알 수 없게 하지 않는다.

### 8.5 단계 4 — 결정론적 검증

모든 구조화 후보를 검증하고 거부 사유를 기록한다.

### 8.6 단계 5 — 엔진 라벨링

검증된 운영 입력만 Safety Budget·개입 엔진에 전달한다. 계산 결과를 `derived labels`로 별도 저장한다.

### 8.7 단계 6 — 검증된 한국어 문서화

검증된 구조화 사건을 입력으로 규칙 생성기·수작업 고정 문서 또는 A.X·K-EXAONE 비교 세트가 비정형 한국어 문서를 생성한다. 문서에 원본에 없는 숫자·사건이 추가되면 거부한다. VARCO는 이 텍스트 단계의 기본 공급자가 아니다.

### 8.8 단계 7 — Upstage 왕복 검증

문서를 Parse·Extract하고 원본 사건과 비교한다.

### 8.9 단계 8 — 중복·커버리지·분할

채택 후보의 의미 중복을 제거하고 시나리오·밴드·결측·개입 유형·실패코드별 커버리지를 측정한 뒤 데이터셋에 배치한다.

## 9. 구조화 생성 프롬프트 가드레일

모든 구조화 생성 프롬프트에는 다음을 포함한다.

- 허용된 JSON Schema
- 필드별 단위와 범위
- 실제 개인정보 생성 금지
- unknown field 금지
- 계산 결과·사고확률·추천 생성 금지
- skeleton ID 변경 금지
- 시간대 포함 ISO 8601
- 설명문 없이 JSON만 출력
- 불가능한 요청이면 구조를 임의 수정하지 말고 명시적 failure 반환

출력 예시는 최소화해 모델이 예시 수치를 반복 복사하지 않게 한다.

## 10. 비정형 생성 프롬프트 가드레일

비정형 문서 생성 입력에는 다음을 제공한다.

- 문서 유형
- 허용된 사건 사실
- 사용할 수 있는 숫자 표시문자열
- 허용된 합성 지역명
- 금지된 개인정보·건강추론·기사비난
- 목표 길이와 문체
- 오타·축약·현장용어 변형 수준

원본 사건에 없는 사실을 창작하지 않도록 한다. 문서 다양성은 표현에서 만들고 사건 정답은 고정한다.

## 11. 검증 게이트

### Gate 1 — Syntax

- JSON 파싱
- UTF-8
- 최대 크기
- 허용 MIME·파일형식

### Gate 2 — Schema

- `contracts-v1.0.0` Zod 스키마
- unknown field 거부
- enum·단위·범위

### Gate 3 — Referential Integrity

- 참조 ID 존재
- 배송지·경로 sequence
- 계획·기사 연결
- 중복 할당 없음

### Gate 4 — Temporal and Physical Constraints

- 시간 역전 없음
- 예상시간·duration 일치
- 차량·적재·권역 호환
- 배송시간창과 종료시각

### Gate 5 — Privacy

- 실제 이름·전화번호·전체 주소 패턴 없음
- 원시 생체·정확 위치·얼굴·음성 없음
- 금지 필드 없음

### Gate 6 — Safety Invariants

- 위험 입력 단조성
- 휴식 Recovery 단조성
- Budget 0~100
- 신뢰도 결측 단조성
- Risk Transfer Guard

### Gate 7 — Semantic Fidelity

- 비정형 문서의 사건·숫자가 원본과 일치
- Upstage 추출이 원본 허용 필드와 일치
- 지원되지 않은 사실 없음

### Gate 8 — Diversity and Duplication

- exact duplicate 없음
- 근접 중복률 기준 이하
- 시나리오·경계·실패코드 커버리지

하나라도 실패하면 `ACCEPTED`가 될 수 없다. 수정 가능한 후보는 원본과 분리된 새 recordId로 재생성한다.

## 12. 경계 탐색

임계치 주변 데이터는 LLM에 정답을 지시하지 않고 다음 방식으로 찾는다.

1. 유효한 기준 레코드를 선택한다.
2. 하나의 입력만 허용 범위에서 변화시킨다.
3. Safety Budget 또는 Guard를 실행한다.
4. 목표 결과 구간에 가까워지는 방향으로 탐색한다.
5. 입력과 출력의 전체 trace를 저장한다.

필수 경계:

- Budget 30 주변
- 지원 임계치 45 주변
- 수신 기사 Budget 감소 15 주변
- 동의 만료 10분 주변
- 배송시간창 경계
- 허용 종료시각 경계
- 예측구간 120분 경계
- 신뢰도 60·80 경계

이 과정은 결정론적 탐색기 소유이며 LLM 판단이 아니다.

## 13. Upstage 왕복 평가

2026-07-21 `upstage-document-roundtrip-v1.0.0`은 6개 위험 유형과 5개 문서 유형을 교차한 결정론적 합성 Markdown 60쌍을 고정했다. Mock 계약 기준선은 60/60, 원문 근거 확인 60/60, 고유 source SHA-256 60개, 비신뢰 문서 지시 18건, raw 문서·raw 출력 저장 0건과 unsafe 표시 0건을 통과했다. 이 결과는 Live Document Parse·Information Extract 정확도가 아니라 유료 호출 전에 입력·기대 규칙·스키마·실패코드·비밀정보 비저장 경계를 검증한 기반이다.

### 13.1 평가 단위

```text
structured source fact
→ validated generated or human-authored document
→ Upstage Parse
→ Upstage Extract
→ extracted fact
```

### 13.2 지표

- JSON schema pass rate
- 필수 필드 exact match
- enum accuracy
- numeric exact match
- unit accuracy
- citation page·section accuracy
- unsupported field count
- hallucinated action count
- malformed response rate
- timeout·fallback rate

### 13.3 통과 원칙

- 수치 exact match가 아니면 제품 실행규칙으로 사용하지 않는다.
- 인용 없는 추출 규칙은 근거 UI에 표시하지 않는다.
- Parse 성공과 Extract 정확성을 별도 측정한다.
- Fallback 결과를 Live 성공률에 포함하지 않는다.

## 14. 데이터셋 분할

문서 표현만 다른 같은 원본 사건이 서로 다른 분할에 들어가면 누출이다. `parentRecordId` 단위로 분할한다.

권장 분할:

| 분할 | 비율 | 목적 |
|---|---:|---|
| development | 60% | 프롬프트·규칙 개발 |
| validation | 20% | 모델·설정 선택 |
| frozen test | 20% | 최종 비교·보고 |

별도 고정:

- 3개 demo fixtures
- 10개 이상 P0 adversarial regression fixtures
- 제공자 장애·malformed 응답 fixtures

동결 평가세트의 기대값을 본 뒤 가중치나 프롬프트를 조정하면 새 버전으로 다시 분할한다.

## 15. 목표 규모

P0 목표:

- 완전한 대표 fixture 3개
- 결정론적 운영 변형 최소 30개
- 권장 운영 변형 100개
- Risk Transfer Guard 경계 최소 20개
- 시간·결측·동의·버전 충돌 최소 20개
- 비정형 한국어 문서 최소 100개
- Upstage 왕복 쌍 최소 60개
- malformed·prompt injection·금지문구 세트 최소 30개

목표 개수보다 Gate 통과율과 범주 커버리지를 우선한다.

## 16. 품질 지표

### 16.1 구조 유효성

- accepted dataset schema pass rate: 100%
- 참조 무결성 실패: 0건
- 시간·용량 불가능 상태: 0건
- 실제 개인정보 탐지: 0건

### 16.2 안전 검증

- 필수 단조성 속성 위반: 0건
- Guard 우회 가능 사례: 0건
- AI 문구로 도메인 결과 변경: 0건

### 16.3 다양성

- 세 대표 시나리오 모두 포함
- 모든 위험 밴드 포함
- 다섯 개 개입 유형 포함
- 주요 blocking reason 포함
- Live/Mock/Error/Fallback 포함
- 기사 동의·수정·거절 포함

### 16.4 문서 왕복

정확한 목표치는 초기 20개 smoke benchmark 후 설정한다. 목표치 설정 전 결과를 임의로 성공 처리하지 않는다.

## 17. 모델 비교 실험

A.X와 K-EXAONE의 텍스트 품질을 공통 12과업과 후속 seed spec 일부에서 교차 비교한다. VARCO를 동일 텍스트 과업에 넣지 않으며, 승인된 에셋 과업이 생기면 별도 지표로 평가한다.

### 비교 항목

- strict JSON 통과율
- 재시도 없는 완성률
- 제약 위반률
- unknown field 발생률
- 실제 개인정보 형태 생성률
- 문서 사실 일치율
- 표현 다양성
- 평균 지연시간
- 토큰·크레딧 사용량
- 동일 prompt 반복 시 중복률

역할 분담은 브랜드 기대가 아니라 이 결과로 조정한다. 특정 모델의 약점을 숨기지 않으며 각 모델이 가장 잘 수행한 영역을 최종 파이프라인에 배치한다.

## 18. 비용·쿼터·재시도

- 배치별 최대 호출 수와 토큰 예산을 설정한다.
- 같은 오류의 무제한 재시도를 금지한다.
- retryable 오류만 지수 백오프로 제한 재시도한다.
- malformed 출력은 같은 응답을 수정하지 않고 새 recordId로 재생성한다.
- 사용량·크레딧은 공급자별로 기록한다.
- 평가세트 생성 후 API 버전을 바꾸면 결과를 혼합하지 않는다.

API 키는 서버 또는 승인된 생성 환경의 secret으로만 사용하고 저장소·노트북·로그·manifest에 넣지 않는다.

## 19. 디렉터리 계획

구현 시 권장 구조다.

```text
/docs/synthetic-data-plan.md
/data/
  /seed-specs/
  /synthetic/
    /development/
    /validation/
    /frozen-test/
  /fixtures/
  /manifests/
  /quarantine/
/prompts/
  /synthetic/
    /ax/
    /exaone/
    /upstage/
    /varco/  # P0 관련 에셋 사용처가 승인될 때만 생성
/scripts/
  /synthetic/
  /validation/
  /evaluation/
```

실제 생성파일을 Git에 넣을지는 크기·민감도·재현성을 검토해 결정한다. 최소한 seed spec, manifest, 고정 fixtures와 재생성 명령은 버전 관리한다.

## 20. 실행 단계

### Phase 0 — 공급자 확인

- 실제 API 모델·엔드포인트·쿼터·구조화 출력·seed 지원 확인
- 이용조건·보존·학습 사용 설정 기록
- A100 사양·접근방식·기간 확인

### Phase 1 — 결정론적 기반

- seed spec
- skeleton generator
- Zod 계약
- 검증 Gate 1~6
- 세 수작업 대표 fixture

### Phase 2 — 공통 텍스트 API smoke benchmark

- A.X·K-EXAONE에 동일한 12개 과업
- 통과율·지연·비용·오류 비교
- 역할 확정

### Phase 3 — 배치 생성

- 결정론적 skeleton 기반 structured operations; A.X Hosted API는 Live 12/12 통과 후에도 선택적 설명·평가 계층으로 두고 필수 생성 의존성에서 제외
- EXAONE challenge mutations
- 규칙·수작업·검증된 텍스트 모델 기반 documents
- Upstage 문서 왕복 60쌍 기반; 유료 Parse·Extract Live 호출은 별도 승인 후 실행
- P0 관련 에셋 요구가 승인된 경우에만 VARCO 별도 평가

### Phase 4 — A100 실험

- 로컬 오픈 웨이트 기준선
- 임베딩 중복·커버리지
- 데이터가 충분할 때만 조건부 확장

### Phase 5 — 동결·평가

- 분할
- frozen test 잠금
- DSE·개입·Upstage 평가
- CSV·차트·한계 문서화

## 21. 실패 방지

### 21.1 텍스트 API가 같은 데이터를 반복 생성

대응: 역할별 prompt family와 공통 비교 subset을 분리한다.

### 21.2 합성데이터가 너무 깨끗함

대응: 결측·오래된 입력·오타·축약·충돌·실패 상태를 의도적으로 포함한다.

### 21.3 LLM이 정답을 만들어 냄

대응: 출력 계약에서 결과 필드를 금지하고 엔진이 사후 라벨링한다.

### 21.4 A100 사용이 장식으로 보임

대응: 로컬 기준선, 배치 결과, 처리량, 중복 제거, 커버리지와 실험 로그를 제출한다. 가치 없는 학습은 하지 않는다.

### 21.5 실제 분포처럼 과장

대응: 모든 산출물에 Synthetic·Simulation 라벨과 한계를 표시한다.

### 21.6 모델별 API 변경

대응: ProviderProfile과 endpointVersion을 manifest에 고정하고 버전 간 결과를 분리한다.

### 21.7 합성 개인정보

대응: 합성 이름도 실제 인물과 겹칠 수 있으므로 이름·연락처·전체 주소 자체를 생성하지 않는다.

### 21.8 Upstage 왕복 결과로 원본 오염

대응: 추출 결과는 평가 대상이며 원본 source record를 덮어쓰지 않는다.

## 22. 발표·보고 표현

권장 표현:

> A.X와 K-EXAONE은 같은 안전 설명 계약으로 먼저 비교하고, 검증된 강점에 따라 구조화 운영 시나리오와 경계·반례 후보 생성을 분담합니다. Upstage는 문서를 다시 구조화하고 근거 있는 설명을 만듭니다. VARCO는 P0에 필요한 에셋 사용처가 승인될 때만 별도로 검증합니다. 안전점수와 추천은 생성 AI가 아니라 SafeRoute 엔진이 계산합니다.

> A100은 로컬 생성 기준선과 데이터 중복·커버리지 분석에 사용했으며, 결과는 실제 사고예측이 아닌 합성 시뮬레이션 평가입니다.

금지 표현:

- `네 AI가 합의해 사고확률을 결정합니다.`
- `A100으로 실제와 동일한 택배데이터를 만들었습니다.`
- `100개의 합성데이터로 사고감소를 증명했습니다.`
- `국내 AI가 Safety Budget을 학습했습니다.`

## 23. 근거 링크

- SKT A.X 공식 발표: https://news.sktelecom.com/en/2035
- LG AI Research EXAONE: https://www.lgresearch.ai/exaone/
- LG EXAONE Data Foundry 소개: https://www.lgresearch.ai/news/view?seq=663
- NC VARCO API 플랫폼: https://api.varco.ai/ko
- NC VARCO LLM 발표: https://about.ncsoft.com/en/news/article/news-update-230816

공식 공개자료는 모델의 일반적 방향을 확인하기 위한 근거다. 실제 지원 API의 정확한 기능은 발급받은 문서와 계정 조건을 우선한다.

## 24. 필수 산출물

- 활성 텍스트 ProviderProfile 3개와 VARCO 보류·재검토 기록
- seed spec 3개 이상
- 생성 manifest
- validation report
- rejection reason 통계
- 모델별 smoke benchmark CSV
- accepted dataset coverage report
- 중복 제거 리포트
- Upstage round-trip 평가 CSV
- 고정 demo fixtures 3개
- P0 adversarial fixtures
- A100 실행 로그와 재현 명령
- 데이터셋 카드와 한계

## 25. 확정된 결정

- A.X·K-EXAONE은 동일 텍스트 계약으로 비교한 뒤 오프라인 합성 후보 생성에 사용한다.
- Upstage는 문서 Parse·Extract와 제품 런타임 설명에 사용한다.
- A.X의 기본 역할은 구조화 운영 시나리오다.
- EXAONE의 기본 역할은 경계·반례·충돌 시나리오다.
- VARCO는 후속 에셋 API이며 P0 관련 사용처 승인 전에는 연동하지 않는다.
- A.X·K-EXAONE의 실제 역할은 공통 smoke benchmark 결과로 조정할 수 있다.
- 생성 AI는 Safety Budget·추천·정답을 만들지 않는다.
- 구조화 Skeleton과 최종 채택은 결정론적 코드가 소유한다.
- A100은 로컬 기준선과 데이터 품질 분석을 우선한다.
- 충분한 검증 데이터가 없으면 조건부 생성모델 학습을 하지 않는다.
- Upstage 왕복 결과는 원본을 덮어쓰지 않는다.
- 모든 데이터는 generator·model·prompt·seed·검증 manifest를 가진다.
- parent record 단위로 데이터셋을 분할한다.
- 합성·시뮬레이션 결과를 실제 안전효과로 표현하지 않는다.

## 26. 미결사항

- A.X Hosted API의 실제 계정 쿼터·입력 보존 정책과 반복 실행 분산
- K-EXAONE 계정에서 실제 활성화된 모델·쿼터
- SafeRoute P0에 필요한 VARCO 에셋 사용처와 해당 제품·쿼터
- Upstage 제품별 정확한 버전·쿼터
- 각 API의 structured output·seed·batch 지원 여부
- 공급자별 입력 보존·학습 사용 설정
- A100 VRAM·접근기간·스토리지·네트워크 조건
- 로컬 실행 모델과 라이선스
- 12과업 이후 배치 합성 역할을 결정할 추가 비교 과업
- 의미 중복 임계치
- Upstage 왕복 평가의 최종 통과기준
- 데이터셋의 실제 저장·배포 방식
- A100 조건부 생성모델 실험을 실행할 최소 데이터량

위 미결 모델별 엔드포인트와 생성량·통과율 목표는 별도 Approved 결정이 기록되기 전까지 구현의 확정 기준이 아니다.
