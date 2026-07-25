# SafeRoute AI 최종 GOAL 완료 감사

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-25
- 기준: `AGENTS.md`, `docs/product-spec.md`, `docs/evals.md`, `docs/final-readiness.md`, `docs/domestic-ai-track-compliance.md`

## 1. 결정사항

기술 릴리스 Gate와 최종 GOAL 완료 판정을 분리한다. `final-readiness-latest.json`의 `PASSED`는 결정론적 Demo·빌드·테스트·국내트랙 기술 경계를 뜻하며, 여섯 심사기준과 실제 사람 이해도까지 완료됐다는 뜻이 아니다.

`pnpm run audit:goal`은 창의성·혁신성·추진성·성장성·실효성·가치성의 여섯 기준을 실행 증거와 SHA-256에 연결하고 다음 중 하나로 판정한다.

- `READY_FOR_FINAL_SUBMISSION`: 여섯 기준과 두 사람 Gate가 모두 통과
- `READY_FOR_DEMO_SUBMISSION_WITH_DISCLOSED_GAP`: 기술·국내트랙·기사 사람 Gate는 통과했지만 승인된 마감 정책에 따라 G5-B Round 4를 미실시했고 그 공백을 제출물에 공개
- `HUMAN_VALIDATION_REQUIRED`: 기술 증거는 통과했지만 승인된 사람 이해도 결과가 부족
- `FAILED`: 기술·문서·국내트랙·데이터 경계 중 하나 이상 실패

기본 제출 패키지는 첫 번째 상태 또는 승인된 공개 공백 상태에서 생성된다. 공개 공백 상태는 `DEMO_SUBMISSION_CANDIDATE_WITH_DISCLOSED_GAP`과 `humanValidationGapDisclosed=true`를 manifest에 강제한다. 나머지 상태에서 `--diagnostic`을 사용한 압축은 `DIAGNOSTIC_ONLY`로 표시한다.

## 2. 실행 명령

```powershell
pnpm run audit:goal
pnpm run audit:goal:require-ready
```

첫 명령은 현재 상태를 정직하게 기록한다. 두 번째 명령은 일반 최종 제출 또는 승인된 공개 공백 데모 제출 상태가 아니면 실패한다.

결과는 `artifacts/evals/goal-completion-latest.json`에 저장한다. 각 기준은 판정, 원자 check, 근거 경로, 구체 수치와 blocker를 포함한다. 입력 증거·승인 문서·감사기와 사람 Gate 계약 테스트에는 바이트 수와 SHA-256을 기록한다.

## 3. 여섯 기준의 권위 증거

| 기준 | 필수 근거 |
|---|---|
| 창의성 | ADR-051의 레퍼런스 경계, 30개 변형·90회 전략 비교, SafeRoute 하드 제약 위반 0 |
| 혁신성 | Risk Transfer Guard 23/23, 시간·동의·버전 경계 30/30, 국내 AI·Upstage strict 증거 계층 |
| 추진성 | 최종 기술 Gate, Vitest 247, Playwright 21, clean-start 3, 공개 Demo 빌드 |
| 성장성 | 24·96·240명 합성 부하, 권역 80명·경로 24개 제한, 불완전 Live 날씨의 Demo 격리 |
| 실효성 | 기술 폐루프와 G5-B Round 4 최소 3인 이해도, 기사 경로·제품 경계 Round 2 최소 5인 이해도 |
| 가치성 | 개인정보·원문 비저장, 기사 권리 승인 문서, SafeRoute 위반 0과 Risk Transfer Guard |

## 4. 사람 Gate

실효성의 `PASSED`는 다음 두 strict summary가 모두 있어야 한다.

1. `g5-spatial-comprehension-round4-summary.json`: 최소 3명, `comprehensionPassed=true`, `KEEP_OPTIONAL` 또는 `DEFAULT_PROMOTION_CANDIDATE`
2. `rider-reference-comprehension-round2-summary.json`: 최소 5명, `READY_TO_PROMOTE`, 중대 제품 오인 0명

Round 1 실패, 자동 E2E 정답 입력, 팀 내부 추정 또는 응답 없는 빈 summary는 사람 증거를 대체하지 않는다.

2026-07-25 승인된 `config/final-release-policy.json`은 G5-B Round 4를 제출 일정상 미실시로 분류한다. 따라서 실효성 기준은 `DISCLOSED_VALIDATION_GAP`이며 통과가 아니다. 기사 Round 2 Gate, 기술 폐루프, 개인정보와 안전 Gate 중 하나라도 실패하면 이 정책으로 제출 가능 상태가 되지 않는다.

## 5. 제출 패키지 Gate

```powershell
pnpm run package:submission
```

기본 명령은 clean tracked tree, 기술 readiness `PASSED`, 국내트랙 `PASSED`, 그리고 `READY_FOR_FINAL_SUBMISSION` 또는 승인된 `READY_FOR_DEMO_SUBMISSION_WITH_DISCLOSED_GAP`을 요구한다. 후자는 정책 파일·감사 요약·제출 manifest가 모두 공백과 금지 주장을 명시해야 한다.

개발 중 allowlist와 비밀정보 스캔만 확인할 때는 다음처럼 명시한다.

```powershell
pnpm run package:submission -- --allow-dirty --diagnostic
```

이 결과는 `saferoute-ai-diagnostic-<sha>.zip`이며 manifest의 `diagnosticOnly=true`를 가진다.

## 6. 수용기준

- 심사기준은 정확히 6개이며 이름·판정·원자 check와 blocker가 있다.
- 근거 파일과 승인 문서의 SHA-256이 기록된다.
- 감사기·사람 summary 계약·단위 테스트의 SHA-256이 기록된다.
- G5-B는 유효한 Round 4만 실효성 통과에 사용한다. Round 1·2·3 실패는 삭제하지 않는다.
- 기사 사람 Gate는 5명·중대 오인 0 계약을 유지한다.
- 승인 정책이 없는 사람 Gate 대기 중에는 제출 패키지가 생성되지 않는다.
- 공개 공백 패키지는 사람 Gate 통과·관리자 이해도 완료로 표시되지 않는다.
- 진단 패키지는 파일명과 manifest에서 최종 제출본과 구분된다.

## 7. 비목표

- 심사위원의 실제 점수 예측
- 합성 결과를 실제 사고감소·현장 성과로 일반화
- 사람 응답 생성 또는 자동 E2E를 사람 결과로 대체
- 외부 TMS·GPS·센서·인증·고객 알림의 운영 완료 주장

## 8. 미결사항

- G5-B Round 4 독립 검토자 3명 결과는 제출 후 후속 검증으로 연기
- 발표 PC, 제출 폼·파일명·마감의 사람 확인
