import { rainyHillyLongShiftFixture } from "../adapters/fixtures";
import type { BreachPrediction, ScenarioFixture } from "../domain/contracts";
import {
  createTransferCandidate,
  evaluateIntervention,
  evaluateRiskTransferGuard,
  interventionConfig,
} from "../domain/interventions";

export const riskTransferBoundaryVersion = "risk-transfer-boundary-v1.0.0";

type DirectBoundaryInput = {
  caseId: string;
  recipientCandidateMinimumBudget: number;
  recipientBudgetDrop: number;
  breachStatus: BreachPrediction["status"];
};

const candidateBudgets = [44.99, 45, 45.01, 60] as const;
const budgetDrops = [0, 14.99, 15, 15.01] as const;

const numberId = (value: number) => String(value).replace(".", "p");
const round = (value: number) => Number(value.toFixed(6));

export const directRiskTransferBoundaryInputs: readonly DirectBoundaryInput[] = [
  ...candidateBudgets.flatMap((candidateMinimumBudget) =>
    budgetDrops.map((budgetDrop) => ({
      caseId: `guard-budget-${numberId(candidateMinimumBudget)}-drop-${numberId(budgetDrop)}`,
      recipientCandidateMinimumBudget: candidateMinimumBudget,
      recipientBudgetDrop: budgetDrop,
      breachStatus: "NO_BREACH_IN_HORIZON" as const,
    })),
  ),
  {
    caseId: "guard-breach-control",
    recipientCandidateMinimumBudget: 50,
    recipientBudgetDrop: 5,
    breachStatus: "NO_BREACH_IN_HORIZON",
  },
  {
    caseId: "guard-breach-predicted",
    recipientCandidateMinimumBudget: 50,
    recipientBudgetDrop: 5,
    breachStatus: "PREDICTED",
  },
  {
    caseId: "guard-breach-already",
    recipientCandidateMinimumBudget: 50,
    recipientBudgetDrop: 5,
    breachStatus: "ALREADY_BREACHED",
  },
  {
    caseId: "guard-breach-at-both-numeric-limits",
    recipientCandidateMinimumBudget: 45,
    recipientBudgetDrop: 15,
    breachStatus: "PREDICTED",
  },
] as const;

function expectedReasonCodes(input: DirectBoundaryInput) {
  const codes: string[] = [];
  if (
    input.recipientCandidateMinimumBudget <
    interventionConfig.riskTransferGuard.recipientMinimumBudget
  ) {
    codes.push("TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR");
  }
  if (
    input.recipientBudgetDrop >
    interventionConfig.riskTransferGuard.maximumRecipientBudgetDrop
  ) {
    codes.push("TRANSFER_RECIPIENT_BUDGET_DROP_EXCEEDED");
  }
  if (input.breachStatus !== "NO_BREACH_IN_HORIZON") {
    codes.push("TRANSFER_RECIPIENT_BREACH_PREDICTED");
  }
  return codes;
}

export function evaluateDirectRiskTransferBoundaries() {
  return directRiskTransferBoundaryInputs.map((input) => {
    const recipientBaselineMinimumBudget = round(
      input.recipientCandidateMinimumBudget + input.recipientBudgetDrop,
    );
    const reasons = evaluateRiskTransferGuard({
      recipientCourierId: "courier-frozen-recipient",
      baselineMinimumBudget: recipientBaselineMinimumBudget,
      candidateMinimumBudget: input.recipientCandidateMinimumBudget,
      breachStatus: input.breachStatus,
    });
    const actualReasonCodes = reasons.map((reason) => reason.code);
    const expected = expectedReasonCodes(input);
    const actualFeasible = actualReasonCodes.length === 0;
    const expectedFeasible = expected.length === 0;
    return {
      caseId: input.caseId,
      caseType: "DIRECT_GUARD" as const,
      transferredStopCount: undefined,
      candidateId: undefined,
      breachStatus: input.breachStatus,
      feasibility: actualFeasible ? "FEASIBLE" : "INFEASIBLE",
      sourceBaselineMinimumBudget: undefined,
      sourceCandidateMinimumBudget: undefined,
      recipientBaselineMinimumBudget,
      recipientCandidateMinimumBudget: input.recipientCandidateMinimumBudget,
      recipientBudgetDrop: input.recipientBudgetDrop,
      minimumRecipientThreshold:
        interventionConfig.riskTransferGuard.recipientMinimumBudget,
      maximumRecipientDrop:
        interventionConfig.riskTransferGuard.maximumRecipientBudgetDrop,
      expectedFeasible,
      actualFeasible,
      expectedReasonCodes: expected.join("|"),
      reasonCodes: actualReasonCodes.join("|"),
      passed:
        expectedFeasible === actualFeasible &&
        expected.join("|") === actualReasonCodes.join("|"),
    };
  });
}

