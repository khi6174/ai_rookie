# 기사 경로·제품 경계 이해도 평가

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-23
- 현재 평가 ID: `rider-route-product-boundary-round2-001`
- 데이터 상태: `Demo fixture`

## 1. 목적

아틀란 트럭의 현장형 지도·배송 진행 패턴과 KBS 모빌리티 AI의 예방적 안전 문제 프레이밍을 참고한 뒤에도 사용자가 SafeRoute를 실제 내비게이션·오더 배차·사고감지 제품으로 오인하지 않는지 검증한다. 평가는 기사 운행 화면에서 현재 경로와 지원 시점을 찾는 능력, 사람의 동의·승인 규칙과 Demo/Live 경계 이해를 함께 확인한다.

## 2. 고정 자극

- 화면: `artifacts/evals/screenshots/rider-source-route-round2-390x844.png`
- manifest: `artifacts/evals/rider-reference-round2-stimulus-manifest.json`
- 생성 명령: `pnpm run eval:rider-reference:stimulus`
- 화면 상태: 원 기사, 적용 전, 390×844, `Fallback map`, 결정론적 합성 경로
- 포함하지 않음: 실제 GPS, 턴바이턴, 교통, 오더 배차, 센서, 사고감지, 개인정보

manifest는 PNG의 크기와 SHA-256을 기록하며 자극 파일이 바뀌면 새 평가 버전을 만든다. 과거 응답의 manifest를 덮어쓰지 않는다.

## 3. 참여자와 개인정보

- 독립 검토자 최소 5명
- `reviewer-01`부터 시작하는 익명 ID만 사용
- 실명, 연락처, 소속, 실제 기사·위치 정보는 수집하지 않음
- 응답 시작 전 익명 결과 보존 동의를 별도로 확인
- 선택 의견은 500자 이하이며 이메일·휴대전화 번호를 스키마에서 거부
- 이전 참여자의 답변과 정답은 다음 참여자에게 표시하지 않음

## 4. 평가 질문과 정답 계약

| 질문 | 기대 답 | 오인으로 기록할 답 |
|---|---|---|
| 현재 운행 구간 | 14번째 배송지 구간 | 다른 구간·알 수 없음 |
| 다음 안전 거점 | 10분 휴식 지점 | 다음 배송지만 표시·알 수 없음 |
| 지원 확인 기준 | 17번째 배송지 전 | 이후·알 수 없음 |
| SafeRoute 역할 | 미래 위험과 지원계획을 합의하는 안전운영 의사결정 | 실시간 길안내·오더 배차, 사고감지·자동구조 |
| 계획 적용 조건 | 필요한 기사 동의와 관리자 승인 후 | 자동 적용, 관리자 단독 적용 |
| 지도·위치 상태 | 합성 Demo 경로, 실제 GPS·턴바이턴 아님 | Live GPS·턴바이턴 |

## 5. 실행 절차

1. `pnpm run eval:rider-reference:stimulus`로 고정 자극 무결성을 확인한다.
2. `pnpm run review:rider-reference`를 실행하고 `http://127.0.0.1:4175/tools/rider-reference-review/`을 연다. `pnpm` 실행이 어렵다면 같은 정적 도구의 공개 경로 `https://saferoute-ai-demo.khiyw.chatgpt.site/tools/rider-reference-review/`를 사용한다.
3. 다섯 명이 차례로 동의하고 독립 응답한다.
4. 마지막 참여자 완료 후 `rider-reference-comprehension-round2-results.json`을 내려받는다.
5. 결과 파일을 `artifacts/evals/`에 복사하되 기존 결과를 덮어쓰지 않는다.
6. `pnpm run eval:rider-reference:comprehension -- <결과 파일>`로 기계 판정한다.

로컬·공개 도구 모두 응답을 서버로 전송하지 않고 같은 브라우저의 메모리에서만 다섯 응답을 모은 뒤 JSON으로 내려받는다. 검토자에게 같은 기기를 차례로 전달하며, 서로 다른 브라우저에서 만든 불완전 결과를 사람이 합치지 않는다.

## 6. 판정 기준

- 전체 6문항 정확도 80% 이상
- 6문항을 모두 맞힌 참여자 비율 70% 이상
- 제품 역할, 사람 승인 규칙, Demo/Live 경계의 중대 오인 참여자 0명
- 위 조건을 모두 통과한 경우에만 `READY_TO_PROMOTE`
- 하나라도 실패하면 `NEEDS_REVISION`

자동 E2E의 정답 입력은 도구와 스키마의 동작 증거일 뿐 사람 이해도 결과가 아니다. 실제 독립 응답 파일이 없으면 `READY_TO_PROMOTE`를 주장하지 않는다.

## 7. Round 1 실행 결과

2026-07-23 독립 검토자 5명이 Round 1 고정 화면에 응답했다. 원본은 `artifacts/evals/rider-reference-comprehension-results.json`, 자동 요약은 `artifacts/evals/rider-reference-comprehension-summary.json`에 보존한다.

| 항목 | 결과 |
|---|---:|
| 검토자 | 5명 |
| 문항 정답 | 25/30, 83.3% |
| 전 문항 정답 참여자 | 3/5, 60% |
| 중대 제품 경계 오인 참여자 | 2명 |
| 중앙 완료시간 | 121,791ms |
| 평균 확신 | 3.6/5 |
| 판정 | `NEEDS_REVISION` |

현재 구간·휴식·지원 시점은 5명 모두 이해했지만 두 참여자가 SafeRoute 역할과 기사·관리자 승인 규칙을 `UNKNOWN`으로 답했고, 그중 한 명은 Demo/Live 경계도 찾지 못했다. 전체 정확도 80%만 통과했으며 완전 정답률과 중대 오인 0명 Gate는 통과하지 못했다.

## 8. Round 2 재설계와 실행 상태

- 상태: 화면·manifest·평가 도구 준비 완료, 독립 5인 응답 대기
- 자극 SHA-256: `728a5fb73f2cba66ca68a051cc52cc98d9bf3db38cc309b5f717bf180601635d`
- 예정 결과: `artifacts/evals/rider-reference-comprehension-round2-results.json`
- 예정 요약: `artifacts/evals/rider-reference-comprehension-round2-summary.json`

Safety 계산과 답의 정답표는 바꾸지 않았다. 첫 화면에 `합성 Demo 경로 · GPS 길안내 아님`을 명시하고, 기존 설명을 `미래 안전한계 예측·지원계획 합의. 기사 동의 → 관리자 승인 후에만 적용`으로 단순화했다. 별도 카드로 화면 높이를 늘리지 않아 390×844·360×800의 핵심 행동과 44px 터치 Gate를 유지한다.

## 9. 수용기준

- 고정 화면과 manifest SHA-256이 일치한다.
- 다섯 명 미만, 중복 익명 ID와 직접 연락처가 거부된다.
- 동의 전에는 검토를 시작할 수 없다.
- 각 참여자의 이전 답변과 정답이 노출되지 않는다.
- 결과 JSON이 strict schema를 통과한다.
- 실제 응답 전에는 이해도 개선 성과로 보고하지 않는다.

## 10. 비목표와 미결사항

### 비목표

- 아틀란 트럭 또는 KBS 제품의 사용성 평가
- 실제 운전 중 조작 평가
- 현장 안전성, 사고감소, GPS·센서 정확도 검증
- 기사 모집·보상·외부 설문 서비스 연동

### 미결사항

- Round 2 독립 검토자 5명의 일정과 진행자
- 본선 제출물에 익명 결과 원본을 포함할지 요약만 포함할지
