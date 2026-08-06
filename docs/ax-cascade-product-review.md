# A.X Local Cascade 제품 검토

## 문서 상태

- 상태: Review Required
- 담당: 팀 안전빵
- 최종 갱신: 2026-08-06
- 결정 대상: `AX_LOCAL` 제품 계층 활성화 여부

## 1. 결론 요약

권고안은 `DEFER_LOCAL_PRODUCT_ACTIVATION`이다. 동일 합성 12과업에서 A.X LoRA Local-only는 7/12, 기존 A.X-K1 Hosted-only는 12/12, 순차 Cascade replay는 Local 7건 수용·Hosted 5건 승격으로 12/12를 기록했다. 모든 전략의 unsafe 표시 건수는 0이다.

후속 `ax-cascade-lora-v2`는 신규 600-parent 계약의 validation·terminal frozen 각각 300/300과 독립 검증을 통과했다. 다만 이 결과는 기존 제품 과업 통과를 의미하지 않으므로, v2 학습에 쓰지 않은 동일 잠금 12과업의 terminal 비교가 완료되기 전까지 기존 활성화 보류 권고를 유지한다.

Cascade 계약과 안전한 승격은 검증됐지만 현재 Local 계층은 제품 자격이 없다. Local Gate 12/12를 충족하지 못했고, Cascade P95 `12,590.46ms`는 Hosted-only P95 `4,251ms`보다 느리며, 제품용 Local runtime도 배포되지 않았다. 공개 제품은 기존 Hosted·Template 경계를 유지하고 adapter는 연구 증거로 보존하는 것이 현재 최선이다.

## 2. 동일 과업 결과

| 전략 | 최종 통과 | Local 수용 | Hosted 수용 | Fallback | P50 | P95 | 총 토큰 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Local-only | 7/12 | 7 | 0 | 5 | 5,792.20ms | 8,435.46ms | 5,550 |
| Hosted-only | 12/12 | 0 | 12 | 0 | 3,192.50ms | 4,251ms | 9,544 |
| Cascade | 12/12 | 7 | 5 | 0 | 6,479.60ms | 12,590.46ms | 9,881 |

Local 실패는 schema 2건, 표시값 누락 3건, malformed response 1건, 필수 fact·citation 누락 각 1건이며 한 과업에 여러 코드가 함께 기록될 수 있다. 숫자·인용·역할·인젝션 무결성은 schema-valid 출력에서 100%였고 검증 실패 출력은 화면에 표시하지 않았다.

## 3. 결정 요청

### 권고 — 제품 활성화 보류

- 공개 제품의 현재 Hosted·Template 경계를 유지한다.
- LoRA adapter와 A100 결과는 연구·심사 증거로만 보존한다.
- consumed frozen과 product-review 12과업을 재실행하거나 결과로 재튜닝하지 않는다.
- 새 Local 실험은 새 dataset·experiment·held-out split에서만 시작한다.
- 현재 기능 순서에 따라 새 dataset·experiment·held-out split을 사용하는 A.X Local v2 설명 강화로 이동한다.
- 기사 앱 제한적 STT는 현재 구현하지 않고 향후 발전 후보로 보존한다.

### 비권고 — Local 제품 활성화 승인

이 선택은 별도 승인이 필요하며 즉시 활성화하지 않는다. 새 runtime endpoint, 인증·권한, health check, timeout·rate limit, A100 가용성·비용, 장애 E2E, 배포·rollback과 국내 AI 경계 검토를 먼저 구현해야 한다.

## 4. 수용기준

- Local 7/12 실패를 삭제·완화하거나 frozen 200/200과 합쳐 성공률을 만들지 않는다.
- Cascade 12/12는 기록된 동일 task 증거의 순차 route replay임을 명시한다.
- 실제 운영 효과·사고감소·실사용자 성능으로 주장하지 않는다.
- 사용자 결정 전 `productIntegrationApproved=false`를 유지한다.
- 승인 또는 보류 결정은 `docs/decisions.md`에 후속 ADR로 기록한다.

## 5. 미결사항

- 사용자가 권고안인 Local 제품 활성화 보류를 승인하는가?
- 후속 새 Local v2 실험의 validation·새 terminal frozen·신규 제품 비교가 사전 Gate를 통과하는가?
- 향후 STT를 검토할 때 실제 음성 수집·보존·외부 전송과 운전 중 사용 경계를 어떻게 승인할 것인가?

## 6. 비목표

- 현재 adapter 재학습·재실행
- frozen 재사용
- 새 외부 API·secret 도입
- A100을 공개 제품 runtime으로 즉시 전환
- AI가 Safety 수치·추천·동의·승인을 결정하도록 권한 확대
