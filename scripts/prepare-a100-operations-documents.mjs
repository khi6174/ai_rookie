import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";

const root = process.cwd();
const outputDirectory = path.join(root, "artifacts", "evals", "a100-operations-documents");
const bundlePath = path.join(outputDirectory, "a100-operations-documents-eval-v1.json");
const manifestPath = path.join(
  outputDirectory,
  "a100-operations-documents-eval-v1-manifest.json",
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const vite = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await vite.ssrLoadModule(
    "/src/evals/a100OperationsDocuments.ts",
  );
  const bundle = module.createA100OperationsBenchmarkBundle();
  const validation = module.validateA100OperationsBenchmarkBundle(bundle);
  if (!validation.passed) {
    throw new Error(
      `A100 operations bundle validation failed: ${JSON.stringify(validation.validationCodes)}`,
    );
  }

  const tasks = bundle.tasks.map((task) => ({
    ...task,
    sourceSha256: sha256(task.sourceDocument),
  }));
  const serializedBundle = `${JSON.stringify({ ...bundle, tasks }, null, 2)}\n`;
  const manifest = {
    schemaVersion: "a100-operations-documents-bundle-manifest-v1",
    bundleVersion: bundle.bundleVersion,
    datasetVersion: bundle.datasetVersion,
    modelId: bundle.modelId,
    modelRevision: bundle.modelRevision,
    promptVersion: bundle.promptVersion,
    bundleRelativePath: path.relative(root, bundlePath).replaceAll(path.sep, "/"),
    bundleSha256: sha256(serializedBundle),
    taskCount: validation.taskCount,
    splitCounts: validation.splitCounts,
    documentKindCounts: validation.documentKindCounts,
    promptInjectionCases: validation.promptInjectionCases,
    dataMode: "SYNTHETIC",
    actualPersonalDataCount: 0,
    evaluationBoundary:
      "문서 추출 정확도·인용 충실도·비신뢰 지시 격리만 평가하며 Safety Budget·추천·실제 안전효과를 평가하지 않는다.",
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(bundlePath, serializedBundle, "utf8");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `A100_OPERATIONS_BUNDLE_PASS tasks=${validation.taskCount} development=${validation.splitCounts.development} ` +
      `validation=${validation.splitCounts.validation} frozen=${validation.splitCounts["frozen-test"]} ` +
      `injection=${validation.promptInjectionCases}`,
  );
  console.log(`bundle_sha256=${manifest.bundleSha256}`);
  console.log(`bundle=${bundlePath}`);
  console.log(`manifest=${manifestPath}`);
} finally {
  await vite.close();
}
