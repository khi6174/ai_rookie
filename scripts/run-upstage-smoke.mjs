import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer, loadEnv } from "vite";

const root = process.cwd();
const environment = {
  ...process.env,
  ...loadEnv("development", root, ""),
};
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule("/scripts/upstage-smoke-entry.ts");
  const mockMode = process.argv.includes("--mock");
  const result = mockMode
    ? await module.executeUpstageMockSmoke()
    : await module.executeUpstageSmoke(environment);
  const outputDirectory = path.join(root, "artifacts", "evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputBaseName = mockMode
    ? "upstage-smoke-mock-latest"
    : "upstage-smoke-latest";
  const outputPath = path.join(outputDirectory, `${outputBaseName}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  if (result.status === "NOT_CONFIGURED") {
    console.error(result.message);
    console.error(`Missing: ${result.missing.join(", ")}`);
    console.error(`Readiness artifact: ${outputPath}`);
    process.exitCode = 2;
  } else {
    const csvHeader =
      "taskId,role,status,passed,latencyMs,citedFactCount,citationCount,fallbackCode";
    const csvRows = result.run.results.map((item) =>
      [
        item.taskId,
        item.role,
        item.status,
        item.passed,
        item.latencyMs,
        item.citedFactCount,
        item.citationCount,
        item.fallbackCode ?? "",
      ].join(","),
    );
    const csvPath = path.join(outputDirectory, `${outputBaseName}.csv`);
    await writeFile(csvPath, `${[csvHeader, ...csvRows].join("\n")}\n`, "utf8");
    console.log(
      `Upstage smoke completed: ${result.run.metrics.passed}/${result.run.taskCount} passed`,
    );
    console.log(`JSON: ${outputPath}`);
    console.log(`CSV: ${csvPath}`);
    if (result.run.metrics.failed > 0) process.exitCode = 1;
  }
} finally {
  await server.close();
}
