# SafeRoute AI 결정 기록

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-19
- 적용 범위: 제품, 데이터, 모델, 개입, AI, UX, 평가 및 데모의 지속 결정

## 1. 목적

이 문서는 SafeRoute AI의 구현과 심사 증빙에 영향을 주는 지속 결정을 한곳에서 추적한다. 세부 공식과 필드 정의는 각 전문 문서가 소유하며, 이 문서는 결정 이유와 문서 간 우선순위를 기록한다.

결정이 충돌할 때는 다음 순서로 처리한다.

1. 개인정보·사용자 권리와 안전 하드 제약
2. 이 결정 기록의 최신 Approved 항목
3. 분야별 Approved 명세
4. Draft 문서와 구현 편의

미결사항을 코드에서 조용히 확정하지 않는다.

## 2. 기록 형식

각 결정은 날짜, 상태, 결정, 이유, 기각한 대안, 영향 파일을 포함한다. 행동이나 아키텍처를 바꾸는 경우 기존 항목을 삭제하지 않고 새 항목으로 대체 관계를 남긴다.

## 3. 결정 목록

### ADR-001 — 단일 안전운영 폐루프를 최우선 범위로 둔다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: 미래 임계치 초과 예측부터 기사 동의, 관리자 승인, 계획·ETA 갱신, 고객안내, 감사기록까지 이어지는 하나의 폐루프를 P0로 둔다.
- 이유: 기능 수보다 실제 현장 의사결정이 끝까지 연결되는지가 창의성, 추진성, 실효성을 동시에 증명한다.
- 기각한 대안: 지도·리포트·Near-miss 등 독립 기능을 먼저 다수 구현하는 방식.
- 영향 파일: `AGENTS.md`, `docs/product-spec.md`, `docs/architecture.md`, `docs/evals.md`, `docs/demo-script.md`

### ADR-002 — Safety Budget은 결정론적 운영지수로 구현한다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: Safety Budget, 위험 기여도, 신뢰도, Time-to-Breach와 개입 효과는 버전 설정을 사용하는 결정론적 코드가 계산한다.
- 이유: 실제 사고 라벨 없이 사고확률을 가장하지 않으면서 단조성, 재현성과 설명 가능성을 검증하기 위해서다.
- 기각한 대안: LLM이 점수나 권고안을 생성하는 방식, 사고확률로 표현하는 방식.
- 영향 파일: `docs/safety-model.md`, `docs/data-contracts.md`, `docs/architecture.md`, `docs/evals.md`

### ADR-003 — Safety Budget v1 경계를 고정한다

- 날짜: 2026-07-14
- 상태: Approved for MVP simulation
- 결정: 근무 시작 기준은 100, 초과 임계치는 30 미만, 지원 필요는 30 이상 45 미만, 주의는 45 이상 60 미만, 안정은 60 이상으로 둔다. 최대 계산 간격은 5분, 예측 범위는 120분이다.
- 이유: 대표 fixture와 경계·단조성 테스트에 재현 가능한 기준이 필요하다.
- 기각한 대안: 과학적 검증 없이 실제 현장 임계치라고 주장하는 방식, 화면에서 임의로 경계를 바꾸는 방식.
- 영향 파일: `docs/safety-model.md`, `docs/data-contracts.md`, `docs/evals.md`, 향후 모델 설정 파일
- 제한: 법적·의학적 기준이 아니며 MVP 시뮬레이션 규칙으로만 표현한다.

### ADR-004 — 안전 가능성을 추천 점수보다 먼저 검사한다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: 실행 불가 후보를 먼저 제외하고 실행 가능한 집합 안에서만 안전효과, ETA, 고객영향, 형평성과 복잡도를 비교한다. 불가능 후보는 이유와 함께 남긴다.
- 이유: 안전을 ETA·비용과 교환 가능한 가중치로 만들지 않기 위해서다.
- 기각한 대안: 모든 목표를 하나의 가중합으로 계산한 뒤 최고점 후보를 선택하는 방식, 불가능 후보를 숨기는 방식.
- 영향 파일: `docs/intervention-policy.md`, `docs/architecture.md`, `docs/evals.md`, `docs/design-system.md`

### ADR-005 — Risk Transfer Guard의 v1 바닥값을 적용한다

- 날짜: 2026-07-14
- 상태: Approved for MVP simulation
- 결정: 물량이관 후 수신 기사의 최소 예측 Budget은 45 이상이어야 하고 기준 대비 감소는 최대 15점이어야 한다. 수신 기사에게 예측 초과가 생기거나 용량·시간창·차량·권역 호환성을 위반하면 이관을 차단한다.
- 이유: 한 기사의 위험을 다른 기사에게 전가하는 물량 균등화를 방지하기 위해서다.
- 기각한 대안: 수신 기사가 30만 넘으면 허용하는 방식, 원 기사 개선만 평가하는 방식.
- 영향 파일: `docs/intervention-policy.md`, `docs/data-contracts.md`, `docs/evals.md`, `docs/demo-script.md`

### ADR-006 — 계획 변경에는 Two-Key Human Control을 사용한다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: 영향받는 기사 동의 후 관리자가 승인해야 계획을 적용한다. 물량이관은 원 기사와 수신 기사 양쪽의 동의를 요구한다. 수정 요청은 새 후보와 새 동의를 만들며 거절은 비징벌적으로 처리한다.
- 이유: 안전 운영이 자동 통제나 기사 감시로 변하는 것을 막고 동일한 결정 근거를 공유하기 위해서다.
- 기각한 대안: 관리자 단독 강제 승인, 거절한 후보 자동 재요청, 화면 전환만으로 동의를 간주하는 방식.
- 영향 파일: `docs/product-spec.md`, `docs/intervention-policy.md`, `docs/privacy-and-ai-policy.md`, `docs/architecture.md`, `docs/demo-script.md`

### ADR-007 — 국내 AI는 생성·문서·설명 계층에서 검증 가능하게 사용한다

- 날짜: 2026-07-14
- 상태: Approved; VARCO 역할과 공통 비교 범위는 ADR-021이 부분 대체
- 결정: A.X는 구조화 운영 시나리오, EXAONE은 경계·반례, VARCO는 한국어 비정형 현장문서의 오프라인 합성 후보 생성에 사용한다. Upstage는 문서 Parse·Extract와 검증된 JSON 기반 역할별 설명에 사용한다. 실제 역할은 공통 smoke benchmark 결과로 조정할 수 있다.
- 이유: 국내 AI 트랙의 모델 활용을 제품 핵심과 연결하되 생성 AI가 안전 정답을 소유하지 않게 하기 위해서다.
- 기각한 대안: 이름만 나열하는 활용, LLM이 Safety Budget·실행 가능성·추천을 계산하는 방식.
- 영향 파일: `docs/synthetic-data-plan.md`, `docs/privacy-and-ai-policy.md`, `docs/architecture.md`, `docs/evals.md`

### ADR-008 — A100과 API 사용은 재현 가능한 연구 산출물로 증명한다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: A100은 로컬 오픈 웨이트 기준선과 데이터 중복·커버리지 분석을 우선한다. 국내 AI API는 공통 smoke benchmark와 생성 manifest를 남긴다. 충분한 데이터와 검증 없이 조건부 생성모델 학습을 강행하지 않는다.
- 이유: 인프라 사용량 자체가 아니라 기술 고도화와 활용 적정성을 증명해야 하기 때문이다.
- 기각한 대안: GPU 사용을 위한 장식성 학습, 공급자별 다른 과업으로 비교하는 방식.
- 영향 파일: `docs/synthetic-data-plan.md`, `docs/evals.md`, 향후 실험 스크립트와 보고서

