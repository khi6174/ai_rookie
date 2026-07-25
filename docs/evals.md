# SafeRoute AI 평가·검증 계획

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-25
- 승인 조건: 평가 스크립트·fixtures·재현 명령과 최초 결과가 저장소에서 확인될 것

## 1. 목적

이 문서는 SafeRoute AI가 안전운영 폐루프를 재현 가능하고 책임 있게 수행하는지 검증하고, AI ROOKIE 국내 AI 트랙의 여섯 심사기준에 제출할 실행 증거를 정의한다.

계획, 예상값과 화면 목업은 개발 성과가 아니다. 결과 표에는 실행 명령, 커밋, 데이터 manifest와 산출물 경로가 있을 때만 `PASS` 또는 성과 수치를 기록한다.

## 2. 평가 원칙

1. 실제 사고감소율이나 사고확률을 측정했다고 주장하지 않는다.
2. 동일 입력·설정·기준시각에서 결과가 같아야 한다.
3. 대표 데모 fixture와 평가용 frozen set을 분리한다.
4. 생성 모델이 만든 정답 라벨을 사용하지 않는다.
5. 안전 하드 제약 위반은 평균 점수로 상쇄할 수 없는 P0 실패다.
6. 실패·결측·Fallback도 정상 경로와 같은 수준으로 검증한다.
7. 모든 비교 결과에 `simulation`, `mock`, `public-data-derived` 등 실제 증거에 맞는 출처를 표시하며, 원본 추적정보가 없으면 `mock`으로 강등한다.

## 3. 평가 대상

### 3.1 P0

- Zod 데이터 계약과 교차 객체 불변조건
- Safety Budget, 위험 밴드, 신뢰도와 Time-to-Breach
- 개입 후보 생성·재계산·추천 순위
- Risk Transfer Guard
- 기사 동의·수정·거절과 관리자 승인
- 계획 재검증·원자적 적용·고객안내
- 관리자·기사 동일 결정 ID와 근거
- Demo reset과 API 실패 Fallback

### 3.2 P1

- 국내 AI 합성데이터 생성 품질
- Upstage Parse·Extract·Solar 계약과 숫자 불변
- Near-miss 검증·시간감쇠·비보복
- 접근성·반응형·시연 복구성
- 30개 이상 결정론적 합성 변형 비교

## 4. 데이터셋과 분할

### 4.1 고정 대표 fixture

| ID | 상황 | 핵심 검증 |
|---|---|---|
| `scenario-rain-hill-longshift-v1` | 우천·경사 빌라·9.4시간 작업 | 52분 후 17번째 배송지 초과, 12건 이관 차단, 8건 이관 가능 |
| `scenario-heat-heavy-stairs-v1` | 폭염·중량물·계단 배송 | 휴식 회복, 결측 기상 입력의 신뢰도 저하 |
| `scenario-night-novice-area-v1` | 초보 기사·낯선 권역·야간 | 익숙도 단조성, 권역 호환성, 순서·안전경로 시간창 |

세 시나리오의 현재 Budget·최소 예측 Budget·Time-to-Breach·초과 배송지는 `tests/safety-engine.test.ts`에 잠겼다. 정확한 기여도와 개입 후 수치는 개입 엔진 회귀 테스트가 통과한 뒤 manifest에 추가한다. 문서의 예시 수치를 테스트보다 먼저 진실로 간주하지 않는다.

### 4.2 변형 세트

- 첫 frozen set은 세 대표 시나리오 각각에 다음 10개 단일 변형을 적용한 정확히 30개다: 누적근무 +30/+60분, 연속근무 +15/+30분, 남은 중량 +10%, 강수 +2mm/h, 시정 -20%, 경사 +2%p, 지역 incident factor +0.05, 자기점검 결측. 변형은 generator `frozen-benchmark-v1.0.0`, seed 6174부터 순차 고정하고 모두 `FROZEN_TEST`·`MOCK`·Demo로 표시한다.
- Risk Transfer Guard 직접 경계 20개: candidate minimum `44.99·45·45.01·60`×Budget drop `0·14.99·15·15.01`의 16개와 breach 상태·복합 위반 4개. 우천 fixture의 4·8·12건 전체 계획 재계산 3개를 별도로 더해 결과표는 총 23행을 유지한다.
- 시간·동의·버전 충돌 30개: 시간 8, 동의·권한 12, 계획·모델 버전 10 (`decision-workflow-boundary-v1.0.0`)
- malformed·prompt injection·금지문구 최소 30개
- 문서 왕복 쌍 최소 60개

### 4.3 분할 규칙

- parent record의 파생 변형은 같은 split에 둔다.
- demo·train·validation·frozen test를 ID로 명시한다.
- frozen test는 결과 확인 후 프롬프트나 가중치 튜닝에 사용하지 않는다.
- manifest에는 generator, model, prompt version, seed, parent ID, 검증 결과와 거절 사유를 기록한다.

## 5. 비교 베이스라인

| 베이스라인 | 정의 | 목적 |
|---|---|---|
| A. Fastest-only | ETA·거리만 최소화하고 Safety Budget 제약 없음 | 빠른 계획이 안전 가능영역을 보장하지 않음을 비교 |
| B. Balanced-only | 작업량 편차만 줄이고 기사별 Budget 제약 없음 | 균등 분배가 위험전가를 막지 못함을 비교 |
| C. SafeRoute | 안전 하드 제약 후 실행 가능한 집합에서 개입 비교 | 폐루프의 안전·지연·형평성 교환관계 검증 |

세 방식은 같은 초기 입력, 경로 후보, 기준시각과 평가 구간을 사용한다.

- `FASTEST_ONLY`: 실행 가능성을 필터링하지 않고 ETA 변화가 가장 작은 후보를 선택한다.
- `BALANCED_ONLY`: 실행 가능성을 필터링하지 않고 적용 후 기사별 남은 배송 수의 최대-최소 차가 가장 작은 후보를 선택한다. 동률은 ETA, candidate ID 순으로 해소한다.
- `SAFEROUTE`: 실행 가능한 후보만 남긴 뒤 기존 결정론적 추천 순위를 사용한다.
- 앞의 두 방식이 실행 불가 후보를 선택하면 이를 실패에서 제외하지 않고 `hardConstraintViolation=true`로 보존한다. 이 비교는 합성 시뮬레이션이며 실제 사고감소나 현장 우월성 증거가 아니다.

## 6. 핵심 지표

### 6.1 안전운영 시뮬레이션

- 첫 임계치 초과까지 남은 분과 배송지 수
- 예측 구간 내 임계치 초과 배송 수
- 기사별 최소 Safety Budget과 최대 소진폭
- 개입 전후 `safetyGain`
- 수신 기사 최소 Budget과 기준 대비 감소
- 불가능 후보 차단률과 reason code 정확도

### 6.2 운영·형평성

- 최대·평균 ETA 지연
- 지연 고객 수와 시간창 위반 수
- 이관 전후 작업량 편차
- 다른 기사에게 생긴 최대 Budget 감소
- 개입 운영복잡도
- 동의 요청부터 승인까지의 결정시간

### 6.3 설명·국내 AI

- LLM 숫자 사실 일치율
- 지원되지 않은 숫자 주장 수
- 허용된 인용 출처 일치율
- strict JSON·Zod 통과율
- malformed·timeout·prompt injection Fallback 성공률
- 역할별 금지문구 발생률
- 생성 후보의 제약 위반·unknown field·개인정보 형태 발생률
- 모델별 지연, 크레딧·토큰 사용량과 중복률

### 6.4 UX·접근성

- 관리자·기사 과업 완료율과 완료시간
- 원인·개입·동의 의미 이해도
- 키보드만으로 관리자 큐·승인 완료 여부
- 44px 터치 대상 준수
- 색상 외 상태표현과 포커스 표시
- 지정 해상도 clipping·overlap 수
- Lighthouse 접근성 목표 90 이상

### 6.5 G5-B 공간 이해도

- 같은 decision의 2D·Demo 2.5D 고정 화면을 SHA-256 manifest로 보존한다.
- 최소 3명의 독립 검토자는 두 화면을 순서 균형에 따라 각각 평가한다.
- 예상 초과 수치, 추천 조치, 원·수신 기사 영향과 경로 우선순위 오답은 공개 기본 승격 차단 사유다. 2D의 경사 미인지는 비교값으로 남기며, 2.5D 경사 오답은 승격을 차단한다.
- `pnpm run eval:g5:comprehension -- <완료 JSON>`이 익명 계약·정확도·혼란·중앙 완료시간을 판정한다.
- 자동 하네스 준비와 실제 사람 결과를 구분한다. Round 1은 완료됐지만 통과하지 않았으므로 G5-B PASS로 기록하지 않는다.
- Round 1 실제 결과는 3명·6 trial, 핵심 의미 전체 정답 2/6, 경사 구간 정답 0/6, 혼란 증가 2/3, 중앙 완료시간 2D 377,042ms·2.5D 978,984ms로 `DO_NOT_PROMOTE`다. 기술 Gate PASS와 사람 이해도 실패를 분리해 기록하고 정보위계 재설계 전 2.5D를 기본값으로 승격하지 않는다.
- Round 2는 같은 정답표와 1280×720 조건에서 decision 질문과 순서를 명료하게 바꿨지만 0/6으로 `DO_NOT_PROMOTE`였다. Round 3도 경사 구간은 6/6이었으나 전체 strict trial은 0/6이었다. 2D의 시간·배송지는 각각 0/3, 2.5D의 두 기사 영향은 각각 1/3, 휴식 선행 순서는 0/3이었다. Round 4는 계산·정답·2D 기본값을 유지하고 `원 기사/수신 기사`를 `지원받는 기사/배송을 나눠 맡는 기사`로 풀어 쓰며, `52분·17번째·10분·8건`을 첫 결론에 함께 고정한다. 새 독립 응답 전에는 개선 성공을 주장하지 않는다.

