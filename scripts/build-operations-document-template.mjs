import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(
  root,
  "data",
  "manifests",
  "synthetic-operations-documents-v1.json",
);
const outputPath = path.join(
  root,
  "public",
  "templates",
  "daily-operations-documents-2026-07-25-bundled-v1.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const extractedRecords = await Promise.all(
  manifest.parents.map(async (parent) =>
    JSON.parse(await readFile(path.join(root, parent.relativePath), "utf8")),
  ),
);
const documents = await Promise.all(
  manifest.documents.map(async (document) => ({
    schemaVersion: "operations-source-document-v1",
    documentId: document.documentId,
    parentRecordId: document.parentRecordId,
    documentKind: document.documentKind,
    sourceFormat: "MARKDOWN",
    mediaType: "text/markdown",
    dataMode: "SYNTHETIC",
    content: await readFile(path.join(root, document.relativePath), "utf8"),
    sha256: document.sha256,
  })),
);
const bundle = {
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
    model: manifest.generatorVersion,
    completedAt: manifest.generatedAt,
    validationStatus: "ACCEPTED",
    rawDocumentStored: false,
    rawOutputStored: false,
  },
  documents,
  extractedRecords,
};
const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
if (process.argv.includes("--verify")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== serialized) {
    console.error(
      "OPERATIONS_DOCUMENT_TEMPLATE_DRIFT: run pnpm run data:operations:document-template",
    );
    process.exitCode = 1;
  } else {
    console.log(
      `OPERATIONS_DOCUMENT_TEMPLATE_VERIFY_PASS documents=${documents.length} records=${extractedRecords.length}`,
    );
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(
    `OPERATIONS_DOCUMENT_TEMPLATE_BUILD_PASS documents=${documents.length} records=${extractedRecords.length}`,
  );
  console.log(`JSON: ${outputPath}`);
}
