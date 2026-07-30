# SafeRoute AI 국내 AI 트랙 제출 패키지 운영

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-30
- 기준: `docs/final-readiness.md`, `docs/domestic-ai-track-compliance.md`

## 0. 2026-08-14 제출용 메시지 패키지

### 0.1 제목과 한 문장

- 제출 제목: `SafeRoute AI - 라스트마일 배송계획 안전운영 코파일럿`
- 한 문장: `남은 배송계획이 언제 안전한계를 넘는지 예측하고, 누구에게도 위험을 넘기지 않는 대안만 기사 동의와 관리자 승인으로 적용합니다.`
- 공개 Demo: `https://saferoute-ai-demo.khiyw.chatgpt.site/stage`

### 0.2 300자 소개문

SafeRoute AI는 배송기사를 감시하거나 사고확률을 매기는 시스템이 아닙니다. 남은 배송 순서를 시뮬레이션해 약 52분 후 17번째 배송지처럼 미래의 운영 안전한계 초과를 예측하고 원인을 설명합니다. 휴식·물량이관·순서변경·안전경로·Safe Delay를 비교하되, 다른 기사에게 위험을 넘기는 후보는 먼저 차단합니다. 두 기사 동의와 관리자 승인 뒤에만 경로·순서·ETA·고객안내를 함께 갱신합니다.

### 0.3 여섯 심사기준용 한 줄 근거

| 기준 | 제출 문장 | 증거 |
|---|---|---|
| 창의성 | 현재 위험점수가 아니라 남은 계획의 `Time-to-Breach`를 배송지 단위로 예측한다. | 52분·17번째 배송지 |
| 혁신성 | 안전을 ETA와 교환하지 않고, 수신 기사까지 검사하는 Risk Transfer Guard를 둔다. | 12건 이관 실행 불가 |
| 추진성 | 단일 화면 제안이 아니라 동의·승인·계획 적용까지 실제 폐루프로 구현했다. | 배포 Demo, E2E, 빌드 |
| 성장성 | 결정론 엔진과 국내 AI 설명 계층을 분리해 TMS·문서·다지역 운영으로 확장할 수 있다. | strict 계약, 합성 운영문서, provider adapter |
| 실효성 | 승인 후 경로·순서·작업량·ETA·고객안내가 하나의 decision으로 함께 갱신된다. | 적용 전후 화면과 감사기록 |
| 가치성 | 기사 거절권, 위험전가 방지, 개인정보 최소화와 Demo 경계를 제품 규칙으로 강제한다. | 양측 동의, 비징벌 문구, Live 0명 |

### 0.4 심사위원에게 먼저 공개할 한계

- 현재 데이터는 결정론적 합성 Demo이며 실제 사고확률이나 사고감소 효과가 아니다.
- 실제 GPS·TMS·고객 메시지 발송과 운영 현장 효과는 검증 범위에 포함하지 않는다.
- 기사 화면의 제품 경계 이해도 Round 2는 통과했지만, 관리자 공간 화면의 마지막 독립 이해도 평가는 제출 일정상 미실시다.
- 국내 AI는 설명·문서 구조화 계층이며 Safety 수치와 추천 판정을 소유하지 않는다.

### 0.5 제출 규격의 권위 순서

2026-08-14 AI ROOKIE 제출 규격은 운영사무국의 최신 공지와 2026-07-29 멘토링에서 확인한 `3분 영상` 요구를 따른다. 로컬에 남아 있는 `30~90초 세로형 숏폼` 안내문은 별도 교내 행사 문서이므로 AI ROOKIE 제출 규격으로 전용하지 않는다. 최종 업로드 전에 최신 공지의 영상 길이, 화면비, 코덱, 파일 크기와 파일명을 다시 확인한다.

## 1. 결정사항

최종 제출 패키지는 GitHub 전체 작업폴더를 압축하지 않고 승인된 소스·문서·최신 평가 증거·스크린샷과 같은 commit의 정적 빌드만 allowlist 방식으로 포함한다. 로컬 비밀정보, 중복 run과 격리형 디자인 프로토타입은 명시적으로 제외한다.

## 2. 생성 명령

```powershell
pnpm run package:submission
```

생성 전 조건은 다음과 같다.

- 추적된 working tree가 clean이다.
- `artifacts/evals/final-readiness-latest.json`이 `PASSED`다.
- `artifacts/evals/domestic-track-compliance-latest.json`이 `PASSED`다.
- `artifacts/evals/goal-completion-latest.json`이 `READY_FOR_FINAL_SUBMISSION` 또는 승인된 `READY_FOR_DEMO_SUBMISSION_WITH_DISCLOSED_GAP`이다.
- 최신 핵심·최종 불변 run이 Git에 추적되어 있다.

