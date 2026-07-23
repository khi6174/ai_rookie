import { z } from "zod";

const G5Round3SummarySchema = z.object({
  schemaVersion: z.literal("g5-spatial-comprehension-summary-v3"),
  studyId: z.literal("g5-b-decision-spatial-comprehension-round3-001"),
  dataMode: z.literal("DEMO"),
  status: z.enum([
    "DO_NOT_PROMOTE",
    "KEEP_OPTIONAL",
    "DEFAULT_PROMOTION_CANDIDATE",
  ]),
  reviewerCount: z.number().int().min(3),
  comprehensionPassed: z.boolean(),
}).passthrough();

const G5Round4SummarySchema = z.object({
  schemaVersion: z.literal("g5-spatial-comprehension-summary-v4"),
  studyId: z.literal("g5-b-decision-spatial-comprehension-round4-001"),
  dataMode: z.literal("DEMO"),
  status: z.enum([
    "DO_NOT_PROMOTE",
    "KEEP_OPTIONAL",
    "DEFAULT_PROMOTION_CANDIDATE",
  ]),
  reviewerCount: z.number().int().min(3),
  comprehensionPassed: z.boolean(),
}).passthrough();

const RiderReferenceSummarySchema = z.object({
  schemaVersion: z.literal("rider-reference-comprehension-summary-v2"),
  studyId: z.literal("rider-route-product-boundary-round2-001"),
  dataMode: z.literal("DEMO"),
  status: z.enum(["READY_TO_PROMOTE", "NEEDS_REVISION"]),
  reviewerCount: z.number().int().min(5),
  comprehensionPassed: z.boolean(),
  criticalMisconceptionCount: z.number().int().nonnegative(),
}).passthrough();

export type HumanGoalEvidenceInput = {
  g5Round4?: unknown;
  g5Round3?: unknown;
  riderRound2?: unknown;
};

export function evaluateHumanGoalEvidence(input: HumanGoalEvidenceInput) {
  const g5 = input.g5Round4 !== undefined
    ? G5Round4SummarySchema.parse(input.g5Round4)
    : input.g5Round3 !== undefined
      ? G5Round3SummarySchema.parse(input.g5Round3)
      : null;
  const rider = input.riderRound2 === undefined
    ? null
    : RiderReferenceSummarySchema.parse(input.riderRound2);
  const g5Passed =
    g5 !== null &&
    g5.comprehensionPassed === true &&
    ["KEEP_OPTIONAL", "DEFAULT_PROMOTION_CANDIDATE"].includes(g5.status);
  const riderPassed =
    rider !== null &&
    rider.status === "READY_TO_PROMOTE" &&
    rider.comprehensionPassed === true &&
    rider.criticalMisconceptionCount === 0;

  return {
    g5Passed,
    riderPassed,
    allPassed: g5Passed && riderPassed,
    requiredNextEvidence: [
      ...(!g5Passed
        ? ["artifacts/evals/g5-spatial-comprehension-round4-summary.json"]
        : []),
      ...(!riderPassed
        ? ["artifacts/evals/rider-reference-comprehension-round2-summary.json"]
        : []),
    ],
  };
}

export type GoalCriterionStatus =
  | "PASSED"
  | "HUMAN_VALIDATION_REQUIRED"
  | "FAILED";

export function evaluateGoalCompletionStatus(
  statuses: GoalCriterionStatus[],
) {
  if (statuses.length !== 6) {
    throw new Error(`Expected six judging criteria, received ${statuses.length}`);
  }
  if (statuses.includes("FAILED")) return "FAILED" as const;
  if (statuses.includes("HUMAN_VALIDATION_REQUIRED")) {
    return "HUMAN_VALIDATION_REQUIRED" as const;
  }
  return "READY_FOR_FINAL_SUBMISSION" as const;
}
