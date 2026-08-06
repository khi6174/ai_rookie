import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";

const root = process.cwd();
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  if (!process.argv.includes("--mock")) {
    throw new Error(
      "Cascade Live execution is not enabled until the local LoRA qualification Gate passes. Use --mock.",
    );
  }
  const module = await server.ssrLoadModule(
    "/scripts/domestic-ai-cascade-entry.ts",
  );
  const run = await module.runDomesticAiCascadeMockBenchmark();
  const outputDirectory = path.join(root, "artifacts", "evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(
    outputDirectory,
    "domestic-ai-cascade-mock-latest.json",
  );
  await writeFile(outputPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  for (const metrics of run.metrics) {
    console.log(
      `${metrics.strategy}: verified=${metrics.verifiedLocal + metrics.verifiedHosted}/${metrics.taskCount} local=${metrics.verifiedLocal} hosted=${metrics.verifiedHosted} fallback=${metrics.fallback} escalated=${metrics.escalated}`,
    );
  }
  console.log(`JSON: ${outputPath}`);
} finally {
  await server.close();
}