명령은 현재 commit에서 프로덕션 빌드를 다시 만들고 다음 파일을 생성한다.

- `artifacts/submission/saferoute-ai-domestic-track-<short-sha>.zip`
- `artifacts/submission/submission-package-latest.json`

압축 내부에는 `SUBMISSION_README.md`, `submission-manifest.json`과 각 파일의 SHA-256이 포함된다.

사람 Gate가 남은 개발 중 allowlist·비밀정보 스캔만 확인하려면 `pnpm run package:submission -- --allow-dirty --diagnostic`을 사용한다. 결과는 `saferoute-ai-diagnostic-<sha>.zip`, `diagnosticOnly=true`로 고정되며 최종 제출본이 아니다.

## 3. 포함 범위

- React·TypeScript 소스와 결정론 도메인 엔진
- 테스트·E2E·평가·검증 스크립트
- `.env.example`과 재현 가능한 패키지 lock
- Approved 핵심 문서 19개
- 합성 운영문서 dataset card, seed spec, manifest와 검증 통과 문서 100개
- 최신 평가 요약, 기사 제품 경계 고정 자극 manifest와 체크인된 스크린샷
- 최신 core evidence run과 final readiness run
- 같은 commit에서 생성한 `demo-dist/`

기사 경로·제품 경계 평가는 최신 `rider-reference-round2-stimulus-manifest.json`과 평가 계약을 항상 포함하고 Round 1 실패 summary도 이력으로 보존한다. 실제 독립 Round 2가 완료된 경우에만 익명 집계 `rider-reference-comprehension-round2-summary.json`을 최종 사람 Gate 후보로 포함하며, 원응답이나 연락처는 제출 패키지에 넣지 않는다. 요약이 없으면 사람 평가를 대기 상태로 명시하고 자동 Gate 통과로 대체하지 않는다.

G5-B 공간 이해도는 Round 1·2·3 실패 원본과 요약을 보존하고, 독립 Round 4가 완료되면 `g5-spatial-comprehension-round4-results.json`과 strict 집계 summary를 함께 포함한다. 최종 readiness는 유효한 최신 round를 우선하되 어느 round를 사용했는지 명시한다. 기사 Round 2 `READY_TO_PROMOTE` 결과와 요약은 포함하되 실제 GPS·내비게이션·현장 성과로 확대하지 않는다.

이번 마감 제출은 `config/final-release-policy.json`에 따라 G5-B Round 4를 미실시로 공개한다. 패키지는 `DEMO_SUBMISSION_CANDIDATE_WITH_DISCLOSED_GAP`으로 표시하며, 이를 관리자 이해도나 현장 사용성 검증 완료로 해석하지 않는다.

## 4. 명시적 제외

- 별도 전략 디자인 PDF
- `artifacts/saferoute-web-demo/`와 관련 압축파일
- `.env.local`, API 키, 인증정보
- `node_modules/`, Playwright report, test-results
- 이전 중복 core·API·날씨 실행 전체
- 실제 배송·근무·사고 원문과 개인정보가 포함된 운영문서

제외는 과거 작업을 숨기기 위한 것이 아니라 제품 런타임·국내 AI 평가·최종 증거의 제출 범위를 명확하게 만들기 위한 것이다. GitHub 저장소의 개발 이력과 제출 패키지는 별도로 관리한다.

## 5. 제출 전 사람 확인

- 운영사무국의 실제 파일명·크기·형식 제한
- 본선 제안서·시연 영상·활용 확약서의 별도 양식
- 제출 ZIP을 요구하는지 또는 GitHub 링크만 요구하는지
- 제출 마감 시각과 업로드 완료 화면
- 제출 문서에 기록할 최종 Git commit SHA

## 6. 수용기준

- 패키지 생성 명령이 clean commit에서 통과한다.
- manifest의 모든 파일 해시가 압축을 푼 파일과 일치한다.
- 비밀정보·실제 개인정보·로컬 경로가 없다.
- 격리형 프로토타입과 비승인 외부 산출물이 없다.
- 최종 readiness와 국내트랙 감사가 모두 `PASSED`다.
- 최종 GOAL 감사가 일반 완료 또는 승인된 공개 공백 데모 제출 상태이고 진단 패키지가 아니다.
- 공개 공백 상태에서는 manifest와 `SUBMISSION_README.md`에 관리자 이해도 미검증이 기록된다.
- 정적 빌드가 패키지의 commit에서 재생성된다.

## 7. 비목표

- 운영사무국 업로드 자동화
- 제출 양식의 임의 확정
- 실제 운영 배포 패키지 생성
- API 키를 포함한 Live 데모 배포

## 8. 미결사항

- 운영사무국의 실제 ZIP 허용 여부와 크기 제한
- 최종 시연 영상 파일명과 코덱
- GitHub Pages 공개 배포 승인
