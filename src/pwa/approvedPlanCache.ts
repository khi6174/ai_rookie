import { z } from "zod";

export const APPROVED_DEMO_PLAN_CACHE_KEY = "saferoute.approved-demo-plan.v1";
export const APPROVED_DEMO_PLAN_CACHE_TTL_MS = 30 * 60 * 1_000;

const CachedCourierPlanSchema = z.object({
  courierId: z.string().min(1),
  remainingStopCount: z.number().int().min(0),
}).strict();

export const CachedApprovedDemoPlanSchema = z.object({
  schemaVersion: z.literal("cached-approved-demo-plan-v1"),
  dataMode: z.literal("DEMO"),
  approvalState: z.literal("APPROVED_APPLIED"),
  decisionId: z.string().min(1),
  planId: z.string().min(1),
  planVersion: z.string().min(1),
  storedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  couriers: z.array(CachedCourierPlanSchema).min(1),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.storedAt)) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "expiresAt must be later than storedAt",
    });
  }
});

export type CachedApprovedDemoPlan = z.infer<typeof CachedApprovedDemoPlanSchema>;

export type CachedApprovedDemoPlanState =
  | { status: "EMPTY" }
  | { status: "INVALID"; reason: string }
  | { status: "EXPIRED"; plan: CachedApprovedDemoPlan }
  | { status: "FRESH"; plan: CachedApprovedDemoPlan };

export function createCachedApprovedDemoPlan(input: {
  decisionId: string;
  planId: string;
  planVersion: string;
  couriers: CachedApprovedDemoPlan["couriers"];
  storedAt?: Date;
  ttlMs?: number;
}) {
  const storedAt = input.storedAt ?? new Date();
  const ttlMs = input.ttlMs ?? APPROVED_DEMO_PLAN_CACHE_TTL_MS;
  return CachedApprovedDemoPlanSchema.parse({
    schemaVersion: "cached-approved-demo-plan-v1",
    dataMode: "DEMO",
    approvalState: "APPROVED_APPLIED",
    decisionId: input.decisionId,
    planId: input.planId,
    planVersion: input.planVersion,
    storedAt: storedAt.toISOString(),
    expiresAt: new Date(storedAt.getTime() + ttlMs).toISOString(),
    couriers: input.couriers,
  });
}

export function evaluateCachedApprovedDemoPlan(
  raw: unknown,
  now: Date = new Date(),
): CachedApprovedDemoPlanState {
  if (raw === null || raw === undefined || raw === "") return { status: "EMPTY" };

  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { status: "INVALID", reason: "MALFORMED_JSON" };
    }
  }

  const parsed = CachedApprovedDemoPlanSchema.safeParse(value);
  if (!parsed.success) return { status: "INVALID", reason: "SCHEMA_INVALID" };
  if (Date.parse(parsed.data.expiresAt) <= now.getTime()) {
    return { status: "EXPIRED", plan: parsed.data };
  }
  return { status: "FRESH", plan: parsed.data };
}

export function readCachedApprovedDemoPlan(
  storage?: Pick<Storage, "getItem">,
  now: Date = new Date(),
) {
  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!target) return { status: "EMPTY" } as const;
    return evaluateCachedApprovedDemoPlan(
      target.getItem(APPROVED_DEMO_PLAN_CACHE_KEY),
      now,
    );
  } catch {
    return { status: "INVALID", reason: "STORAGE_UNAVAILABLE" } as const;
  }
}

export function writeCachedApprovedDemoPlan(
  plan: CachedApprovedDemoPlan,
  storage?: Pick<Storage, "setItem">,
) {
  const validated = CachedApprovedDemoPlanSchema.parse(plan);
  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!target) return false;
    target.setItem(APPROVED_DEMO_PLAN_CACHE_KEY, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}

export function clearCachedApprovedDemoPlan(
  storage?: Pick<Storage, "removeItem">,
) {
  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!target) return false;
    target.removeItem(APPROVED_DEMO_PLAN_CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}
