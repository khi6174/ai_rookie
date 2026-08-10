# SafeRoute AI 외부 연동 준비 Sandbox 운영 Runbook

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-08-10
- 적용 범위: `INTEGRATION_READY_SANDBOX`

## 1. 목적과 완료 상태

이 Runbook은 실제 데이터·TMS·택배사·기사·GPS·실제 인증 공급자·고객 발송 없이 외부 Adapter 연결 직전 상태를 반복 검증하는 절차다. 완료 상태는 `PRODUCTION_SANDBOX`이며 `LIVE`나 현장 운영 완료를 의미하지 않는다.

Sandbox가 보장하는 범위는 합성 조직·역할 경계, TMS 이벤트 계약, 계획 적용과 고객안내 Outbox, D1 보존·백업·복구, Kill switch, rate limit, 장애 의미와 결정론적 Safety 독립성이다. 실제 외부 연결은 별도 사용자 재승인 대상이다.

## 2. 안전한 기본값과 환경 설정

배포 기본값은 Sandbox 비활성화다. 공개 health는 비밀값 없이 `DISABLED`와 외부 연결이 모두 `false`임을 반환한다. 활성화는 서버 환경에서 다음 값이 모두 유효할 때만 가능하다.

| 변수 | 규칙 | 브라우저 노출 |
|---|---|---|
| `INTEGRATION_SANDBOX_ENABLED` | 정확히 `true` | 금지 |
| `INTEGRATION_SANDBOX_TOKEN` | 32자 이상 임의 문자열 | 금지 |
| `INTEGRATION_SANDBOX_TENANT_ID` | 합성 `tenant-*` 식별자 | health에는 미노출 |
| `INTEGRATION_SANDBOX_SITE_ID` | 합성 `site-*` 식별자 | health에는 미노출 |
| `INTEGRATION_SANDBOX_RETENTION_HOURS` | 1~168 | 금지 |
| `INTEGRATION_SANDBOX_RATE_LIMIT_PER_MINUTE` | 1~600 | 금지 |

실제 이름·전화번호·주소·차량번호·GPS·위경도·생체정보는 설정하거나 요청 payload에 넣지 않는다. `.env.example`에는 값이 없는 계약만 둔다.

## 3. 역할과 요청 경계

인증 endpoint는 `Authorization: Bearer <token>`과 합성 tenant·site·actor·role header를 모두 요구한다. 역할은 최소 권한으로 사용한다.

- `DISPATCHER`: TMS 합성 이벤트 수신과 운영 조회
- `ADMIN`: 승인된 계획 Outbox, 고객안내 Outbox, 일반 운영 조회
- `PLATFORM_ADMIN`: Kill switch, 백업, 복구 검증·적용, 보존 실행

tenant·site가 설정과 다르면 동일한 거부 응답을 반환한다. 토큰이나 tenant 존재 여부를 로그·URL·응답·증거 파일에 남기지 않는다.

## 4. 시작 전 점검

1. `pnpm run typecheck`와 Sandbox 계약·서버·build-boundary 테스트를 통과한다.
2. `pnpm run audit:integration-sandbox`가 16개 기술 점검을 모두 통과하는지 확인한다.
3. `pnpm run build` 후 생성 Worker에 D1 binding과 Sandbox route가 포함됐는지 확인한다.
4. 공개 배포는 Sandbox 비활성 상태로 유지하고 `/api/integration-sandbox/health`의 외부 연결 네 항목이 모두 `false`인지 확인한다.
5. 활성 시험이 필요하면 공개 서비스와 분리된 승인된 환경에서 합성 토큰과 합성 tenant만 주입한다.

## 5. 정상 운영 순서

1. `/readiness`에서 D1, TMS Simulator, Outbox, AI Fallback 상태를 확인한다.
2. `/tms/events`에 단조 증가 sequence와 고유 idempotency key를 가진 합성 batch를 넣는다.
3. 기사 동의·관리자 승인·Safety 증명·최신 plan version을 가진 명령만 `/plan-outbox`로 넣는다.
4. 고객안내는 합성 수신자 참조와 허용 템플릿만 `/customer-outbox`에 넣는다. `networkDelivery`는 항상 `false`다.
5. 재시도는 같은 idempotency key를 사용한다. 같은 key의 다른 payload나 stale plan은 수정하지 말고 원인을 조사한다.

## 6. 장애 대응과 Kill switch

계획 적용 이상에는 `planApplyDisabled`, 고객안내 이상에는 `customerNoticeDisabled`, AI 제공자 이상에는 `aiProviderDisabled`를 켠다. Safety 계산·실행 가능성·Risk Transfer Guard는 결정론 엔진이 소유하며 AI 장애로 변경되지 않는다.

- 토큰·역할 오류: 자격 증명을 응답이나 로그에 복사하지 말고 서버 설정과 합성 header만 재검증한다.
- rate limit: 자동 확장하지 말고 호출자 retry/backoff와 중복 key를 확인한다.
- sequence conflict: 누락 batch부터 순서대로 재처리한다.
- stale plan: 현재 활성 version을 다시 읽고 사람 동의·승인·Safety 증명을 새 decision으로 재생성한다.
- D1 conflict: 최신 revision을 읽은 뒤 명령을 재평가한다. 기존 활성 계획을 덮어쓰지 않는다.
- AI timeout/invalid schema: 명시적 template fallback을 사용한다. LIVE AI 성공으로 표시하지 않는다.

## 7. 백업·복구·보존

백업은 payload와 SHA-256을 함께 보관하고 토큰·실제 개인정보를 포함하지 않는다. `/restore/verify`는 무변경 검증이며 hash·schema·tenant·site를 확인한다. 실제 Sandbox restore는 계획·고객·AI Kill switch 세 개가 모두 켜진 상태에서만 수행한다.

복구 후 revision, 마지막 TMS sequence, Outbox idempotency, 활성 계획 version을 확인한다. hash 불일치나 tenant 불일치는 복구하지 않는다. `/retention`은 설정된 TTL보다 오래된 합성 event와 처리 완료 Outbox만 정리하며 감사·활성 상태를 임의 삭제하지 않는다.

## 8. 롤백과 승격 Gate

릴리스 장애 시 세 Kill switch를 켜고 이전 검증 commit의 Sites 버전으로 되돌린다. D1 schema는 파괴적 되돌리기를 하지 않으며 구버전 코드가 새 table을 무시할 수 있어야 한다. 복구 완료 후 goal audit와 배포 smoke를 다시 실행한다.

실제 Adapter 승격 전에는 실제 원천·계약·보존·개인정보·인증·보상 트랜잭션·고객 발송·현장 Pilot을 별도로 승인하고 검증한다. 이 Runbook의 통과만으로 실서비스 효과나 실제 연동 완료를 주장하지 않는다.

## 9. 수용기준과 비목표

수용기준은 `docs/integration-ready-sandbox-goal.md`의 모든 Gate, 전체 회귀 테스트, 지정 해상도 E2E, clean-start, production build, 동일 공개범위 배포 smoke 통과다.

비목표는 실제 PII·GPS·생체정보 수집, 실제 인증, 실제 TMS·택배사 연결, 고객 네트워크 발송, 실제 운영 성과·사고감소 주장, 관리자 이해도와 실운영 효과의 독립 검증이다.
