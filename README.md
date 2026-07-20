# SafeRoute AI

SafeRoute AI는 배송계획 변경 전에 모든 영향 기사의 미래 안전 가능영역을 검증하고, 같은 결정 근거와 기사 동의·관리자 승인 아래 계획을 갱신하는 라스트마일 안전운영 코파일럿입니다.

계약, 결정론적 Safety Budget, 다섯 단일 개입, 허용 묶음 6종, 결정 상태기계·원자적 Demo 적용과 동일 decision ID의 관리자·기사 Demo UI 기반을 완료했습니다. 지정 네 해상도·키보드 폐루프·새 결정 ID reset Playwright E2E, Upstage strict 계약·Mock·Fallback·Live smoke와 A100의 A.X 고정 revision 기준선까지 검증했습니다. 대회 제공 활용 가이드에 맞춘 A.X·K-EXAONE 공통 텍스트 API 계약과 Mock 평가를 구현했고, K-EXAONE Live 12과업도 12/12 통과했습니다. 30개 frozen 합성 변형의 동일 후보 집합에서 Fastest-only·Balanced-only·SafeRoute를 90회 비교했고, 하드 제약 위반은 각각 17·11·0건이었다. Risk Transfer Guard는 숫자·breach 직접 경계 20건과 4·8·12건 전체 계획 3건을 모두 통과했다. 시간·동의·버전 충돌은 실제 상태기계 command를 실행하는 30개 경계에서 30/30을 통과했고, 전체 Vitest는 207/207이다. 기상청 API허브 4.1·4.2와 보완 1.3·4.3의 비식별 Live 표본을 통과했고, 4.3 `TMP·REH·WSD`에서 공식 계절별 체감온도도 결정론적으로 산출했습니다. 현재 시간당 적설과 미래 시정이 남아 Live 날씨는 Safety 입력으로 승격하지 않고, 부분 Live와 Demo를 섞지 않는 명시적 `Weather Fallback`에서 Demo 타임라인 전체만 계산에 사용합니다. 본선 P0 데모는 기능 동결 상태이며 남은 작업은 발표 PC·역할·제출물의 운영 점검과, A.X API 키 발급 시 기존 12과업 계약의 선택적 비교입니다. VARCO는 후속 에셋 생성 API로 분리해 P0에 필요한 사용처가 승인될 때만 연동합니다.

- TypeScript·Zod 데이터 계약
- 우천·폭염·야간 대표 fixture 3개
- 출처·Demo 상태와 개인정보 경계
- Safety Budget·Risk Transfer Guard 입력·출력 불변조건
- `dse-v1.0.0` Safety Budget·Time-to-Breach 엔진
- 세 대표 시나리오 정확값·경계·단조성 회귀 테스트
- 결정론적 다섯 단일 개입과 허용 묶음 6종의 순차 전체 계획 재계산
- 수신 기사 Budget 45·감소 15점 Risk Transfer Guard
- 시나리오 A 8건 허용·12건 차단·안전 후보 순위
- 배송순서 변경·안전경로·Safe Delay Demo 계약과 하드 제약
- 두 기사 동의·관리자 승인·재검증·원자 적용·고객안내 감사 상태기계
- 관리자 Control Tower와 원 기사·수신 기사 역할 전환형 폐루프 Demo UI
- 동의 전 승인 잠금, 수정·거절·보류, 승인 후 경로·순서·ETA 동시 갱신
- 1440×900·1280×720 관리자, 390×844·360×800 기사 화면 수동 브라우저 QA
- 합성 안전문서 Parse·Extract fixture와 숫자·인용·역할 검증 Upstage Mock/Fallback
- 공식 HTTPS endpoint 허용목록과 비밀키 분리를 적용한 서버 전용 Upstage Live 어댑터
- `solar-pro3` Live 12과업 첫 시도 11건 통과·1건 안전 Fallback
- K-EXAONE Live 12과업 12/12·Fallback 0건·unsafe 표시 0건
- A100-SXM4 80GB 익명화 사전점검과 실행 전 제한사항 기록
- A.X 4.0 Light 고정 revision 12과업 12/12·생성 강건성 28/30·안전 Fallback·독립 결과 검증
- 기상청 API허브 4.1 초단기실황·4.2 초단기예보 official endpoint, `authKey`, 스키마·최신성·6시간 범위·실패 계약과 Mock provenance 검증, Safety 입력 자동 승격 차단
- 기상청 API허브 Live 실황 1건·예보 6시점 검증, RN1 정확값·구간값 분리와 응답 SHA-256 보존
- KMA 4.1·4.2 초기 적합성 Gate: 강수 6시점 준비 완료, 보완 API 적용 전 3필드 차단 증거 보존
- 기상청 1.3 현재 체감온도·시정과 4.3 향후 120분 적설 Live 보완 검증, 3시간 적설 무단 환산·현재값 미래복제 차단
- 4.3 `TMP·REH·WSD`와 기상청 공식 계절별 식으로 미래 체감온도 3시점 결정론적 산출
- KMA 부분 Live를 감사 증거로만 보존하고 Demo 타임라인 전체를 선택하는 `Weather Fallback`, 필드 혼합 0건
- Playwright 관리자–두 기사 폐루프·새 ID reset·키보드·지도 drag/keyboard pan·4개 해상도·스크린샷 16/16과 서버 clean start 3회 통과
- 관리자·기사 PWA의 선택적 Kakao Maps 2D 베이스 레이어와 결정론적 합성 경로·마커, SDK 실패·오프라인 시 schematic map·구조화 목록 자동 Fallback
- 30개 frozen 변형·3전략 90회 비교: Fastest 17건·Balanced 11건 하드 제약 위반, SafeRoute 0건
- Risk Transfer Guard 직접 경계 20/20·전체 계획 3/3 통과
- 시간·동의·버전 충돌 결정 경계 30/30 통과
- Vitest 22개 파일·207/207 통과

