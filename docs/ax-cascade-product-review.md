# A.X Local Cascade 제품 검토

## 문서 상태

- 상태: Review Required
- 담당: 팀 안전빵
- 최종 갱신: 2026-08-06
- 결정 대상: `AX_LOCAL` 제품 계층 활성화 여부

## 1. 결론 요약

현재 권고안은 `QUALIFY_LOCAL_MODEL_RETAIN_ACTIVATION_REVIEW`다. v1은 동일 합성 12과업에서 Local-only 7/12였지만, 신규 데이터와 새 frozen을 사용한 v2는 Local-only 12/12·Fallback 0·unsafe 0건으로 모델 품질 Gate를 통과했다. 기존 A.X-K1 Hosted-only도 12/12다.

후속 `ax-cascade-lora-v2`는 신규 600-parent 계약의 validation·terminal frozen 각각 300/300과 독립 검증을 통과했고, v2 학습에 쓰지 않은 동일 잠금 12과업도 12/12로 통과했다. Local 모델 슬롯은 자격을 얻었지만 제품용 runtime과 운영 Gate가 없어 실제 활성화는 계속 사람 검토 대상으로 남긴다.

v2 Local 모델 슬롯은 품질 자격을 얻었지만 Local P95 `8,411.80ms`는 Hosted-only P95 `4,251ms`보다 느리고 제품용 runtime도 배포되지 않았다. 따라서 공개 제품은 기존 Hosted·Template 경계를 유지하고 adapter는 검증된 연구·심사 증거로 보존하는 것이 현재 최선이다.

## 2. 동일 과업 결과

| 전략 | 최종 통과 | Local 수용 | Hosted 수용 | Fallback | P50 | P95 | 총 토큰 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Local-only | 7/12 | 7 | 0 | 5 | 5,792.20ms | 8,435.46ms | 5,550 |
| Hosted-only | 12/12 | 0 | 12 | 0 | 3,192.50ms | 4,251ms | 9,544 |
| Cascade | 12/12 | 7 | 5 | 0 | 6,479.60ms | 12,590.46ms | 9,881 |

### v2 동일 과업 결과

| 전략 | 최종 통과 | Local 수용 | Hosted 수용 | Fallback | P50 | P95 | 총 토큰 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Local-only v2 | 12/12 | 12 | 0 | 0 | 6,064.27ms | 8,411.80ms | 6,732 |
| Hosted-only | 12/12 | 0 | 12 | 0 | 3,192.50ms | 4,251ms | 9,544 |
| Cascade v2 | 12/12 | 12 | 0 | 0 | 6,064.27ms | 8,411.80ms | 6,732 |

v1 Local 실패는 schema 2건, 표시값 누락 3건, malformed response 1건, 필수 fact·citation 누락 각 1건이며 한 과업에 여러 코드가 함께 기록될 수 있다. v2는 이 실패 코드를 새 합성 계약의 상위 요구로만 사용했고 동일 과업에서 실패 코드 0건을 기록했다. 두 버전 모두 검증 실패 출력은 화면에 표시하지 않았다.

## 3. 결정 요청

### 권고 — Local 모델 자격 인정, 제품 활성화 별도 검토

- v2 Local 모델 슬롯의 strict 설명 품질 자격을 인정한다.
- 공개 제품의 현재 Hosted·Template 경계는 runtime 승인 전까지 유지한다.
- LoRA adapter와 A100 결과는 검증된 연구·심사 증거로 보존한다.
- consumed frozen과 product-review 12과업을 재실행하거나 결과로 재튜닝하지 않는다.
- Local runtime을 진행하려면 인증·health check·timeout·rate limit·장애 E2E·배포 rollback과 비공개 pilot을 별도 승인한다.
- 다음 작업은 현재 Hosted·Template 제품 경계를 유지할지, 별도 승인을 거쳐 controlled Local runtime pilot을 준비할지 결정하는 것이다.
- 기사 앱 제한적 STT는 현재 구현하지 않고 향후 발전 후보로 보존한다.

### 비권고 — Local 제품 활성화 승인

이 선택은 별도 승인이 필요하며 즉시 활성화하지 않는다. 새 runtime endpoint, 인증·권한, health check, timeout·rate limit, A100 가용성·비용, 장애 E2E, 배포·rollback과 국내 AI 경계 검토를 먼저 구현해야 한다.

## 4. 수용기준

- Local 7/12 실패를 삭제·완화하거나 frozen 200/200과 합쳐 성공률을 만들지 않는다.
- v2 12/12는 v1과 동일한 잠금 과업의 별도 terminal 실행 결과로 표시한다.
- Cascade 12/12는 기록된 동일 task 증거의 순차 route replay임을 명시한다.
- 실제 운영 효과·사고감소·실사용자 성능으로 주장하지 않는다.
- 사용자 결정 전 `productIntegrationApproved=false`를 유지한다.
- 승인 또는 보류 결정은 `docs/decisions.md`에 후속 ADR로 기록한다.

## 5. 미결사항

- 사용자가 권고안인 Local 모델 자격 인정과 제품 활성화 별도 검토를 승인하는가?
- 최종 제출 전 controlled Local runtime pilot까지 진행할 필요가 있는가?
- 향후 STT를 검토할 때 실제 음성 수집·보존·외부 전송과 운전 중 사용 경계를 어떻게 승인할 것인가?

## 6. 비목표

- 현재 adapter 재학습·재실행
- frozen 재사용
- 새 외부 API·secret 도입
- A100을 공개 제품 runtime으로 즉시 전환
- AI가 Safety 수치·추천·동의·승인을 결정하도록 권한 확대
