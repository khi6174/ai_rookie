# SafeRoute AI 국내 AI 트랙 활용명세·준수 경계

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-21
- 기준: 대회 운영 가이드 5·7·8쪽, 국내 AI 기업별 활용 가이드, `docs/privacy-and-ai-policy.md`, ADR-021

## 1. 결정사항

SafeRoute AI의 제품 실행, 생성형 AI 평가와 제출 성과로 인정하는 모델은 국내 AI 공급자에 한정한다. 비국내 생성형 AI 모델·API는 제품 실행, 학습, 평가에 사용하지 않는다. 개발 보조 도구, 격리된 디자인 참고물과 모델 배포 저장소는 제품 런타임 AI와 분리해 공개하며 국내 AI 활용 성과로 계산하지 않는다.

이 문서는 대회 운영사무국을 대신해 자격을 법적으로 확정하지 않는다. 제공된 운영 가이드에서 확인되는 국내 AI 모델·API 활용, 활용 확약서와 활용명세 요구에 맞춰 저장소의 실제 경계를 증명한다.

## 2. 국내 AI 사용 명세

| 기업·모델 | SafeRoute 역할 | 실제 상태 | 안전 경계 | 핵심 증거 |
|---|---|---|---|---|
| Upstage `solar-pro3` | 검증된 JSON과 인용 기반 역할별 설명 | Live 12과업 중 11건 첫 시도 통과, 1건 안전 Fallback | 수치·추천·실행 가능성 변경 금지 | `artifacts/evals/upstage-smoke-latest.json` |
| SKT `A.X-K1` | K-EXAONE과 같은 12과업 API 계약 | AI One Portal v1.3 exact 계약·readiness 통과, 키 재발급·3분 후에도 Live 1과업은 401 안전 Fallback | 설명 Gate 뒤에서만 사용 | `artifacts/evals/domestic-ai-api-runs/2026-07-21T12-00-06-856Z-live-ax/` |
| SKT `skt/A.X-4.0-Light` | A100 고정 revision 오프라인 생성 기준선 | 12/12 배치 통과, 강건성 28/30·2건 안전 Fallback | 안전 수치·추천 정답 생성 금지 | `artifacts/evals/local-model-runs/` |
| LG `LGAI-EXAONE/K-EXAONE-236B-A23B` | 공통 12과업과 반례 후보 평가 | Live 12/12 통과 | 같은 strict 스키마·숫자·인용 Gate | `artifacts/evals/domestic-ai-api-smoke-latest.json` |
| NC VARCO | 후속 3D·이미지·음성·번역 에셋 후보 | P0 미연동 | 텍스트 LLM으로 추정하지 않음 | ADR-021과 `docs/synthetic-data-plan.md` |

기상청 API허브는 공개 날씨 입력이며 생성형 AI 공급자가 아니다. 불완전한 Live 필드는 Safety 계산에 섞지 않고 전체 Demo 타임라인으로 Fallback한다.

## 3. 통신 계약 설명

코드와 평가 산출물의 `OPENAI_CHAT_COMPLETIONS` 또는 `OpenAI-compatible` 표기는 `/v1/chat/completions` 형태의 요청·응답 통신 계약 이름이다. OpenAI 서비스, 모델, endpoint, SDK 또는 API 키 사용을 의미하지 않는다.

현재 허용된 생성형 AI host는 다음뿐이다.

- `api.upstage.ai`
- `awf-gw.adot.ai`
- `api.friendli.ai` — 대회 제공 LG 활용 가이드의 K-EXAONE serving endpoint

공공데이터 입력 host는 `apihub.kma.go.kr`이다. 지도 표시 host `dapi.kakao.com`은 합성 좌표를 렌더링하는 비생성형 지도 SDK이며 국내 AI 모델·학습·추론 성과로 계산하지 않는다. 모든 host는 코드 allowlist로 검사하고, 생성형 AI와 공공데이터의 서버 비밀정보는 서버 전용 환경변수 계약으로 검사한다. Kakao Maps JavaScript 플랫폼 키는 브라우저 배포 특성상 별도 `VITE_KAKAO_MAP_JAVASCRIPT_KEY`와 허용 도메인 제한을 사용한다.

