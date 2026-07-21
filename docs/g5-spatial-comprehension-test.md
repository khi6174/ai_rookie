# SafeRoute AI G5-B 공간 이해도 검토 절차

## 문서 상태

- 상태: Approved — G5-B 실행 절차
- 담당: 팀 안전빵
- 최종 갱신: 2026-07-21
- 상위 기준: `docs/g5-spatial-visualization-design.md` 7.2
- 현재 결과: Round 1 `DO_NOT_PROMOTE` — decision 화면 정보위계 재설계·재검토 필요

## 1. 목적

같은 합성 Demo decision을 표현한 2D와 선택형 2.5D를 독립 검토자가 각각 보고, 예상 초과·경사 구간·추천 조치·양측 기사 영향과 경로 우선순위를 정확히 이해하는지 확인한다. 이 검토는 화면 이해도 근거이며 실제 운행 성과나 사고감소 근거가 아니다.

## 2. 참여자와 개인정보

- SafeRoute 구현에 참여하지 않은 성인 3명 이상을 모집한다.
- 실명, 이메일, 전화번호, 소속, 실제 기사 정보는 수집하지 않는다.
- `reviewer-01` 같은 익명 ID만 사용한다.
- 실제 개인 데이터나 정밀 위치는 보여주지 않는다.
- 참여 전에 합성 Demo 화면이며 응답을 익명 평가 증거로 보존한다고 알리고 동의를 받는다.

## 3. 고정 자극과 순서

`artifacts/evals/g5-spatial-stimulus-manifest.json`에 해시가 고정된 두 화면만 사용한다.

- `reviewer-01`, `reviewer-03`: 2D → Demo 2.5D
- `reviewer-02`: Demo 2.5D → 2D
- 4명 이상이면 노출 순서 수가 가능한 한 같도록 번갈아 배정한다.

검토자에게 다음 화면을 보여주기 전 답을 확정하게 한다. 정답, 다른 사람의 답, 파일명에 담긴 모드 설명은 답변 전에 알려주지 않는다.

## 4. 화면별 질문

각 화면을 처음 보여준 순간부터 네 질문을 모두 답한 순간까지 밀리초 단위 시간을 잰다.

1. 예상 안전 임계치 초과는 몇 분 후, 몇 번째 배송지인가?
2. 경사 노출은 `현재–휴식`, `휴식–예상 초과`, `예상 초과 이후` 중 어디에 집중되는가?
3. 추천 조치의 휴식 시간과 이관 배송 건수는 얼마인가?
4. 원 기사와 수신 기사에게 생기는 변화, 그리고 휴식과 예상 초과 지점 중 어느 것이 경로에서 먼저인지 설명해 달라.

각 화면의 답 뒤 이해 확신을 1점(매우 낮음)부터 5점(매우 높음)으로 기록한다. 두 화면을 모두 본 뒤 어느 화면이 더 빨리 이해되었는지, 2.5D가 혼란을 더했는지, 이유를 500자 이내로 기록한다.

## 5. 구조화 기록값

진행자는 자유 답변을 다음 열거값으로 옮기되 의미가 불명확하면 반드시 `UNKNOWN`을 사용한다.

| 질문 | 기록값 |
|---|---|
| 경사 구간 | `CURRENT_TO_REST`, `REST_TO_BREACH`, `BREACH_AND_AFTER`, `UNKNOWN` |
| 원 기사 영향 | `WORKLOAD_REDUCED_AND_BUDGET_RECOVERS`, `WORKLOAD_INCREASES`, `NO_CHANGE`, `UNKNOWN` |
| 수신 기사 영향 | `TRANSFER_WITHIN_SAFETY_LIMIT`, `TRANSFER_EXCEEDS_SAFETY_LIMIT`, `NO_TRANSFER`, `UNKNOWN` |
| 경로 우선순위 | `REST_BEFORE_BREACH`, `BREACH_BEFORE_REST`, `UNKNOWN` |
| 더 명료한 화면 | `TWO_D`, `DEMO_TWO_POINT_FIVE_D`, `SAME` |

`artifacts/evals/g5-spatial-comprehension-input.template.json`을 복사해 3명 이상의 응답을 입력한다. 템플릿 자체는 결과가 아니며 사람 응답 없이 채우거나 통과 증거로 사용하지 않는다.

### 5.1 권장 로컬 평가 화면

수기 JSON 대신 저장소 루트의 PowerShell에서 다음 명령을 실행할 수 있다.

```powershell
pnpm run review:g5
```

브라우저에서 `http://127.0.0.1:4174/tools/g5-spatial-review/`을 연다. 한 기기에서 익명 검토자 3명이 차례로 동의하고 두 화면에 답하면 순서 균형·완료시간·JSON 구조가 자동 기록된다. 현재 도구는 Round 2 고정 화면을 사용하며 마지막의 `결과 JSON 다운로드`로 받은 파일을 `artifacts/evals/g5-spatial-comprehension-round2-results.json`에 복사한다. Round 1 원본은 `g5-spatial-comprehension-results.json`에서 변경하지 않는다.

이 로컬 도구는 응답을 서버나 외부 서비스로 보내지 않고 새로고침 전 브라우저 메모리에만 둔다. 앞 사람의 응답을 다음 사람에게 보여주지 않으며 정답도 표시하지 않는다.

## 6. 자동 판정

