import {
  SafetyBudgetSnapshotSchema,
  type SafetyBudgetSnapshot,
} from "../../domain/contracts";
import type { DailyOperationsSnapshot } from "../../domain/operations";
import { evaluateValidatedSafetyBudget } from "../../domain/safety";
import { z } from "zod";

export const CourierSupportStateSchema = z.enum([
  "BREACHED",
  "SUPPORT_NEEDED",
  "MONITOR",
  "STABLE",
  "INSUFFICIENT_DATA",
]);

export const CourierOperationsEvaluationSchema = z
  .object({
    courierId: z.string().min(3),
    planId: z.string().min(3),
    snapshotId: z.string().min(3),
    decisionId: z.string().min(3).optional(),
    supportState: CourierSupportStateSchema,
    supportReason: z.enum([
      "ALREADY_BREACHED",
      "FUTURE_BREACH_PREDICTED",
      "FORECAST_SUPPORT_BAND",
      "CURRENT_SUPPORT_BAND",
      "CAUTION_MONITORING",
      "NO_SUPPORT_REQUIRED",
      "MISSING_REQUIRED_INPUT",
    ]),
    safety: SafetyBudgetSnapshotSchema,
  })
  .strict();

export const SupportQueueItemSchema = z
  .object({
    decisionId: z.string().min(3),
    courierId: z.string().min(3),
    planId: z.string().min(3),
    snapshotId: z.string().min(3),
    supportState: z.enum(["BREACHED", "SUPPORT_NEEDED"]),
    currentBudget: z.number().finite().min(0).max(100),
    timeToBreachMinutes: z.number().finite().min(0).optional(),
    breachStopId: z.string().min(3).optional(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    missingInputCount: z.number().int().min(0),
    queuePosition: z.number().int().min(1),
  })
  .strict();

export const FleetEvaluationSchema = z
  .object({
    schemaVersion: z.literal("fleet-evaluation-v1"),
    snapshotId: z.string().min(3),
    snapshotVersion: z.string().min(1),
    evaluatedAt: z.string().datetime({ offset: true }),
    courierCount: z.number().int().min(1),
    supportDecisionCount: z.number().int().min(0),
    monitorCount: z.number().int().min(0),
    stableCount: z.number().int().min(0),
    insufficientDataCount: z.number().int().min(0),
    evaluations: z.array(CourierOperationsEvaluationSchema).min(1),
    supportQueue: z.array(SupportQueueItemSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.courierCount !== value.evaluations.length) {
      context.addIssue({
        code: "custom",
        path: ["courierCount"],
        message: "Courier count must match evaluations",
      });
    }
    if (value.supportDecisionCount !== value.supportQueue.length) {
      context.addIssue({
        code: "custom",
        path: ["supportDecisionCount"],
        message: "Support decision count must match the queue",
      });
    }
    if (
      value.supportQueue.some(
        (item, index) => item.queuePosition !== index + 1,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["supportQueue"],
        message: "Support queue positions must be sequential",
      });
    }
  });

export type CourierSupportState = z.infer<typeof CourierSupportStateSchema>;
export type CourierOperationsEvaluation = z.infer<
  typeof CourierOperationsEvaluationSchema
>;
export type SupportQueueItem = z.infer<typeof SupportQueueItemSchema>;
export type FleetEvaluation = z.infer<typeof FleetEvaluationSchema>;

function classifySupport(safety: SafetyBudgetSnapshot): {
  supportState: CourierSupportState;
  supportReason: CourierOperationsEvaluation["supportReason"];
} {
  if (safety.breach.status === "INSUFFICIENT_DATA") {
    return {
      supportState: "INSUFFICIENT_DATA",
      supportReason: "MISSING_REQUIRED_INPUT",
    };
  }
  if (
    safety.breach.status === "ALREADY_BREACHED" ||
    safety.currentBand === "BREACHED"
  ) {
    return {
      supportState: "BREACHED",
      supportReason: "ALREADY_BREACHED",
    };
  }
  if (safety.breach.status === "PREDICTED") {
    return {
      supportState: "SUPPORT_NEEDED",
      supportReason: "FUTURE_BREACH_PREDICTED",
    };
  }
  if (
    safety.minimumForecastBudget !== undefined &&
    safety.minimumForecastBudget < 45
  ) {
    return {
      supportState: "SUPPORT_NEEDED",
      supportReason: "FORECAST_SUPPORT_BAND",
    };
  }
  if (safety.currentBand === "SUPPORT_NEEDED") {
    return {
      supportState: "SUPPORT_NEEDED",
      supportReason: "CURRENT_SUPPORT_BAND",
    };
  }
  if (safety.currentBand === "CAUTION") {
    return {
      supportState: "MONITOR",
      supportReason: "CAUTION_MONITORING",
    };
  }
  return {
    supportState: "STABLE",
    supportReason: "NO_SUPPORT_REQUIRED",
  };
}

function decisionIdFor(snapshot: DailyOperationsSnapshot, courierId: string) {
  return `decision-${snapshot.packageHash.slice(0, 10)}-${courierId}`;
}

