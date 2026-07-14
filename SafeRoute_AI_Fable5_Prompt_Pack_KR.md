# SafeRoute AI - Claude Fable 5 개발 프롬프트 팩

작성일: 2026-07-11  
목적: SafeRoute AI 본선 MVP를 5주 안에 구현하고, 설계·코드·테스트·시연 자료를 일관되게 유지하기 위한 복사형 프롬프트 모음

---

## 0. 가장 먼저 만들 파일

리포지토리 루트에 아래 파일을 만들고 모든 세션에서 먼저 읽게 한다.

```text
/CLAUDE.md
/docs/product-spec.md
/docs/decisions.md
/docs/data-contracts.md
/docs/design-system.md
/docs/evals.md
/docs/demo-script.md
/docs/lessons/
```

`CLAUDE.md`에는 다음의 **마스터 지침**을 넣는다.

```md
# SafeRoute AI - Project Instructions

## Mission
Build a last-mile safety operations copilot that predicts when and where a courier's dynamic safety capacity will be exceeded, explains the contributing factors, compares feasible interventions, and updates the delivery plan only after transparent human approval.

## Product boundary
- This is not an accident-probability oracle.
- This is not a worker ranking, punishment, or productivity surveillance system.
- Do not display raw biometric data to managers.
- Never optimize ETA or cost outside the safety-feasible region.
- Do not move risk from one courier to another. Every workload transfer must pass the recipient courier's post-transfer Safety Budget constraint.
- The rider and administrator must receive the same decision basis. The rider can decline or request a modification without a punitive UI.

## AI boundary
- Deterministic code owns risk scores, Safety Budget, route risk, time-to-breach, and intervention effects.
- Upstage Solar Pro 3 may explain supplied JSON, generate role-specific messages, and cite parsed safety documents. It must not invent or change scores.
- Upstage Document Parse converts safety manuals and sample reports into LLM-readable text.
- Upstage Information Extract converts selected fields into validated JSON.
- If live APIs fail, use an explicitly labeled demo fixture. Never present mock data as live.

## Engineering rules
- Stack: React + TypeScript + Vite + Tailwind CSS, Vercel Functions, Zod, Vitest, Playwright.
- Prefer the simplest implementation that satisfies the acceptance criteria.
- Do not refactor unrelated code or add speculative abstractions.
- Validate at system boundaries: user input, external APIs, imported documents.
- Use discriminated unions for live/mock/error/loading states.
- All core calculations must have unit tests and deterministic fixtures.
- Accessibility: keyboard support, visible focus, non-color-only status, 44px mobile touch targets, reduced-motion support.

## Source-of-truth artifacts
Read these before changing behavior:
- docs/product-spec.md
- docs/decisions.md
- docs/data-contracts.md
- docs/design-system.md
- docs/evals.md
- docs/demo-script.md

After a meaningful decision, append a concise record to docs/decisions.md with date, decision, reason, alternatives rejected, and affected files. Store one reusable lesson per file under docs/lessons/.

## Verification
Before claiming completion, point to concrete evidence from this session: test output, build output, screenshots, or file diffs. State failures and skipped checks plainly. Do not reproduce private chain-of-thought; provide decisions, assumptions, evidence, and remaining risks.
```

권장 실행 설정: 일반 구현은 `high`, 아키텍처 변경·복합 버그·최종 검증은 `xhigh`.

---

## 1. 리포지토리 감사와 실행계획

```text
You are the lead engineer for SafeRoute AI. Inspect the entire repository before editing.

Context:
- The contest deadline is 2026-08-14.
- The team has two people.
- The prize-winning demo must show one closed loop: future threshold breach -> cause explanation -> intervention comparison -> rider consent/admin approval -> route and schedule update -> customer notice -> before/after metrics.
- Read CLAUDE.md and every file under docs/ first.

Deliverables:
1. A factual repo audit: current architecture, working features, broken or fake paths, test coverage, and demo risks.
2. A gap matrix against the required hero loop.
3. A five-week implementation plan with dependencies and owner A/owner B split.
4. A prioritized issue list labeled P0/P1/P2.
5. Update docs/decisions.md only for decisions supported by the audit.

Rules:
- Do not modify code in this turn.
- Verify every claim by opening the relevant file or running a command.
- Recommend one plan, not an exhaustive list.
- Stop after the audit and plan.
```

---

## 2. 제품 명세와 수용기준 고정