### ADR-009 — 단일 TypeScript 애플리케이션에서 책임을 분리한다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: React·TypeScript·Vite 기반 단일 애플리케이션 안에서 도메인 계산, 개입, 상태 전이, 데이터 어댑터, 국내 AI 어댑터와 UI를 모듈로 분리한다. 입력·외부 응답은 Zod로 검증하고 Vitest·Playwright로 검증한다.
- 이유: 2인 팀과 본선 일정에 맞는 가장 단순한 배포 단위를 유지하면서 핵심 책임 경계를 지키기 위해서다.
- 기각한 대안: 초기부터 다중 서비스·이벤트 브로커·복잡한 최적화 인프라를 도입하는 방식.
- 영향 파일: `docs/architecture.md`, 향후 `src/`, `api/`, 테스트 디렉터리

### ADR-010 — 데모 저장소와 계획 적용은 원자적 스냅샷으로 모사한다

- 날짜: 2026-07-14
- 상태: Approved for MVP demo
- 결정: 본선 MVP에서는 실제 TMS를 연결하지 않고 결정 ID에 묶인 불변 입력·평가·동의·승인 스냅샷을 사용한다. 적용 서비스가 경로·순서·ETA를 한 번에 교체하며 실패하면 마지막 확정 계획을 유지한다.
- 이유: 실제 배차시스템 없이도 승인 전후와 실패 상태를 정직하고 재현 가능하게 시연하기 위해서다.
- 기각한 대안: UI 상태만 변경해 적용 성공처럼 보이게 하는 방식, 일부 필드만 먼저 갱신하는 방식.
- 영향 파일: `docs/architecture.md`, `docs/intervention-policy.md`, `docs/evals.md`, `docs/demo-script.md`

### ADR-011 — 관리자와 기사 화면은 같은 결정 스냅샷을 사용한다

- 날짜: 2026-07-14
- 상태: Approved; 기사 표면은 ADR-031이 반응형 모바일 웹으로 구체화
- 결정: 관리자 Control Tower와 기사 모바일 화면은 같은 결정 ID, 수치, 기여도와 개입 평가를 사용하며 역할별 표현만 다르게 한다.
- 이유: 비대칭 정보와 설명 불일치를 막고 Two-Key Consent를 검증하기 위해서다.
- 기각한 대안: 화면별 fixture 또는 별도 계산, 기사에게 근거 없이 권고만 제시하는 방식.
- 영향 파일: `docs/design-system.md`, `docs/architecture.md`, `docs/evals.md`, `docs/demo-script.md`

### ADR-012 — 심사 성과는 실행 증거로만 주장한다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: 계획 문서는 심사 준비도를 보여주지만 개발 성과로 계산하지 않는다. 빌드, 테스트, CSV, 스크린샷, API 로그, 시연 영상과 사용자 평가가 존재할 때만 성과로 기록한다.
- 이유: 기술워크샵은 개발 성과와 인프라 활용 성과를 요구하며 합성·시뮬레이션을 실제 효과처럼 표현하면 신뢰를 잃기 때문이다.
- 기각한 대안: 계획된 수치나 기대효과를 완료된 결과로 서술하는 방식.
- 영향 파일: `docs/evals.md`, `docs/demo-script.md`, 본선 제안서와 발표자료

### ADR-013 — 디자인 방향을 역할별로 분리한다

- 날짜: 2026-07-14
- 상태: Approved at direction level
- 결정: 관리자는 Calm Control Tower, 기사는 Field-first Human UI를 사용한다. 빨강은 실제 임계치 초과에만 사용하고 상태는 색상 외 텍스트·아이콘으로도 표현한다.
- 이유: 관리자는 조치 우선순위와 근거를 빠르게 확인해야 하고, 기사는 정차 시 한 번에 하나의 결정을 안전하게 내려야 한다.
- 기각한 대안: 기사 순위 중심 관제, 과도한 다크·네온 대시보드, 색상만으로 위험을 전달하는 방식.
- 영향 파일: `docs/design-system.md`, `docs/demo-script.md`, 향후 UI

### ADR-014 — 궁극적 목표는 안전 제약을 운영 표준으로 만드는 것이다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: SafeRoute AI의 궁극적 목표는 배송계획 변경 전 모든 영향 기사의 미래 안전 가능영역을 검증하고, 같은 결정 근거와 인간의 동의·승인 아래 계획을 갱신하는 감사 가능한 운영 표준을 만드는 것이다.
- 이유: 대회용 화면이나 단일 위험점수에 머물지 않고 각 구현 단계가 현장 적용 가능한 폐루프에 기여하는지 판단할 기준이 필요하다.
- 기각한 대안: 기능 수, 모델 크기, 사고확률 또는 기사 점수의 개선을 최상위 목표로 두는 방식.
- 영향 파일: `docs/product-spec.md`, `docs/architecture.md`, `docs/evals.md`, `docs/demo-script.md`, 향후 전체 구현
- 측정: MVP North Star는 안전 제약을 위반하지 않고 필요한 동의·승인을 거쳐 완결된 시뮬레이션 계획 조정 비율이다. 불안전 적용, 무동의 적용, LLM 수치 변경은 허용치 0건이다.

### ADR-015 — 이관 군집 선택과 안전판정을 분리한다

- 날짜: 2026-07-14
- 상태: Approved
- 결정: v1 Domain은 경로·권역 계층이 제공한 명시적 4·8·12건 이관 군집을 정규화하고 평가한다. 아직 승인되지 않은 지리 군집 알고리즘을 Domain이 임의로 만들거나 배열 앞에서 N개를 자르지 않는다. 후보 ID, 전체 계획 재계산, Risk Transfer Guard와 추천 순위는 결정론적 Domain이 소유한다.
- 이유: 지리 군집 규칙은 지도·인계 데이터가 필요하지만 위험전가 차단은 그 선택 방식과 독립적으로 먼저 검증할 수 있기 때문이다.
- 기각한 대안: 배송지 배열 앞에서 N개 선택, 시나리오별 숨은 예외, 생성 AI가 이관 배송지를 직접 확정하는 방식.
- 영향 파일: `docs/intervention-policy.md`, `src/domain/interventions/`, `tests/interventions.test.ts`

### ADR-016 — 남은 개입 유형은 명시적 Demo 카탈로그로 평가한다

- 날짜: 2026-07-15
- 상태: Approved
- 결정: 배송순서 변경은 전체 stop ID 순서와 고정 stop 정책, 안전경로는 교체 대상과 완전한 대체 구간, Safe Delay는 지연 가능 stop·최대 지연·고객안내 가능 여부를 `ScenarioFixture.interventionInputs`에 명시한다. Domain은 이 입력으로 전체 계획을 다시 계산하며 실제 지도·서비스정책 알고리즘을 추정하지 않는다.
- 이유: 세 개입의 안전효과와 하드 제약을 재현하려면 명시적 반사실 입력이 필요하지만, 실제 공급자·분류 규칙은 아직 승인되지 않았기 때문이다.
- 기각한 대안: 현재 구간의 위험값을 임의로 낮추는 방식, 모든 일반 배송을 자동 지연 가능으로 간주하는 방식, 생성 AI가 경로·순서·지연 가능 여부를 확정하는 방식.
- 영향 파일: `docs/data-contracts.md`, `docs/intervention-policy.md`, `src/domain/contracts/`, `src/domain/interventions/`, `src/adapters/fixtures/`, `tests/interventions.test.ts`

### ADR-017 — 허용 묶음은 정규 순서로 순차 재계산한다

