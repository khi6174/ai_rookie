import { z } from "zod";

const ViewModeSchema = z.enum(["TWO_D", "DEMO_TWO_POINT_FIVE_D"]);
const directIdentifierPattern =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b)/i;

const TrialSchema = z.object({
  mode: ViewModeSchema,
  durationMs: z.number().int().positive(),
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
  consentConfirmed: z.literal(true),
  trialOrder: z.tuple([ViewModeSchema, ViewModeSchema]),
  trials: z.array(TrialSchema).length(2),
  comparison: z.object({
    clearerMode: z.enum(["TWO_D", "DEMO_TWO_POINT_FIVE_D", "SAME"]),
    twoPointFiveDAddedConfusion: z.boolean(),
    comment: z.string().trim().max(500).refine(
      (value) => !directIdentifierPattern.test(value),
      "comment must not contain an email address or mobile phone number",
    ),
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

const SpatialComprehensionStudyV1Schema = z.object({
  schemaVersion: z.literal("g5-spatial-comprehension-v1"),
  studyId: z.literal("g5-b-decision-spatial-comprehension-001"),
  dataMode: z.literal("DEMO"),
  stimulusManifest: z.literal("artifacts/evals/g5-spatial-stimulus-manifest.json"),
  reviewers: z.array(ReviewerSchema).min(3),
}).strict();

const SpatialComprehensionStudyV2Schema = z.object({
  schemaVersion: z.literal("g5-spatial-comprehension-v2"),
  studyId: z.literal("g5-b-decision-spatial-comprehension-round2-001"),
  dataMode: z.literal("DEMO"),
  stimulusManifest: z.literal(
    "artifacts/evals/g5-spatial-round2-stimulus-manifest.json",
  ),
  reviewers: z.array(ReviewerSchema).min(3),
}).strict();

export const SpatialComprehensionStudySchema = z.discriminatedUnion(
  "schemaVersion",
  [SpatialComprehensionStudyV1Schema, SpatialComprehensionStudyV2Schema],
).superRefine((study, context) => {
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
  const correctTrialsByMode: Record<Mode, number> = {
    TWO_D: 0,
    DEMO_TWO_POINT_FIVE_D: 0,
  };
  const confidenceByMode: Record<Mode, number[]> = {
    TWO_D: [],
    DEMO_TWO_POINT_FIVE_D: [],
  };
  const unknownAnswerCountByMode: Record<Mode, number> = {
    TWO_D: 0,
    DEMO_TWO_POINT_FIVE_D: 0,
  };
  const slopeCorrectByMode: Record<Mode, number> = {
    TWO_D: 0,
    DEMO_TWO_POINT_FIVE_D: 0,
  };

  for (const reviewer of study.reviewers) {
    for (const trial of reviewer.trials) {
      totalTrials += 1;
      modeDurations[trial.mode].push(trial.durationMs);
      confidenceByMode[trial.mode].push(trial.confidence);
      unknownAnswerCountByMode[trial.mode] += Object.values(trial.answers).filter(
        (value) => value === "UNKNOWN",
      ).length;
      const isCorrect = Object.entries(expectedAnswers).every(
        ([key, value]) => trial.answers[key as keyof typeof trial.answers] === value,
      );
      if (isCorrect) {
        correctTrials += 1;
        correctTrialsByMode[trial.mode] += 1;
      }
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
    schemaVersion: study.schemaVersion === "g5-spatial-comprehension-v2"
      ? ("g5-spatial-comprehension-summary-v2" as const)
      : ("g5-spatial-comprehension-summary-v1" as const),
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
    correctTrialsByMode,
    answerAccuracy: correctTrials / totalTrials,
    criticalMisinterpretationCount,
    slopeCorrectByMode,
    confusionCount,
    prefers2point5dCount,
    medianDurationMs: {
      twoD: median2dMs,
      demoTwoPointFiveD: median2point5dMs,
    },
    durationRatioTwoPointFiveDToTwoD: median2point5dMs / median2dMs,
    meanConfidenceByMode: {
      twoD:
        confidenceByMode.TWO_D.reduce((sum, value) => sum + value, 0) /
        confidenceByMode.TWO_D.length,
      demoTwoPointFiveD:
        confidenceByMode.DEMO_TWO_POINT_FIVE_D.reduce(
          (sum, value) => sum + value,
          0,
        ) / confidenceByMode.DEMO_TWO_POINT_FIVE_D.length,
    },
    unknownAnswerCountByMode,
    comprehensionPassed,
    twoPointFiveDSlopePassed,
    defaultPromotionEligible,
    note:
      "Independent human observations only; this result is not field-performance or accident-reduction evidence.",
  };
}
