import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";

const root = process.cwd();
if (!process.argv.includes("--mock")) {
  throw new Error(
    "Only --mock is enabled. Live Document Parse and Information Extract require explicit paid-API approval.",
  );
}

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const vite = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await vite.ssrLoadModule(
    "/src/evals/upstageDocumentRoundtrip.ts",
  );
  const cases = module.createUpstageDocumentRoundtripCorpus();
  const run = await module.runUpstageDocumentRoundtrip({
    provider: module.createUpstageDocumentRoundtripMockProvider(),
    cases,
  });
  const sourceHashes = new Map(
    cases.map((testCase) => [
      testCase.caseId,
      createHash("sha256").update(testCase.sourceText).digest("hex"),
    ]),
  );
  const artifact = {
    ...run,
    results: run.results.map((result) => ({
      ...result,
      sourceSha256: sourceHashes.get(result.caseId),
    })),
  };
  const outputDirectory = path.join(root, "artifacts", "evals");
  const latestJsonPath = path.join(
    outputDirectory,
    "upstage-document-roundtrip-mock-latest.json",
  );
  const latestCsvPath = path.join(
    outputDirectory,
    "upstage-document-roundtrip-mock-latest.csv",
  );
  const runTimestamp = run.capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-");
  const immutableDirectory = path.join(
    outputDirectory,
    "upstage-document-roundtrip-runs",
    `${runTimestamp}-mock`,
  );
  await mkdir(path.dirname(immutableDirectory), { recursive: true });
  await mkdir(immutableDirectory, { recursive: false });
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const header = [
    "caseId",
    "documentId",
    "hazardType",
    "documentKind",
    "seed",
    "status",
    "passed",
    "validationCode",
    "containsUntrustedInstruction",
    "sourceExcerptVerified",
    "sourceSha256",
    "rawDocumentStored",
    "rawOutputStored",
  ];
  const rows = artifact.results.map((result) =>
    header.map((key) => csvCell(result[key])).join(","),
  );
  const csv = `${[header.join(","), ...rows].join("\n")}\n`;
  await writeFile(latestJsonPath, serialized, "utf8");
  await writeFile(latestCsvPath, csv, "utf8");
  await writeFile(
    path.join(immutableDirectory, path.basename(latestJsonPath)),
    serialized,
    "utf8",
  );
  await writeFile(
    path.join(immutableDirectory, path.basename(latestCsvPath)),
    csv,
    "utf8",
  );
  console.log(
    `UPSTAGE_DOCUMENT_ROUNDTRIP_MOCK_PASS cases=${run.caseCount} passed=${run.metrics.passed} ` +
      `hazards=${run.metrics.hazardCoverage} documentKinds=${run.metrics.documentKindCoverage} ` +
      `untrusted=${run.metrics.untrustedInstructionCases}`,
  );
  console.log(`JSON: ${latestJsonPath}`);
  console.log(`CSV: ${latestCsvPath}`);
  console.log(`Immutable run: ${immutableDirectory}`);
  if (run.metrics.passed !== run.caseCount) process.exitCode = 1;
} finally {
  await vite.close();
}
