import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionCommandError } from "../src/domain/decisions";
import { App } from "../src/ui/App";
import { generateDemoAdminExplanation } from "../src/ui/demoExplanation";
import {
  approveAndApplyDemo,
  consentStatusFor,
  createInitialDemoSession,
  createResetDemoDecisionId,
  demoDecisionId,
  demoFixture,
  demoRecipientCourierId,
  demoRecommendedCandidate,
  demoSourceCourierId,
  holdDemoDecision,
  requestDemoModification,
  respondToDemo,
} from "../src/ui/demoSession";

function commandErrorCode(action: () => unknown) {
  try {
    action();
    return undefined;
  } catch (error) {
    return error instanceof DecisionCommandError ? error.code : "UNEXPECTED_ERROR";
  }
}

function adminReadySession() {
  const source = respondToDemo(
    createInitialDemoSession(),
    demoSourceCourierId,
    "CONSENTED",
  );
  return respondToDemo(source, demoRecipientCourierId, "CONSENTED");
}

describe("shared admin and courier Demo session", () => {
  it("renders accessible shared decision landmarks without punitive copy", () => {
    const markup = renderToStaticMarkup(createElement(App));
    expect(markup).toContain('href="#main-content"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain("Demo fixture");
    expect(markup).toContain("Weather Fallback");
    expect(markup).toContain("Safety 계산은 Demo 날씨만 사용합니다");
    expect(markup).toContain("현재 시간당 적설 · 미래 120분 시정");
    expect(markup).toContain("INCOMPLETE_COVERAGE");
    expect(markup).toContain(demoDecisionId);
    expect(markup).toContain("12건 이관은 실행할 수 없습니다");
    expect(markup).toContain("동의");
    expect(markup).toContain("수정 요청");
    expect(markup).toContain("기사 동의 대기");
    expect(markup).not.toContain("위험한 기사");
    expect(markup).not.toContain("저성과 기사");
  });

  it("starts both roles on the same selected decision and candidate", () => {
    const session = createInitialDemoSession();
    expect(session.decision.decisionId).toBe(demoDecisionId);
    expect(session.decision.selectedCandidateId).toBe(
      demoRecommendedCandidate.candidateId,
    );
    expect(session.decision.status).toBe("RIDER_RESPONSE_PENDING");
    expect(consentStatusFor(session, demoSourceCourierId)).toBe("PENDING");
    expect(consentStatusFor(session, demoRecipientCourierId)).toBe("PENDING");
  });

  it("keeps administrator approval locked after only one consent", () => {
    const initial = createInitialDemoSession();
    const source = respondToDemo(initial, demoSourceCourierId, "CONSENTED");
    expect(source.decision.status).toBe("RIDER_RESPONSE_PENDING");
    expect(consentStatusFor(source, demoSourceCourierId)).toBe("CONSENTED");
    expect(consentStatusFor(source, demoRecipientCourierId)).toBe("PENDING");
    expect(source.store).toBe(initial.store);
    expect(commandErrorCode(() => approveAndApplyDemo(source))).toBe(
      "DECISION_STATUS_NOT_ALLOWED",
    );
  });

  it("opens the administrator gate only after both couriers consent", () => {
    const session = adminReadySession();
    expect(session.decision.status).toBe("ADMIN_APPROVAL_REQUIRED");
    expect(
      session.decision.consentRequirements.every(
        (requirement) => requirement.status === "CONSENTED",
      ),
    ).toBe(true);
  });

  it("applies the materialized workload and records notices after approval", () => {
    const ready = adminReadySession();
    const beforeStore = structuredClone(ready.store);
    const applied = approveAndApplyDemo(ready);
    expect(applied.decision.status).toBe("NOTICE_RECORDED");
    expect(applied.store).not.toBe(ready.store);
    expect(ready.store).toEqual(beforeStore);
    expect(applied.decision.customerNoticeIds).toEqual([
      "notice-scenario-a-001",
    ]);
    expect(
      applied.store.activePlan.stops.filter(
        (stop) => stop.assignedCourierId === demoSourceCourierId,
      ),
    ).toHaveLength(9);
    expect(
      applied.store.activePlan.stops.filter(
        (stop) => stop.assignedCourierId === demoRecipientCourierId,
      ).length,
    ).toBeGreaterThanOrEqual(8);
    expect(
      applied.store.pendingCustomerNoticeIds[demoDecisionId],
    ).toBeUndefined();
    expect(
      applied.store.customerNoticeDrafts["notice-scenario-a-001"],
    ).toMatchObject({
      deliveryStatus: "PREVIEW_ONLY",
      generationMode: "TEMPLATE",
      actualDeliverySent: false,
    });
  });

  it("renders the applied plan as resolved rather than as a current breach", () => {
    const applied = approveAndApplyDemo(adminReadySession());
    const markup = renderToStaticMarkup(
      createElement(App, { initialSession: applied }),
    );
    expect(markup).toContain("결정 완료 · 1건");
    expect(markup).toContain("10분 휴식과 배송 8건 이관을 적용했습니다");
    expect(markup).toContain("예상 초과 해소");
    expect(markup).toContain("수신 기사로 이관");
    expect(markup).not.toContain("현재 계획을 유지하면");
    expect(markup).not.toContain("is-breach");
  });

  it("renders a verified Mock explanation without presenting it as Live", async () => {
    const applied = approveAndApplyDemo(adminReadySession());
    const explanation = await generateDemoAdminExplanation();
    const markup = renderToStaticMarkup(
      createElement(App, {
        initialSession: applied,
        initialExplanation: explanation,
      }),
    );
    expect(markup).toContain("Upstage Mock · 검증 통과");
    expect(markup).toContain("합성 안전운영 매뉴얼");
    expect(markup).toContain("숫자 불변");
    expect(markup).toContain("Demo fixture");
    expect(markup).not.toContain("Upstage Live");
  });

  it("records modification and decline without changing the active plan", () => {
    const initial = createInitialDemoSession();
    const modification = respondToDemo(
      initial,
      demoSourceCourierId,
      "MODIFICATION_REQUESTED",
    );
    expect(modification.decision.status).toBe("MODIFICATION_REQUESTED");
    expect(modification.store).toBe(initial.store);

    const declined = respondToDemo(
      createInitialDemoSession(),
      demoSourceCourierId,
      "DECLINED",
    );
    expect(declined.decision.status).toBe("RIDER_DECLINED");
    expect(declined.announcement).toContain("불이익 없이");
  });

  it("keeps the plan unchanged on administrator hold or modification", () => {
    const ready = adminReadySession();
    const held = holdDemoDecision(ready);
    expect(held.decision.status).toBe("ADMIN_HELD");
    expect(held.store).toBe(ready.store);

    const modified = requestDemoModification(adminReadySession());
    expect(modified.decision.status).toBe("ADMIN_MODIFICATION_REQUESTED");
    expect(modified.store.activePlan).toEqual(demoFixture);
  });

  it("resets to the same clean manifest with a new linked decision ID", () => {
    const before = structuredClone(demoFixture);
    const first = createInitialDemoSession();
    const changed = respondToDemo(first, demoSourceCourierId, "CONSENTED");
    const resetDecisionId = "decision-scenario-a-ui-reset-test-001";
    const reset = createInitialDemoSession(resetDecisionId);
    expect(reset.decision.decisionId).toBe(resetDecisionId);
    expect(reset.decision.decisionId).not.toBe(first.decision.decisionId);
    expect(reset.decision.status).toBe(first.decision.status);
    expect(reset.decision.candidateIds).not.toEqual(first.decision.candidateIds);
    expect(reset.decision.candidateIds).toContain(
      reset.decision.selectedCandidateId,
    );
    expect(
      reset.decision.consentRequirements.every(
        (requirement) =>
          requirement.candidateId === reset.decision.selectedCandidateId,
      ),
    ).toBe(true);
    expect(reset.store).toEqual(first.store);
    expect(reset.decision).not.toEqual(changed.decision);
    expect(demoFixture).toEqual(before);
  });

  it("creates opaque, distinct reset decision IDs", () => {
    const first = createResetDemoDecisionId();
    const second = createResetDemoDecisionId();
    expect(first).toMatch(/^decision-scenario-a-ui-reset-[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });
});