```text
Create or revise docs/product-spec.md for SafeRoute AI.

The spec must define:
- Primary users: hub administrator, courier, customer-notification recipient.
- Three demo scenarios: rainy hilly villas after 9.4 hours; heatwave plus heavy stair deliveries; novice courier in an unfamiliar area at night.
- The exact state transition for the hero loop.
- Dynamic Safety Envelope, Safety Budget, time-to-breach, confidence, missing-data state, and risk band definitions.
- Five intervention types: rest, transfer stops, reorder, safer route, safe delay.
- Risk Transfer Guard and rider consent/appeal rules.
- What Upstage products do and do not do.
- Functional and non-functional acceptance criteria.
- Explicit non-goals for the 2026-08-14 MVP.

Do not invent scientific accuracy. When labels are unavailable, call the output an operational risk index, not accident probability. End with a traceability table mapping each requirement to a planned UI, API, test, and demo moment.
```

---

## 3. 데이터 계약과 시뮬레이션 시나리오

```text
Implement the SafeRoute AI domain data contracts first.

Required TypeScript/Zod schemas:
- CourierState
- WorkloadState
- WeatherState
- AreaRiskProfile
- RouteSegment
- DeliveryStop
- SafetyBudgetSnapshot
- RiskContribution
- InterventionCandidate
- InterventionEvaluation
- DecisionRecord
- NearMissReport
- CustomerNotice

Create deterministic fixtures for the three demo scenarios. Every fixture must include provenance metadata: mock, public-data-derived, or user-entered.

Acceptance criteria:
- `npm test` validates all schemas.
- Invalid negative workload, impossible timestamps, and transfers that exceed the recipient's capacity are rejected.
- Live/mock/error/loading are explicit discriminated unions.
- No personally identifying real courier data is included.
- Update docs/data-contracts.md with examples and field rationale.

Do not implement UI yet.
```

---

## 4. Safety Budget 및 Time-to-Breach 엔진

```text
Implement a transparent, deterministic Safety Budget engine.

Model intent:
B(t+1) = clip(B(t) - exposure(driver, task, route, weather) + recovery(rest), 0, 100)

Requirements:
- Separate driver fatigue exposure, task load, route/area exposure, and weather exposure.
- Use monotonic rules: more continuous work, heavier remaining workload, worse weather, and riskier segments must never improve the budget.
- Return total score, ordered contributions, confidence, missing inputs, risk band, and the first future stop/time that breaches the threshold.
- Keep all weights in a versioned config file with human-readable rationales.
- Support sensitivity analysis so judges can see how one variable changes the output.
- Never call the result accident probability.

Tests:
- Boundary tests at 0 and 100.
- Monotonicity property tests.
- Recovery after rest.
- Missing-data confidence degradation.
- Exact expected outputs for all three demo fixtures.

After implementation, run tests and generate one JSON example for the rainy scenario. Update docs/evals.md with test evidence and known limitations.
```

---

## 5. 개입 비교 및 Risk Transfer Guard

```text
Implement the counterfactual intervention engine.

Candidate actions:
1. Rest for N minutes.
2. Transfer N stops to a nearby courier.
3. Reorder remaining stops.
4. Select a safer route.
5. Delay low-priority stops and generate a customer notice request.
6. Bundles of compatible actions.

For each candidate return:
- predicted post-action budget and risk band
- safety gain
- ETA change
- operational complexity
- customer impact
- recipient-courier fairness impact
- feasibility reasons
- consent requirements

Hard constraints:
- No courier may fall below the minimum post-transfer budget.
- Respect stop time windows and max work-duration constraints.
- Safety feasibility is checked before ETA/cost ranking.
- Infeasible actions remain visible with a plain-language reason; do not silently hide them.

Ranking objective inside the feasible set:
maximize safety_gain - delay_cost - fairness_penalty - operational_complexity

Create unit tests for risk transfer, infeasible actions, ties, and bundled actions. Add one snapshot showing why the recommended bundle beats the fastest option.
```

---

## 6. 관리자 Control Tower

