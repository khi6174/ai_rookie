import { z } from "zod";

const finite = z.number().finite();

export const ScenarioPlanningInputSchema = z
  .object({
    schemaVersion: z.literal("scenario-planning-input-v1"),
    preset: z.enum(["CUSTOM", "RAIN_HILL", "HEAT_STAIRS", "NIGHT_UNFAMILIAR"]),
    remainingStopCount: z.number().int().min(4).max(40),
    shiftElapsedHours: finite.min(1).max(11),
    continuousWorkHours: finite.min(0.25).max(5),
    currentSafetyBudget: finite.min(25).max(90),
    recipientSafetyBudget: finite.min(45).max(95),
    rainfallMmPerHour: finite.min(0).max(20),
    feelsLikeCelsius: finite.min(-15).max(45),
    visibilityMeters: finite.min(500).max(20_000),
    uphillGradePct: finite.min(0).max(20),
    narrowRoadFactor: finite.min(0).max(1),
    parkingDifficultyFactor: finite.min(0).max(1),
    stairStopRatio: finite.min(0).max(1),
    areaFamiliarity: z.enum(["FAMILIAR", "PARTIAL", "UNFAMILIAR"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.continuousWorkHours > value.shiftElapsedHours) {
      context.addIssue({
        code: "custom",
        path: ["continuousWorkHours"],
        message: "연속 작업시간은 총 근무시간을 넘을 수 없습니다.",
      });
    }
  });

export const ScenarioPlanningAlternativeSchema = z
  .object({
    candidateId: z.string().min(3),
    label: z.string().min(1),
    actionKinds: z.array(
      z.enum(["REST", "TRANSFER_STOPS", "REORDER_STOPS", "SAFER_ROUTE", "SAFE_DELAY"]),
    ).min(1),
    feasibility: z.enum(["FEASIBLE", "INFEASIBLE", "INSUFFICIENT_DATA"]),
    candidateMinimumBudget: finite.min(0).max(100),
    safetyGain: finite.optional(),
    etaDeltaMinutes: finite,
    recipientMinimumBudget: finite.min(0).max(100).optional(),
    reasonCodes: z.array(z.string().min(1)),
    recommended: z.boolean(),
  })
  .strict();

export const ScenarioPlanningResultSchema = z
  .object({
    schemaVersion: z.literal("scenario-planning-result-v1"),
    scenarioId: z.string().min(3),
    dataMode: z.literal("USER_ENTERED_SIMULATION"),
    evaluatedAt: z.string().datetime({ offset: true }),
    baseline: z
      .object({
        currentBudget: finite.min(0).max(100),
        minimumForecastBudget: finite.min(0).max(100),
        currentBand: z.enum(["STABLE", "CAUTION", "SUPPORT_NEEDED", "BREACHED"]),
        breachStatus: z.enum([
          "PREDICTED",
          "NO_BREACH_IN_HORIZON",
          "ALREADY_BREACHED",
          "INSUFFICIENT_DATA",
        ]),
        timeToBreachMinutes: finite.min(0).nullable(),
        breachStopOrdinal: z.number().int().min(1).nullable(),
        confidenceScore: finite.min(0).max(100),
        confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
        contributions: z.array(
          z.object({
            category: z.enum(["DRIVER", "TASK", "ROUTE", "WEATHER", "INTERACTION", "RECOVERY"]),
            consumed: finite.min(0),
            recovered: finite.min(0),
          }).strict(),
        ),
      })
      .strict(),
    alternatives: z.array(ScenarioPlanningAlternativeSchema).min(1),
    recommendationStatus: z.enum(["RECOMMENDED", "NO_SAFE_OPTION"]),
    recommendedCandidateId: z.string().min(3).nullable(),
    sources: z
      .object({
        safetyInputs: z.tuple([
          z.literal("USER_ENTERED"),
          z.literal("DETERMINISTIC_SYNTHETIC_REFERENCE"),
        ]),
        publicWeatherEvidence: z.literal("PARTIAL_CONTEXT_ONLY"),
        publicWeatherEvidenceCapturedAt: z.string().datetime({ offset: true }),
        publicWeatherReadyFieldCount: z.literal(8),
        publicWeatherBlockingFieldCount: z.literal(2),
        publicWeatherUsedForSafety: z.literal(false),
        mapUsedForSafety: z.literal(false),
        aiUsedForNumericPrediction: z.literal(false),
        actualTmsConnected: z.literal(false),
        actualCourierConnected: z.literal(false),
        actualPersonalDataIncluded: z.literal(false),
        networkWritePerformed: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type ScenarioPlanningInput = z.infer<typeof ScenarioPlanningInputSchema>;
export type ScenarioPlanningResult = z.infer<typeof ScenarioPlanningResultSchema>;
