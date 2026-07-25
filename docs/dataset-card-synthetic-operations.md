# SafeRoute AI 합성 운영문서 데이터셋 카드

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-25
- 데이터셋 버전: `synthetic-operations-documents-v1.0.0`
- 생성기 버전: `deterministic-operations-document-generator-v1.0.0`
- 기준 문서: `docs/synthetic-data-plan.md`, `docs/data-contracts.md`, `docs/privacy-and-ai-policy.md`

## 1. 목적

실제 기사·고객·배송주소·TMS 기록 없이 배송 작업표, 근무표, 배송지·운행 경로표와 사고예방 안전보고서의 구조·참조·시간·개인정보·문서 왕복 경계를 검증한다. 이 데이터는 SafeRoute의 문서 처리와 Demo 재현을 위한 합성 기준선이며 실제 사고감소, 현장 분포, 기사 성과 또는 모델 학습 완료를 증명하지 않는다.

## 2. 구성

| 항목 | 수량 |
|---|---:|
| 상위 구조화 운영 레코드 | 25 |
| 합성 Markdown 문서 | 100 |
| 배송 작업표 | 25 |
| 근무표 | 25 |
| 배송지·운행 경로표 | 25 |
| 사고예방 안전보고서 | 25 |
| prompt-injection 경계 문서 | 5 |

시나리오는 `RAIN_SLOPE` 9개, `HEAT_STAIRS` 8개, `LOW_VISIBILITY` 8개 상위 레코드로 구성한다. 각 상위 레코드는 네 문서를 모두 소유한다.

## 3. 분할과 누출 방지

분할은 문서가 아니라 `parentRecordId` 단위로 고정한다.

| 분할 | 상위 레코드 | 문서 | 비율 |
|---|---:|---:|---:|
| development | 15 | 60 | 60% |
| validation | 5 | 20 | 20% |
| frozen-test | 5 | 20 | 20% |

같은 운영 사건에서 파생된 작업표·근무표·경로표·안전보고서가 서로 다른 분할에 들어가지 않는다. frozen-test 문서를 본 뒤 생성 규칙을 조정하면 데이터셋 버전을 올리고 다시 분할해야 한다.

## 4. 생성 방식과 계보

- 생성기: `RULE_ENGINE`
- 공급자: `SafeRoute`
- 모델: `none`
- seed 시작값: `6174`
- 데이터 모드: `SYNTHETIC`, provenance `MOCK`, `isDemo=true`
- seed spec: `data/seed-specs/synthetic-operations-documents-v1.json`
- accepted dataset: `data/synthetic/operations-documents-v1/`
- manifest: `data/manifests/synthetic-operations-documents-v1.json`
- 재생성 명령: `pnpm run data:synthetic:operations`

상위 구조화 레코드를 먼저 만들고 문서는 허용된 사실만 결정론적 템플릿으로 렌더링한다. 생성 AI가 ID, 시간, 숫자, Safety Budget, 사고확률, 추천 또는 합격 라벨을 만들지 않는다.

## 5. 개인정보·안전 경계

포함하지 않는 데이터:

- 실제 이름·전화번호·이메일·전체 주소
- 정밀 좌표와 실제 GPS 궤적
- 고객 식별자와 고객 메시지
- 원시 심박·수면단계·얼굴·음성
- 사고확률·건강상태·기사 순위·징계 점수
- Safety Budget·Time-to-Breach·개입 추천 정답

기사·허브·차량·배송지 ID와 권역은 모두 `demo-*` 또는 `합성` 표기다. 안전보고서는 실제 사고가 아니라 `사고 발생 사실 없음 · 예방 검토용`으로 고정하며 기사 불이익 반영을 금지한다.

## 6. 검증 결과

`synthetic-operations-documents-validation-v1` 자동 Gate 결과:

- Schema pass: 100/100 문서
- 참조 무결성 위반: 0
- 시간·물리 제약 위반: 0
- 개인정보 패턴 위반: 0
- 의미 일치 위반: 0
- AI 안전 책임 경계 위반: 0
- exact duplicate: 0
- 문서 종류와 split 목표 충족

근거:

- `artifacts/evals/synthetic-operations-documents-latest.json`
- `artifacts/evals/synthetic-operations-documents-latest.csv`

## 7. 허용 용도

- 문서 계약·참조·시간·개인정보 회귀 테스트
- Upstage Parse·Extract용 합성 후보 입력
- P0/P1 Demo의 작업표·근무표·경로표·안전보고 문서 예시
- parent record 단위 분할과 manifest 재현성 검증
- prompt injection이 문서 데이터로만 취급되는지 검증

## 8. 금지 용도

- 실제 기사·배송망·사고 분포를 대표한다고 주장
- 기사 평가·징계·보험·보상 또는 사고확률 모델 학습
- 실제 주소·GPS·TMS 데이터와 출처 표시 없이 결합
- frozen-test를 개발 프롬프트나 생성 규칙 조정에 사용
- 이 데이터만으로 현장 안전성이나 사고감소 효과를 주장

## 9. 한계와 미결사항

- 규칙 기반 문서이므로 실제 현장 문체·오타·예외 분포를 대표하지 않는다.
- 의미 근접 중복 임계치는 승인되지 않아 exact duplicate만 차단한다.
- Upstage Live Parse·Extract 성능은 아직 이 데이터셋으로 측정하지 않았다.
- 실제 운영사 문서의 법적 근거·보존기간·필드 매핑은 별도 파일럿 승인이 필요하다.
- 조건부 생성모델 학습에 충분한 데이터량이나 독립 검증셋으로 간주하지 않는다.

## 10. 수용기준

- 같은 명령이 동일한 25개 상위 레코드와 100개 문서를 재생성한다.
- 네 문서 종류와 세 시나리오가 모두 포함된다.
- 60/20/20 분할이 parent record 단위로 유지된다.
- 개인정보·정밀 위치·생체정보·AI 소유 금지 결정 필드가 0건이다.
- 문서 사실이 구조화 상위 레코드와 exact match한다.
- manifest가 모든 파일의 SHA-256과 상대경로를 보존한다.
