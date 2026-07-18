import { describe, expect, it } from "vitest";
import {
  decisionWorkflowBoundaryInputs,
  evaluateDecisionWorkflowBoundaries,
  evaluateDecisionWorkflowBoundarySuite,
} from "../src/evals/decisionWorkflowBoundaries";

describe("decision workflow time, consent, and version boundaries", () => {
  it("freezes exactly 30 unique deterministic cases across three categories", () => {
    expect(decisionWorkflowBoundaryInputs).toHaveLength(30);
    expect(
      new Set(decisionWorkflowBoundaryInputs.map((item) => item.caseId)),
    ).toHaveLength(30);
    expect(evaluateDecisionWorkflowBoundaries()).toEqual(
      evaluateDecisionWorkflowBoundaries(),
    );
  });

  it("allows 9.999 minutes and blocks the exact ten-minute consent boundary", () => {
    const rows = evaluateDecisionWorkflowBoundaries();
    expect(rows.find((row) => row.caseId === "time-approve-9m59s-allowed")).toMatchObject({
      actualOutcome: "APPROVED",
      reasonCode: "ADMIN_APPROVE",
      passed: true,
    });
    expect(rows.find((row) => row.caseId === "time-approve-exact-10m-blocked")).toMatchObject({
      actualOutcome: "ERROR:CONSENT_EXPIRED",
      reasonCode: "CONSENT_EXPIRED",
      passed: true,
    });
  });

  it("requires both couriers and preserves modification, decline, hold, and resume rights", () => {
    const rows = evaluateDecisionWorkflowBoundaries();
    for (const caseId of [
      "consent-first-of-two-keeps-pending",
      "consent-modification-stops-approval",
      "consent-decline-stops-approval",
      "consent-both-complete",
      "consent-admin-hold-preserves-review",
      "consent-admin-resume-preserves-review",
    ]) {
      expect(rows.find((row) => row.caseId === caseId)?.passed).toBe(true);
    }
  });

  it("routes every stale or mismatched context back to revalidation", () => {
    const rows = evaluateDecisionWorkflowBoundaries().filter(
      (row) => row.category === "VERSION" && row.caseId !== "version-idempotent-replay",
    );
    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.actualOutcome === "REVALIDATION_REQUIRED")).toBe(true);
    expect(rows.every((row) => row.passed)).toBe(true);
  });

  it("passes all 8 time, 12 consent, and 10 version cases", () => {
    expect(evaluateDecisionWorkflowBoundarySuite()).toMatchObject({
      caseCount: 30,
      categoryCounts: { TIME: 8, CONSENT: 12, VERSION: 10 },
      passedCount: 30,
      failedCount: 0,
      allPassed: true,
    });
  });
});
