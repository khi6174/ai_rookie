import { z } from "zod";

export const DEMO_RIDER_DANGER_SIGNAL_EVENT =
  "saferoute:rider-danger-signal";
export const DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY =
  "saferoute:demo-rider-danger-signal:v1";

const demoRiderDangerSignalSchema = z.object({
  schemaVersion: z.literal("demo-rider-danger-signal-v1"),
  courierId: z.string().regex(/^(?:R-\d{3}|demo-courier-\d{3})$/),
  label: z.string().trim().min(1).max(40),
  receivedAt: z.string().regex(/^\d{2}:\d{2}$/),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  source: z.literal("SYNTHETIC_RIDER_APP"),
});

const demoRiderDangerSignalCollectionSchema = z.object({
  schemaVersion: z.literal("demo-rider-danger-signal-collection-v1"),
  signals: z.array(demoRiderDangerSignalSchema),
  version: z.string().min(1),
  storage: z.enum(["D1", "MEMORY_DEV"]),
});

export type DemoRiderDangerSignal = z.infer<
  typeof demoRiderDangerSignalSchema
>;

type StorageBoundary = Pick<Storage, "getItem" | "setItem">;

function timeLabel(now: Date) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

export function parseDemoRiderDangerSignal(value: unknown) {
  const parsed = demoRiderDangerSignalSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function loadDemoRiderDangerSignal(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
) {
  try {
    const stored = storage.getItem(
      DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY,
    );
    if (!stored) return undefined;
    const signal = parseDemoRiderDangerSignal(JSON.parse(stored));
    if (!signal || Date.parse(signal.expiresAt) <= now) return undefined;
    return signal;
  } catch {
    return undefined;
  }
}

export function publishDemoRiderDangerSignal(input: {
  courierId: string;
  label?: string;
  now?: Date;
  storage?: StorageBoundary;
  eventTarget?: EventTarget;
}) {
  const now = input.now ?? new Date();
  const signal = demoRiderDangerSignalSchema.parse({
    schemaVersion: "demo-rider-danger-signal-v1",
    courierId: input.courierId,
    label: input.label ?? "앱 감지 위험 신호",
    receivedAt: timeLabel(now),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    source: "SYNTHETIC_RIDER_APP",
  });

  let persisted = false;
  if (input.storage) {
    try {
      input.storage.setItem(
        DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY,
        JSON.stringify(signal),
      );
      persisted = true;
    } catch {
      persisted = false;
    }
  }

  input.eventTarget?.dispatchEvent(
    new CustomEvent(DEMO_RIDER_DANGER_SIGNAL_EVENT, {
      detail: signal,
    }),
  );

  return { signal, persisted };
}

export async function saveDemoRiderDangerSignal(
  signal: DemoRiderDangerSignal,
  requestSignal?: AbortSignal,
) {
  const validated = demoRiderDangerSignalSchema.parse(signal);
  const response = await fetch(
    `/api/operations/danger-signals/${encodeURIComponent(validated.courierId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "demo-rider-danger-signal-command-v1",
        courierId: validated.courierId,
        source: validated.source,
      }),
      signal: requestSignal,
    },
  );
  if (!response.ok) {
    throw new Error(`응급 합성 신호 저장 실패 (${response.status})`);
  }
  const body = (await response.json()) as { signal?: unknown };
  const storedSignal = parseDemoRiderDangerSignal(body.signal);
  if (!storedSignal) {
    throw new Error("응급 합성 신호 저장 응답이 계약과 다릅니다.");
  }
  return storedSignal;
}

export async function loadDemoRiderDangerSignalsFromOperationsStore(options?: {
  etag?: string;
  signal?: AbortSignal;
}) {
  const response = await fetch("/api/operations/danger-signals", {
    headers: options?.etag ? { "If-None-Match": options.etag } : undefined,
    signal: options?.signal,
    cache: "no-store",
  });
  if (response.status === 304) {
    return { status: "NOT_MODIFIED" as const, etag: options?.etag };
  }
  if (!response.ok) {
    throw new Error(`응급 합성 신호 조회 실패 (${response.status})`);
  }
  const parsed = demoRiderDangerSignalCollectionSchema.parse(
    await response.json(),
  );
  return {
    status: "LOADED" as const,
    signals: parsed.signals,
    etag: response.headers.get("ETag") ?? undefined,
    storage: parsed.storage,
  };
}