```text
Build the administrator web dashboard according to docs/design-system.md.

Information architecture:
- Top bar: hub, date/time, weather, data mode.
- Left navigation: Control Tower, Routes, Drivers, Interventions, Near-miss Map, Reports, Privacy/Audit.
- KPI strip: support-needed couriers, predicted breaches within 60 minutes, high-risk stops, pending interventions.
- Main map: route, risk segments, rest points, transfer candidates.
- Right intervention queue: prioritize action urgency, not driver ranking.
- Selected courier panel: time-to-breach timeline, ordered cause contributions, confidence/missing data.
- Counterfactual cards: rest, transfer, reorder, safer route, recommended bundle.
- Approval modal: before/after, delay, recipient fairness, rider consent state, customer message, reason and audit record.

Design rules:
- Calm Control Tower visual direction: off-white background, navy structure, teal actions, amber pending, red only critical.
- No leaderboard, rank, or punitive wording.
- Status must not rely on color alone.
- Use realistic loading, empty, API-error, and fallback-demo states.

Acceptance criteria:
- Responsive at 1440x900 and 1280x720.
- Keyboard-accessible action queue and modal.
- Playwright test completes the full admin half of the hero loop.
- Capture screenshots for visual verification and compare them against the approved wireframe.
```

---

## 7. 택배기사 PWA

```text
Build a mobile-first courier PWA.

Primary home state:
- Remaining Safety Budget as a range and band, not a competitive score.
- “Safe until” time and breach stop.
- Top three causes in plain Korean.
- One recommended action, with expected safety gain and delay.
- Buttons: agree, request change, decline with reason.
- One-tap near-miss report.
- Privacy/consent page explaining which data are used and what the administrator can see.

Interaction rules:
- One primary action per screen.
- 44px minimum touch targets.
- Do not require long reading while driving; high-risk prompts must be voice-ready and safe to view only when stopped.
- The rider sees the same intervention basis as the administrator.
- Declining an action must not trigger punitive copy or visual treatment.
- Add offline queueing for near-miss reports and action responses.

Acceptance criteria:
- Works at 390x844 and 360x800.
- Lighthouse accessibility score target >= 90 in demo build.
- Playwright mobile test covers consent, action review, approval, and near-miss submission.
```

---

## 8. Upstage 문서·설명 레이어

```text
Implement the Upstage layer without allowing the LLM to own numerical safety decisions.

Pipeline A - safety knowledge:
1. Parse a synthetic courier safety manual with Upstage Document Parse.
2. Extract selected rule fields with Upstage Information Extract.
3. Validate the JSON with Zod.
4. Store source-page/section metadata for citations.

Pipeline B - role-specific explanations:
Input is immutable deterministic JSON containing risk score, contributions, intervention results, confidence, missing data, and cited safety rules.
Solar Pro 3 outputs:
- courier explanation
- administrator decision note
- customer safe-delay message
- daily safety report summary

Prompt constraints:
- Never modify, infer, round, or recompute supplied numeric values.
- Never blame the courier.
- Cite only supplied document passages.
- State uncertainty and missing data.
- Produce strict JSON matching a schema.

Build live, mock, timeout, malformed-response, and fallback states. Display a visible “demo fixture” badge when fallback is used. Add contract tests proving that changed LLM text cannot change the deterministic score or selected intervention.
```

---

## 9. Near-miss Memory Graph

```text
Implement a minimal Near-miss Feedback Loop suitable for a contest demo.

Requirements:
- Courier submits category, severity, optional note, and coarse location while stopped.
- Strip precise personal trajectory data from the manager view.
- Aggregate reports into area/segment memory with time decay and weather interaction.
- A new report changes only future localized route-risk features after validation; it must not instantly punish the reporting courier.
- Show before/after localized risk in the demo scenario.
- Provide an admin moderation state for duplicate or low-confidence reports.

Tests must cover time decay, duplicate reports, location coarsening, and non-retaliation behavior.
```

---

## 10. 평가 설계와 근거 만들기

```text
Create a defensible evaluation harness for SafeRoute AI.

Baselines:
A. fastest-route-only plan
B. workload-balanced plan without Safety Budget
C. SafeRoute closed-loop plan

Metrics:
- minutes before threshold breach
- number of high-risk stops
- maximum courier budget depletion
- workload imbalance after transfer
- ETA delay
- intervention decision time
- explanation factual-consistency rate
- rider/admin task completion and comprehension
- number of unsupported LLM numerical claims

Run at least 30 deterministic synthetic variations across the three scenarios. Produce a CSV and charts, but label them simulation results. Add a small usability protocol for 5-10 participants and a consent script. Do not claim accident reduction.

Update docs/evals.md with methodology, results, limitations, and reproducibility commands.
```

---

## 11. 3분 시연 모드

