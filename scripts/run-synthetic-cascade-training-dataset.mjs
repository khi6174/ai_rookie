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
  "cascade-explanations-v1",
);
const expectedOutputRoot = path.join(
  root,
  "data",
  "synthetic",
  "cascade-explanations-v1",
);
if (outputRoot !== expectedOutputRoot || !outputRoot.startsWith(path.join(root, "data", "synthetic"))) {
  throw new Error(`Unexpected dataset output path: ${outputRoot}`);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const vite = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await vite.ssrLoadModule(
    "/src/evals/syntheticCascadeTrainingDataset.ts",
  );
  const dataset = module.createSyntheticCascadeTrainingDataset();
  const validation = module.validateSyntheticCascadeTrainingDataset(dataset);
  if (!validation.passed) {
    throw new Error(
      `Synthetic Cascade training validation failed: ${JSON.stringify(validation.validationCodes)}`,
    );
  }

  const seedSpecPath = path.join(
    root,
    "data",
    "seed-specs",
    "synthetic-cascade-explanations-v1.json",
  );
  const seedSpecText = await readFile(seedSpecPath, "utf8");
  const seedSpec = JSON.parse(seedSpecText);
  if (
    seedSpec.seedSpecId !== dataset.seedSpecId ||
    seedSpec.datasetVersion !== dataset.datasetVersion ||
    seedSpec.recordCount !== dataset.records.length ||
    seedSpec.parentCount !== dataset.parents.length
  ) {
    throw new Error("Cascade seed specification does not match generated dataset");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const parentsText = `${dataset.parents.map((parent) => JSON.stringify(parent)).join("\n")}\n`;
  const parentsPath = path.join(outputRoot, "parents.jsonl");
  await writeFile(parentsPath, parentsText, "utf8");

  const files = [];
  for (const split of ["train", "validation", "frozen-test"]) {
    const records = dataset.records.filter((record) => record.split === split);
    const content = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
    const filePath = path.join(outputRoot, `${split}.jsonl`);
    await writeFile(filePath, content, "utf8");
    files.push({
      split,
      relativePath: path.relative(root, filePath).replaceAll(path.sep, "/"),
      parentCount: new Set(records.map((record) => record.parentRecordId)).size,
      recordCount: records.length,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
    });
  }

  const manifest = {
    schemaVersion: "synthetic-cascade-training-manifest-v1",
    datasetVersion: dataset.datasetVersion,
    generatorVersion: dataset.generatorVersion,
    generatedAt: dataset.generatedAt,
    seedSpecId: dataset.seedSpecId,
    seedSpecSha256: sha256(seedSpecText),
    dataMode: "SYNTHETIC",
    targetTask: "verified-role-explanation-strict-json",
    targetAuthority: "EXPLANATION_ONLY",
    validationStatus: "ACCEPTED",
    validationReportId: validation.reportId,
    counts: {
      parents: validation.parentCount,
      records: validation.recordCount,
      parentSplits: validation.parentSplitCounts,
      recordSplits: validation.splitCounts,
      roles: validation.roleCounts,
      scenarios: validation.scenarioCounts,
      promptInjectionCases: validation.promptInjectionCases,
    },
    privacy: {
      actualPersonalDataCount: 0,
      preciseLocationCount: 0,
      rawBiometricCount: 0,
      hostedApiOutputCount: 0,
      privacyViolationCount: validation.privacyViolationCount,
    },
    trainingBoundary: {
      safetyAuthority: "DETERMINISTIC_ENGINE_ONLY",
      hostedApiOutputUsedAsLabel: false,
      frozenSplitMayTuneModel: false,
      productIntegrationApproved: false,
    },
    limitations: validation.limitations,
    parents: {
      relativePath: path.relative(root, parentsPath).replaceAll(path.sep, "/"),
      count: dataset.parents.length,
      bytes: Buffer.byteLength(parentsText),
      sha256: sha256(parentsText),
    },
    files,
  };

  const manifestDirectory = path.join(root, "data", "manifests");
  await mkdir(manifestDirectory, { recursive: true });
  const manifestPath = path.join(
    manifestDirectory,
    "synthetic-cascade-explanations-v1.json",
  );
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, manifestText, "utf8");

  const evidence = {
    ...validation,
    capturedAt: new Date().toISOString(),
    generatorVersion: dataset.generatorVersion,
    seedSpecSha256: manifest.seedSpecSha256,
    manifestSha256: sha256(manifestText),
    datasetFiles: files,
    rawModelOutputStored: false,
    hostedApiOutputStored: false,
    acceptedDatasetStoredUnderDataDirectory: true,
  };
  const artifactDirectory = path.join(root, "artifacts", "evals");
  await mkdir(artifactDirectory, { recursive: true });
  const evidencePath = path.join(
    artifactDirectory,
    "synthetic-cascade-training-dataset-latest.json",
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(
    `SYNTHETIC_CASCADE_TRAINING_DATASET_PASS parents=${validation.parentCount} records=${validation.recordCount} ` +
      `train=${validation.splitCounts.train} validation=${validation.splitCounts.validation} ` +
      `frozen=${validation.splitCounts["frozen-test"]} injections=${validation.promptInjectionCases} ` +
      `privacyViolations=${validation.privacyViolationCount} duplicates=${validation.exactDuplicateCount}`,
  );
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Evidence: ${evidencePath}`);
} finally {
  await vite.close();
}