- 날짜: 2026-07-15
- 상태: Approved
- 결정: v1 묶음은 정책에 명시된 두 조치 조합 6종만 허용하고 `REST → TRANSFER_STOPS → REORDER_STOPS → SAFER_ROUTE → SAFE_DELAY`의 정규 부분순서로 적용한다. 각 조치는 직전 조치가 만든 전체 계획을 입력으로 전제조건과 하드 제약을 다시 검사하며, 최종 효과는 마지막 계획을 Safety Budget 엔진으로 한 번 더 평가한다.
- 이유: 단일 조치 효과를 합산하거나 기준 계획에 각 조치를 독립 적용하면 이관 후 잔여 배송지, 경로 변경 후 ETA와 시간창 같은 상호작용을 놓칠 수 있기 때문이다.
- 기각한 대안: 조치별 점수 합산, 입력 배열 순서 그대로 실행, 세 개 이상 조치의 임의 순열, 정책에 없는 조합을 낙관적으로 실행하는 방식.
- 영향 파일: `docs/data-contracts.md`, `docs/intervention-policy.md`, `src/domain/contracts/`, `src/domain/interventions/`, `tests/intervention-bundles.test.ts`

### ADR-018 — 결정 명령과 Demo 계획 적용은 순수 상태 전이로 구현한다

- 날짜: 2026-07-15
- 상태: Approved
- 결정: 기사 응답, 관리자 결정, 재검증, 계획 적용과 고객안내 기록은 허용 상태와 행위자 권한을 검사하는 순수 명령 함수로 구현한다. 동의는 10분 동안 candidate·plan·모델·정책 버전에 묶고, 만료는 `RIDER_CONSENT_EXPIRED`로 기록한다. MVP 계획 적용은 검증된 새 `ScenarioFixture`와 고객안내 요청 ID를 새 Demo store로 완성한 뒤 활성 참조를 한 번에 교체하며, 실패·버전 충돌·중복 요청은 기존 store를 변경하지 않는다.
- 이유: UI에서 상태를 직접 바꾸거나 계획 객체를 부분 수정하면 동의·승인 우회, 감사기록 단절과 부분 적용을 막을 수 없기 때문이다.
- 기각한 대안: React 로컬 상태가 승인 조건을 소유하는 방식, 외부 TMS 성공을 가정하는 방식, 실패 후 일부 ETA·작업목록을 남기는 방식, 기사 응답을 감사 이벤트 없이 덮어쓰는 방식.
- 영향 파일: `docs/data-contracts.md`, `docs/intervention-policy.md`, `src/domain/contracts/`, `src/domain/decisions/`, `src/application/apply-plan/`, `tests/decision-workflow.test.ts`

### ADR-019 — Upstage 설명은 검증된 별도 결과로만 표시한다

- 날짜: 2026-07-16
- 상태: Approved for MVP demo
- 결정: 역할별 최소 사실, 허용 행동과 인용만 strict 입력으로 만들고 Upstage 출력은 숫자·인용·역할·Demo 상태 Gate를 통과한 별도 설명 결과로만 표시한다. timeout, malformed, 새 숫자, 잘못된 인용 또는 금지문구가 있으면 결정론적 템플릿으로 전환한다. 실제 모델명·endpoint·quota가 승인되기 전에는 Mock과 Fallback만 사용하고 이를 Live로 표시하지 않는다.
- 이유: 생성문이 Safety Budget·추천·동의·적용 상태를 변경하거나 실패한 외부 연결을 정상처럼 보이게 하지 않으면서 국내 AI 활용을 폐루프 안에 연결하기 위해서다.
- 기각한 대안: 전체 결정 객체 전송, LLM이 수치나 추천을 다시 계산하는 방식, 검증 실패 응답의 부분 표시, 브라우저에서 API 키로 직접 호출하는 방식.
- 영향 파일: `docs/data-contracts.md`, `docs/architecture.md`, `docs/evals.md`, `src/domain/contracts/`, `src/application/explanations/`, `src/adapters/upstage/`, `src/ui/`, `tests/upstage-explanations.test.ts`

### ADR-020 — A100 로컬 기준선은 A.X 4.0 Light의 고정 revision으로 실행한다

- 날짜: 2026-07-16
- 상태: Approved for benchmark
- 결정: 첫 A100 로컬 생성 기준선은 `skt/A.X-4.0-Light` revision `ba21c20ea1b31ded1ec3e2fb432335077dc4be98`을 BF16·비양자화·batch size 1로 실행한다. 입력은 4,096 tokens 이하, 생성은 최대 512 tokens로 제한한다. 모델은 구조화 JSON smoke benchmark와 지연·VRAM·실패 측정에만 사용하며 Safety Budget, 실행 가능성, 추천, 동의와 적용 상태를 만들거나 변경하지 않는다.
- 이유: 공식 공개 7B 한국어 모델이고 Apache-2.0이며, 약 13.53GB의 고정 snapshot이 확인돼 A100 80GB와 서버 81GB 여유공간에서 재현 가능한 단일 GPU 기준선을 구성할 수 있기 때문이다.
- 기각한 대안: 라이선스 제한이 더 큰 EXAONE 3.5를 첫 기준선으로 사용, 35B·72B 모델로 초기 저장공간과 실행 복잡도를 늘리는 방식, 최신 `main`을 revision 없이 다운로드, 양자화를 먼저 적용해 BF16 기준선을 잃는 방식.
- 영향 파일: `docs/synthetic-data-plan.md`, `docs/gpu-benchmark-runbook.md`, `docs/evals.md`, `artifacts/evals/local-model-manifest.json`, 향후 A100 benchmark 스크립트와 결과 CSV

### ADR-021 — 공급자 가이드에 따라 공통 텍스트 평가와 VARCO 에셋 역할을 분리한다

- 날짜: 2026-07-17
- 상태: Approved
- 대체 관계: ADR-007의 VARCO 한국어 비정형 문서 생성 역할과 세 모델 공통 텍스트 benchmark 범위를 대체한다. A.X·EXAONE·Upstage의 안전 책임 경계는 유지한다.
- 결정: 대회 제공 SKT 가이드의 OpenAI-compatible A.X K1 API와 LG 가이드의 FriendliAI 기반 K-EXAONE API만 동일한 12개 텍스트 설명 과업으로 비교한다. 문서에 명시된 HTTPS endpoint와 host만 서버 어댑터에서 허용하고 API 키는 환경변수로만 주입한다. NC 가이드가 VARCO를 3D·이미지/텍스처·음성/사운드·번역 등 LLM 기획 이후의 에셋 구현 단계로 설명하므로, VARCO를 공통 텍스트 benchmark나 비정형 현장문서 생성기로 가장하지 않는다. P0 폐루프에 필요한 에셋 사용처가 별도 승인되기 전에는 VARCO 연동을 보류한다.
- 이유: 공급자가 문서화한 실제 제품 역할과 비교 가능한 계약을 지키고, 심사에서 모델 이름을 나열하기 위한 장식성 연동이 P0 일정과 안전 설명 계층을 왜곡하지 않게 하기 위해서다.
- 기각한 대안: VARCO를 OpenAI-compatible 텍스트 LLM으로 추정해 같은 endpoint 계약을 적용하는 방식, P0와 무관한 이미지·음성 에셋을 심사용으로 추가하는 방식, 임의의 외부 host를 환경변수만으로 허용하는 방식.
- 근거: 2026 AI ROOKIE 제공 자료 `SKT-AI 모델 및 API 활용법` p.9, `LG AI연구원-AI 모델 및 API 활용법` p.15, `NC AI-AI 모델 및 API 활용법` pp.10–12.
- 영향 파일: `.env.example`, `README.md`, `docs/synthetic-data-plan.md`, `docs/evals.md`, `src/evals/domesticAiProvider.ts`, `src/evals/domesticAiBenchmark.ts`, `scripts/domestic-ai-smoke-entry.ts`, `scripts/run-domestic-ai-smoke.mjs`, `tests/domestic-ai-benchmark.test.ts`