export function evaluateFullPlanTransferBoundaries(
  fixture: ScenarioFixture = rainyHillyLongShiftFixture,
) {
  const sourceCourierId = fixture.couriers[0].courierId;
  const recipientCourierId = fixture.couriers[1].courierId;
  return ([4, 8, 12] as const).map((transferredStopCount) => {
    const candidate = createTransferCandidate(
      fixture,
      `decision-risk-transfer-boundary-${transferredStopCount}-v1`,
      {
        sourceCourierId,
        recipientCourierId,
        stopIds: fixture.stops
          .slice(-transferredStopCount)
          .map((stop) => stop.stopId),
      },
    );
    const evaluation = evaluateIntervention(fixture, candidate);
    const source = evaluation.courierImpacts.find((impact) => impact.role === "SOURCE");
    const recipient = evaluation.courierImpacts.find(
      (impact) => impact.role === "RECIPIENT",
    );
    if (!source || !recipient) throw new Error("Transfer boundary has incomplete impacts");
    const actualFeasible = evaluation.feasibility.status === "FEASIBLE";
    const expectedFeasible = transferredStopCount !== 12;
    const expectedCodes = transferredStopCount === 12
      ? ["TRANSFER_RECIPIENT_BUDGET_BELOW_FLOOR"]
      : [];
    const actualCodes = evaluation.reasons
      .filter((reason) => reason.severity === "BLOCKING")
      .map((reason) => reason.code);
    return {
      caseId: `full-plan-transfer-${transferredStopCount}`,
      caseType: "FULL_PLAN_TRANSFER" as const,
      transferredStopCount,
      candidateId: candidate.candidateId,
      breachStatus: recipient.breach.status,
      feasibility: evaluation.feasibility.status,
      sourceBaselineMinimumBudget: source.baselineMinimumBudget,
      sourceCandidateMinimumBudget: source.candidateMinimumBudget,
      recipientBaselineMinimumBudget: recipient.baselineMinimumBudget,
      recipientCandidateMinimumBudget: recipient.candidateMinimumBudget,
      recipientBudgetDrop: round(
        recipient.baselineMinimumBudget - recipient.candidateMinimumBudget,
      ),
      minimumRecipientThreshold:
        interventionConfig.riskTransferGuard.recipientMinimumBudget,
      maximumRecipientDrop:
        interventionConfig.riskTransferGuard.maximumRecipientBudgetDrop,
      expectedFeasible,
      actualFeasible,
      expectedReasonCodes: expectedCodes.join("|"),
      reasonCodes: actualCodes.join("|"),
      passed:
        expectedFeasible === actualFeasible &&
        expectedCodes.join("|") === actualCodes.join("|"),
    };
  });
}

export function evaluateRiskTransferBoundarySuite() {
  const directCases = evaluateDirectRiskTransferBoundaries();
  const fullPlanCases = evaluateFullPlanTransferBoundaries();
  const rows = [...directCases, ...fullPlanCases];
  const reasonCodeCounts = rows.reduce<Record<string, number>>((counts, row) => {
    for (const code of row.reasonCodes.split("|").filter(Boolean)) {
      counts[code] = (counts[code] ?? 0) + 1;
    }
    return counts;
  }, {});
  return {
    schemaVersion: "risk-transfer-boundary-summary-v1",
    generatorVersion: riskTransferBoundaryVersion,
    dataMode: "MOCK" as const,
    isDemo: true as const,
    directCaseCount: directCases.length,
    fullPlanCaseCount: fullPlanCases.length,
    totalCaseCount: rows.length,
    passedCount: rows.filter((row) => row.passed).length,
    failedCount: rows.filter((row) => !row.passed).length,
    reasonCodeCounts,
    allPassed: rows.every((row) => row.passed),
    rows,
  };
}
