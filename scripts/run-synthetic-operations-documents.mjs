import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";

const root = process.cwd();
const outputRoot = path.resolve(
  root,
  "data",
  "synthetic",
  "operations-documents-v1",
);
const expectedOutputRoot = path.join(
  root,
  "data",
  "synthetic",
  "operations-documents-v1",
);
if (outputRoot !== expectedOutputRoot) {
  throw new Error(`Unexpected dataset output path: ${outputRoot}`);
}

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const documentFileName = {
  DELIVERY_WORK_SHEET: "delivery-work-sheet.md",
  SHIFT_ROSTER: "shift-roster.md",
  ROUTE_STOP_MANIFEST: "route-stop-manifest.md",
  SAFETY_INCIDENT_PREVENTION_REPORT: "safety-incident-prevention-report.md",
};

const vite = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await vite.ssrLoadModule(
    "/src/evals/syntheticOperationsDocuments.ts",
  );
  const dataset = module.createSyntheticOperationsDataset();
  const validation = module.validateSyntheticOperationsDataset(dataset);
  if (!validation.passed) {
    throw new Error(
      `Synthetic operations validation failed: ${JSON.stringify(
        validation.validationCodes,
      )}`,
    );
  }

  const seedSpecPath = path.join(
    root,
    "data",
    "seed-specs",
    "synthetic-operations-documents-v1.json",
  );
  const seedSpec = await readFile(seedSpecPath, "utf8");
  const seedSpecParsed = JSON.parse(seedSpec);
  if (seedSpecParsed.seedSpecId !== dataset.seedSpecId) {
    throw new Error("Seed specification does not match generated dataset");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const parentManifestEntries = [];
  const documentManifestEntries = [];
  for (const parent of dataset.parents) {
    const parentDirectory = path.join(
      outputRoot,
      parent.split,
      parent.parentRecordId,
    );
    await mkdir(parentDirectory, { recursive: true });
    const sourceRecord = `${JSON.stringify(parent, null, 2)}\n`;
    const sourcePath = path.join(parentDirectory, "source-record.json");
    await writeFile(sourcePath, sourceRecord, "utf8");
    parentManifestEntries.push({
      parentRecordId: parent.parentRecordId,
      split: parent.split,
      scenario: parent.scenario,
      seed: parent.seed,
      relativePath: path
        .relative(root, sourcePath)
        .replaceAll(path.sep, "/"),
      sha256: sha256(sourceRecord),
    });
    for (const document of dataset.documents.filter(
      (candidate) => candidate.parentRecordId === parent.parentRecordId,
    )) {
      const documentPath = path.join(
        parentDirectory,
        documentFileName[document.documentKind],
      );
      await writeFile(documentPath, document.content, "utf8");
      documentManifestEntries.push({
        documentId: document.documentId,
        parentRecordId: document.parentRecordId,
        split: document.split,
        documentKind: document.documentKind,
        seed: document.seed,
        containsUntrustedInstruction:
          document.containsUntrustedInstruction,
        relativePath: path
          .relative(root, documentPath)
          .replaceAll(path.sep, "/"),
        sha256: sha256(document.content),
      });
    }
  }

  const manifest = {
    schemaVersion: "synthetic-operations-dataset-manifest-v1",
    datasetVersion: dataset.datasetVersion,
    generatedAt: dataset.generatedAt,
    seedSpecId: dataset.seedSpecId,
    seedSpecSha256: sha256(seedSpec),
    generatorVersion: module.syntheticOperationsGeneratorVersion,
    dataMode: "SYNTHETIC",
    validationStatus: "ACCEPTED",
    validationReportId: validation.reportId,
    counts: {
      parents: validation.parentCount,
      documents: validation.documentCount,
      splits: validation.splitCounts,
      documentKinds: validation.documentKindCounts,
      scenarios: validation.scenarioCounts,
      promptInjectionCases: validation.promptInjectionCases,
    },
    privacy: {
      actualPersonalDataCount: 0,
      preciseLocationCount: 0,
      rawBiometricCount: 0,
      privacyViolationCount: validation.privacyViolationCount,
    },
    limitations: validation.limitations,
    parents: parentManifestEntries,
    documents: documentManifestEntries,
  };

  const manifestDirectory = path.join(root, "data", "manifests");
  await mkdir(manifestDirectory, { recursive: true });
  const manifestPath = path.join(
    manifestDirectory,
    "synthetic-operations-documents-v1.json",
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const capturedAt = new Date().toISOString();
  const evidence = {
    ...validation,
    capturedAt,
    generatorVersion: module.syntheticOperationsGeneratorVersion,
    seedSpecSha256: manifest.seedSpecSha256,
    manifestSha256: sha256(JSON.stringify(manifest)),
    rawDocumentStoredInEvidence: false,
    acceptedDatasetStoredUnderDataDirectory: true,
  };
  const artifactDirectory = path.join(root, "artifacts", "evals");
  await mkdir(artifactDirectory, { recursive: true });
  const latestJsonPath = path.join(
    artifactDirectory,
    "synthetic-operations-documents-latest.json",
  );
  const latestCsvPath = path.join(
    artifactDirectory,
    "synthetic-operations-documents-latest.csv",
  );
  const header = [
    "documentId",
    "parentRecordId",
    "split",
    "documentKind",
    "seed",
    "containsUntrustedInstruction",
    "sha256",
  ];
  const rows = documentManifestEntries.map((entry) =>
    header.map((key) => csvCell(entry[key])).join(","),
  );
  await writeFile(
    latestJsonPath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    latestCsvPath,
    `${[header.join(","), ...rows].join("\n")}\n`,
    "utf8",
  );

  const runDirectory = path.join(
    artifactDirectory,
    "synthetic-operations-document-runs",
    `${capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-")}-deterministic`,
  );
  await mkdir(path.dirname(runDirectory), { recursive: true });
  await mkdir(runDirectory, { recursive: false });
  await writeFile(
    path.join(runDirectory, path.basename(latestJsonPath)),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(runDirectory, path.basename(latestCsvPath)),
    `${[header.join(","), ...rows].join("\n")}\n`,
    "utf8",
  );

  console.log(
    `SYNTHETIC_OPERATIONS_DOCUMENTS_PASS parents=${validation.parentCount} ` +
      `documents=${validation.documentCount} development=${validation.splitCounts.development} ` +
      `validation=${validation.splitCounts.validation} frozen=${validation.splitCounts["frozen-test"]} ` +
      `privacyViolations=${validation.privacyViolationCount} duplicates=${validation.exactDuplicateCount}`,
  );
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Evidence: ${latestJsonPath}`);
  console.log(`Immutable run: ${runDirectory}`);
} finally {
  await vite.close();
}