### ADR-022 — 원본 증거가 없는 합성 특징은 public-derived로 표시하지 않는다

- 날짜: 2026-07-17
- 상태: Approved
- 결정: 원본 데이터셋 ID·공식 URI·버전, 라이선스 또는 이용정책, 원본 파일 SHA-256과 변환기 버전이 모두 추적되는 경우에만 `PUBLIC_DATA_DERIVED`를 사용한다. 현재 세 대표 fixture의 날씨·권역·경로 특징은 실제 공공데이터 파일과 연결되지 않았으므로 값은 유지하되 모두 `MOCK` Demo provenance로 교정한다. 공공데이터나 AI Hub 원본을 수집하기 전에는 이를 실제 분포·현장 검증·공공데이터 활용 성과로 표현하지 않는다.
- 이유: `public feature definitions`를 참고했다는 일반 설명만으로는 특정 데이터의 출처, 라이선스와 재현 가능한 변환을 입증할 수 없고, 심사·사용자에게 합성 Demo를 공공데이터 기반으로 오인시킬 수 있기 때문이다.
- 기각한 대안: 현재 라벨을 유지하고 문서 각주로만 한계를 설명하는 방식, URL만 있으면 public-derived로 허용하는 방식, 합성 수치를 실제 공공데이터 원본으로 대체했다고 추정하는 방식.
- 영향 파일: `docs/product-spec.md`, `docs/data-contracts.md`, `docs/safety-model.md`, `docs/evals.md`, `docs/demo-script.md`, `src/domain/contracts/schemas.ts`, `src/adapters/fixtures/scenarioFactory.ts`, `tests/contracts.test.ts`, `artifacts/evals/data-provenance-audit.json`

### ADR-023 — 기상청 초단기실황은 검증된 후보로 격리하고 Safety 입력으로 자동 승격하지 않는다

- 날짜: 2026-07-17
- 상태: Approved
- 결정: DS-001의 첫 연동은 기상청 초단기실황 공식 HTTPS endpoint의 exact allowlist, 서버 전용 secret, 응답 크기·timeout·최신성·스키마 검증과 원본 응답 SHA-256을 갖춘 어댑터로 제한한다. 원본이 직접 제공하는 기온·시간당 강수·습도·풍속·강수형태만 후보로 보존한다. 현재 `WeatherState`에 필수인 체감온도·시정·노면상태·시간당 적설을 원본에서 모두 확보하지 못하므로 결과에 `safeForSafetyEngine=false`와 결측 필드를 기록하고, 보완 출처와 매핑 정책이 승인될 때까지 Demo/Fallback 날씨를 유지한다. 가짜 응답 계약 검증 결과는 항상 `MOCK`으로 표시한다.
- 이유: 일부 관측값의 실연동 성공이 전체 안전 입력의 현장 타당성을 의미하지 않으며, 원본에 없는 필드를 계산하거나 낙관적으로 채우면 Safety Budget을 왜곡할 수 있기 때문이다.
- 기각한 대안: 기온으로 체감온도를 임의 대체하는 방식, 강수형태로 노면을 단정하는 방식, 누락된 시정·적설을 0으로 채우는 방식, Mock 응답 hash를 공공데이터 원본 증거로 기록하는 방식.
- 영향 파일: `.env.example`, `docs/data-sources.md`, `docs/architecture.md`, `docs/evals.md`, `src/adapters/weather/kma.ts`, `scripts/kma-weather-smoke-entry.ts`, `scripts/run-kma-weather-smoke.mjs`, `tests/kma-weather-adapter.test.ts`

### ADR-024 — 승인된 기상청 API허브 4.1·4.2 계약을 함께 사용한다

- 날짜: 2026-07-17
- 상태: Approved
- 대체 관계: ADR-023의 데이터 격리·Safety 자동 승격 차단은 유지하고, 최초 공공데이터포털 단일 실황 endpoint 계약을 API허브 4.1·4.2 계약으로 대체한다.
- 결정: 사용자가 활용 승인을 받고 인증키를 발급받은 기상청 API허브 `4.1 초단기실황조회`와 `4.2 초단기예보조회`만 허용한다. exact allowlist는 `apihub.kma.go.kr`의 두 HTTPS path로 고정하고 인증은 query의 `authKey`로만 주입한다. 실황은 현재 관측 후보, 초단기예보는 발표시각부터 최대 6시간의 시간순 후보로 분리 검증한다. 인증키와 원문 응답은 산출물에 저장하지 않고 응답 SHA-256만 보존한다. 두 결과 모두 필수 안전 필드가 부족하므로 Domain 입력 승인은 계속 `false`다.
- 이유: 승인된 공급 경로와 실제 인증 계약을 일치시키고, SafeRoute의 60~120분 미래 예측에 필요한 예보를 현재 관측과 구분해 검증하기 위해서다.
- 기각한 대안: API허브 인증키를 공공데이터포털 `serviceKey`에 재사용하는 방식, 4.1 실황만으로 미래 날씨를 고정하는 방식, 4.2의 모든 시점을 하나의 현재값으로 병합하는 방식, 임의 host·path를 환경변수로 허용하는 방식.
- 근거: 기상청 API허브 `단기예보자료(2001년 2월 이후) 조회`의 4.1·4.2 API 명세, 2026-07-17 사용자 활용 승인·키 발급 확인.
- 영향 파일: `.env.example`, `README.md`, `docs/data-sources.md`, `docs/architecture.md`, `docs/evals.md`, `src/adapters/weather/kma.ts`, `scripts/kma-weather-smoke-entry.ts`, `tests/kma-weather-adapter.test.ts`

### ADR-025 — Live 날씨는 적합성 Gate를 통과하기 전 Safety 입력으로 변환하지 않는다

- 날짜: 2026-07-17
- 상태: Approved
- 결정: 기상청 Live 후보와 `WeatherState` 사이에 별도의 결정론적 적합성 Gate를 둔다. `RN1` 구간값은 중간값을 만들지 않고, 유한 상한이 있으면 상한을 사용하되 Safety 모델의 강수 정규화 상한 20mm/h에서 자른다. `50mm 이상`처럼 상한이 없더라도 하한이 이미 정규화 상한을 넘으면 20mm/h를 사용한다. 이는 실제 강수량 추정값이 아니라 `CONSERVATIVE_NORMALIZATION_BOUND` 가정으로 기록한다. `roadSurface`는 현재 v1 계산에 사용되지 않으므로 `UNKNOWN`으로만 표시할 수 있다. 체감온도·시정·시간당 적설은 직접 출처 또는 별도 승인된 결정론적 변환이 없으면 차단 필드로 유지하며, 현재 관측값을 미래 120분에 자동 복제하지 않는다.
- 이유: 강수 구간의 임의 중간값은 출처를 왜곡하지만, 단조 증가 후 20mm/h에서 포화되는 현재 모델에서는 구간 상한 또는 포화 하한을 사용하는 것이 위험을 과소평가하지 않으면서 계산 효과를 재현할 수 있기 때문이다. 나머지 세 필드는 현재·미래 의미와 단위가 달라 조용한 대체가 안전하지 않다.
- 기각한 대안: `1mm 미만`을 0.5로 바꾸는 방식, 구간 하한을 사용하는 방식, 결측 필드를 0으로 채우는 방식, 현재 시정·체감온도·적설을 모든 미래 시점에 무감점 복제하는 방식, 노면을 강수형태만으로 `WET`·`SNOW`로 단정하는 방식.
- 후속 후보: API허브 고해상도 격자자료 1.3의 `ta_chi`·`vs`·`sd_3hr`는 현재 상태 보완 후보이나 `sd_3hr`는 시간당 적설과 동일하지 않다. 동네예보 4.3의 `SNO`는 미래 적설 후보이며 별도 활용 승인과 계약 검증이 필요하다.
- 영향 파일: `docs/data-sources.md`, `docs/data-contracts.md`, `docs/safety-model.md`, `docs/evals.md`, `src/adapters/weather/coverage.ts`, `scripts/run-kma-weather-coverage.mjs`, `tests/kma-weather-adapter.test.ts`

