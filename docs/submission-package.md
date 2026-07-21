# SafeRoute AI 국내 AI 트랙 제출 패키지 운영

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-21
- 기준: `docs/final-readiness.md`, `docs/domestic-ai-track-compliance.md`

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
- 최신 핵심·최종 불변 run이 Git에 추적되어 있다.

명령은 현재 commit에서 프로덕션 빌드를 다시 만들고 다음 파일을 생성한다.

- `artifacts/submission/saferoute-ai-domestic-track-<short-sha>.zip`
- `artifacts/submission/submission-package-latest.json`

압축 내부에는 `SUBMISSION_README.md`, `submission-manifest.json`과 각 파일의 SHA-256이 포함된다.

## 3. 포함 범위

- React·TypeScript 소스와 결정론 도메인 엔진
- 테스트·E2E·평가·검증 스크립트
- `.env.example`과 재현 가능한 패키지 lock
- Approved 핵심 문서 17개
- 최신 평가 요약, 기사 제품 경계 고정 자극 manifest와 체크인된 스크린샷
- 최신 core evidence run과 final readiness run
- 같은 commit에서 생성한 `demo-dist/`

기사 경로·제품 경계 평가는 `rider-reference-stimulus-manifest.json`과 평가 계약을 항상 포함한다. 실제 독립 검토가 완료된 경우에만 익명 집계 `rider-reference-comprehension-summary.json`을 추가하며, 원응답이나 연락처는 제출 패키지에 넣지 않는다. 요약이 없으면 사람 평가를 `NOT_RUN`으로 명시하고 자동 Gate 통과로 대체하지 않는다.

G5-B 공간 이해도는 Round 1 실패 원본·요약을 보존하고, 독립 Round 2가 완료되면 `g5-spatial-comprehension-round2-results.json`과 strict 집계 summary를 함께 포함한다. 최종 readiness는 유효한 Round 2를 우선하되 어느 round를 사용했는지 명시한다.

## 4. 명시적 제외

- 별도 전략 디자인 PDF
- `artifacts/saferoute-web-demo/`와 관련 압축파일
- `.env.local`, API 키, 인증정보
- `node_modules/`, Playwright report, test-results
- 이전 중복 core·API·날씨 실행 전체

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