function queueSeverity(item: Omit<SupportQueueItem, "queuePosition">) {
  return item.supportState === "BREACHED" ? 0 : 1;
}

export function evaluateOperationsFleet(
  snapshot: DailyOperationsSnapshot,
): FleetEvaluation {
  const fixture = snapshot.fixture;
  const workloadsByCourier = new Map(
    fixture.workloads.map((workload) => [
      workload.courierId,
      workload,
    ]),
  );
  const stopsByCourier = new Map<string, typeof fixture.stops>();
  for (const stop of fixture.stops) {
    const current = stopsByCourier.get(stop.assignedCourierId) ?? [];
    current.push(stop);
    stopsByCourier.set(stop.assignedCourierId, current);
  }
  const routesByCourier = new Map<string, typeof fixture.routeSegments>();
  for (const [courierId, stops] of stopsByCourier) {
    const stopIds = new Set(stops.map((stop) => stop.stopId));
    routesByCourier.set(
      courierId,
      fixture.routeSegments.filter((segment) =>
        stopIds.has(segment.toStopId),
      ),
    );
  }
  const evaluations: CourierOperationsEvaluation[] =
    fixture.couriers.map((courier) => {
      const workload = workloadsByCourier.get(courier.courierId);
      if (!workload) {
        throw new Error(`Missing workload for ${courier.courierId}`);
      }
      const courierStops = stopsByCourier.get(courier.courierId) ?? [];
      const areaIds = new Set(courierStops.map((stop) => stop.areaId));
      const courierFixture = {
        ...fixture,
        couriers: [courier],
        workloads: [workload],
        stops: courierStops,
        routeSegments:
          routesByCourier.get(courier.courierId) ?? [],
        weatherTimeline: fixture.weatherTimeline.filter((weather) =>
          areaIds.has(weather.areaId),
        ),
        areaRiskProfiles: fixture.areaRiskProfiles.filter((profile) =>
          areaIds.has(profile.areaId),
        ),
        initialSafetyStates: fixture.initialSafetyStates?.filter(
          (state) => state.courierId === courier.courierId,
        ),
      };
      const safety = evaluateValidatedSafetyBudget(
        courierFixture,
        courier.courierId,
      );
      const classification = classifySupport(safety);
      const decisionId = ["BREACHED", "SUPPORT_NEEDED"].includes(
        classification.supportState,
      )
        ? decisionIdFor(snapshot, courier.courierId)
        : undefined;
      return CourierOperationsEvaluationSchema.parse({
        courierId: courier.courierId,
        planId: workload.planId,
        snapshotId: snapshot.snapshotId,
        decisionId,
        ...classification,
        safety,
      });
    });

  const unorderedQueue = evaluations
    .filter(
      (
        evaluation,
      ): evaluation is CourierOperationsEvaluation & {
        decisionId: string;
        supportState: "BREACHED" | "SUPPORT_NEEDED";
      } =>
        evaluation.decisionId !== undefined &&
        ["BREACHED", "SUPPORT_NEEDED"].includes(evaluation.supportState),
    )
    .map((evaluation) => ({
      decisionId: evaluation.decisionId,
      courierId: evaluation.courierId,
      planId: evaluation.planId,
      snapshotId: snapshot.snapshotId,
      supportState: evaluation.supportState,
      currentBudget: evaluation.safety.currentBudget,
      timeToBreachMinutes:
        evaluation.safety.breach.status === "PREDICTED"
          ? evaluation.safety.breach.timeToBreachMinutes
          : undefined,
      breachStopId:
        evaluation.safety.breach.status === "PREDICTED"
          ? evaluation.safety.breach.stopId
          : undefined,
      confidence: evaluation.safety.confidence,
      missingInputCount: evaluation.safety.missingInputs.length,
    }));
  unorderedQueue.sort((left, right) => {
    const severityDifference = queueSeverity(left) - queueSeverity(right);
    if (severityDifference !== 0) return severityDifference;
    const leftTime = left.timeToBreachMinutes ?? Number.NEGATIVE_INFINITY;
    const rightTime = right.timeToBreachMinutes ?? Number.NEGATIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.currentBudget !== right.currentBudget) {
      return left.currentBudget - right.currentBudget;
    }
    return left.courierId.localeCompare(right.courierId);
  });
  const supportQueue = unorderedQueue.map((item, index) =>
    SupportQueueItemSchema.parse({
      ...item,
      queuePosition: index + 1,
    }),
  );

  return FleetEvaluationSchema.parse({
    schemaVersion: "fleet-evaluation-v1",
    snapshotId: snapshot.snapshotId,
    snapshotVersion: snapshot.snapshotVersion,
    evaluatedAt: snapshot.evaluatedAt,
    courierCount: evaluations.length,
    supportDecisionCount: supportQueue.length,
    monitorCount: evaluations.filter(
      (evaluation) => evaluation.supportState === "MONITOR",
    ).length,
    stableCount: evaluations.filter(
      (evaluation) => evaluation.supportState === "STABLE",
    ).length,
    insufficientDataCount: evaluations.filter(
      (evaluation) => evaluation.supportState === "INSUFFICIENT_DATA",
    ).length,
    evaluations,
    supportQueue,
  });
}
