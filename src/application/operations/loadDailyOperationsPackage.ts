import { z } from "zod";
import { DailyOperationsPackageSchema } from "../../domain/operations";

const CurrentDailyOperationsPackageResponseSchema = z
  .object({
    package: DailyOperationsPackageSchema,
    storage: z.enum(["D1", "MEMORY_DEV"]),
    sourceBundleId: z.string().min(3),
    rawDocumentsStored: z.literal(false),
  })
  .strict();

export type CurrentDailyOperationsPackageResult =
  | {
      status: "LOADED";
      operationsPackage: z.infer<typeof DailyOperationsPackageSchema>;
      storage: "D1" | "MEMORY_DEV";
      sourceBundleId: string;
    }
  | { status: "UNAVAILABLE"; message: string };

export async function loadCurrentDailyOperationsPackage(
  signal?: AbortSignal,
): Promise<CurrentDailyOperationsPackageResult> {
  try {
    const response = await fetch("/api/operations/days/current/package", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      return {
        status: "UNAVAILABLE",
        message: `합성 운영 DB 응답 오류: ${response.status}`,
      };
    }
    const parsed = CurrentDailyOperationsPackageResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      return {
        status: "UNAVAILABLE",
        message: "합성 운영 DB 응답 계약이 유효하지 않습니다.",
      };
    }
    return {
      status: "LOADED",
      operationsPackage: parsed.data.package,
      storage: parsed.data.storage,
      sourceBundleId: parsed.data.sourceBundleId,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return {
      status: "UNAVAILABLE",
      message: "합성 운영 DB에 연결할 수 없습니다.",
    };
  }
}
