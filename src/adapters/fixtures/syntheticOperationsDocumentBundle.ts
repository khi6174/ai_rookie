import {
  DailyOperationsDocumentBundleSchema,
  type DailyOperationsDocumentBundle,
} from "../../domain/operations";
import { bundledSyntheticOperationsRecords } from "./syntheticOperationsPackage";

const sourceDocumentModules = import.meta.glob(
  "../../../data/synthetic/operations-documents-v1/**/*.md",
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
) as Record<string, string>;

const manifestModules = import.meta.glob(
  "../../../data/manifests/synthetic-operations-documents-v1.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

type SyntheticOperationsManifest = {
  generatedAt: string;
  documents: Array<{
    documentId: string;
    parentRecordId: string;
    documentKind:
      | "DELIVERY_WORK_SHEET"
      | "SHIFT_ROSTER"
      | "ROUTE_STOP_MANIFEST"
      | "SAFETY_INCIDENT_PREVENTION_REPORT";
    relativePath: string;
    sha256: string;
  }>;
};

const manifest = Object.values(
  manifestModules,
)[0] as SyntheticOperationsManifest;

function sourceDocument(relativePath: string) {
  const matched = Object.entries(sourceDocumentModules).find(([modulePath]) =>
    modulePath.replaceAll("\\", "/").endsWith(relativePath),
  );
  if (!matched) {
    throw new Error(`Bundled source document is missing: ${relativePath}`);
  }
  return matched[1];
}

export const bundledDailyOperationsDocumentBundle: DailyOperationsDocumentBundle =
  DailyOperationsDocumentBundleSchema.parse({
    schemaVersion: "daily-operations-document-bundle-v1",
    bundleId: "daily-operations-documents-2026-07-25-bundled-v1",
    operationDate: "2026-07-25",
    evaluatedAt: "2026-07-25T18:00:00+09:00",
    timeZone: "Asia/Seoul",
    dataMode: "SYNTHETIC",
    source: "BUNDLED_SAMPLE",
    extraction: {
      provider: "SAFEROUTE",
      mode: "DETERMINISTIC",
      model: "deterministic-operations-document-generator-v1.0.0",
      completedAt: manifest.generatedAt,
      validationStatus: "ACCEPTED",
      rawDocumentStored: false,
      rawOutputStored: false,
    },
    documents: manifest.documents.map((document) => ({
      schemaVersion: "operations-source-document-v1",
      documentId: document.documentId,
      parentRecordId: document.parentRecordId,
      documentKind: document.documentKind,
      sourceFormat: "MARKDOWN",
      mediaType: "text/markdown",
      dataMode: "SYNTHETIC",
      content: sourceDocument(document.relativePath),
      sha256: document.sha256,
    })),
    extractedRecords: bundledSyntheticOperationsRecords,
  });
