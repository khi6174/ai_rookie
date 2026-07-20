# SafeRoute AI 본선 최종준비 점검

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-20
- 대체 문서: `docs/midpoint-review.md`
- 기준 문서: `AGENTS.md`, `docs/product-spec.md`, `docs/evals.md`, `docs/demo-script.md`, `docs/design-system.md`, `docs/domestic-ai-track-compliance.md`, `docs/submission-package.md`

## 1. 결론

SafeRoute AI의 AI ROOKIE 본선용 결정론적 P0 데모는 최종준비 단계에 진입할 수 있다. 미래 임계치 초과 예측부터 양측 기사 동의, 관리자 승인, 최신 계획 재검증, 계획·ETA·고객안내와 감사기록 갱신까지 하나의 decision ID로 재현된다.

이 판정은 합성 Demo의 기능·재현성 준비 완료를 뜻한다. 이후 G3-B의 설치 가능한 정적 app shell, 승인 Demo 계획 캐시, ADR-043·044의 Kakao Maps 2D 표시 어댑터, ADR-045의 결정론적 Demo 이동과 ADR-046의 Fallback 2D 부하 예산이 추가됐지만, 실제 사고감소, 현장 안전성, 실제 기사 데이터 처리, 실제 인증·위치·푸시·TMS와 운영 배포 준비 완료를 뜻하지 않는다.

## 2. 확정된 최종준비 범위

- 신규 기능을 추가하지 않고 현재 폐루프를 동결한다.
- 관리자 Calm Control Tower와 설치 가능한 합성 Demo 기사 PWA를 본선 화면으로 사용한다.
- 관리자는 합성 좌표만 표시하는 Kakao Maps 2D 베이스 레이어를 사용하고, SDK 오류·키 미설정 시 명시적인 `Fallback schematic map`으로 전환한다.
- 관리자는 24명 합성 위치의 30초 `Demo movement`를 재생할 수 있지만 `Live 0명`을 고정 표시하고 stale·offline을 움직이지 않는다.
- 지도 부하는 24·96·240명 합성 profile까지 평가했고 공개 기본값은 24명으로 유지한다. 240명 초과, Kakao 네트워크 성능과 실제 장치 성능은 주장하지 않는다.
- 불완전한 Live 날씨는 Safety 계산에 섞지 않고 전체 Demo 날씨로 전환한다.
- 국내 AI는 수치·추천·실행 가능성을 변경하지 않는 설명 Gate 뒤에서만 사용한다.
- 실제 인증·Live 위치·푸시·서버 동기화, 주소·길찾기·3D와 추가 외부 의존성은 별도 승인 대상으로 유지한다.

## 3. 실행 증거

| 영역 | 최종 확인 결과 |
|---|---|
| 단위·계약 | Vitest 24개 파일, 220/220 통과 |
| 브라우저 폐루프 | Playwright 17/17 통과, Demo 이동·G4-B 부하·bounded 지도 pan·실제 offline reload·캐시 만료 포함 |
| 지도 부하 | Fallback 2D 24·96·240명 3/3, 권역 최대 80명·동시 경로 24개·5초 갱신 예산 통과 |
| 서버 clean start | 독립 서버·브라우저 3/3 |
| 프로덕션 빌드 | TypeScript 검사와 Vite 빌드 성공 |
| 화면 | 관리자 1440×900·1280×720, 기사 390×844·360×800 통과, 레퍼런스 대응 실제 캡처 6개 |
| Risk Transfer Guard | 직접 20개와 전체 계획 3개, 23/23 통과 |
| 결정 폐루프 경계 | 시간 8·동의/권한 12·버전 10, 30/30 통과 |
| 전략 비교 | 30개 변형·90회 비교, SafeRoute 하드 제약 위반 0건 |
| 국내 AI 표시 안전 | 검증되지 않은 생성문 표시 0건, 실패는 Fallback |
| 국내 AI 트랙 경계 | 제품·평가 host·모델·SDK·credential 자동 감사 통과 필요 |
| 증거 무결성 | 국내트랙 자동 감사와 지도 부하를 포함한 핵심 산출물 14개와 SHA-256 run manifest, 총 15개 파일 생성 |

모든 수치는 합성·Mock·시뮬레이션 또는 명시된 비식별 API smoke 결과다. 실제 운영효과로 일반화하지 않는다.

### 3.1 자동 최종 릴리스 게이트