```powershell
pnpm run eval:g5:comprehension -- artifacts/evals/g5-spatial-comprehension-round2-results.json
```

- 입력 스키마, 익명 ID, 두 화면 완주와 순서 균형이 맞지 않으면 평가를 거부한다.
- 수치·추천·양측 영향·경로 우선순위 오답이 한 건이라도 있으면 `DO_NOT_PROMOTE`다. 2D의 경사 구간 미인지는 비교 관찰값으로 보존하되, 2.5D에서도 경사 구간을 맞히지 못하면 기본 승격 후보가 될 수 없다.
- 전 trial이 정확해도 2.5D가 더 빠르고 과반이 더 명료하다고 답하지 않으면 `KEEP_OPTIONAL`이다.
- 전 trial 정확, 혼란 0건, 2.5D 중앙 완료시간 단축, 과반 명료 응답을 모두 만족해야 `DEFAULT_PROMOTION_CANDIDATE`다.
- 후보 판정은 자동 기본 전환 승인이 아니다. 제품 기본값 변경은 별도 사용자 승인을 받는다.

## 7. 수용기준과 비목표

수용기준은 독립 검토자 3명 이상, 화면별 답 100% 보존, 개인정보 0건, 기계 검증 가능한 요약 생성이다. 사람 검토 전에는 G5-B 완료 또는 기본 승격을 주장하지 않는다.

비목표는 실제 기사 대표성 주장, 통계적 유의성 주장, 현장 주행 성능, 사고감소 효과, 실제 지도·고도 정확도와 2.5D 자동 기본 전환이다.

## 8. Round 1 실행 결과

2026-07-21 독립 검토자 3명이 고정 2D·Demo 2.5D 화면을 순서 균형에 따라 평가했다. 원본은 `artifacts/evals/g5-spatial-comprehension-results.json`, 자동 요약은 `artifacts/evals/g5-spatial-comprehension-summary.json`, 해시·수신 메타데이터는 `artifacts/evals/g5-spatial-comprehension-evidence.json`에 보존한다.

| 항목 | 결과 |
|---|---:|
| 검토자 | 3명 |
| 전체 trial | 6개 |
| 핵심 의미 전체 정답 | 2/6, 33.3% |
| 핵심 오해 trial | 4개 |
| 경사 구간 정답 | 2D 0/3, 2.5D 0/3 |
| 2.5D 혼란 증가 응답 | 2/3 |
| 2.5D 명료 선호(혼란 없음 조건) | 0/3 |
| 중앙 완료시간 | 2D 377,042ms, 2.5D 978,984ms |
| 판정 | `DO_NOT_PROMOTE` |

수치인 52분·17번째 배송지·10분 휴식·8건 이관은 읽을 수 있었지만, 경사 구간, 원·수신 기사 영향, 휴식과 예상 초과 지점의 순서가 화면만으로 전달되지 않았다. 정성 응답도 무엇을 보고 어떤 판단을 해야 하는지 불명확하고 오른쪽 텍스트에 의존해야 했다고 보고했다.

따라서 Demo 2.5D는 기본 기능으로 승격하지 않는다. 현재 기술 Gate 통과와 사람 이해도 실패를 구분하며, 다음 반복은 3D 표현을 늘리는 작업이 아니라 관리자 첫 결정면의 질문·조치·근거 순서를 단순화하는 정보위계 재설계부터 시작한다. 재설계 전 Round 1 결과를 삭제하거나 PASS로 덮어쓰지 않는다.

## 9. Round 2 재설계와 실행 상태

- 상태: 화면·평가 도구 준비 완료, 독립 검토 응답 대기
- 자극 manifest: `artifacts/evals/g5-spatial-round2-stimulus-manifest.json`
- 2D 화면: `artifacts/evals/screenshots/g5-round2-admin-decision-2d-1280x720.png`
- 보조 2.5D 화면: `artifacts/evals/screenshots/g5-round2-admin-decision-2-5d-1280x720.png`
- 예정 결과: `artifacts/evals/g5-spatial-comprehension-round2-results.json`
- 예정 요약: `artifacts/evals/g5-spatial-comprehension-round2-summary.json`

Round 2에서는 Safety 계산과 답의 정답표를 바꾸지 않고 다음 정보위계만 수정했다.

1. `지금 필요한 결정` 아래에 관리자가 답해야 할 조치를 질문형 한 문장으로 표시한다.
2. `현재 → 10분 휴식 → 휴식 뒤 경사 노출 → 17번째 배송지 전 지원` 순서를 연결된 진행선으로 표시한다.
3. 원 기사는 배송 17→9건·안전여유 29.9→47.2, 수신 기사는 배송 +8건·안전여유 52.5→45.0과 기준 45 통과를 나란히 표시한다.
4. 12건 이관 차단 이유를 짧게 제공하고 2.5D를 보조 근거로 낮춘다.

Round 2 결과가 없으므로 현재 공식 판정은 여전히 Round 1의 `DO_NOT_PROMOTE`다. 기술 회귀 통과만으로 사람 이해도 개선을 주장하지 않는다.

Round 2 요약이 strict validator를 통과해 보존되면 최종 readiness는 이를 우선 읽고 `g5HumanEvidenceRound=ROUND_2`로 기록한다. Round 1 원본과 실패 요약은 삭제하지 않으며, Round 2가 없거나 잘못된 경우에는 기존 판정을 조용히 덮어쓰지 않는다.