## 7. 계약 검증

### 7.1 필수 거절 사례

- 음수 작업량·용량·강수량
- 종료가 시작보다 이른 시간창
- 중복 ID와 끊어진 참조
- 허용 범위 밖 Budget·confidence
- 서로 모순되는 Live·Mock·Error 상태
- 수신 기사 capacity·시간창·Budget을 위반하는 이관
- 승인되지 않은 결정의 계획 적용

### 7.2 통과 기준

- 유효 fixture 100% parse
- 필수 invalid fixture 100% reject
- 검증 실패가 사용자에게 안정적인 오류 코드로 전달
- 원본 비밀정보·정밀 위치·원시 생체값이 오류 로그에 없음

## 8. Safety Budget 검증

### 8.1 단위·경계

- 0·30·45·60·100 경계와 반올림 전 판정
- 5분 이하 계산 간격과 120분 예측 상한
- 첫 초과·정확히 임계치·무초과 반환 상태
- 유효 휴식의 회복과 비유효 휴식의 무회복

### 8.2 단조성 속성

다른 입력을 고정한 상태에서 다음 증가가 Budget을 개선하면 실패한다.

- 연속작업시간
- 누적근무시간
- 남은 작업량·중량·계단 노출
- 강수·폭염·시정 악화
- 경사·골목·후진 등 경로위험

휴식 증가가 회복량을 악화하거나 결측 증가가 confidence를 높여도 실패한다.

### 8.3 메타모픽

- 동일 계획을 더 작은 계산 구간으로 분할해도 허용 오차 안에서 결과가 일치
- 순서를 바꾸지 않은 stop ID 재명명은 수치 결과에 영향 없음
- 선택하지 않은 DMS·웨어러블 부재는 confidence 감점 없음
- 설명 문구 변경은 모든 도메인 수치에 영향 없음

## 9. 개입·Risk Transfer Guard 검증

### 9.1 필수 사례

- 휴식, 이관, 순서변경, 안전경로, Safe Delay 각각 최소 한 후보
- 호환 묶음은 전체 계획을 재계산
- 예상 초과가 남은 빠른 후보는 추천 불가
- 수신 기사 Budget 45 미만 또는 15점 초과 감소 차단
- 수신 기사 새 초과, 용량·시간창·차량·권역 불일치 차단
- 실행 불가 후보를 이유와 함께 표시
- 추천 점수 0.5 이하 차이의 동점 순서 재현

### 9.2 시나리오 A 게이트

- 12건 이관은 Risk Transfer Guard에 의해 차단된다.
- 8건 이관은 모든 하드 제약과 필요한 동의를 충족할 때만 가능하다.
- 추천 묶음은 가장 빠른 후보보다 안전 제약과 형평성 측면에서 우월한 이유를 설명한다.

## 10. 상태기계·원자적 적용

- 기사 동의 없이 관리자 승인으로 이동 불가
- 수신 기사 동의가 필요한 이관은 양측 응답 전 승인 불가
- 수정 요청으로 효과가 바뀌면 기존 동의 무효화
- 거절한 동일 후보 자동 재요청 금지
- 승인 직전 입력 버전 변경 시 `REVALIDATION_REQUIRED`
- 적용 성공 시 경로·순서·작업목록·ETA가 함께 변경
- 중간 실패 시 네 필드 모두 기존 확정 계획 유지
- 고객안내는 실제 적용된 ETA만 사용

## 11. Upstage·책임 있는 AI 검증

ADR-050에 따라 A.X Hosted API 인증 해결을 기다리지 않고 Upstage 문서 왕복을 다음 핵심 평가로 진행한다. 먼저 개인정보가 없는 결정론적 합성 문서 60쌍과 strict 기대 규칙을 고정해 Mock·계약 Gate를 통과시킨다. Document Parse·Information Extract의 유료 Live 호출은 endpoint·요금·보존조건과 사용자 승인을 확인한 뒤 별도 불변 run으로 실행하며, Mock 결과를 Live 정확도로 주장하지 않는다.

`pnpm run eval:upstage:documents:mock`은 `upstage-document-roundtrip-v1.0.0`의 6개 위험 유형×10개 변형, 5개 문서 유형을 합친 정확히 60쌍을 실행했다. 60/60이 strict `ExtractedSafetyRule`·원문 excerpt·정확 사실 일치를 통과했고, 비신뢰 지시 18건을 포함해 Fallback·unsafe 표시·raw 문서·raw 출력 저장은 모두 0건이었다. 60개 source SHA-256은 모두 고유하다. 이는 Live 모델 성능이 아닌 결정론적 계약·평가 기반의 통과다.

### 11.3 합성 운영문서 100개

`pnpm run data:synthetic:operations`는 25개 상위 구조화 레코드에서 배송 작업표·근무표·배송지 경로표·사고예방 안전보고서를 각각 25개씩 생성한다. 분할은 parent record 단위 development 60·validation 20·frozen-test 20문서다. `synthetic-operations-documents-validation-v1`은 100/100 Schema, 상위 참조와 stop 순서, 평가시각 이후·근무종료 이전 ETA, 개인정보·정밀 좌표·생체정보 패턴, 문서와 상위 레코드의 exact 의미 일치, Safety Budget·사고확률·기사평가·추천 필드 부재와 exact duplicate 0건을 검사한다.

이는 실제 TMS·GPS·기사·고객·사고 문서 또는 Upstage Live 정확도 증거가 아니다. 의미 근접 중복 임계치는 미승인이므로 exact duplicate만 하드 Gate로 사용한다.

`node scripts/prepare-a100-operations-documents.mjs`는 이 100개 문서를 변경하지 않고 A100 오프라인 추출 bundle로 고정한다. 각 과업은 문서 원문 SHA-256, 정확 field ID, 문서 표시값과 표시값을 포함하는 원문 전체 한 줄을 expected contract로 가진다. `scripts/local-model-operations-documents.py`는 development 60 → validation 20 → frozen-test 20을 분리 실행하며 strict JSON·identity·field 순서·새 숫자·원문 인용·PII·비신뢰 지시 격리 Gate를 통과하지 못한 출력은 모두 `safe-fallback`으로 전환한다. 로컬 준비 결과는 100건·60/20/20·유형별 25건·주입 5건 계약, Python self-test 7종과 세 split dry-run을 통과했다. 아직 A100 100건 추론 결과는 실행·회수되지 않았으므로 모델 통과율이나 학습 완료를 주장하지 않는다.

development v1.0.0 첫 실행은 0/60, Fallback 60건, unsafe 표시 0건이었다. 원본 오류는 `MARKDOWN_WRAPPER` 50, `SCHEMA_MISMATCH` 8, `CITATION_VALUE_MISMATCH` 2건이며 독립 검증을 통과했다. 코드펜스 내부 진단에서도 잠재 PASS는 0건이어서 사후 펜스 제거로 승격하지 않는다. v1.1은 expected와 문서를 그대로 두고 field별 추출 규칙·고정 scaffold·문서 뒤 신뢰 경계만 development 프롬프트에 추가했다. validation과 frozen-test는 v1.1 development 독립 검증까지 실행하지 않는다.

v1.1 development는 28/60, Fallback 32건, unsafe 표시 0건이었다. 근무표 15/15와 경로표 13/15가 통과했고 작업표·안전보고서는 각각 0/15였다. parse 가능한 45건은 fact ID가 모두 정확했지만 15건은 facts 뒤 메타 키를 생략했고, 작업표 15건은 단일 인용 범위와 JSON 닫기를 위반했다. v1.2는 세 메타 키를 facts 앞으로 옮기고 facts를 마지막 키로 고정하며 작업표 부분문자열·단일 인용·사고 상태 범위의 예시만 추가한다. expected label·원문·validator는 변경하지 않으며 아직 validation과 frozen-test는 잠금 상태다.

v1.2 development는 33/60, Fallback 27건, unsafe 표시 0건이었다. 근무표·안전보고서는 각각 15/15이고 비신뢰 지시 3/3도 통과했지만 경로표는 3/15, 작업표는 0/15였다. 경로표 실패는 값이 아닌 새 형식의 인용 12건, 작업표 실패는 정확해진 값 뒤의 multiline citation·중복 JSON 닫기 15건이다. v1.3은 근무표 v1.1과 안전보고서 v1.2를 고정하고 경로표 전체 행 인용·작업표 실제 전체 메모 한 줄만 별도 보강한 마지막 development 후보다.

v1.3 development는 35/60, Fallback 25건, unsafe 표시 0건이었다. 작업표 5/15·근무표 15/15·경로표 0/15·안전보고서 15/15이며 비신뢰 지시 3/3이 통과했다. 추가 문구 튜닝을 종료하고 작업표 v1.3, 근무표·경로표 v1.1, 안전보고서 v1.2를 유형별로 선택한 v1.4를 validation 전 최종 동결했다. validation 판정은 실행 전에 전체 80%·유형별 60%·주입 100%·unsafe 0건의 적격 기준, 전체 50% 이상의 부분 연구 기준선, 50% 미만의 불충분 기준선으로 고정하며 어떤 등급도 제품 통합을 허용하지 않는다.