## 실행

```bash
pnpm install
pnpm test
pnpm run test:e2e
pnpm run test:e2e:clean-start
# 외부 API 호출 없이 최종 빌드·E2E·평가·국내트랙 게이트를 한 번에 검증
pnpm run verify:final
# clean commit에서 국내트랙 제출용 allowlist ZIP과 SHA-256 manifest 생성
pnpm run package:submission
pnpm run typecheck
pnpm run build
pnpm dev
# 단위 테스트를 재실행하고 핵심 평가 최신본·SHA-256 불변 run을 생성
pnpm run eval:core-artifacts
pnpm run eval:upstage:smoke:mock
pnpm run eval:upstage:smoke
pnpm run eval:domestic-track:audit
pnpm run eval:domestic-ai:smoke:mock
pnpm run eval:domestic-ai:check
# readiness 통과 후 명시적으로 Live 12과업 실행
pnpm run eval:domestic-ai:smoke
pnpm run eval:kma-weather:mock
# API 호출 없이 기상청 서버 변수 구성만 확인
pnpm run eval:kma-weather:check
# readiness 통과 후에만 4.1·4.2 단일 Live smoke 실행
pnpm run eval:kma-weather:live
pnpm run eval:kma-weather:coverage
# 승인된 1.3·4.3 보완 API를 각 1회 호출하고 부분 적합성 Gate 생성
pnpm run eval:kma-weather:supplement:live
# 부분 Live 미승격과 Demo-only Safety 입력 감사 산출물 생성
pnpm run eval:kma-weather:runtime
```

관리자와 기사 compact 실제 베이스맵은 로컬 `.env.local`에 `VITE_KAKAO_MAP_JAVASCRIPT_KEY`를 설정하고 Kakao Developers 앱에 실행 도메인을 등록했을 때만 활성화된다. 키가 없거나 `VITE_KAKAO_MAP_ENABLED=false`이면 외부 네트워크 없이 동일한 합성 데이터의 schematic map을 사용한다. 기사 compact map은 오프라인에서도 자동으로 Fallback한다. 지도에 표시하는 기사·경로는 모두 Demo fixture이며 실제 위치가 아니다.