`pnpm run verify:final`은 build, Playwright 17개, clean-start 3회, 핵심 평가, 국내트랙 감사와 공개 정적 Demo 빌드를 외부 API 호출 없이 다시 실행한다. 2026-07-20 ADR-046 반영 Gate는 Vitest 220/220, Playwright 17/17, clean-start 3/3, 지도 부하 3/3, 국내트랙 감사 7/7과 build를 통과했다. 전체 묶음의 최신 결과와 사람 확인 항목은 `artifacts/evals/final-readiness-latest.json`에서 추적한다.

## 4. 문서 게이트

### 구현 기준 Approved

- `docs/product-spec.md`
- `docs/data-contracts.md`
- `docs/safety-model.md`
- `docs/intervention-policy.md`
- `docs/privacy-and-ai-policy.md`
- `docs/design-system.md`
- `docs/architecture.md`
- `docs/evals.md`
- `docs/demo-script.md`
- `docs/domestic-ai-track-compliance.md`
- `docs/decisions.md`

### 의도적으로 Draft 유지

- `docs/data-sources.md`: 실제 운영 입력 승격 조건과 추가 공공데이터 적합성이 미확정이다.
- `docs/gpu-benchmark-runbook.md`: A.X API 계정 계약과 반복 실행 분산이 미확정인 운영 runbook이다.

Draft 유지 문서는 현재 합성 Demo의 P0 폐루프를 차단하지 않는다. 실제 데이터·API·GPU 운영 성과를 확대 주장하는 근거로 사용하지 않는다.

## 5. 발표 전 운영 체크

- 발표 PC에서 `pnpm run build`와 `pnpm run test:e2e:clean-start`를 마지막으로 한 번 실행한다.
- 가능하면 `pnpm run verify:final`로 빌드·E2E·clean-start·핵심 평가·국내트랙 감사를 한 번에 재검증한다.
- 1280×720, 브라우저 확대 100%, 알림과 자동 업데이트를 끈다.
- `Demo 초기화` 후 새 decision ID와 `Demo fixture · Weather Fallback`을 확인한다.
- 원 기사와 수신 기사 역할 전환 후 각각 `안전지원` 탭에서 동의를 기록한다.
- 관리자 승인 후 계획·안내 갱신 완료와 Audit Timeline을 확인한다.
- 네트워크 장애 시 Live 복구를 시도하며 시간을 쓰지 않고 표시된 Fallback으로 계속 진행한다.
- 발표자는 `사고확률`, `실제 사고감소`, `학습된 기사 개인 모델`, `실시간 관제 완료`라고 표현하지 않는다.

## 6. 외부 준비사항

- 발표자와 보조자의 클릭·복구 역할 확정
- 실제 발표 PC의 전원·브라우저·해상도·네트워크 확인
- 제출 파일과 GitHub 커밋 SHA 기록
- `pnpm run eval:domestic-track:audit` 통과와 활용명세·제출 제외 항목 확인
- `artifacts/evals/final-readiness-latest.json`의 `PASSED`와 사람 확인 항목 기록
- `pnpm run package:submission`으로 allowlist ZIP과 SHA-256 manifest 생성
- 공개 URL에서도 `Demo fixture`, `Fallback map`과 비운영 한계 표시 확인
- A.X API 키가 발급되면 기존 12과업 계약만 별도 실행하고 데모 폐루프에는 의존시키지 않기
- 사용자 평가를 수행할 경우 실제 기사 데이터 없이 참여·녹화 동의를 분리하기

## 7. 수용기준

- P0 차단 실패가 0건이다.
- Vitest, Playwright, build와 clean start가 모두 통과한다.
- 시간·동의·버전 충돌 30개와 Risk Transfer Guard 23개가 모두 통과한다.
- Demo·Fallback·Simulation 출처가 화면과 산출물에 보인다.
- 본선 데모의 모든 역할이 같은 decision ID와 결정 근거를 사용한다.
- 실행하지 않은 실제 운영·사용자 검증과 남은 Draft 문서를 숨기지 않는다.

## 8. 비목표

- 실제 현장 배포 승인
- 실제 사고율 감소 주장
- 실제 기사·고객 개인정보 처리
- 실제 인증·위치·푸시·서버 동기화
- 실제 지도·TMS·고객 메시지 발송
- 국내 AI 모델의 범용 우열 판단

## 9. 미결사항

- 실제 발표 PC에서의 최종 당일 점검 시각과 담당자
- 제출 영상 또는 현장 발표에서 사용할 정확한 3분 대사 속도
- A.X API 계정의 활성 모델·quota·입력 보존 정책
- 실제 운영 파일럿을 위한 데이터 계약·권한·보존·법률·노무 검토
- 사용자 평가 모집과 역할별 이해도 결과
