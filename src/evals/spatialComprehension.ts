import { z } from "zod";

const ViewModeSchema = z.enum(["TWO_D", "DEMO_TWO_POINT_FIVE_D"]);

const TrialSchema = z.object({
  mode: ViewModeSchema,
  durationMs: z.number().int().positive().max(600_000),
  confidence: z.number().int().min(1).max(5),
  answers: z.object({
    timeToBreachMinutes: z.number().int().nonnegative(),
    breachStopOrdinal: z.number().int().positive(),
    slopeExposureSegment: z.enum([
      "CURRENT_TO_REST",
      "REST_TO_BREACH",
      "BREACH_AND_AFTER",
      "UNKNOWN",
    ]),
    restMinutes: z.number().int().nonnegative(),
    transferStopCount: z.number().int().nonnegative(),
    sourceImpact: z.enum([
      "WORKLOAD_REDUCED_AND_BUDGET_RECOVERS",
      "WORKLOAD_INCREASES",
      "NO_CHANGE",
      "UNKNOWN",
    ]),
    recipientImpact: z.enum([
      "TRANSFER_WITHIN_SAFETY_LIMIT",
      "TRANSFER_EXCEEDS_SAFETY_LIMIT",
      "NO_TRANSFER",
      "UNKNOWN",
    ]),
    routePriority: z.enum([
      "REST_BEFORE_BREACH",
      "BREACH_BEFORE_REST",
      "UNKNOWN",
    ]),
  }).strict(),
}).strict();

const ReviewerSchema = z.object({
  reviewerId: z.string().regex(/^reviewer-[0-9]{2}$/),
  trialOrder: z.tuple([ViewModeSchema, ViewModeSchema]),
  trials: z.array(TrialSchema).length(2),
  comparison: z.object({
    clearerMode: z.enum(["TWO_D", "DEMO_TWO_POINT_FIVE_D", "SAME"]),
    twoPointFiveDAddedConfusion: z.boolean(),
    comment: z.string().trim().max(500),
  }).strict(),
}).strict().superRefine((reviewer, context) => {
  if (new Set(reviewer.trialOrder).size !== 2) {
    context.addIssue({
      code: "custom",
      message: "trialOrder must contain each view exactly once",
      path: ["trialOrder"],
    });
  }
  if (
    reviewer.trials.map((trial) => trial.mode).join("|") !==
    reviewer.trialOrder.join("|")
  ) {
    context.addIssue({
      code: "custom",
      message: "trials must follow trialOrder",
      path: ["trials"],
    });
  }
});

export const SpatialComprehensionStudySchema = z.object({
  schemaVersion: z.literal("g5-spatial-comprehension-v1"),
  studyId: z.literal("g5-b-decision-spatial-comprehension-001"),
  dataMode: z.literal("DEMO"),
  stimulusManifest: z.literal(
    "artifacts/evals/g5-spatial-stimulus-manifest.json",
  ),
  reviewers: z.array(ReviewerSchema).min(3),
}).strict().superRefine((study, context) => {
  if (new Set(study.reviewers.map(({ reviewerId }) => reviewerId)).size !== study.reviewers.length) {
    context.addIssue({
      code: "custom",
      message: "reviewerId values must be unique",
      path: ["reviewers"],
    });
  }
  if (new Set(study.reviewers.map(({ trialOrder }) => trialOrder.join("|"))).size < 2) {
    context.addIssue({
      code: "custom",
      message: "at least two counterbalanced trial orders are required",
      path: ["reviewers"],
    });
  }
});

export type SpatialComprehensionStudy = z.infer<
  typeof SpatialComprehensionStudySchema
>;

const expectedAnswers = Object.freeze({
  timeToBreachMinutes: 52,
  breachStopOrdinal: 17,
  restMinutes: 10,
  transferStopCount: 8,
  sourceImpact: "WORKLOAD_REDUCED_AND_BUDGET_RECOVERS",
  recipientImpact: "TRANSFER_WITHIN_SAFETY_LIMIT",
  routePriority: "REST_BEFORE_BREACH",
});

type Mode = z.infer<typeof ViewModeSchema>;

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function evaluateSpatialComprehension(input: unknown) {
  const study = SpatialComprehensionStudySchema.parse(input);
  const modeDurations: Record<Mode, number[]> = {
    TWO_D: [],
    DEMO_TWO_POINT_FIVE_D: [],
  };
  let totalTrials = 0;
  let correctTrials = 0;
  let criticalMisinterpretationCount = 0;
  const slopeCorrectByMode: Record<Mode, number> = {
    TWO_D: 0,
    DEMO_TWO_POINT_FIVE_D: 0,
  };

  for (const reviewer of study.reviewers) {
    for (const trial of reviewer.trials) {
      totalTrials += 1;
      modeDurations[trial.mode].push(trial.durationMs);
      const isCorrect = Object.entries(expectedAnswers).every(
        ([key, value]) => trial.answers[key as keyof typeof trial.answers] === value,
      );
      if (isCorrect) correctTrials += 1;
      else criticalMisinterpretationCount += 1;
      if (trial.answers.slopeExposureSegment === "REST_TO_BREACH") {
        slopeCorrectByMode[trial.mode] += 1;
      }
    }
  }

  const median2dMs = median(modeDurations.TWO_D);
  const median2point5dMs = median(modeDurations.DEMO_TWO_POINT_FIVE_D);
  const prefers2point5dCount = study.reviewers.filter(
    ({ comparison }) =>
      comparison.clearerMode === "DEMO_TWO_POINT_FIVE_D" &&
      !comparison.twoPointFiveDAddedConfusion,
  ).length;
  const confusionCount = study.reviewers.filter(
    ({ comparison }) => comparison.twoPointFiveDAddedConfusion,
  ).length;
  const comprehensionPassed = criticalMisinterpretationCount === 0;
  const twoPointFiveDSlopePassed =
    slopeCorrectByMode.DEMO_TWO_POINT_FIVE_D === study.reviewers.length;
  const defaultPromotionEligible =
    comprehensionPassed &&
    twoPointFiveDSlopePassed &&
    confusionCount === 0 &&
    median2point5dMs < median2dMs &&
    prefers2point5dCount >= Math.ceil(study.reviewers.length / 2);

  return {
    schemaVersion: "g5-spatial-comprehension-summary-v1" as const,
    studyId: study.studyId,
    dataMode: study.dataMode,
    status: defaultPromotionEligible
      ? ("DEFAULT_PROMOTION_CANDIDATE" as const)
      : comprehensionPassed
        ? ("KEEP_OPTIONAL" as const)
        : ("DO_NOT_PROMOTE" as const),
    reviewerCount: study.reviewers.length,
    totalTrials,
    correctTrials,
    answerAccuracy: correctTrials / totalTrials,
    criticalMisinterpretationCount,
    slopeCorrectByMode,
    confusionCount,
    prefers2point5dCount,
    medianDurationMs: {
      twoD: median2dMs,
      demoTwoPointFiveD: median2point5dMs,
    },
    comprehensionPassed,
    twoPointFiveDSlopePassed,
    defaultPromotionEligible,
    note:
      "Independent human observations only; this result is not field-performance or accident-reduction evidence.",
  };
}