### ADR-026 — 승인된 1.3·4.3은 현재 관측과 미래 적설의 부분 보완으로만 사용한다

- 날짜: 2026-07-17
- 상태: Approved
- 결정: 활용 승인된 DS-005 `1.3 특정지점 다중요소 API`와 DS-006 `4.3 단기예보조회 API`를 기존 서버 전용 `authKey`와 exact endpoint로만 호출한다. 1.3의 `ta_chi`는 현재 체감온도 °C로, `vs`는 km에서 m로 단위 변환해 보존한다. `sd_3hr`는 3시간 신적설이며 시간당 적설로 나누지 않는다. 4.3의 `SNO`는 현재부터 120분 범위의 미래 시간당 신적설 후보로만 사용한다. `0.5cm 미만`과 `5.0cm 이상`은 중간값을 만들지 않고 구간으로 보존하며 Safety 모델의 3cm/h 포화 상한에 대한 보수적 경계만 선택할 수 있다. 현재 시간당 적설과 미래 체감온도·시정이 남아 있으므로 전체 `WeatherState`와 Safety 입력 승인은 계속 `false`다.
- 이유: 승인된 공공데이터로 실제 결측 일부를 줄이면서도 시간 의미가 다른 3시간 적설을 임의 환산하거나 현재 체감온도·시정을 미래에 복제해 위험을 과소평가하지 않기 위해서다.
- 기각한 대안: `sd_3hr / 3`을 현재 시간당 적설로 사용하는 방식, 현재 `ta_chi`·`vs`를 향후 120분에 복제하는 방식, `SNO` 구간의 중간값을 사용하는 방식, 일부 필드가 채워졌다는 이유로 전체 Live Safety 입력을 승인하는 방식, 임의 endpoint를 환경변수로 허용하는 방식.
- 실행 근거: 2026-07-17 Live 표본에서 1.3 현재 체감온도 29.7°C·시정 6,900m·3시간 신적설 0cm, 4.3 21·22·23시 적설 0cm/h 3개 시점을 스키마·최신성·SHA-256으로 검증했다. 인증키·원문·위경도는 산출물에 저장하지 않았다.
- 영향 파일: `.env.example`, `README.md`, `docs/data-sources.md`, `docs/data-contracts.md`, `docs/safety-model.md`, `docs/architecture.md`, `docs/evals.md`, `src/adapters/weather/supplement.ts`, `src/adapters/weather/coverage.ts`, `scripts/kma-supplement-smoke-entry.ts`, `scripts/run-kma-supplement-smoke.mjs`, `tests/kma-weather-supplement.test.ts`, `artifacts/evals/kma-weather-supplement-live-latest.json`

### ADR-027 — 4.3의 TMP·REH·WSD로 공식 계절별 체감온도만 결정론적으로 산출한다

- 날짜: 2026-07-17
- 상태: Approved
- 대체 관계: ADR-026의 미래 체감온도 차단을 공식 입력과 공식 적용조건을 충족한 시점에 한해 해소한다. 미래 시정·현재 시간당 적설 차단은 유지한다.
- 결정: 승인된 DS-006 4.3 단기예보가 직접 제공하는 `TMP` 기온, `REH` 상대습도, `WSD` 풍속을 같은 격자·발표·발효시각으로 검증한 뒤 기상청 예보업무규정 별표 10의 체감온도 공식에만 입력한다. 5∼9월은 Stull 습구온도 추정식과 습도 기반 공식을 사용한다. 10월∼다음 해 4월은 기온 10°C 이하·풍속 1.3m/s 이상에서만 풍속을 km/h로 변환해 겨울 공식을 사용하며, 적용조건 밖이면 값을 만들지 않는다. 원본 입력과 공식 버전을 provenance에 남기고 생성형 AI나 임의 보간·반올림은 사용하지 않는다. 4.3의 3시간 발표주기와 약 10분 제공지연을 반영해 발표 최신성 한도는 전용 210분으로 고정하고, 1.3·4.1·4.2의 최신성 설정과 분리한다.
- 이유: 기상청이 동네예보 체감온도에 여름철 습도·겨울철 풍속을 사용한다고 명시하고 공식과 입력 단위를 공개했으며, 4.3이 필요한 원본 필드를 같은 예보시점에 직접 제공하기 때문이다.
- 기각한 대안: `TMP`를 체감온도로 그대로 복사하는 방식, 비공식 heat index 공식을 사용하는 방식, 계절·겨울 적용조건을 무시하는 방식, 현재 1.3 `ta_chi`를 미래에 복제하는 방식, 입력 결측을 0으로 채우는 방식.
- 남은 경계: 승인된 4.3에는 육상 미래 시정이 없고 현재 시간당 적설의 관측 계약도 확정되지 않았다. 두 필드는 계속 Gate를 차단하며 신규 API 활용신청 또는 별도 정책 승인 전에는 Live `WeatherState`를 만들지 않는다.
- 근거: 기상청 예보업무규정(2025.6.13.) 별표 10, 기상자료개방포털 체감온도 설명, 기상청 API허브 동네예보 4.3 변수 명세.
- 실행 근거: 2026-07-17 20:00 KST 발표의 22·23·00시 `TMP·REH·WSD`에서 공식 여름식으로 약 30.04·29.38·28.71°C를 산출했다. 최초 Live 재실행은 공통 120분 최신성 한도로 정상 20시 발표를 `STALE_DATA` 처리해 실패 산출물로 보존했고, 3시간 발표주기 전용 210분 계약으로 분리한 뒤 통과했다.
- 영향 파일: `docs/data-sources.md`, `docs/data-contracts.md`, `docs/safety-model.md`, `docs/architecture.md`, `docs/evals.md`, `src/adapters/weather/supplement.ts`, `src/adapters/weather/coverage.ts`, `tests/kma-weather-supplement.test.ts`, `artifacts/evals/kma-weather-supplement-live-latest.json`

### ADR-028 — 불완전한 Live 날씨는 필드 혼합 없이 전체 Demo 타임라인으로 Fallback한다

