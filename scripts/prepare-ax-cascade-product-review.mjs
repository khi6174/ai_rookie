#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";

const root = process.cwd();
const outputPath = path.join(
  root,
  "artifacts/evals/ax-cascade-product-review-v1.json",
);
const checkOnly = process.argv.includes("--check");
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

try {
  const benchmark = await server.ssrLoadModule(
    "/src/evals/domesticAiBenchmark.ts",
  );
  const explanations = await server.ssrLoadModule(
    "/src/application/explanations/index.ts",
  );
  const records = benchmark.domesticAiBenchmarkTasks.map((task, index) => ({
    recordId: task.taskId,
    parentRecordId: `product-review-${String(index + 1).padStart(3, "0")}`,
    split: "product-review",
    role: task.input.role,
    scenarioFamily: "DOMESTIC_AI_PRODUCT_REVIEW",
    containsUntrustedInstruction: task.taskId.includes("injection"),
    seed: 6800 + index,
    input: task.input,
    expectedOutput: explanations.createTemplateExplanation(task.input),
    requiredFactIds: task.requiredFactIds,
    requiredCitationIds: task.requiredCitationIds,
    requiredDisplayValues: task.requiredDisplayValues,
  }));
  const bundle = {
    schemaVersion: "ax-cascade-product-review-bundle-v1",
    status: "LOCKED_NOT_RUN",
    datasetVersion: "domestic-ai-product-review-v1.0.0",
    createdAt: "2026-08-06T06:00:00.000Z",
    dataMode: "SYNTHETIC_DEMO",
    sourceTaskSuite: "domestic-ai-benchmark-v1",
    promptVersion: explanations.explanationPromptVersion,
    taskCount: records.length,
    roles: ["ADMIN", "COURIER", "CUSTOMER", "REPORT"],
    hostedReference: {
      providerId: "AX",
      model: "A.X-K1",
      evidencePath:
        "artifacts/evals/domestic-ai-api-runs/2026-07-23T11-08-49-486Z-live-ax/domestic-ai-api-smoke-latest.json",
      taskCount: 12,
    },
    privacy: {
      actualPersonalDataCount: 0,
      preciseLocationCount: 0,
      biometricDataCount: 0,
    },
    records,
  };
  if (records.length !== 12) throw new Error("PRODUCT_REVIEW_TASK_COUNT");
  if (new Set(records.map((record) => record.recordId)).size !== records.length) {
    throw new Error("PRODUCT_REVIEW_DUPLICATE_RECORD_ID");
  }
  const serialized = stableJson(bundle);
  const digest = createHash("sha256").update(serialized).digest("hex");
  if (checkOnly) {
    const existing = await readFile(outputPath, "utf8");
    if (existing !== serialized) throw new Error("PRODUCT_REVIEW_BUNDLE_DRIFT");
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
  }
  console.log(
    `AX_CASCADE_PRODUCT_REVIEW_BUNDLE_PASS tasks=${records.length} ` +
      `injections=${records.filter((record) => record.containsUntrustedInstruction).length} ` +
      `sha256=${digest} write=${checkOnly ? "false" : "true"}`,
  );
  if (!checkOnly) console.log(`artifact=${outputPath}`);
} finally {
  await server.close();
}
