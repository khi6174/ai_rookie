# SafeRoute AI 국내 AI 트랙 활용명세·준수 경계

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-08-06
- 기준: 대회 운영 가이드 5·7·8쪽, 국내 AI 기업별 활용 가이드, `docs/privacy-and-ai-policy.md`, ADR-021

## 1. 결정사항

SafeRoute AI의 제품 실행, 생성형 AI 평가와 제출 성과로 인정하는 모델은 국내 AI 공급자에 한정한다. 비국내 생성형 AI 모델·API는 제품 실행, 학습, 평가에 사용하지 않는다. 개발 보조 도구, 격리된 디자인 참고물과 모델 배포 저장소는 제품 런타임 AI와 분리해 공개하며 국내 AI 활용 성과로 계산하지 않는다.

이 문서는 대회 운영사무국을 대신해 자격을 법적으로 확정하지 않는다. 제공된 운영 가이드에서 확인되는 국내 AI 모델·API 활용, 활용 확약서와 활용명세 요구에 맞춰 저장소의 실제 경계를 증명한다.

## 2. 국내 AI 사용 명세

| 기업·모델 | SafeRoute 역할 | 실제 상태 | 안전 경계 | 핵심 증거 |
|---|---|---|---|---|
| Upstage `solar-pro3` | 문서 왕복 기반과 검증된 JSON·인용 역할별 설명 | 설명 Live 12과업 중 11건 통과·1건 안전 Fallback, 합성 문서 Mock 계약 60/60 | 수치·추천·실행 가능성 변경 금지, Mock을 Parse·Extract Live로 주장 금지 | `artifacts/evals/upstage-document-roundtrip-mock-latest.json` |
| SKT `A.X-K1` | K-EXAONE과 같은 12과업 API 계약 | 공식 exact 계약으로 Live 12/12·Fallback 0건·unsafe 표시 0건; 이전 401 run은 복구 전 실패 증거로 보존 | 설명 Gate 뒤에서만 사용, P0·Safety 판정 비의존 | `artifacts/evals/domestic-ai-api-runs/2026-07-23T11-08-49-486Z-live-ax/` |
| SKT `skt/A.X-4.0-Light` | A100 고정 revision 기준선과 설명 LoRA 후보 | v1 validation·terminal frozen 각각 200/200, 동일 제품 과업 Local 7/12; v2 신규 600-parent 계약 준비 완료·A100 미실행 | 안전 수치·추천 정답 생성 금지, v1 frozen·제품검토 재사용 금지, v2 새 validation·terminal frozen·제품검토 전 비활성 | `artifacts/evals/ax-cascade-lora-evidence-latest.json`, `artifacts/evals/synthetic-cascade-training-dataset-v2-latest.json`, ADR-133~138 |
| LG `LGAI-EXAONE/K-EXAONE-236B-A23B` | 공통 12과업과 반례 후보 평가 | Live 12/12 통과 | 같은 strict 스키마·숫자·인용 Gate | `artifacts/evals/domestic-ai-api-runs/2026-07-17T11-37-10-732Z-live-exaone/` |
| NC VARCO | 후속 3D·이미지·음성·번역 에셋 후보 | P0 미연동 | 텍스트 LLM으로 추정하지 않음 | ADR-021과 `docs/synthetic-data-plan.md` |

ADR-132의 제품 설명 경로는 자격을 갖춘 `AX_LOCAL`을 1차로 두고, 객관적 계약 실패나 capability 부족일 때만 A.X-K1·K-EXAONE·Solar 중 허용 공급자로 승격하는 국내 AI Cascade다. 기존 A.X-4.0-Light 기준선은 학습되지 않은 `PARTIAL_RESEARCH_BASELINE`이다. 새 LoRA 후보는 validation과 terminal frozen을 통과했지만 독립 Cascade 비교와 사람 검토 전에는 로컬 제품 계층으로 활성화하지 않는다. Hosted API 출력은 각 공급자의 학습·증류 조건을 확인하기 전에는 로컬 학습 라벨로 재사용하지 않는다.

독립 비교는 frozen을 재실행하거나 Hosted 출력을 학습 라벨로 사용하지 않는다. 기존 A.X-K1 Live 12과업과 동일한 합성 입력 bundle에서 LoRA 로컬 결과만 새로 측정하고, 두 증거의 task ID·계약·hash를 대조한다. 비교 결과와 관계없이 사람 검토와 별도 모델 경계 승인 전에는 공개 제품의 `AX_LOCAL`을 활성화하지 않는다.

동일 12과업 결과는 Local 7/12, Hosted 12/12, 기록 기반 순차 Cascade 12/12·Hosted 승격 5건이다. 안전한 승격 계약은 통과했지만 Local Gate와 지연 기준은 통과하지 못했으므로 현재 권고는 제품 활성화 보류다. 이 결과는 `artifacts/evals/ax-cascade-product-review-latest.json`에 원문 출력 없이 보존한다.

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
- Cascade의 모든 시도는 공급자·모델·계층·검증 결과·실패 코드로 추적되고, 숫자·추천·실행 상태는 어떤 모델도 변경하지 않는다.
- `OpenAI-compatible`을 OpenAI 모델 사용으로 오해하지 않도록 설명한다.
- 격리형 디자인 참고물과 제품 런타임을 제출 범위에서 분리한다.
- 실제 실행하지 않은 VARCO를 사용 성과로 주장하지 않고, A.X K1은 [공식 가이드](https://portal.adot.ai/docs/ax-k1-api-guide)의 고정 12과업 Live 결과 범위만 주장한다.

## 8. 비목표

- 국내 AI 모델의 범용 우열 판단
- 운영사무국을 대신한 참가자격 법률 판정
- 개발 보조 도구를 제품 런타임 AI로 재분류
- P0와 무관한 에셋 API 추가

## 9. 미결사항

- A.X 가이드의 RPS 3 표기와 제약사항 표의 "팀 합산 6 요청" 설명 불일치 확인
- A.X 계정별 실제 쿼터·입력 보존 정책과 반복 실행 분산 확인
- 운영사무국이 개발 보조 AI 공개를 별도 양식으로 요구하는지 확인
