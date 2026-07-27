import {
  DailyOperationsPackageSchema,
  SyntheticOperationsParentRecordSchema,
  type DailyOperationsPackage,
  type SyntheticOperationsParentRecord,
} from "../../domain/operations";

const sourceRecordModules = import.meta.glob(
  "../../../data/synthetic/operations-documents-v1/**/source-record.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

function sourceRecordNumber(record: SyntheticOperationsParentRecord) {
  return Number(record.parentRecordId.split("-").at(-1));
}

export const bundledSyntheticOperationsRecords = Object.values(
  sourceRecordModules,
)
  .map((record) => SyntheticOperationsParentRecordSchema.parse(record))
  .sort((left, right) => sourceRecordNumber(left) - sourceRecordNumber(right));

export const bundledDailyOperationsPackage: DailyOperationsPackage =
  DailyOperationsPackageSchema.parse({
    schemaVersion: "daily-operations-package-v1",
    packageId:
      "daily-operations-documents-2026-07-25-bundled-v1-normalized",
    operationDate: "2026-07-25",
    evaluatedAt: "2026-07-25T18:00:00+09:00",
    timeZone: "Asia/Seoul",
    dataMode: "SYNTHETIC",
    source: "BUNDLED_SAMPLE",
    records: bundledSyntheticOperationsRecords,
  });