- 날짜: 2026-07-17
- 상태: Approved
- 결정: KMA 적합성 Gate가 `safeForSafetyEngine=false`이면 Live 후보의 준비된 일부 필드도 Safety 계산에 넣지 않는다. `INCOMPLETE_COVERAGE` 오류와 시간범위별 차단 필드를 기록하고, 승인된 결정론적 Demo fixture의 `WeatherState[]` 전체를 `FALLBACK` 입력으로 선택한다. Live 후보는 공식 출처 ID·수집시각·응답 SHA-256·준비/차단 필드만 별도 evidence로 보존하며 `liveEvidenceUsedForSafety=false`, `mixedLiveAndDemoFields=false`를 감사 불변조건으로 둔다. 관리자·기사 화면은 `Demo fixture · Weather Fallback`을 공통 표시하고 실제 계산값과 Live 부분 증거를 구분한다.
- 이유: Live 강수·체감온도 같은 준비 필드와 Demo 시정·적설을 한 객체에 섞으면 출처·시점·신뢰도의 의미가 사라지고, 사용자가 부분 연동을 완전한 Live Safety 결과로 오인할 수 있기 때문이다. 전체 fixture 전환은 현재 P0 폐루프의 결정론적 재현성을 유지하면서 불완전한 외부 데이터를 정직하게 보여준다.
- 기각한 대안: 준비된 Live 필드와 Demo 결측 필드를 병합하는 방식, 결측 시정·적설을 0으로 채우는 방식, 화면만 Live로 표시하는 방식, 마지막 Live 값을 조용히 재사용하는 방식, Live evidence 자체를 숨기는 방식.
- 영향 파일: `docs/product-spec.md`, `docs/data-contracts.md`, `docs/architecture.md`, `docs/evals.md`, `src/domain/contracts/schemas.ts`, `src/adapters/weather/runtime.ts`, `src/ui/demoSession.ts`, `src/ui/App.tsx`, `src/ui/styles.css`, `tests/weather-runtime.test.ts`, `tests/ui-demo-session.test.ts`

### ADR-029 — 3방식 비교는 같은 후보 집합에서 선택 규칙만 분리한다

- 날짜: 2026-07-17
- 상태: Approved for evaluation
- 결정: frozen benchmark의 `FASTEST_ONLY`, `BALANCED_ONLY`, `SAFEROUTE`는 같은 합성 fixture, 기준시각, 후보 카탈로그와 결정론적 개입 평가를 공유한다. `FASTEST_ONLY`는 실행 가능성과 Safety Budget을 보지 않고 `etaDeltaMinutes`가 가장 작은 후보를 고른다. `BALANCED_ONLY`는 실행 가능성과 Safety Budget을 보지 않고 후보 적용 후 기사별 남은 배송 수의 최대-최소 차가 가장 작은 후보를 고르며, 동률이면 ETA와 candidate ID 순으로 고른다. `SAFEROUTE`는 기존 Risk Transfer Guard를 포함한 하드 제약을 먼저 통과한 후보만 기존 추천 순위로 고른다. 앞의 두 방식이 고른 실행 불가 후보는 제거하지 않고 `hardConstraintViolation=true`로 기록한다.
- frozen set: 대표 fixture 3개의 각 parent에서 누적근무 +30/+60분, 연속근무 +15/+30분, 남은 중량 +10%, 강수 +2mm/h, 시정 -20%, 경사 +2%p, 지역 incident factor +0.05, 자기점검 결측의 10개 단일 변형을 만든다. 총 30개는 모두 `FROZEN_TEST`, `MOCK`, `isDemo=true`이며 generator version, seed, parent ID와 변형 ID를 고정한다. 자기점검 결측은 현재 v1 신뢰도 모델이 선택형 입력 부재에 감점을 주지 않는 경계를 드러내는 평가 사례이며, 현장 결측 처리 완료를 의미하지 않는다.
- 이유: 안전 제약의 효과를 비교하면서도 서로 다른 입력·후보를 사용해 SafeRoute에 유리한 비교를 만들지 않고, 평균값이 하드 제약 위반을 숨기지 않게 하기 위해서다.
- 기각한 대안: 세 방식마다 다른 후보 집합을 사용하는 방식, Fastest/Balanced의 불안전 후보를 사후 제거하는 방식, LLM으로 변형·정답을 생성하는 방식, 한 번에 여러 요인을 바꿔 원인을 추적하기 어렵게 하는 방식.
- 영향 파일: `docs/evals.md`, `src/evals/frozenBenchmark.ts`, `tests/frozen-benchmark.test.ts`, `scripts/run-core-eval-artifacts.mjs`, `artifacts/evals/frozen-variant-results.csv`, `artifacts/evals/baseline-comparison.csv`, `artifacts/evals/frozen-benchmark-summary.json`

### ADR-030 — Risk Transfer Guard 경계는 직접 20건과 전체 계획 3건으로 이중 검증한다

- 날짜: 2026-07-17
- 상태: Approved for evaluation
- 결정: 수신 기사 최소 Budget 45와 최대 감소 15점의 부등호를 직접 검증하는 결정론적 경계 세트 20건을 고정한다. 16건은 candidate minimum `44.99·45·45.01·60`과 Budget drop `0·14.99·15·15.01`의 조합이고, 4건은 `NO_BREACH_IN_HORIZON`, `PREDICTED`, `ALREADY_BREACHED`와 임계값 동시 위반을 검사한다. 이에 더해 우천 대표 fixture의 4·8·12건 이관 전체 계획 재계산 3건을 같은 결과표에 보존한다. 직접 경계와 전체 계획의 기대 판정은 구현 결과와 별도로 명시하고 불일치 시 산출물 생성을 실패시킨다.
- 이유: 4·8·12건 예시만으로는 정확히 45와 15인 허용 경계, 0.01 아래·위와 수신 기사 breach 판정을 충분히 입증하지 못하기 때문이다.
- 기각한 대안: 임의 난수만 사용해 정확 경계를 놓치는 방식, 직접 함수만 검사하고 전체 계획 재계산을 생략하는 방식, 실행 불가 결과를 평균에서 제외하는 방식.
- 영향 파일: `docs/evals.md`, `src/evals/riskTransferBoundaries.ts`, `tests/risk-transfer-boundaries.test.ts`, `scripts/run-core-eval-artifacts.mjs`, `artifacts/evals/risk-transfer-boundaries.csv`, `artifacts/evals/risk-transfer-boundary-summary.json`

### ADR-031 — 본선 데모 디자인은 기존 폐루프 위에 최소 이식한다

- 날짜: 2026-07-18
- 상태: Approved
- 결정: 현재 React·Vite 단일 애플리케이션과 결정론적 폐루프를 유지하고, 별도 디자인 프로토타입에서는 레이아웃·정보구조·색상 패턴만 이식한다. 관리자는 밝은 Calm Control Tower와 큰 schematic route를 유지하며 지도와 지원 큐의 같은 decision을 양방향 연결한다. 기사 화면은 설치형 PWA가 아닌 반응형 모바일 웹으로 명시하고 하단 주요 탭을 `운행 / 안전지원 / 내 정보` 세 개로 고정한다. 기사 지도는 현재 위치·휴식 지점·다음 배송지만 나타내는 compact `Fallback map`으로 제한한다. 팔레트는 오프화이트·네이비 구조, 블루 운영 행동, 틸 안전 상태, 앰버 대기, 빨강 실제 초과·차단으로 통일하고 보라색은 사용하지 않는다.
- 이유: 완성된 안전 엔진·동의·승인·계획 적용 테스트를 보존하면서도 관리자와 기사가 실제 운영 흐름을 더 빠르게 이해하도록 정보 위계를 정리하기 위해서다.
- 기각한 대안: 별도 Next.js 프로토타입을 제품 저장소에 병합하는 방식, 관리자·기사 UI 전체 재작성, 실제 로그인처럼 보이는 Demo 진입, 실지도 공급자 도입, 설치형 PWA·오프라인·푸시 기능 추가, 외부 UI 의존성 추가, 레퍼런스 화면의 외형을 복제하는 방식.
- 영향 파일: `docs/design-system.md`, `docs/decisions.md`, `docs/demo-script.md`, `src/ui/App.tsx`, `src/ui/styles.css`, `e2e/saferoute-demo.spec.ts`, `artifacts/evals/screenshots/`, `artifacts/evals/accessibility-summary.json`

### ADR-032 — 결정 폐루프는 시간·동의·버전 30개 경계로 독립 고정한다