v1.4 validation은 15/20, Fallback 5건, unsafe 표시 0건이었다. 작업표 2/5·근무표 5/5·경로표 3/5·안전보고서 5/5이고 비신뢰 지시 1/1을 통과했다. 독립 verifier와 사전 고정 분류기는 전체 `0.75`, 유형별 `0.40/1.00/0.60/1.00`의 `PARTIAL_RESEARCH_BASELINE`, 제품 통합 불가, frozen-test 실행 가능을 반환했다. validation 결과로 프롬프트·정답·Gate를 바꾸지 않고 frozen-test 20건을 최종 1회 실행한다.

### 11.1 문서 파이프라인

- Parse 결과에서 페이지·섹션 출처 보존
- Extract 결과는 허용 스키마 외 필드 거절
- 문서 내 prompt injection 문장을 지시가 아닌 데이터로 처리
- 공급되지 않은 문서·구절 인용 금지

### 11.2 숫자 불변

1. 입력 JSON의 숫자 경로와 값을 수집한다.
2. Solar 출력의 수치 필드를 strict schema로 검증한다.
3. 허용된 입력 숫자와 정확히 대응하지 않는 출력은 거절한다.
4. 거절 시 결정론적 템플릿으로 전환한다.
5. 어떤 설명 결과도 추천·실행 가능성·적용 상태에 입력되지 않는지 계약 테스트한다.

## 12. 국내 AI·인프라 활용 평가

### 12.1 공통 텍스트 smoke benchmark

대회 제공 활용 가이드에서 OpenAI-compatible 텍스트 생성 계약이 확인된 A.X K1과 K-EXAONE에 동일한 12개 과업을 제공하고 다음을 비교한다. VARCO는 NC 가이드상 LLM 기획 이후의 3D·이미지/텍스처·음성/사운드·번역 등 에셋 구현 API이므로 이 공통 텍스트 비교에 포함하지 않는다. SafeRoute P0에 필요한 에셋 사용처가 승인될 때 별도 과업·지표로 평가한다.

- 첫 시도 strict JSON 성공률
- 검증 Gate 통과율과 거절 사유
- 제약 위반·unknown field·개인정보 형태 발생률
- 문서 사실 일치율과 표현 다양성
- 지연·사용량·비용·재시도 수

모델 역할은 브랜드 기대가 아니라 결과에 따라 조정한다.

AI One Portal A.X K1 API 가이드 v1.3의 `A.X-K1`·`https://awf-gw.adot.ai/v1/chat/completions`와 LG 가이드 p.15의 FriendliAI K-EXAONE endpoint를 exact allowlist로 고정한 서버 전용 어댑터를 사용한다. `pnpm run eval:domestic-ai:check`는 키를 출력하거나 API를 호출하지 않고 필수 환경변수, 모델과 endpoint 계약만 확인한다. `pnpm run eval:domestic-ai:smoke:mock`은 두 공급자에 같은 12과업을 실행해 A.X 12/12, EXAONE 12/12와 unsafe 표시 0건을 기록했다. 이 24/24는 HTTP·Gate·산출물 파이프라인의 Mock 계약 통과이며 실제 모델 품질이나 Live 연결 성공이 아니다. 실제 계정 실행은 공급자별로 별도 기록하고 Mock 수치와 합산하지 않는다.

K-EXAONE만 등록한 뒤 2026-07-17 첫 Live 12과업을 실행했다. readiness는 문서화된 model·endpoint 계약을 통과했지만, 첫 3건이 설정된 10초에서 `TIMEOUT`, 뒤 9건이 `RATE_LIMITED`로 종료돼 승인 출력과 토큰 사용량을 받지 못했다. 통과 0/12, unsafe 표시 0건이며 이는 모델 출력 품질 결과가 아니라 timeout·계정 rate limit의 운영 실패다. 결과 원본은 `artifacts/evals/domestic-ai-api-runs/2026-07-17-exaone-live-run1/`에 보존했다.

timeout을 60초로 조정한 단일 과업 진단은 26,800ms에 1/1, Fallback 0건으로 통과했다. 이어 같은 계약으로 전체 12과업을 중첩 없이 순차 실행해 12/12, Fallback 0건, unsafe 표시 0건을 통과했다. 평균 지연은 22,124ms, P95는 35,805ms였고 입력 8,684·완료 30,855·합계 39,539 tokens를 기록했다. JSON·CSV 과업 수와 집계, 상태, 비밀정보·프롬프트·원문 응답 비포함을 독립 확인해 `EXAONE_12_TASK_VERIFY_PASS`를 반환했다. 결과는 `artifacts/evals/domestic-ai-api-runs/2026-07-17T11-37-10-732Z-live-exaone/`에 불변 보존한다.

2026-07-21 A.X 공식 계약으로 readiness를 다시 통과시킨 뒤 합성 과업 1건을 실행했다. 이전 QA host의 `NETWORK_ERROR`와 달리 공개 gateway가 155ms에 응답했으나 `401 UNAUTHORIZED`로 안전 Fallback되어 생성 출력과 토큰 사용량은 없었다. 공식 `awf_` 형식, 따옴표·외곽 공백·제어문자 부재를 비밀값 노출 없이 확인했고 키를 재발급·교체한 뒤 3분 이상 지난 시점에도 137ms `401`이 반복됐다. 따라서 네트워크·모델 품질 실패로 집계하지 않고 gateway의 팀 권한 또는 키 동기화에 대한 운영팀 확인 대상으로 판정했다. 최종 재시도는 `artifacts/evals/domestic-ai-api-runs/2026-07-21T12-00-06-856Z-live-ax/`에 불변 보존한다.