`download.pytorch.org`는 A100 실행환경의 PyTorch 설치 저장소로만 허용하며 생성형 AI 모델·추론 endpoint와 별도로 분류한다.

## 4. 비국내 AI 관련 흔적의 분류

| 항목 | 분류 | 제품 런타임·평가 사용 | 제출 처리 |
|---|---|---:|---|
| `saferoute-screen-demo.khiyw.chatgpt.site` | 격리된 디자인 참고 프로토타입 | 없음 | 실제 SafeRoute 데모·성과에서 제외 |
| Codex 등 개발 보조 도구 | 개발 과정 보조 | 없음 | 제품 AI로 주장하지 않고 질문 시 투명하게 설명 |
| `huggingface_hub` | 국내 A.X 고정 revision 파일 배포 도구 | Hosted inference 없음 | SKT A.X 파일 전달 용도로만 명시 |

비국내 참고물이나 개발 보조 결과를 국내 AI 모델의 생성 성과로 표현하지 않는다. 최종 제출물에서는 실제 SafeRoute React 앱, 국내 AI 평가 증거와 결정론 엔진 결과만 제품 성과로 사용한다.

## 5. 자동 감사

다음 명령은 외부 API를 호출하지 않는다.

```bash
pnpm run eval:domestic-track:audit
```

검사 범위는 다음과 같다.

- 추적된 `.env` 비밀 파일 부재
- 런타임·평가 HTTPS host allowlist
- A.X·K-EXAONE 공급자 레지스트리
- Upstage 공식 endpoint
- 국내 모델 식별자 증거
- 비국내 생성형 AI SDK 부재
- 비국내 생성형 AI credential 이름 부재

결과는 `artifacts/evals/domestic-track-compliance-latest.json`에 저장하며 하나라도 실패하면 명령이 비정상 종료된다.

## 6. 국내 AI 트랙 제출 문구

> SafeRoute AI의 생성형 AI 런타임과 모델 평가는 Upstage Solar, LG K-EXAONE, SKT A.X 등 국내 AI만 사용합니다. 비국내 AI 모델·API는 제품 실행·학습·평가에 사용하지 않았으며, OpenAI-compatible 표기는 통신 프로토콜만 의미합니다. 안전 수치와 추천은 결정론적 SafeRoute 엔진이 계산하고 국내 AI는 검증된 설명과 합성 후보 평가만 담당합니다.

## 7. 수용기준

- 자동 감사의 모든 검사가 통과한다.
- 제품·평가 실행 경로에 비국내 생성형 AI endpoint·SDK·credential이 없다.
- 국내 AI별 역할·모델·상태·증거가 활용명세에서 추적된다.
- `OpenAI-compatible`을 OpenAI 모델 사용으로 오해하지 않도록 설명한다.
- 격리형 디자인 참고물과 제품 런타임을 제출 범위에서 분리한다.
- 실제 실행하지 않은 VARCO와 아직 인증되지 않은 A.X K1 API 출력을 사용 성과로 주장하지 않는다.

## 8. 비목표

- 국내 AI 모델의 범용 우열 판단
- 운영사무국을 대신한 참가자격 법률 판정
- 개발 보조 도구를 제품 런타임 AI로 재분류
- P0와 무관한 에셋 API 추가

## 9. 미결사항

- A.X 운영팀의 gateway 팀 권한·키 동기화 확인과 401 해소 후 Live 12과업 실행
- A.X 가이드의 RPS 3 표기와 제약사항 표의 "팀 합산 6 요청" 설명 불일치 확인
- 운영사무국이 개발 보조 AI 공개를 별도 양식으로 요구하는지 확인