- 날짜: 2026-07-18
- 상태: Approved for evaluation
- 결정: 기존 결정 상태기계와 원자 적용 코드를 변경하지 않고, 실제 command를 실행하는 결정론적 경계 30개를 고정한다. 시간 8개는 사건시각 역행·동일시각과 동의 9.999분·정확히 10분의 승인·만료·재검증을 검사한다. 동의·권한 12개는 상태 건너뛰기, 대리·미요청·중복 응답, 양측 동의, 수정·거절, 동일 후보 재사용, 관리자 보류·재개를 검사한다. 버전 10개는 활성 계획·Safety 모델·설정·개입 정책·평가 계획·후보·중요 입력 변경, 적용시점 경쟁, 제안 계획 불일치와 멱등 재실행을 검사한다. 각 사례는 예상 outcome과 reason code를 구현 결과와 별도로 고정하며 하나라도 다르면 평가 산출물 생성을 실패시킨다.
- 이유: 정상 폐루프 한 건과 단편적인 단위 테스트만으로는 정확히 10분인 동의 만료 경계, 동의 후 입력 변경, 승인 후 계획 경쟁과 중복 적용 방지를 제출 증거로 추적하기 어렵기 때문이다.
- 기각한 대안: 기존 테스트 개수만 성과로 기록하는 방식, UI 클릭만으로 경쟁조건을 추정하는 방식, 난수 기반 경계 생성, 상태기계 내부 함수를 복제해 실제 command를 호출하지 않는 방식.
- 영향 파일: `docs/evals.md`, `docs/decisions.md`, `src/evals/decisionWorkflowBoundaries.ts`, `tests/decision-workflow-boundaries.test.ts`, `scripts/run-core-eval-artifacts.mjs`, `artifacts/evals/decision-workflow-boundaries.csv`, `artifacts/evals/decision-workflow-boundary-summary.json`

### ADR-033 — 국내 AI 트랙 성과는 제품 런타임·평가 경계로 자동 감사한다

- 날짜: 2026-07-18
- 상태: Approved for evaluation
- 결정: SafeRoute의 생성형 AI 런타임과 모델 평가 공급자를 Upstage Solar, SKT A.X와 LG K-EXAONE으로 한정하고 exact HTTPS host·모델 식별자·SDK·credential 경계를 자동 감사한다. `OpenAI-compatible`은 통신 형식으로만 분류하며 OpenAI 서비스 사용으로 계산하지 않는다. NC VARCO는 P0 미연동을 유지한다. Hugging Face는 SKT A.X 고정 revision 배포 도구로만 분류하고 hosted inference로 사용하지 않는다. 과거 Claude 개발 프롬프트와 격리형 ChatGPT 디자인 프로토타입은 제품 런타임·평가 성과가 아니며 최종 제출 패키지에서 제외한다.
- 이유: 국내 AI 트랙 활용명세를 설명에만 의존하면 프로토콜 이름, 모델 배포 도구와 과거 개발 참고물이 실제 해외 AI 런타임 사용으로 오해될 수 있다. 반대로 흔적을 숨기지 않고 제품·평가 실행 경계와 제출 범위를 자동 검사하면 실제 국내 AI 활용 성과를 재현 가능하게 설명할 수 있다.
- 기각한 대안: 저장소의 모든 `OpenAI` 문자열을 삭제해 프로토콜 계약을 불명확하게 만드는 방식, 개발 보조 도구를 국내 AI 사용 성과로 포함하는 방식, 문서 선언만 하고 endpoint·SDK·credential을 검사하지 않는 방식, VARCO를 P0 텍스트 모델로 추가하는 방식.
- 영향 파일: `docs/domestic-ai-track-compliance.md`, `docs/final-readiness.md`, `docs/decisions.md`, `README.md`, `package.json`, `scripts/run-domestic-track-audit.mjs`, `artifacts/evals/domestic-track-compliance-latest.json`

### ADR-034 — 공개 배포는 합성 Demo 전용 정적 앱으로 제한한다

- 날짜: 2026-07-18
- 상태: Approved
- 결정: 팀 승인에 따라 과거 비국내 AI 개발 프롬프트 파일을 GitHub main에서 삭제한다. SafeRoute 공개 사이트는 현재 검증된 React·Vite 화면과 결정론적 fixture만 배포하며, Cloudflare Worker 호환 정적 자산 어댑터는 `ASSETS` 제공과 SPA fallback만 담당한다. 공개 접근을 허용하되 API 키와 `.env.local`은 배포물에 포함하지 않고, 실제 인증·지도·TMS·고객 알림·개인정보 처리처럼 보이는 기능을 추가하지 않는다. 화면의 `Demo fixture`, `Fallback map`, 합성 결과 한계를 유지한다.
- 이유: 국내 AI 트랙 제출 범위를 더 명확하게 만들고 심사자가 별도 설치 없이 같은 폐루프를 재현할 수 있게 하면서도, 공개 배포를 실제 운영 서비스로 오인하거나 서버 자격증명이 노출되는 위험을 막기 위해서다.
- 기각한 대안: 과거 프롬프트를 main에 계속 보존하는 방식, API 키가 필요한 Live 데모 공개, 별도 디자인 프로토타입 배포, 실제 인증처럼 보이는 진입 화면, 검증되지 않은 외부 지도·알림 연동 추가.
- 영향 파일: `SafeRoute_AI_Fable5_Prompt_Pack_KR.md`, `.openai/hosting.json`, `package.json`, `scripts/build-sites-worker.mjs`, `scripts/run-domestic-track-audit.mjs`, `scripts/run-final-readiness-audit.mjs`, `docs/domestic-ai-track-compliance.md`, `docs/submission-package.md`, `docs/final-readiness.md`

### ADR-035 — 최종 디자인 목표를 다지역 지리공간 Control Tower와 현장형 기사 PWA로 고정한다

