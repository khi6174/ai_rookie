import { describe, expect, it } from "vitest";
import {
  directRiskTransferBoundaryInputs,
  evaluateDirectRiskTransferBoundaries,
  evaluateFullPlanTransferBoundaries,
  evaluateRiskTransferBoundarySuite,
} from "../src/evals/riskTransferBoundaries";

describe("Risk Transfer Guard direct boundaries", () => {
  it("freezes exactly 20 unique deterministic boundary cases", () => {
    expect(directRiskTransferBoundaryInputs).toHaveLength(20);
    expect(new Set(directRiskTransferBoundaryInputs.map((item) => item.caseId))).toHaveLength(20);
    expect(evaluateDirectRiskTransferBoundaries()).toEqual(
      evaluateDirectRiskTransferBoundaries(),
    );
  });

  it("allows exact Budget 45 and exact 15-point drop when no breach is predicted", () => {
    const cases = evaluateDirectRiskTransferBoundaries();
    const exactFloor = cases.find(
      (item) =>
        item.recipientCandidateMinimumBudget === 45 &&
        item.recipientBudgetDrop === 0,
    );
    const exactDrop = cases.find(
      (item) =>
        item.recipientCandidateMinimumBudget === 45.01 &&
        item.recipientBudgetDrop === 15,
    );
    expect(exactFloor).toMatchObject({ actualFeasible: true, reasonCodes: "", passed: true });
    expect(exactDrop).toMatchObject({ actualFeasible: true, reasonCodes: "", passed: true });
  });

  it("blocks 0.01 below the floor and 0.01 above the drop limit", () => {
    const cases = evaluateDirectRiskTransferBoundaries();
    expect(
      cases.find(
        (item) =>
          item.recipientCandidateMinimumBudget === 44.99 &&
          item.recipientBudgetDrop === 0,
      )?.reasonCodes,
    ).toBe("TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR");
    expect(
      cases.find(
        (item) =>
          item.recipientCandidateMinimumBudget === 45.01 &&
          item.recipientBudgetDrop === 15.01,
      )?.reasonCodes,
    ).toBe("TRANSFER_RECIPIENT_BUDGET_DROP_EXCEEDED");
  });

  it("blocks both predicted and already-breached recipient states", () => {
    const cases = evaluateDirectRiskTransferBoundaries();
    for (const caseId of ["guard-breach-predicted", "guard-breach-already"]) {
      expect(cases.find((item) => item.caseId === caseId)).toMatchObject({
        actualFeasible: false,
        reasonCodes: "TRANSFER_RECIPIENT_BREACH_PREDICTED",
        passed: true,
      });
    }
  });
});

describe("Risk Transfer Guard full-plan boundaries", () => {
  it("keeps 4 and 8 transfers feasible and blocks 12 after full-plan recalculation", () => {
    const rows = evaluateFullPlanTransferBoundaries();
    expect(rows.map((row) => [row.transferredStopCount, row.actualFeasible])).toEqual([
      [4, true],
      [8, true],
      [12, false],
    ]);
    expect(rows.every((row) => row.passed)).toBe(true);
  });

  it("passes all 20 direct and 3 full-plan cases without hiding violations", () => {
    const suite = evaluateRiskTransferBoundarySuite();
    expect(suite).toMatchObject({
      directCaseCount: 20,
      fullPlanCaseCount: 3,
      totalCaseCount: 23,
      passedCount: 23,
      failedCount: 0,
      allPassed: true,
    });
    expect(suite.reasonCodeCounts).toMatchObject({
      TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR: 5,
      TRANSFER_RECIPIENT_BUDGET_DROP_EXCEEDED: 4,
      TRANSFER_RECIPIENT_BREACH_PREDICTED: 3,
    });
  });
});