`eval:core-artifacts`는 외부 API를 호출하지 않는다. Vitest를 새로 실행하고 대표 fixture·개입·Risk Transfer Guard를 현재 코드로 재계산한 뒤, 기존 국내 AI·Upstage 요약과 Playwright 접근성 결과를 묶어 `artifacts/evals/` 최신본과 SHA-256 불변 run을 생성한다. `eval:domestic-track:audit`도 외부 API를 호출하지 않고 추적된 런타임·평가 파일, 허용 host, 모델 식별자, 의존성, 비밀정보 경계를 검사해 국내 AI 트랙 활용 증거를 만든다. `OPENAI_CHAT_COMPLETIONS`는 요청 형식 이름일 뿐 OpenAI 모델·서비스 사용을 뜻하지 않는다. Upstage Live는 opt-in smoke 명령에서만 활성화한다. `eval:upstage:smoke:mock`은 자격증명 없이 12개 합성 과업 기준선을 생성하고, `eval:upstage:smoke`는 [.env.example](./.env.example)을 복사한 로컬 `.env.local`의 서버 변수로 실행한다. 현재 Live 첫 시도 검증 통과는 11/12이며 나머지 1건은 안전한 Fallback으로 전환됐다. 국내 AI 공통 명령은 대회 가이드에서 텍스트 API 계약이 확인된 A.X K1과 K-EXAONE만 대상으로 한다. `eval:domestic-ai:check`는 API 호출 없이 secret과 exact endpoint 계약을 점검하고, Live 명령은 readiness 이후에만 명시적으로 실행한다. K-EXAONE은 60초 timeout에서 12/12를 통과했고 평균 22,124ms·P95 35,805ms·총 39,539 tokens를 기록했다. 기상청은 API허브 4.1·4.2 Mock 계약과 무호출 readiness를 먼저 검증하며, Live 명령은 승인된 로컬 `authKey`가 준비된 뒤에만 실황·예보를 각 1회 호출한다. 1.3·4.3 보완 명령도 같은 서버 전용 키를 재사용하고 exact endpoint만 호출하므로 새 키나 새 환경변수는 필요 없다. `eval:kma-weather:runtime`은 외부 API를 호출하지 않고 승인된 Live 증거의 미완전 범위와 Demo-only Safety 입력 경계를 재검증한다. `VITE_` 접두사를 사용하지 않으며 키를 저장소나 채팅에 넣지 않는다. A100의 A.X 고정 revision은 정확 복사 12/12와 최종 생성 강건성 28/30을 독립 검증했고 나머지 2건은 안전한 Fallback으로 전환됐다. 로컬 모델 benchmark도 접속정보·비밀번호를 저장하지 않고 고정 revision과 비식별 결과만 보존한다.

`eval:core-artifacts`의 현재 bundle에는 시간 8개·동의/권한 12개·계획/모델 버전 10개의 결정 폐루프 경계 30개, 국내트랙 자동 감사와 해당 SHA-256 요약도 포함된다.

`verify:final`은 외부 API를 호출하지 않고 빌드, Playwright 16개, clean-start 3회, 핵심 평가, 국내트랙 감사를 순서대로 다시 실행한다. 성공 결과는 `artifacts/evals/final-readiness-latest.json`과 timestamp 불변 run에 저장하며 실제 발표 PC 점검·제출 업로드 같은 사람의 확인 항목은 별도로 남긴다.

`package:submission`은 추적된 working tree가 clean이고 최종 readiness·국내트랙 감사 결과가 모두 `PASSED`일 때만 실행된다. 승인된 소스·문서·최신 증거·스크린샷과 같은 commit의 정적 빌드를 allowlist로 압축하고, 격리형 디자인 프로토타입·로컬 비밀정보·중복 run은 제외한다.

## 핵심 문서

- `AGENTS.md`: 프로젝트 가드레일
- `docs/product-spec.md`: 궁극적 목표와 제품 수용기준
- `docs/decisions.md`: 지속 결정 기록
- `docs/architecture.md`: 모듈과 데이터 흐름
- `docs/data-contracts.md`: 데이터 계약 명세
- `docs/data-sources.md`: 실제 수집 전 데이터 출처·이용조건 승인 등록부
- `docs/evals.md`: 평가·심사 증거 계획
- `docs/demo-script.md`: 3분 폐루프 시연
- `docs/midpoint-review.md`: 본선 MVP와 본선 이후 궁극적 목표 중간점검
- `docs/final-readiness.md`: 본선 최종준비 증거·동결 범위·발표 전 체크
- `docs/gpu-benchmark-runbook.md`: A100 사전점검과 로컬 기준선 실행 경계

## 표현 경계

이 프로젝트의 결과는 사고확률이나 의료 진단이 아닙니다. 현재 fixtures와 결과는 합성·시뮬레이션이며 실제 운영 효과로 표현하지 않습니다.