- 날짜: 2026-07-18
- 상태: Approved
- 대체 관계: ADR-031의 단일 schematic 지도와 반응형 모바일 웹은 현재 공개 Demo의 정직한 구현 경계로 유지하되, 최종 제품 디자인 목표에 한해서 이 결정이 대체한다.
- 결정: 최종 관리자 화면은 `전국·권역 → 지역·허브 → 기사·decision`으로 좁혀 가는 다지역·다기사 지리공간 Control Tower로 설계한다. 지도와 지원 큐는 같은 식별자로 양방향 연결하고, 기사 위치·계획 경로·날씨·도로위험·집계 Near-miss·지원 decision을 출처와 최신성이 있는 레이어로 표시한다. 낮은 확대 수준에서는 개별 기사와 정밀 위치를 군집화한다. 검증된 Live 위치만 움직이며 stale·오프라인·Demo는 멈춤과 명시적 라벨로 구분한다. 기본 지도는 2D이고, 지형·도심 구조·겹친 경로를 더 잘 설명하는 경우에만 접근 가능한 2.5D·3D를 점진적으로 제공한다. 최종 기사 화면은 설치 가능한 현장형 PWA를 목표로 하며 `운행 / 안전지원 / 내 정보` 3탭, 현재 위치 지도, 다음 지점·Safe-until, 현장 맥락 이미지·일러스트와 큰 단일 행동을 사용한다. 사람의 동의·수정·거절·승인과 Risk Transfer Guard는 모든 시각 추천보다 우선한다.
- 변경통제: `docs/design-system.md`의 `design-v2.0.0`을 source of truth로 사용한다. 이 방향을 바꾸려면 문제, 사용자 근거, 안전·개인정보 영향, 대안, 테스트 영향과 승인자를 새 ADR에 기록하고 사용자 승인을 받아야 한다. 디자인 목표 승인은 위치 수집, 지도 공급자, PWA 보안, 실제 인증이나 새 외부 의존성의 구현 승인이 아니다. 구현 전 `product-spec`, `data-contracts`, `privacy-and-ai-policy`, `architecture`, `evals`의 관련 계약을 먼저 갱신한다.
- 레퍼런스 근거: Bridges의 밝은 실시간 fleet Control Tower, Dynamic Map and List의 지도·목록·실시간 경로 연결, Human-in-the-Loop AI Decision Dashboard의 후보 비교·설명·사람 승인, Mobile UI Screens for Driver App의 이동 중 빠른 판단, Field Service Dispatch의 모바일 재배치, Drileaf의 Demo 진입면 패턴만 사용한다. 원본 이미지·아이콘·레이아웃은 복제하지 않는다.
- 이유: 현재 단일 기사·단일 decision schematic 데모는 폐루프 설명에는 충분하지만 여러 지역에서 함께 일하는 기사들의 공간적 관계, 데이터 최신성, 지원 우선순위와 현장 위치 맥락을 한눈에 설명하지 못한다. 텍스트 카드 중심 모바일 화면도 실제 운행 중 빠른 상황 인지에 한계가 있다.
- 기각한 대안: 단일 기사 지도를 최종 화면으로 유지하는 방식, 모든 기사를 저배율에 개별 표시하는 방식, 기사 순위·성과판, Live 데이터 없이 움직이는 마커, 장식용 3D·자동 카메라, 장기 개인 궤적 재생, Dribbble 원본 복제, 위치·인증 계약 없이 실지도·PWA가 완료된 것처럼 표시하는 방식.
- 영향 파일: `docs/design-system.md`, `docs/decisions.md`; 후속 승인 대상은 `docs/product-spec.md`, `docs/data-contracts.md`, `docs/privacy-and-ai-policy.md`, `docs/architecture.md`, `docs/evals.md`, 관리자·기사 UI, 지도·위치 어댑터와 E2E·성능·접근성 산출물

### ADR-036 — G2-A 지도는 공급자 독립 projection과 기능형 SVG로 시작한다

- 날짜: 2026-07-19
- 상태: Approved
- 결정: 첫 다지역 지도 구현은 새 지도 SDK나 외부 의존성 없이 `MapAdapter`와 기능 목적의 SVG 2D 작업면으로 구현한다. `national` 범위는 지역 집계만, `region` 범위는 선택 지역의 기사·경로만, `decision` 범위는 선택 decision의 기사·경로만 반환한다. 지도와 지원 큐는 같은 `decisionId`를 사용하며, 위치는 움직이지 않는 결정론적 합성 Demo로 표시한다.
- 이유: 지도 공급자·라이선스·Live 위치 계약이 미결인 상태에서도 다지역 탐색과 개인정보 가시 범위를 먼저 검증하고, 기존 폐루프·국내 AI 책임 경계·공개 정적 배포를 보존하기 위해서다.
- 기각한 대안: 공급자를 먼저 확정해 SDK를 직접 UI에 결합하는 방식, 전국 화면에서 24명 개별 위치를 모두 표시하는 방식, 합성 좌표를 실시간으로 움직이는 방식, 지도가 Safety 판정이나 추천 순위를 다시 계산하는 방식.
- 영향 파일: `src/adapters/maps/index.ts`, `src/adapters/fixtures/multiRegionMapFixture.ts`, `src/ui/App.tsx`, `src/ui/styles.css`, `tests/map-adapter.test.ts`, `tests/multi-region-map-fixture.test.ts`, `e2e/saferoute-demo.spec.ts`, `docs/geospatial-pwa-implementation-plan.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/evals.md`

### ADR-037 — 지도 오류에서도 동일 projection의 구조화 목록으로 폐루프를 유지한다

- 날짜: 2026-07-19
- 상태: Approved
- 결정: 지도 렌더링 오류 시 빈 상자나 정상 Live 상태를 표시하지 않고, 동일 `MapRenderModel`에서 파생한 지역·기사·decision·배송순서 목록을 자동으로 제공한다. 정상 상태에서도 구조화 대안을 키보드로 펼칠 수 있으며 지도와 목록, 지원 큐는 같은 selection과 `decisionId`를 공유한다. 지도 오류·복구는 UI 가용성만 바꾸고 Safety 계산, 추천, 동의·승인과 적용 상태를 변경하지 않는다.
- 이유: 지도 공급자 장애나 시각적 지도 사용이 어려운 상황에서도 관리자가 같은 근거로 지원 결정을 찾아 폐루프를 완료할 수 있어야 하며, 별도 Fallback 데이터로 수치·상태가 갈라지는 위험을 막기 위해서다.
- 기각한 대안: 오류 시 빈 지도 표시, 정상 지도 스크린샷으로 대체, 별도 하드코딩 목록, 지도 복구 시 선택 초기화, 오류 중 승인 기능 전체 차단.
- 영향 파일: `src/ui/App.tsx`, `src/ui/styles.css`, `e2e/saferoute-demo.spec.ts`, `artifacts/evals/accessibility-summary.json`, `docs/geospatial-pwa-implementation-plan.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/evals.md`

## 4. 심사기준 연결

| 심사기준 | 핵심 결정 | 향후 실행 증거 |
|---|---|---|
| 창의성 | ADR-001, 004, 005, 006, 035 | Time-to-Breach와 반사실적 비교 폐루프, 다지역 지도와 현장형 PWA 시연 |
| 혁신성 | ADR-002, 004, 005, 007, 035 | 안전 하드 제약, 위험전가 차단, 사람 검토형 지리공간 의사결정과 국내 AI 근거 계층 테스트 |
| 추진성 | ADR-009, 010, 012 | 주차별 빌드·테스트·시연 체크포인트 |
| 성장성 | ADR-007, 008, 009, 020 | 모델별 benchmark, 데이터 manifest, 확장 가능한 어댑터 경계 |
| 실효성 | ADR-001, 006, 010, 011, 035 | 기사·관리자 E2E, 계획·ETA 원자적 갱신과 다기사 지도·큐 동기화 |
| 가치성 | ADR-005, 006, 011, 012 | 안전·지연·형평성·비징벌성 지표와 감사기록 |

## 5. 수용기준

- 모든 지속적인 행동·아키텍처 변경은 이 문서의 기존 결정과 충돌 여부를 확인한다.
- 결정에는 이유, 기각 대안과 영향 파일이 있다.
- 안전·개인정보·동의·AI 권한을 바꾸는 결정은 구현보다 먼저 기록한다.
- Superseded 결정은 삭제하지 않고 대체 ADR을 연결한다.

## 6. 비목표

- 분야별 공식과 전체 필드 스키마를 중복 정의하지 않는다.
- 회의 메모와 일시적인 구현 세부사항을 모두 기록하지 않는다.
- 실제 데이터 검증이 필요한 값을 현장 기준으로 승인하지 않는다.

## 7. 미결사항

- 실제 지도 공급자와 지도 스타일
- 외부 TMS 연동 시 트랜잭션·롤백 계약
- A.X·K-EXAONE 계정별 실제 활성 모델·쿼터·입력 보존 정책
- SafeRoute P0에 필요한 VARCO 에셋 사용처와 제품 계약 존재 여부
- 실제 공공·AI Hub 후보 데이터셋의 이용조건·필드 적합성·다운로드 방식
- Near-miss GeoHash 정밀도와 최소 집계기준
- 실제 운영 파일럿의 보존기간·권한행렬·법적 고지
- 시나리오 A의 화면 표시값과 실제 지도 군집 연결
