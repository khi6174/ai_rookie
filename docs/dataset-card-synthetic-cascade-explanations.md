# SafeRoute AI 합성 Cascade 설명 학습 데이터셋 카드

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-08-06
- 데이터셋 버전: `synthetic-cascade-explanations-v1.0.0`
- 생성기 버전: `deterministic-cascade-explanation-generator-v1.0.0`
- 기준: ADR-132, `docs/privacy-and-ai-policy.md`, `docs/domestic-ai-track-compliance.md`

## 1. 목적

자격을 갖춘 SKT A.X 로컬 LoRA/adapter가 검증된 숫자·상태·허용 행동·인용을 변경하지 않고 기사·관리자·고객·보고서용 strict JSON 설명으로 복사·정리하는 능력을 학습·평가하기 위한 결정론적 합성 데이터다. Safety Budget, Time-to-Breach, 후보 실행 가능성, Risk Transfer Guard, 추천, 동의, 승인과 적용 상태의 계산·결정 학습에는 사용하지 않는다.

## 2. 구성

| 항목 | 수량 |
|---|---:|
| parent 합성 사건 | 400 |
| 역할별 설명 레코드 | 1,600 |
| parent당 역할 | 4 |
| 합성 기사 슬롯 | 25 |
| 슬롯당 변형 | 16 |
| 시나리오 family | 8 |
| 비신뢰 문서 지시 레코드 | 150 |
| 실제 개인정보·정밀 위치·Hosted 출력 | 0 |

시나리오는 `RAIN_TRAFFIC`, `HEAT_STAIRS`, `LOW_VISIBILITY`, `API_PARTIAL`, `TRANSFER_GUARD`, `CONSENT_WAIT`, `STALE_DATA`, `PROMPT_INJECTION`을 각각 parent 50건으로 균등 구성한다. 각 parent는 `ADMIN`, `COURIER`, `CUSTOMER`, `REPORT` 네 역할을 소유한다.

## 3. 분할과 누출 방지

| 분할 | parent | 레코드 | 용도 |
|---|---:|---:|---|
| train | 300 | 1,200 | LoRA 학습 |
| validation | 50 | 200 | epoch·설정 비교와 조기 중단 |
| frozen-test | 50 | 200 | 설정 동결 후 최종 1회 평가 |

분할은 `parentRecordId` 단위다. 같은 사건의 네 역할은 항상 같은 split에 속한다. frozen-test는 학습 스크립트 입력에서 제외하며, 결과를 본 뒤 prompt·hyperparameter·expected output·validator를 수정하지 않는다. 수정이 필요하면 데이터셋과 평가 버전을 올리고 새 frozen split을 만든다.

## 4. 생성·계보

- 생성기: `RULE_ENGINE`
- 생성 AI: 없음
- Hosted API 응답: 없음
- data mode: `SYNTHETIC`
- seed: `8501`부터 순차 고정
- seed spec: `data/seed-specs/synthetic-cascade-explanations-v1.json`
- accepted data: `data/synthetic/cascade-explanations-v1/`
- manifest: `data/manifests/synthetic-cascade-explanations-v1.json`
- 재생성: `pnpm run data:synthetic:cascade`

입력의 숫자는 설명 무결성 학습용 표시 계약 anchor다. 실제 Safety 엔진의 예측 정답이나 현실 분포가 아니다. 기대 출력은 기존 `createTemplateExplanation`과 `validateExplanationOutput`으로 생성·검증하며, 생성모델이 라벨을 만들지 않는다.

## 5. 개인정보·안전 경계

- 실제 이름·연락처·이메일·주소·좌표·GPS·생체정보 없음
- 고객 역할 입력에는 기사 응답·배송 분담·문서 인용 없음
- 기사 역할은 허용된 선택지 중 하나만 설명 출력에 포함
- 비신뢰 문서 지시는 인용 입력의 데이터로만 존재하고 기대 출력에 실행·반복되지 않음
- 사고확률·기사 순위·징계·성과평가 목표 없음
- AI가 소유하는 Safety·추천·동의·승인·적용 라벨 없음

## 6. 자동 검증 결과

`synthetic-cascade-training-validation-v1` 결과:

- schema 위반: 0
- parent split 누출: 0
- 개인정보 패턴 위반: 0
- 숫자·인용·역할 출력 무결성 위반: 0
- 의미상 exact content duplicate: 0
- 비신뢰 지시 레코드: 150
- train/validation/frozen 및 역할·시나리오 목표 충족

증거: `artifacts/evals/synthetic-cascade-training-dataset-latest.json`

## 7. 허용 용도

- A.X-4.0-Light 기반 LoRA의 strict 역할별 설명 학습
- 로컬 단독·Hosted 단독·Cascade 비교
- 숫자·인용·금지문구·역할·Fallback 평가
- A100 학습시간·VRAM·loss·재현성 측정

## 8. 금지 용도

- 실제 기사·배송·교통·사고 분포를 대표한다고 주장
- 사고확률·기사평가·징계·보험·의료 모델 학습
- Safety Budget·후보·추천·동의·승인 결정 모델 학습
- frozen-test를 학습·튜닝·조기중단에 사용
- 약관 확인 전 Hosted API 출력을 라벨로 추가하거나 증류
- 이 데이터만으로 현장 안전효과나 제품 통합 완료 주장

## 9. 수용기준

- 같은 명령이 동일 400 parent·1,600 레코드와 파일 hash를 재생성한다.
- 1,200/200/200 split과 parent 격리가 유지된다.
- 네 역할과 여덟 시나리오가 목표 수량을 충족한다.
- 개인정보·정밀 위치·Hosted 출력·AI 결정 라벨이 0건이다.
- 모든 expected output이 기존 strict 검증기를 통과한다.
- 학습 전 manifest hash와 base model revision을 A100 실행 기록에 고정한다.

## 10. 한계

- 규칙 기반 템플릿이므로 실제 현장 문체·오타·장문 분포를 대표하지 않는다.
- 표시값 복사와 정책 경계 학습에 최적화돼 범용 질의응답 능력을 입증하지 않는다.
- 현재 생성 완료는 LoRA 학습·성능 개선·제품 활성화를 의미하지 않는다.