```text
Build a one-click demo mode that tells one coherent story in under three minutes.

Sequence:
1. Show the fastest baseline route.
2. Increase rain and elapsed work time; time-to-breach appears at stop 17.
3. Open the ordered cause explanation and confidence state.
4. Compare rest, transfer, reorder, safer route, and the recommended bundle.
5. Show Risk Transfer Guard for the recipient courier.
6. Courier reviews and agrees on the mobile view.
7. Administrator approves; route, schedule, and ETA update.
8. Solar Pro 3 generates a cited manager note and customer safe-delay message.
9. Submit a near-miss report and show the localized risk-memory update.
10. End on before/after metrics and the anti-surveillance audit record.

Requirements:
- A reset button restores the initial fixture.
- A keyboard shortcut advances each step.
- Live API failure automatically falls back without breaking the story, with a visible label.
- A 1280x720 stage mode keeps the critical panel readable.
- Add docs/demo-script.md with exact narration, clicks, timing, and fallback lines.
- Record a dry-run checklist and verify the build three times from a clean start.
```

---

## 12. 독립 검증자 프롬프트

```text
Act as a fresh-context verifier. Do not trust the implementation team's completion claims.

Read CLAUDE.md, product spec, data contracts, design system, eval plan, and demo script. Then:
1. Trace every hero-loop requirement to concrete code and tests.
2. Run build, unit tests, and end-to-end tests.
3. Try to violate Safety Budget monotonicity and Risk Transfer Guard.
4. Try malformed Upstage responses and network failure.
5. Inspect admin and mobile screenshots for clipped text, color-only status, ranking language, and surveillance cues.
6. Check that every numerical claim in generated explanations is present in the deterministic input JSON.
7. Check demo reset, fallback, and 1280x720 readability.

Output:
- P0 blockers with reproduction steps
- P1 competition risks
- verified strengths with evidence
- pass/fail table against acceptance criteria

Do not fix anything in this turn. Do not expose private chain-of-thought; provide evidence and concise rationale.
```

---

## 13. 결함 수정 프롬프트

```text
Fix only the verified P0/P1 issues listed below. Do not add features or refactor unrelated code.

For each issue:
- reproduce first
- identify the narrow root cause
- add or update a regression test
- implement the smallest correct fix
- run the relevant test and the full smoke suite
- record the decision only if behavior or architecture changes

Before reporting completion, audit every claim against command output or file diffs. If a test still fails, say so plainly.

[PASTE VERIFIED ISSUE LIST]
```

---

## 14. 디자인 승인 후 고해상도 구현 프롬프트

```text
The design direction has been approved as: Admin = Calm Control Tower, Courier = Field-first Human UI.

Use the approved low-fidelity wireframes in [PATHS] and the design tokens in docs/design-system.md. Implement high-fidelity screens without changing information architecture or adding new features.

Reference principles, not pixel copying:
- Onfleet/Bringg: dispatcher map + exception workflow + customer ETA flow.
- Logistics command-center concepts: top KPI hierarchy, map-centric view, actionable right rail.
- Courier app: single primary action, large touch targets, plain-language consent.

Visual constraints:
- Light admin canvas; navy structural chrome; teal primary actions; amber pending; red only critical.
- Avoid excessive gradients, glassmorphism, neon, and decorative charts.
- No driver avatars in risk queues unless operationally necessary.
- Risk is described as “지원 필요” and “임계치 예상,” never “저성과” or rank.
- Use Korean production-length copy, not lorem ipsum.

After implementation:
- capture 1440x900 admin and 390x844 mobile screenshots
- compare against wireframes
- run accessibility checks
- list any intentional deviations with reasons
```

---

## 15. 세션 종료 체크포인트

```text
Before ending this session:
1. State the verified outcome in one sentence.
2. List changed files and why each changed.
3. Include exact test/build commands and results.
4. Update docs/decisions.md only for durable decisions.
5. Add or update one lesson under docs/lessons/ if a reusable insight emerged.
6. State remaining P0/P1 risks and the next single recommended task.
7. Do not claim work that lacks a tool result or file diff.
```

---

## 운영 팁

- 페이블에게 매번 전체 기능을 한 번에 만들게 하지 말고, **명세 → 데이터 계약 → 엔진 → 개입 → UI → AI 연동 → 검증** 순서로 통과시킨다.
- 장기 작업에서는 구현자와 별도의 검증자 세션을 둔다.
- “생각 과정을 전부 보여줘”라고 요구하지 않는다. 대신 결정, 가정, 근거, 테스트 결과를 요구한다.
- 최종 시연 직전 72시간은 기능 추가를 금지하고, 재현성·오류 상태·발표 해상도만 고친다.