공급자 버그 수정 안내 후 2026-07-23 [A.X K1 LLM API 가이드](https://portal.adot.ai/docs/ax-k1-api-guide)의 동일 공개 gateway·Bearer·`A.X-K1` 계약으로 다시 실행했다. 단일 과업 1/1 통과 뒤 전체 12과업이 12/12, Fallback 0건, unsafe 표시 0건을 통과했다. 평균 지연은 3,386ms, P95는 4,251ms였고 입력 8,227·완료 1,317·합계 9,544 tokens를 기록했다. JSON·CSV의 12개 고유 과업, 집계 일치와 비밀정보·프롬프트·원문 응답 비포함을 독립 확인해 `AX_12_TASK_VERIFY_PASS`를 반환했다. 성공 결과는 `artifacts/evals/domestic-ai-api-runs/2026-07-23T11-08-49-486Z-live-ax/`에 불변 보존하며 이전 401 run을 삭제하거나 모델 품질 실패로 다시 분류하지 않는다.

현재 Upstage 설명 계층에는 관리자·원 기사·수신 기사·고객·보고서 역할, 불가능 이관, 결측·신뢰도, 적용 완료, 문서 내 지시문, 무인용, 소수 표시값과 Fallback 경계를 포함한 12개 합성 과업이 있다. `pnpm run eval:upstage:smoke:mock`은 같은 harness로 Mock 기준선을 생성하고, `pnpm run eval:upstage:smoke`는 서버 환경변수가 모두 있을 때만 Live를 순차 실행한다. 저장 결과에는 생성문·프롬프트·API 키를 포함하지 않고 과업 ID, 상태, 지연, fact·citation 수와 실패 코드만 남긴다. A.X 오프라인 비교용 `scripts/local-model-benchmark.py`도 같은 12개 역할·실패경계를 고정 계약으로 구성했다. A100 순차 실행은 첫 시도 12/12, Fallback 0건, unsafe 표시 0건이었고, 회수한 원본을 `scripts/verify-local-model-benchmark.py`가 raw output hash·고정 계약·CSV·요약 집계까지 독립 검증했다.

12과업은 summary까지 제공한 정확 복사 기준선이므로 생성 강건성 주장에는 사용하지 않는다. 후속 `scripts/local-model-robustness.py`는 10개 업무 상황에 `canonical-json`, `reordered-json`, `untrusted-note` 세 입력 변형을 적용해 30개 과업을 만든다. 모델은 summary 한 문장만 직접 작성하고, Gate는 role·facts·citations·allowedActions·Demo label의 완전 일치, 모든 displayValue 포함, 새 숫자·PII·금지어·코드펜스 부재를 검사한다. `local-robustness-ko-v1.0.0` 첫 실행은 30건 모두 코드펜스로 감싸 `MARKDOWN_WRAPPER` Fallback이 됐고 unsafe 표시 0건을 유지했다. 회수 원본의 prompt·output hash, CSV와 요약 집계를 독립 재검증했다. 진단 목적으로만 펜스 내부를 검사한 결과 잠재 PASS 3건, 표시값 누락 6건, facts 변경 10건, schema 불일치 9건, 금지어 1건, 완전한 단일 펜스가 아닌 출력 1건이었다. 원본 판정은 0/30 그대로 보존한다. v1.1은 빈 summary scaffold와 필수 표시값, 첫·마지막 문자, 신뢰 경계를 보강해 22/30, Fallback 8건, unsafe 표시 0건으로 개선됐다. 남은 실패는 모두 정확 displayValue를 자연어로 바꾼 `DISPLAY_VALUE_OMISSION`이었다. 최종 v1.2는 고정 displayValue anchor를 코드가 소유하고 모델이 그 뒤 설명만 생성하게 분리해 28/30, Fallback 2건, unsafe 표시 0건을 독립 검증했다. 비신뢰 문서 변형 10/10과 기사·고객·보고서 역할 전부가 통과했고, 관리자 적용 완료 2건은 설명을 추가하지 않은 `MISSING_NARRATIVE`로 안전하게 거부됐다. 추가 프롬프트 튜닝 없이 v1.2를 A.X 기준선으로 동결한다.

### 12.2 A100 적정성

- 로컬 오픈 웨이트 기준선 실행 환경·명령·처리량 기록
- 임베딩 중복 제거 전후 레코드 수와 범주 커버리지 비교
- 조건부 생성 실험은 검증셋과 기준선이 있을 때만 수행
- 기준선 대비 개선이 없으면 실패 결과를 그대로 보고하고 제품 런타임에 넣지 않음

최초 연결은 `scripts/gpu-server-preflight.sh`의 읽기 전용 환경 점검으로 제한하고, 모델 다운로드·패키지 설치·GPU 점유는 `docs/gpu-benchmark-runbook.md`의 승인 항목을 확인한 뒤 수행한다.

2026-07-16 익명화 사전점검에서 A100-SXM4 80GB 1장, 약 81GB의 파일시스템 여유공간, Docker와 NVIDIA container CLI를 확인했다. `nvcc`, pip, ensurepip, PyTorch, Transformers와 Accelerate는 없다. Docker daemon은 현재 계정에 `permission denied`를 반환했으며 홈 디렉터리는 쓰기 가능하고 GPU는 점검 시 사용률 0%였다. GitHub·PyPI·PyTorch CUDA 12.1 wheel index는 연결되지만 Hugging Face 본문과 모델 API는 timeout된다. Docker 권한을 우회하지 않고 `--without-pip` 가상환경, PyPA 공식 bootstrap, 사전 빌드 CUDA wheel과 오프라인 모델 복사 경로를 우선 검증한다. 사용시간 정책은 아직 미확인이다. 연결 사용자명·호스트명·IP·비밀번호는 저장하지 않고 `artifacts/evals/gpu-preflight.txt`에 비식별 결과만 남긴다.

이어진 CUDA runtime smoke에서는 `torch 2.5.1+cu121`, CUDA runtime 12.1과 A100 BF16 지원을 확인하고 2,048×2,048 BF16 행렬곱을 `206.73ms`, 할당 VRAM `24.12MiB`로 완료했다. NumPy 미설치 경고는 있었지만 GPU 연산은 `GPU_SMOKE_PASS`로 끝났다. 따라서 Docker·`nvcc` 없이 Python 가상환경의 사전 빌드 CUDA wheel을 사용하는 추론 경로는 통과했다. 모델 파일 반입, 단일 과업 생성과 12과업 순차 benchmark까지 후속 독립 검증을 통과했다.

첫 A.X 오프라인 생성은 checkpoint 3개를 정상 로드하고 peak VRAM `13,896.9MiB`로 끝났지만 코드펜스 때문에 `MALFORMED_JSON` Fallback으로 전환됐다. 원문에는 `31/100`을 `31%`로 바꾼 단위 변경과 공급되지 않은 차단 가능 주장도 있어 펜스 제거만으로 승인하지 않는다. 검증되지 않은 생성문 표시 건수는 0건이다. attention mask와 프롬프트·Gate를 보강한 `local-structured-ko-v1.1.0`도 별도 결과 폴더에서 재실행했다.
`local-structured-ko-v1.1.0` 재실행은 attention 경고와 코드펜스를 제거하고 JSON·사실·인용·단위를 모두 보존했지만, summary의 “침해/차단” 표현을 `FORBIDDEN_LANGUAGE`로 거부했다. 생성 `4,618.11ms`, peak VRAM `13,907.7MiB`이며 검증되지 않은 생성문 표시 건수는 계속 0건이다. 이후 금지어를 프롬프트에서 제거하고 승인 용어만 제공하는 v1.2.0을 별도로 실행했다.
`local-structured-ko-v1.2.0`은 생성 `4,097.95ms`, peak VRAM `13,917.77MiB`로 strict JSON과 facts·인용·표시값·승인 용어 Gate를 통과했다. 서버 원본에 대해 별도 검증기가 raw output hash, 재파싱 결과, `validatedOutput`과 CSV 일치를 확인해 `LOCAL_MODEL_RESULT_VERIFY_PASS`를 반환했다. 출력 hash는 `67a9900519b595eaf4639440966defcf6bf34902b6676ca17b29d60e2721b5b3`이며 표시 승인 1건, 검증되지 않은 생성문 표시 0건이다. 이 단일 과업의 실패 보강 과정은 후속 12과업 프롬프트와 Gate의 선행 근거로 사용했다.

이 과정에서 완료한 “튜닝”은 모델 가중치 학습이나 fine-tuning이 아니다. 공개 A.X 고정 revision의 가중치는 변경하지 않았고, 프롬프트·출력 계약·검증 Gate·Fallback 경계를 v1.2.0까지 보강한 뒤 동결했다.

같은 날 접근 가능한 로컬 호스트에서 ADR-020의 `skt/A.X-4.0-Light` revision `ba21c20ea1b31ded1ec3e2fb432335077dc4be98` snapshot 16개 파일, 14,532,308,097바이트를 받았다. `artifacts/evals/local-model-manifest.json`에 절대경로·자격증명 없이 파일별 SHA-256을 기록했고 `scripts/verify-model-manifest.py`로 16개 전부 재검증했다. 서버 전송 후 같은 manifest로 16개·14,532,308,097바이트 전부 다시 통과했다. 고정 revision의 12과업은 모델 로드 `3,176.29ms`, 평균 생성 `2,741.56ms`, P95 `4,532.12ms`, 최대 peak VRAM `13,907.91MiB`로 끝났다. 이는 주어진 고정 JSON 계약을 그대로 재현하는 구조화 출력 기준선이며 자유 생성·범용 추론·실제 운영 효과를 입증하지 않는다.

## 13. E2E·시각 검증

### 13.1 관리자·기사 폐루프

1. 시나리오 A 초기화
2. 52분 후 17번째 배송지 초과 확인
3. 원인·신뢰도·결측 확인
4. 다섯 개 개입과 불가능 사유 비교
5. 기사와 필요한 수신 기사 동의
6. 관리자 승인과 재검증
7. 경로·순서·ETA 갱신
8. 고객안내와 전후 지표·감사로그 확인

모든 화면은 같은 결정 ID를 사용해야 한다.

### 13.2 해상도

- 관리자: 1440×900, 1280×720
- 기사: 390×844, 360×800

핵심 행동, 상태, 수치와 승인 근거가 잘리거나 모달 뒤에 숨지 않아야 한다.

2026-07-15 인앱 브라우저 점검에서는 네 해상도 모두 가로 넘침 없이 핵심 카드와 조치가 표시됐다. 기사 역할 전환은 최소 44px, 동의·수정·거절은 48px 터치 높이를 확인했다. 두 기사 동의부터 관리자 승인·적용 완료까지 포인터 폐루프와 적용 후 0건 상태를 확인했다.

2026-07-18 Playwright E2E는 관리자–원 기사–수신 기사 동일 결정 ID, 동의 전 승인 잠금, 두 기사 동의, 승인 대화상자, 계획·ETA·고객안내 적용, 키보드 전용 순회, Demo 계정 확인, 기사 모바일 웹 3탭, 네 지정 해상도의 가로 넘침과 기사 터치 높이를 9/9 통과했다. `Demo 초기화`는 새 UUID 기반 결정 ID에 후보·평가·동의·적용계획을 모두 다시 연결하고, reset 직후 같은 fixture로 폐루프를 다시 완료했다. 별도 clean-start 명령은 Vite 서버와 브라우저를 매회 새로 띄워 핵심 폐루프를 3회 연속 실행했고 디자인 이식 후 최종 재검증에서 `CLEAN_START_3X_PASS elapsedSeconds=20.68`을 반환했다.

같은 E2E에서 네 지정 해상도에 걸쳐 관리자 초기·적용 완료, 기사 Demo 계정 확인·운행·원 기사 안전지원·수신 기사 안전지원 PNG 6개를 저장했다. `ui-screenshot-manifest.json`의 해상도와 SHA-256을 원본 파일에서 다시 계산해 6/6 통과했고 연결 식별정보·실제 개인정보는 포함하지 않았다. 실제 화면 기준 상황보고형 리허설과 팀 승인을 거쳐 `docs/demo-script.md`는 Approved다.

### 13.3 복구

- Upstage timeout·malformed
- 외부 날씨·지도 오류
- 빈 데이터와 일부 결측
- 적용 실패
- Demo fallback과 reset
- clean start 3회 연속 완료

### 13.4 다지역 지도·기사 PWA 확장

G1은 실지도나 Live 위치가 아니라 결정론적 다지역 projection을 검증한다.

- 최소 3개 지역, 지역별 8명 이상, 총 24명 이상의 합성 기사
- 같은 seed·기준시각에서 동일 fixture JSON
- region·hub·courier·plan·decision 참조 무결성
- 저배율 지역 집계와 상세 기사 수·지원 상태 합계 일치
- Demo provenance 100%, Live·실제 식별정보·주소·전화번호 0건
- stale·offline·permission denied 상태에서 현재 이동 불가
- 기존 대표 시나리오 A·B·C parent 연결

G2-A는 전국→지역→기사 drill-down, 전국 개별 기사 비노출, 선택 범위 밖 feature 제거, 지도·큐 동일 decision을 단위·정적 UI 계약으로 검증했다. G2-B는 키보드용 구조화 대안, 지도 오류 목록 Fallback, 복구 후 동일 selection, 지정 해상도와 기존 폐루프를 Playwright로 검증했다. 실제 보조기기 발화 품질과 자동 WCAG 규칙 스캔은 아직 별도 검증이 필요하다. G3는 위치 권한·오프라인·캐시 만료와 모바일 시각 구조를, G4는 합성 위치 timeline과 군집 성능을, G5는 2D 대안과 조건부 3D 의미 일치를 검증한다.

ADR-043의 Kakao 베이스 레이어는 SDK URL이 공식 HTTPS host·path와 `autoload=false`만 사용하는지, 빈 값·공백 키를 거부하는지 단위 테스트한다. `MapAdapter`의 합성 좌표·가시 범위·동일 decision 계약은 기존 테스트가 계속 소유한다. Playwright와 clean-start에서는 `VITE_KAKAO_MAP_ENABLED=false`를 강제해 외부 네트워크·도메인 설정과 무관하게 schematic 지도, 구조화 목록, 오류 복구와 폐루프를 결정론적으로 검증한다. 공개 Demo의 실제 SDK는 별도 브라우저 확인 대상으로 두며 실패해도 자동 Fallback과 `Kakao 오류` 상태가 보여야 한다.

ADR-063 Directions 경계는 임의 좌표·추가 query 차단, 서버 전용 키, exact host·path, provider 인증·timeout·malformed·크기 실패, 경로 점 상한, 원문·키·요청 ID 비저장과 `safetyEngineInputApproved=false`를 단위 테스트한다. Playwright는 `KAKAO_DIRECTIONS_ENABLED=false`를 강제해 외부 요청 0건에서 `Demo 경로로 계속`, 구조화 목록, 48px 길찾기 링크와 기존 폐루프를 검증한다. 별도 Round 사람 평가는 이번 시간제약 릴리스에서 재실행하지 않으며, 이 기능이 이해도·현장 안전·사고감소를 개선했다고 주장하지 않는다.

G3-A는 390×844·360×800에서 합성 현재 위치, 다음 배송, Safe-until, compact route와 주요 안전지원 행동이 하단 탭 위 첫 화면에 보이는지 검증한다. 자동 E2E는 외부 네트워크를 끄고 `Fallback map`을 검증하며, 공개 Demo 점검에서는 Kakao 타일·합성 3지점·`Kakao map · Demo route`와 schematic 비노출을 확인한다. 안전지원은 조정 전후·작업 변화·동의 행동이 첫 화면에 있고 동의·수정·거절 터치 높이와 비징벌 문구가 유지돼야 한다.

G3-B는 manifest·192/512 아이콘·버전된 same-origin app shell, 승인·적용 Demo 계획 strict schema와 30분 TTL, malformed·storage unavailable, 정확 만료 경계를 단위 계약으로 검증한다. Playwright는 실제 service worker 제어 후 네트워크를 차단해 오프라인 reload, 마지막 승인 계획·저장시각·읽기 전용 표시와 응답 버튼 차단을 확인한다. 만료 fixture는 `최신 계획 아님`으로 표시하고 적용된 계획 UI로 승격하지 않는다. 설치 화면은 실제 인증·위치·푸시 미포함을 명시한다.

G4-A는 24명·7 frame·5초 cadence와 고정 SHA-256을 계약 테스트로 검증한다. CURRENT 기사만 이동하고 stale·offline 위치 JSON은 frame 전체에서 변하지 않아야 한다. 연결 끊김 두 frame 뒤 새 CURRENT 관측으로만 복구해야 하며 Live 관측 혼합과 깨진 cadence는 100% 거부한다. Playwright는 권역 선택 후 현재 마커 이동·stale 마커 정지, 재생·일시정지·초기화를 확인하고 기존 지도 pan·오류 Fallback·폐루프를 함께 재검증한다.

G4-B는 24·96·240명 합성 profile을 같은 1440×900 Windows headless Chromium Fallback 2D 환경에서 순차 측정한다. 각 profile은 첫 지도 준비, 권역 drill-down, 5초 frame 적용, keyboard pan, 30개 requestAnimationFrame gap과 관측 가능한 JS heap을 기록한다. 첫 지도 준비 5,000ms, drill-down·frame 1,000ms, pan 500ms, frame gap P95 100ms·최대 250ms를 하드 Gate로 사용한다. 전국 개별 기사 0명, 권역 최대 80명, 동시 경로 24개와 선택 경로 보존도 함께 검증한다. 메모리는 브라우저 지원 차이로 관측값만 기록한다. Kakao SDK, 실제 발표 PC·배터리·현장망과 240명 초과는 이 PASS의 범위가 아니다.

## 14. 소규모 사용자 평가

### 14.1 대상과 범위

- 5~10명 역할 기반 테스트
- 실제 기사 데이터나 위험한 주행 상황을 사용하지 않는다.
- 참여 동의와 녹화 여부를 분리한다.

### 14.2 과업

- 관리자: 60분 내 지원 상황 식별, 불가능 이관 이유 설명, 승인 판단
- 기사: 추천 이유와 지연 이해, 동의·수정·거절 중 선택
- 공통: 데이터 출처와 Demo·Live 차이 식별

### 14.3 성공 지표

- 핵심 과업 완료율
- 완료시간과 도움 요청 횟수
- Safety Budget을 사고확률로 오해한 비율
- 거절이 불이익으로 이어진다고 인식한 비율
- 수신 기사 형평성 이유를 정확히 설명한 비율

### 14.4 레퍼런스 계승과 차별성 이해도

아틀란 트럭과 KBS 모빌리티 AI 영상은 제품 이름 인지도나 외형 유사성으로 평가하지 않는다. 기사 운행 화면과 3분 설명을 본 참여자가 다음 네 질문에 답하는지 확인한다.

1. 기사의 현재 구간, 다음 안전 거점과 지원 기준 배송지를 순서대로 찾을 수 있는가?
2. SafeRoute가 실시간 턴바이턴 내비게이션이나 오더 배차 앱이 아니라는 점을 구분하는가?
3. SafeRoute가 사고감지·운전점수 시스템이 아니라 미래 작업계획을 조정하는 시스템임을 설명하는가?
4. 제안된 조치가 기사 동의와 관리자 승인 전에는 적용되지 않는다고 이해하는가?

고정 화면의 목표는 과업 완료율 80% 이상, 도움 없이 네 문항 모두 정답인 참여자 70% 이상, `실제 GPS·센서·구조 요청이 동작한다`는 오인 0건이다. 결과가 없으면 레퍼런스 반영이 사용자 이해도를 개선했다고 주장하지 않는다. 자동 E2E는 현재·다음 안전 거점·지원 기준, Demo/Fallback 라벨과 승인 전 계획 불변 문구의 존재만 검증하며 사람 이해도 PASS를 대신하지 않는다.

실행 프로토콜은 `docs/rider-reference-comprehension-test.md`가 소유한다. `pnpm run eval:rider-reference:stimulus`는 체크인된 390×844 기사 화면의 크기와 SHA-256을 고정하고, `pnpm run review:rider-reference`는 독립 검토자 5명의 동의·익명 구조화 응답을 수집한다. 완료 JSON은 `pnpm run eval:rider-reference:comprehension -- <결과 파일>`로 판정한다. Round 1은 25/30 정답이었지만 완전 정답 3/5·중대 제품 경계 오인 2명으로 `NEEDS_REVISION`이다. Round 2는 Demo/GPS 경계와 미래 안전한계·지원계획 역할, 기사 동의→관리자 승인 규칙을 첫 화면에 명시한 새 자극으로 분리했으며 독립 응답 전에는 개선 성공을 주장하지 않는다.

2026-07-23 기사 Round 2 독립 5인 결과는 30/30, 완전 정답 5/5, 중대 오인 0건으로 `READY_TO_PROMOTE`를 통과했다. 중앙 완료시간은 6,205ms, 평균 확신은 4/5다. 이는 화면 이해도 증거일 뿐 실제 GPS·내비게이션·현장 성과나 사고감소 증거가 아니다.

## 15. AI ROOKIE 여섯 심사기준 평가표

| 기준 | 현재 문서 근거 | 구현 후 필수 증거 | 실패 조건 |
|---|---|---|---|
| 창의성 | Time-to-Breach, 개입 비교, Two-Key Control | 3분 폐루프 영상·동일 결정 ID | 기존 위험점수·대시보드 수준에서 멈춤 |
| 혁신성 | Safety hard constraint, Risk Transfer Guard | 불안전한 빠른 후보·12건 이관 차단 테스트 | ETA 가중치가 안전을 상쇄함 |
| 추진성 | 구현 순서, contracts, architecture | 주차별 빌드·테스트·시연 산출물 | 계획만 있고 실행 증거 없음 |
| 성장성 | 국내 AI 역할 분리, manifest, adapter | 모델 benchmark·A100 기준선·확장 경계 | 모델 이름만 나열하거나 결과 비교 없음 |
| 실효성 | 기사 동의→관리자 승인→계획 적용 | E2E, 원자적 적용·오류 복구 | 화면만 바뀌고 경로·ETA가 갱신되지 않음 |
| 가치성 | 비징벌성, 형평성, 개인정보 최소화 | 안전·지연·형평성·이해도·감사 지표 | 사고감소 과장, 기사 랭킹·감시 표현 |

### 15.1 현재 사전심사 판정

- 창의성: 문서 기준 충족
- 혁신성: 문서 기준 충족
- 추진성: 계약, 결정론적 Safety Budget, 다섯 단일 개입, 허용 묶음 6종과 결정 상태기계 실행 증거 확보
- 성장성: Upstage strict 계약·Mock·Fallback·Live 12과업, K-EXAONE·A.X K1 Hosted Live 각 12/12, A100 환경·A.X 고정 revision 12과업 12/12와 생성 강건성 0/30→22/30→28/30·안전 Fallback·독립 진단 증거 확보
- 실효성: 동일 decision ID의 Domain 폐루프·원자 적용, 관리자·기사 Demo 세션, 지정 해상도·키보드 Playwright 폐루프와 서버 clean start 3회 증거 확보
- 가치성: 사회적 가치와 보호 원칙은 충족, 사용자 평가 증거는 아직 없음

따라서 문서 방향은 본선 심사기준과 일치하지만, 이 표만으로 개발 성과를 주장하지 않는다.

### 15.2 현재 확인된 실행 증거

2026-07-15 결정론적 기반 구현에서 다음을 확인했다.

| 항목 | 명령 | 결과 |
|---|---|---|
| 계약·fixture 테스트 | `pnpm test` | 1개 파일, 16개 테스트 통과 |
| Safety Budget·Time-to-Breach | `pnpm test` | 1개 파일, 19개 테스트 통과 |
| 개입·Risk Transfer Guard | `pnpm test` | 1개 파일, 16개 테스트 통과 |
| 순서변경·안전경로·Safe Delay | `pnpm test` | 1개 파일, 16개 테스트 통과 |
| 허용 개입 묶음 6종 | `pnpm test` | 1개 파일, 6개 테스트 통과 |
| 결정 상태기계·원자적 Demo 적용 | `pnpm test` | 1개 파일, 12개 테스트 통과 |
| 관리자·기사 공유 Demo 세션·정적 UI | `pnpm test` | 1개 파일, 11개 테스트 통과 |
| Upstage 계약·Mock·Fallback | `pnpm test` | 1개 파일, 15개 테스트 통과 |
| Upstage 서버 Live 어댑터 경계 | `pnpm test` | 1개 파일, 8개 테스트 통과 |
| Upstage 12과업 smoke harness | `pnpm test` | 1개 파일, 6개 테스트 통과 |
| A.X·K-EXAONE 공통 API 계약·Gate | `pnpm test` | 1개 파일, 9개 테스트 통과 |
| 날씨 Runtime Fallback 경계 | `pnpm test` | 1개 파일, 4개 테스트 통과: 전체 Demo 복제·Live source/hash 비유입·완전 Gate 분기·비-Demo provenance/잘못된 hash 거부 |
| 시간·동의·버전 충돌 경계 | `pnpm run eval:core-artifacts` | 결정론적 30/30 통과: 시간 8·동의/권한 12·계획/모델 버전 10, 정확히 10분 만료·양측 동의·재검증·적용 경쟁·멱등성 검증 |
| 전체 Vitest | `pnpm test` | 17개 파일, 182개 테스트 통과 |
| 30개 frozen 변형·3전략 비교 | `pnpm run eval:core-artifacts` | 같은 후보 집합으로 90회 비교: Fastest-only 하드 제약 위반 17건, Balanced-only 11건, SafeRoute 0건; SafeRoute 30/30 실행 가능한 후보 선택 |
| Risk Transfer Guard 경계 suite | `pnpm run eval:core-artifacts` | 직접 숫자·breach 경계 20/20, 4·8·12건 전체 계획 재계산 3/3 통과; Budget 45·감소 15 허용, 0.01 경계와 수신 기사 breach 차단 |
| 핵심 평가 증거 bundle | `pnpm run eval:core-artifacts` | Vitest 전체 재실행, 대표 fixture 3개·frozen 변형 30개·전략 비교 90개·이관 경계 23개·결정 경계 30개 재계산, 국내 AI 공급자/모드 4개·Upstage 설명 12과업·문서 Mock 60쌍, 접근성·기사 제품 경계 고정 자극과 SHA-256 manifest·불변 run 생성 |
| 기상청 DS-001 계약 어댑터 | `pnpm test` | API허브 4.1·4.2 exact endpoint·`authKey` 비노출·실황 최신성·예보 6시간·결측·혼합 격자·중복·범위·provider 오류·401·429·timeout·Mock 라벨·Safety 차단 통과 |
| 기상청 DS-005·006 보완 계약 | `pnpm test` | 1개 파일, 8개 테스트 통과: EUC-KR 필드 순서·km→m·3시간 적설 보존·SNO 정확/구간·공식 계절별 체감온도·120분·exact endpoint·secret/좌표 비저장·부분 Gate |
| 기상청 Mock 계약 smoke | `pnpm run eval:kma-weather:mock` | 실황·예보 응답 계약 통과, API 요청 0건, public-derived 주장 0건, Safety 입력 승인 0건, JSON·불변 run 생성 |
| 기상청 Live readiness | `pnpm run eval:kma-weather:check` | API허브 환경변수 계약만 확인, API 요청 0건·secret 값 저장 0건 |
| 기상청 Live 단일 표본 | `pnpm run eval:kma-weather:live` | 첫 진단은 4.2 RN1 구간 문자열로 안전 실패, 공식 명세에 따라 정확값·구간 분리 후 실황 1시점·예보 6시점 통과, `authKey`·원문 0건 저장, Safety 입력 승인 0건 |
| 기상청 Safety 적합성 Gate | `pnpm run eval:kma-weather:coverage` | 강수 6시점 변환 가능, 체감온도·시정·시간당 적설 3필드 차단, 노면 `UNKNOWN`·v1 미사용, 중간값·0 채움·무단 미래복제 금지 산출물 생성 |
| 기상청 1.3·4.3 보완 Live | `pnpm run eval:kma-weather:supplement:live` | 현재 체감온도 29.7°C·시정 7,000m, 미래 적설 3시점과 공식 체감온도 3시점 검증, `sd_3hr` 무단 시간당 환산 0건, 원문·키·위경도 저장 0건, Safety 입력 승인 0건 |
| 기상청 4.3 최신성 경계 | 같은 명령 최초 재실행→수정 후 재실행 | 공통 120분 한도에서 정상 20시 발표를 `STALE_DATA`로 차단한 실패 run 보존, 3시간 발표주기·제공지연 전용 210분 계약과 회귀 테스트 후 통과 |
| 기상청 보완 적합성 Gate | 같은 명령의 `coverage` | 4.3 적설·공식 체감온도 각 3시점 준비 완료, 현재 시간당 적설·미래 시정 2개 시간범위 차단, 중간값·현재값 미래복제 금지 |
| 날씨 Runtime 선택 감사 | `pnpm run eval:kma-weather:runtime` | `FALLBACK`, Demo 5시점·Live 차단 2필드, `liveEvidenceUsedForSafety=false`, `mixedLiveAndDemoFields=false`, JSON·불변 run 생성 |
| TAAS 공개데이터 계약 어댑터 | `pnpm test` | 1개 파일, 12개 테스트 통과: 트럭 다발지역·교통사고 통계 exact endpoint·공용/별도 키·이미 URL 인코딩된 키·스키마·무자료·인증·timeout·응답 크기·출처·Safety 차단 |
| TAAS Mock 계약 smoke | `pnpm run eval:taas:mock` | 두 응답 정규화와 `public-data-derived` provenance 통과, API 요청 0건, Safety 입력 승인 0건 |
| TAAS Live readiness | `pnpm run eval:taas:check` | endpoint·공용 키의 두 API 승인 구성을 확인하고 API 요청 0건, `READY` |
| TAAS Live 단일 표본 | `pnpm run eval:taas:live` | 트럭 사고 다발지역 영등포구 2024년 3개 지점·지자체 통계 중랑구 2024년 13개 사고유형 검증, `COMPLETED`; 원문·키·원시 polygon 저장 0건, Safety 입력 승인 0건 |
| Upstage Mock smoke 기준선 | `pnpm run eval:upstage:smoke:mock` | 12/12 통과, JSON·CSV 생성 |
| Upstage Live smoke | `pnpm run eval:upstage:smoke` | 첫 시도 11/12 통과, 1건 안전 Fallback |
| 국내 AI 공통 Mock smoke | `pnpm run eval:domestic-ai:smoke:mock` | A.X 12/12·EXAONE 12/12, unsafe 표시 0건, JSON·CSV 생성; 실제 모델 품질 증거 아님 |
| K-EXAONE Live run 1 | `pnpm run eval:domestic-ai:smoke -- --providers=EXAONE` | 0/12, TIMEOUT 3·RATE_LIMITED 9, unsafe 표시 0건; 출력 품질 평가 전 운영 실패로 보존 |
| K-EXAONE Live 단일 진단 | `pnpm run eval:domestic-ai:smoke -- --providers=EXAONE --task-limit=1` | 1/1, 26,800ms, Fallback 0건, unsafe 표시 0건 |
| K-EXAONE Live 12과업 | `pnpm run eval:domestic-ai:smoke -- --providers=EXAONE` | 12/12, 평균 22,124ms·P95 35,805ms·총 39,539 tokens, Fallback·unsafe 표시 0건, 독립 집계 검증 통과 |
| A.X 공식 계약 readiness | `pnpm run eval:domestic-ai:check -- --providers=AX` | `A.X-K1`·공식 gateway exact 계약 통과, API 요청·키 출력 0건 |
| A.X Live 단일 인증 진단 | `pnpm run eval:domestic-ai:smoke -- --providers=AX --task-limit=1` | 키 재발급·교체·3분 후에도 공개 gateway 응답 137ms, 0/1·`UNAUTHORIZED` 안전 Fallback, 생성 출력·토큰·unsafe 표시 0건 |
| A.X Live 12과업 복구 확인 | `pnpm run eval:domestic-ai:smoke -- --providers=AX` | 공급자 수정 후 12/12, 평균 3,386ms·P95 4,251ms·총 9,544 tokens, Fallback·unsafe 표시 0건, 독립 집계 검증 통과 |
| A100 환경 사전점검 | 원격 읽기 전용 점검 | A100-SXM4 80GB 1장·가용 VRAM 81,050MiB 확인, 연결 식별정보 미저장 |
| A100 CUDA runtime smoke | 원격 격리 Python 환경 | PyTorch 2.5.1+cu121·BF16 행렬곱 통과, 206.73ms·24.12MiB |
| A.X 고정 snapshot | 로컬 공식 Hugging Face 다운로드·SHA-256 검증 | revision 고정, 16개·14,532,308,097바이트 전부 통과 |
| A.X 서버 반입 무결성 | 원격 SHA-256 재검증 | 16개·14,532,308,097바이트 전부 통과 |
| A.X 단일 오프라인 생성 | v1.2.0 자체 Gate·독립 결과 검증 | strict JSON 1/1 통과, 4,097.95ms·13,917.77MiB, unsafe 표시 0건 |
| A.X 12과업 오프라인 기준선 | 고정 revision·BF16·순차 실행·독립 결과 검증 | 첫 시도 12/12, Fallback 0건, 평균 2,741.56ms·P95 4,532.12ms·최대 13,907.91MiB, unsafe 표시 0건 |
| A.X 30과업 생성 강건성 v1.1 | 고정 revision·세 입력 변형·summary 직접 생성·독립 결과 검증 | 첫 시도 22/30, Fallback 8건, 평균 2,562.04ms·P95 3,503.12ms·최대 13,947.27MiB, unsafe 표시 0건 |
| A.X 30과업 생성 강건성 v1.2 | 결정론적 사실 anchor·생성 설명 분리·독립 결과 검증 | 첫 시도 28/30, Fallback 2건, 평균 2,589.14ms·P95 3,442.77ms·최대 13,949.28MiB, unsafe 표시 0건 |
| 지정 해상도·포인터 폐루프 | 인앱 브라우저 수동 QA | 4개 해상도, 두 기사 동의→승인→적용 통과 |
| 여섯 심사기준 최종 GOAL 감사 | `pnpm run audit:goal` | 여섯 기준의 원자 check·근거 SHA-256·사람 blocker 판정; G5-B Round 4 미실시는 `DISCLOSED_VALIDATION_GAP`, 전체 상태는 `READY_FOR_DEMO_SUBMISSION_WITH_DISCLOSED_GAP`이며 사람 통과로 계산하지 않음 |
| Playwright 폐루프·접근성·PWA E2E | `pnpm run test:e2e` | 21/21 통과, 기존 폐루프·reset·키보드·4개 해상도·지도 Fallback·bounded drag/keyboard pan·offline/PWA·G4-B 부하·G5-A 2.5D 전환·복귀·reduced-motion, G5-B와 기사 제품 경계 익명 검토 도구 추가 |
| 서버 clean start 3회 | `pnpm run test:e2e:clean-start` | Vite·브라우저 매회 재기동, 핵심 폐루프 3/3, 기사 제품 경계 도구 반영 후 최종 재실행 총 20.1초 |
| 발표 스크린샷 | `pnpm run test:e2e` | 네 지정 해상도에서 6개 PNG 생성, 해상도·SHA-256 manifest 독립 검증 6/6 |
| TypeScript 검사 | `pnpm run typecheck` | 오류 0건 |
| 프로덕션 빌드 | `pnpm run build` | Vite 빌드 성공 |
| 최신 전체 Vitest | `pnpm test` | 32개 파일, 272/272 통과 |
| G2-A 다지역 fixture·MapAdapter | `pnpm test` | 19개 파일, 198개 테스트 통과: 3지역·24기사 참조 무결성, 동일 seed 재현, national 개별 기사 0명, region 8명, decision 1명, 지도·큐 동일 decision |
| G2-B 지도 Fallback·접근성 E2E | `pnpm run test:e2e` | 12/12 통과: 지도 오류→지역·기사·decision·배송순서 목록, 지도 복구, 지도·지원 큐 왕복, 키보드 전용 구조화 대안, 네 지정 해상도, 기존 승인 폐루프·독립 세션 3회 |
| G3-A 기사 모바일 첫 화면 | `pnpm run test:e2e` | 390×844·360×800에서 Safe-until·다음 배송·합성 현재 위치·주요 안전지원 행동과 조정 전후·동의 행동이 하단 탭 위에 표시, 44px·48px 터치 기준과 가로 넘침 0건 |
| G3-B 설치·오프라인 경계 | `pnpm test`, `pnpm run test:e2e` | manifest·아이콘·versioned app shell, 승인 Demo 계획 30분 TTL·정확 만료·손상 격리, 실제 offline reload와 읽기 전용 계획, 만료 최신 승격 0건, 오프라인 응답 성공 0건; 전체 Gate 안에서 회귀 검증 |
| G4-A 결정론적 Demo 이동 | `pnpm test`, `pnpm run test:e2e` | 24명·7 frame·5초 cadence·고정 SHA-256, CURRENT만 이동, stale·offline 정지, 합성 연결 끊김·복구, Live 혼합 거부, 재생·일시정지·단계·초기화 |
| G4-B Fallback 2D 부하 | `pnpm test`, `pnpm run test:e2e` | 24·96·240명 profile 3/3, 전국 기사 0명·권역 최대 80명·경로 24개, 첫 표시·drill-down·frame·pan·rAF 예산 통과; `map-performance-summary.json` 보존 |
| G5-A 선택형 Demo 2.5D | `pnpm test`, `pnpm run test:e2e` | 같은 decision·plan·route·4 route point·표시 수치 불일치 0건, SHA-256 재현, Live 혼합·거리 역전·예상 초과 누락 거부, 1280×720 열기·키보드 2D 복귀·reduced-motion·지도 오류 Fallback과 성능 예산 통과; `spatial-scene-summary.json` 보존 |

검증 범위는 데이터 계약, 대표 fixture 3개, provenance·Demo 상태, 시간·작업량 경계, Budget 밴드, 초과 결과 모순과 상태 전이 건너뛰기 차단을 포함한다. Safety Budget에서는 세 시나리오 정확값, 임계 경계, 최초 교차 보간, 무초과, 최대 5분 간격, 휴식 회복, 기여도 보존, 연속작업·누적근무·중량·강수·경사·익숙도 단조성과 선택형 입력 신뢰도를 검증했다. KMA Runtime은 전체 계약이 완성되지 않은 부분 Live를 Safety 계산에 넣지 않고 5시점 Demo 타임라인 전체만 선택하며, 두 입력의 필드·출처·해시가 섞이지 않는 불변조건을 검증했다. TAAS 어댑터는 트럭 다발지역과 교통사고 통계의 별도 키·endpoint·스키마를 검증하고, 원시 polygon이나 비밀키를 보존하지 않으며, 불완전한 Live 수집을 `PARTIAL`로 드러내고 Safety 입력 자동 승격을 금지한다. 개입에서는 결정론적 후보 ID, 다섯 단일 유형과 허용 묶음 6종의 전체 재계산, 8건 허용·12건 차단, 수신 기사 Budget 45와 감소 15점 경계, 용량·시간창·차량·권역·종료시각, 안전 후보만의 순위와 `NO_SAFE_OPTION`을 검증했다. 묶음은 정규 순서, 정책 외 조합, 동일 기사 조건, 이관 후 잔여 stop, 경로 변경 후 ETA, 후행 카탈로그 결측과 fixture 불변성을 검증했다. 결정 폐루프는 두 기사 동의, 권한, 10분 만료, 관리자 승인·보류, 재검증, 계획 materialize, 원자 적용·실패 롤백·멱등성과 고객안내 기록을 검증했다. 별도 결정 경계 30개는 9.999분 허용과 정확히 10분 차단, 양측 동의·대리응답·중복응답·수정·거절·보류, 계획·모델·설정·정책·후보·중요 입력 변경과 적용 경쟁을 직접 재현했다. UI Demo 세션은 관리자·원 기사·수신 기사가 같은 decision ID와 후보를 사용하고, 두 동의 전 승인 잠금, 수정·거절·보류, 승인 후 원자 적용, reset과 비징벌 문구를 유지하는지 검증했다. Upstage 계층은 PII·정확 좌표 제거, 합성문서 출처 보존, strict JSON, 승인 displayValue, 인용·역할·행동·Demo 라벨, timeout·malformed·새 숫자·비난 표현 Fallback과 설명 전후 추천·계획 불변을 검증했다. 서버 Live 어댑터는 공식 HTTPS host·path 허용목록, 브라우저 실행 차단, 명시적 모델·timeout·요청·응답 크기, Authorization 헤더 분리와 401·429·timeout·malformed Fallback을 가짜 HTTP 응답으로 검증했다. 실제 `solar-pro3` 왕복은 `explanation-ko-v1.1.0`에서 12과업 중 11건이 첫 시도 strict Gate를 통과했고 1건은 `MALFORMED_RESPONSE`로 거부돼 템플릿으로 전환됐다. A.X·K-EXAONE 공통 어댑터는 대회 문서 endpoint의 exact allowlist, Bearer 헤더 분리, timeout·인증·rate limit·malformed Fallback과 12과업 동일 Gate를 검증했다. 공통 Mock 24/24는 파이프라인 증거일 뿐 Live 모델 결과로 세지 않는다. K-EXAONE 실제 12과업은 60초 계약에서 첫 시도 12/12를 통과했고 독립 집계 검증을 통과했다. A.X K1 Hosted 실제 12과업도 공급자 수정 후 첫 시도 12/12·Fallback 0건으로 같은 strict Gate와 독립 집계 검증을 통과했다. A.X 고정 revision은 12개 고정 JSON 계약을 첫 시도에 모두 재현했고 독립 검증기가 raw output·CSV·요약 집계를 다시 확인했다. 검증된 실제 생성 경로 모두에서 검증되지 않은 생성문 표시 0건이다. Playwright는 새 결정 ID reset, 전체 키보드 순회, 지정 네 해상도, 가로 넘침, 터치 높이와 두 기사 동의부터 적용까지를 자동 재현했고 clean-start 실행기는 서버까지 3회 재기동했다. 지정 스크린샷 6개와 무결성 manifest도 보존했다. 실제 화면 기준 상황보고형 리허설과 팀 승인은 완료했으며, A.X Hosted 단일 실행 외 반복 분산과 Upstage 반복 실행은 아직 통과로 기록하지 않는다.

## 16. 결과 산출물

`pnpm run test:e2e`가 스크린샷 manifest와 `accessibility-summary.json`을 만들고, 이어서 `pnpm run eval:core-artifacts`가 외부 API 호출 없이 나머지 최신본을 현재 코드·테스트와 기존 비식별 smoke 요약에서 다시 생성한다. `frozen-variant-results.csv`는 30개 변형의 입력 계보와 기준 결과를, `baseline-comparison.csv`는 같은 후보 집합에서 세 전략이 선택한 90개 결과를 보존한다. 이는 합성 시뮬레이션이며 실제 사고감소나 현장 성과로 표현하지 않는다. 각 실행은 최신본과 별도로 `core-evidence-runs/<timestamp>/`에 SHA-256 manifest와 함께 보존한다.

`pnpm run verify:final`은 빌드, 전체 Playwright, clean-start 3회, 핵심 평가와 국내트랙 감사를 하나의 최종 릴리스 게이트로 다시 실행한다. 결과는 `final-readiness-latest.json`과 `final-readiness-runs/<timestamp>/final-readiness.json`에 저장한다. 실제 발표 PC, 발표자 역할, 제출 폼과 업로드는 자동화할 수 없는 사람 확인 항목으로 남긴다.

```text
artifacts/evals/
  run-manifest.json
  final-readiness-latest.json
  final-readiness-runs/
    <timestamp>/
      final-readiness.json
  unit-summary.json
  scenario-results.csv
  baseline-comparison.csv
  frozen-variant-results.csv
  frozen-benchmark-summary.json
  risk-transfer-boundaries.csv
  risk-transfer-boundary-summary.json
  decision-workflow-boundaries.csv
  decision-workflow-boundary-summary.json
  domestic-track-compliance-latest.json
  domestic-ai-smoke.csv
  domestic-ai-api-smoke-mock-latest.json
  domestic-ai-api-smoke-mock-latest.csv
  domestic-ai-api-readiness-latest.json  # local secret 구성 확인 시 생성, API 호출 없음
  domestic-ai-api-smoke-latest.json      # Live 실행 전에는 생성 결과를 성과로 기록하지 않음
  domestic-ai-api-smoke-latest.csv
  domestic-ai-api-runs/
    2026-07-17-exaone-live-run1/
      domestic-ai-api-smoke-latest.json
      domestic-ai-api-smoke-latest.csv
    2026-07-17T11-31-20-972Z-live-exaone/  # 단일 진단 1/1
      domestic-ai-api-smoke-latest.json
      domestic-ai-api-smoke-latest.csv
    2026-07-17T11-37-10-732Z-live-exaone/  # 전체 12/12
      domestic-ai-api-smoke-latest.json
      domestic-ai-api-smoke-latest.csv
  upstage-roundtrip.csv
  upstage-smoke-latest.json
  upstage-smoke-latest.csv
  upstage-smoke-mock-latest.json
  upstage-smoke-mock-latest.csv
  gpu-preflight.txt
  data-provenance-audit.json
  kma-weather-smoke-mock-latest.json
  kma-weather-readiness-latest.json  # READY, API 호출 없음
  kma-weather-smoke-live-latest.json  # 실황 1시점·예보 6시점 Live 통과
  kma-weather-coverage-latest.json    # 보완 전 3필드 차단 증거
  kma-weather-supplement-live-latest.json # 적설·공식 체감온도 준비, 2개 시간범위 차단
  weather-runtime-selection-latest.json   # 부분 Live 미사용·Demo-only Safety 입력 감사
  map-performance-summary.json            # G4-B 24·96·240명 Fallback 2D 부하 Gate
  spatial-scene-summary.json               # G5-A Demo 2.5D 전환·동등성·성능 Gate
  weather-runtime-runs/
    <timestamp>-fallback-selection/
      weather-runtime-selection.json
  public-data-runs/
    <timestamp>-mock-kma-contract/
      kma-weather-smoke-mock-latest.json
    <timestamp>-live-kma-api-hub/
      kma-weather-smoke-live-latest.json
    <timestamp>-kma-safety-coverage/
      kma-weather-coverage-latest.json
    <timestamp>-kma-weather-supplement-live/
      kma-weather-supplement-live-latest.json  # 성공·실패 run 모두 불변 보존
  local-model-runs/
    local-model-smoke-v1.0.0.{json,csv}
    local-model-smoke-v1.1.0.{json,csv}
    local-model-smoke-v1.2.0.{json,csv}
    batch-v1.0.0-run1/
      local-model-benchmark.json
      local-model-benchmark-summary.json
      local-model-benchmark.csv
    robustness-v1.0.0-run1/
      local-model-robustness.json
      local-model-robustness-summary.json
      local-model-robustness.csv
    robustness-v1.1.0-run1/
      local-model-robustness.json
      local-model-robustness-summary.json
      local-model-robustness.csv
    robustness-v1.2.0-run1/
      local-model-robustness.json
      local-model-robustness-summary.json
      local-model-robustness.csv
    robustness-comparison.csv
  accessibility-summary.json
  core-evidence-runs/
    <timestamp>/
      run-manifest.json
      unit-summary.json
      scenario-results.csv
      baseline-comparison.csv
      frozen-variant-results.csv
      frozen-benchmark-summary.json
      risk-transfer-boundaries.csv
      risk-transfer-boundary-summary.json
      decision-workflow-boundaries.csv
      decision-workflow-boundary-summary.json
      domestic-track-compliance-latest.json
      domestic-ai-smoke.csv
      upstage-roundtrip.csv
      accessibility-summary.json
      map-performance-summary.json
      spatial-scene-summary.json
  screenshots/
    admin-initial-1440x900.png
    admin-applied-1280x720.png
    rider-login-390x844.png
    rider-source-route-390x844.png
    rider-source-review-390x844.png
    rider-recipient-review-360x800.png
    ui-screenshot-manifest.json
```

실제 경로는 구현 시 저장소 구조에 맞춰 확정하되 본선 보고서에서 직접 추적 가능해야 한다.

## 17. 완료 게이트

### P0 차단

- 필수 계약 invalid 사례가 하나라도 통과
- Safety Budget 단조성 위반
- 불안전 이관이 실행 가능 또는 추천으로 표시
- 기사 동의 없는 적용
- AI 설명이 숫자·추천·적용 상태를 변경
- 실패한 계획을 적용 완료로 표시
- Demo·Mock을 Live처럼 표시

### 본선 준비 완료

- 단위·계약·E2E 전체 통과
- 세 대표 fixture 정확값 잠금
- 최소 30개 변형과 세 베이스라인 결과 생성
- 국내 AI smoke benchmark와 Upstage 왕복 결과 생성
- 지정 네 해상도와 접근성 검증
- clean start 3회 연속 3분 폐루프 완료
- 남은 한계와 실행하지 못한 검증 명시

## 18. 수용기준

- 각 평가에는 입력 집합, 설정 버전, 실행 명령과 결과 경로가 있다.
- 여섯 심사기준의 주장을 최소 하나의 실행 증거에 연결한다.
- 안전·동의·AI 숫자 불변 실패는 평균 점수로 상쇄하지 않는다.
- 계획과 실제 결과를 명확히 구분한다.
- 합성·시뮬레이션 결과를 실제 사고감소로 표현하지 않는다.

## 19. 비목표

- 실제 사고율 감소의 통계적 입증
- 의료적 피로 모델의 임상 검증
- 법률·노무·개인정보 준수 보증
- 대규모 실제 배송망 성능 벤치마크
- G1 합성 위치를 실제 실시간 관제 성능으로 주장
- 국내 AI 모델의 범용 우열 평가

## 20. 미결사항

- 시나리오별 정확한 기여도·개입 후 기대값
- property test 도구와 허용 수치 오차
- A.X 가이드의 RPS 3 표기와 제약사항 표 내부 6 요청 설명 불일치 확인
- A.X·K-EXAONE 반복 실행 분산과 계정별 쿼터·입력 보존 정책
- SafeRoute P0에 필요한 VARCO 에셋 사용처와 별도 평가 계약
- A.X v1.2 30과업 반복 실행의 분산
- Upstage 왕복 반복 실행의 분산과 안정성
- Near-miss 시간감쇠·중복 판정 기대값
- 자동 접근성 규칙 스캔 도구
- 사용자 평가 모집·동의·녹화 방식
- G2 지도 SDK 후보별 성능 예산과 국내 지도·3D·라이선스 조건
- G3 PWA 실제 인증·위치·푸시·서버 동기화 평가 환경
