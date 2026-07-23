import { z } from "zod";

const directIdentifierPattern =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b)/i;

const ReviewerSchema = z.object({
  reviewerId: z.string().regex(/^reviewer-[0-9]{2}$/),
  consentConfirmed: z.literal(true),
  durationMs: z.number().int().positive(),
  confidence: z.number().int().min(1).max(5),
  answers: z.object({
    currentSegment: z.enum([
      "FOURTEENTH_DELIVERY_SEGMENT",
      "OTHER",
      "UNKNOWN",
    ]),
    nextSafetyStop: z.enum([
      "TEN_MINUTE_REST",
      "NEXT_DELIVERY_ONLY",
      "UNKNOWN",
    ]),
    supportBoundary: z.enum([
      "BEFORE_SEVENTEENTH_DELIVERY",
      "AFTER_SEVENTEENTH_DELIVERY",
      "UNKNOWN",
    ]),
    productRole: z.enum([
      "SAFETY_OPERATION_DECISION_LAYER",
      "LIVE_NAVIGATION_AND_DISPATCH",
      "ACCIDENT_DETECTION_AND_RESCUE",
      "UNKNOWN",
    ]),
    approvalRule: z.enum([
      "RIDER_AND_ADMIN_REQUIRED",
      "AUTOMATIC_APPLY",
      "ADMIN_ONLY",
      "UNKNOWN",
    ]),
    demoBoundary: z.enum([
      "DEMO_ROUTE_NO_LIVE_GPS",
      "LIVE_GPS_TURN_BY_TURN",
      "UNKNOWN",
    ]),
  }).strict(),
  comment: z.string().trim().max(500).refine(
    (value) => !directIdentifierPattern.test(value),
    "comment must not contain an email address or mobile phone number",
  ),
}).strict();

const RiderReferenceComprehensionStudyV1Schema = z.object({
  schemaVersion: z.literal("rider-reference-comprehension-v1"),
  studyId: z.literal("rider-route-product-boundary-001"),
  dataMode: z.literal("DEMO"),
  stimulusManifest: z.literal(
    "artifacts/evals/rider-reference-stimulus-manifest.json",
  ),
  reviewers: z.array(ReviewerSchema).min(5),
}).strict();

const RiderReferenceComprehensionStudyV2Schema = z.object({
  schemaVersion: z.literal("rider-reference-comprehension-v2"),
  studyId: z.literal("rider-route-product-boundary-round2-001"),
  dataMode: z.literal("DEMO"),
  stimulusManifest: z.literal(
    "artifacts/evals/rider-reference-round2-stimulus-manifest.json",
  ),
  reviewers: z.array(ReviewerSchema).min(5),
}).strict();

export const RiderReferenceComprehensionStudySchema = z.discriminatedUnion(
  "schemaVersion",
  [
    RiderReferenceComprehensionStudyV1Schema,
    RiderReferenceComprehensionStudyV2Schema,
  ],
).superRefine((study, context) => {
  if (new Set(study.reviewers.map(({ reviewerId }) => reviewerId)).size !== study.reviewers.length) {
    context.addIssue({
      code: "custom",
      message: "reviewerId values must be unique",
      path: ["reviewers"],
    });
  }
});

export type RiderReferenceComprehensionStudy = z.infer<
  typeof RiderReferenceComprehensionStudySchema
>;

const expectedAnswers = Object.freeze({
  currentSegment: "FOURTEENTH_DELIVERY_SEGMENT",
  nextSafetyStop: "TEN_MINUTE_REST",
  supportBoundary: "BEFORE_SEVENTEENTH_DELIVERY",
  productRole: "SAFETY_OPERATION_DECISION_LAYER",
  approvalRule: "RIDER_AND_ADMIN_REQUIRED",
  demoBoundary: "DEMO_ROUTE_NO_LIVE_GPS",
});

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function evaluateRiderReferenceComprehension(input: unknown) {
  const study = RiderReferenceComprehensionStudySchema.parse(input);
  const questionCount = Object.keys(expectedAnswers).length;
  let correctAnswerCount = 0;
  let fullyCorrectReviewerCount = 0;
  let criticalMisconceptionCount = 0;
  const durations: number[] = [];
  const confidence: number[] = [];

  for (const reviewer of study.reviewers) {
    durations.push(reviewer.durationMs);
    confidence.push(reviewer.confidence);
    const answers = Object.entries(expectedAnswers).map(
      ([key, value]) => reviewer.answers[key as keyof typeof reviewer.answers] === value,
    );
    const reviewerCorrectCount = answers.filter(Boolean).length;
    correctAnswerCount += reviewerCorrectCount;
    if (reviewerCorrectCount === questionCount) fullyCorrectReviewerCount += 1;
    if (
      reviewer.answers.productRole !== expectedAnswers.productRole ||
      reviewer.answers.approvalRule !== expectedAnswers.approvalRule ||
      reviewer.answers.demoBoundary !== expectedAnswers.demoBoundary
    ) {
      criticalMisconceptionCount += 1;
    }
  }

  const totalAnswerCount = study.reviewers.length * questionCount;
  const taskAccuracy = correctAnswerCount / totalAnswerCount;
  const fullyCorrectReviewerRate = fullyCorrectReviewerCount / study.reviewers.length;
  const comprehensionPassed =
    taskAccuracy >= 0.8 &&
    fullyCorrectReviewerRate >= 0.7 &&
    criticalMisconceptionCount === 0;

  return {
    schemaVersion: study.schemaVersion === "rider-reference-comprehension-v2"
      ? ("rider-reference-comprehension-summary-v2" as const)
      : ("rider-reference-comprehension-summary-v1" as const),
    studyId: study.studyId,
    dataMode: study.dataMode,
    status: comprehensionPassed
      ? ("READY_TO_PROMOTE" as const)
      : ("NEEDS_REVISION" as const),
    reviewerCount: study.reviewers.length,
    questionCount,
    totalAnswerCount,
    correctAnswerCount,
    taskAccuracy,
    fullyCorrectReviewerCount,
    fullyCorrectReviewerRate,
    criticalMisconceptionCount,
    medianDurationMs: median(durations),
    meanConfidence:
      confidence.reduce((sum, value) => sum + value, 0) / confidence.length,
    comprehensionPassed,
    note:
      "Independent comprehension observations only; this is not live-navigation, field-performance, or accident-reduction evidence.",
  };
}
