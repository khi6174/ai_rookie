# A100 합성 운영문서 추출 멘토링 브리프

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-25
- 용도: SKT AI 담당자 멘토링의 재현 가능한 기술 검토 자료

## 1. 한 문장 결론

A100에서 고정 revision `skt/A.X-4.0-Light`로 합성 운영문서 100건의 strict JSON·정확 인용 추출을 평가한 결과, 동결 test는 17/20이었지만 비신뢰 지시 과업 1건이 exact contract를 통과하지 못해 사전 기준상 `PARTIAL_RESEARCH_BASELINE`이며 제품에는 통합하지 않는다.

## 2. 무엇을 했고 하지 않았는가

한 일:

- 배송 작업표·근무표·경로표·사고예방 안전보고서 각 25건, 총 100건을 규칙 기반으로 생성
- parent 기준 development 60·validation 20·frozen-test 20 분리
- A.X-4.0-Light 고정 revision, BF16, greedy decoding, A100 순차 추론
- strict JSON, 고정 field ID, 표시값 단위, 원문 전체 한 줄 인용, PII·새 숫자·비신뢰 지시 Gate
- 실패 시 생성문 표시를 막고 결정론적 Fallback으로 전환
- 모든 run의 raw output hash·CSV·summary를 독립 재검증

하지 않은 일:

- 모델 가중치 학습, SFT, LoRA 또는 파인튜닝
- 실제 기사·고객·TMS·GPS·사고 문서 사용
- Safety Budget, Time-to-Breach, 추천 또는 기사 평가를 모델에 위임
- 실패 출력의 코드펜스 제거·후처리 보정·정답 완화
- frozen-test 반복 실행 또는 좋은 결과 선택

## 3. 실행 결과

| 단계 | 버전 | 통과 | 통과율 | 비신뢰 지시 | unsafe 표시 |
|---|---|---:|---:|---:|---:|
| development | v1.0 | 0/60 | 0.00% | 0/3 | 0 |
| development | v1.1 | 28/60 | 46.67% | 0/3 | 0 |
| development | v1.2 | 33/60 | 55.00% | 3/3 | 0 |
| development | v1.3 | 35/60 | 58.33% | 3/3 | 0 |
| validation | v1.4 | 15/20 | 75.00% | 1/1 | 0 |
| frozen-test | v1.4 | 17/20 | 85.00% | 0/1 | 0 |

동결 test 유형별 결과:

- 배송 작업표: 3/5
- 근무표: 5/5
- 경로표: 5/5
- 안전보고서: 4/5

동결 실패:

- 작업표 2건: 모든 값과 인용을 만들었지만 JSON 대괄호를 한 번 더 닫아 `MALFORMED_JSON`
- 비신뢰 안전보고서 1건: 자유메모 지시를 실행하거나 노출하지 않았으나 observation ID에 다른 원문 줄을 인용해 `CITATION_VALUE_MISMATCH`

따라서 비신뢰 지시가 화면에 노출된 것은 아니며 `unsafeDisplayCount=0`이다. 다만 사전 기준은 비신뢰 과업의 전체 exact contract 통과를 요구하므로 주입 통과율을 0/1로 유지한다.

## 4. 해석

강점:

- 근무표와 경로표의 동결 test가 10/10이다.
- 안전보고서 일반 사례와 데이터/지시 경계는 대부분 유지됐다.
- 모든 실패가 표시 전에 차단되어 unsafe 출력은 전체 여섯 run에서 0건이다.
- development → validation → frozen을 parent 단위로 분리하고 결과를 덮어쓰지 않았다.

한계:

- strict JSON 문법이 긴 10-fact 작업표에서 불안정하다.
- 정확 인용은 의미가 맞는 답보다 훨씬 엄격하며, 한 필드의 citation 정렬 실패로 전체 과업이 Fallback 된다.
- frozen 비신뢰 표본은 지시 실행이 아니라 인용 정렬 실패였지만 exact task 기준은 통과하지 못했다.
- 데이터가 규칙 기반 합성이므로 실제 문서 레이아웃·OCR·표 깨짐·운영 약어를 대표하지 않는다.

## 5. SKT 멘토에게 확인할 질문

1. A.X-4.0-Light 로컬 추론에서 JSON Schema, grammar-constrained decoding 또는 공식 structured-output 경로를 권장하는가?
2. 긴 JSON에서 마지막 배열을 중복 닫는 현상에 대해 권장하는 chat template, EOS, stopping criteria 또는 generation 설정이 있는가?
3. 표의 여러 field가 동일한 원문 전체 행을 citation으로 가져야 할 때 권장하는 프롬프트·출력 구조는 무엇인가?
4. 비신뢰 메모를 실행하지 않았지만 다른 필드의 citation이 밀린 사례를 지시 격리와 추출 정확도로 분리 평가하는 공식 권장법이 있는가?
5. 100건 합성 문서로 SFT·LoRA를 시도하기 전에 필요한 최소 표본 규모, 실제 문서 혼합 비율, 라이선스·재배포 경계는 무엇인가?
6. strict exact-match 외에 SKT가 권장하는 구조 정확도·인용 충실도·안전 실패율 지표가 있는가?

## 6. 현재 결정

- v1.4 결과는 `PARTIAL_RESEARCH_BASELINE`으로 고정한다.
- 제품 런타임에는 넣지 않고 기존 결정론적 파서·Fallback을 유지한다.
- 멘토링 전에는 추가 프롬프트 튜닝이나 frozen 재실행을 하지 않는다.
- 후속 학습은 SKT의 구조화 출력·라이선스·데이터 규모 권고를 받은 뒤 별도 실험 계획과 새 split으로 승인한다.

## 7. 재현 자료

- Bundle manifest: `artifacts/evals/a100-operations-documents/a100-operations-documents-eval-v1-manifest.json`
- 전체 비교: `artifacts/evals/local-model-runs/operations-documents-comparison.json`
- 비교 CSV: `artifacts/evals/local-model-runs/operations-documents-comparison.csv`
- 실행 절차: `docs/gpu-benchmark-runbook.md`
- 판정 정책: `config/a100-operations-document-eval-policy.json`
