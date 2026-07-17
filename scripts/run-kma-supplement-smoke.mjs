import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer, loadEnv } from "vite";

const root = process.cwd();
const environment = { ...process.env, ...loadEnv("development", root, "") };
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule(
    "/scripts/kma-supplement-smoke-entry.ts",
  );
  const result = await module.executeKmaSupplementLiveSmoke(environment);
  const outputDirectory = path.join(root, "artifacts", "evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputName = "kma-weather-supplement-live-latest.json";
  const outputPath = path.join(outputDirectory, outputName);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const runTimestamp = result.capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-");
  const immutableDirectory = path.join(
    outputDirectory,
    "public-data-runs",
    `${runTimestamp}-kma-weather-supplement-live`,
  );
  await mkdir(immutableDirectory, { recursive: false });
  await writeFile(
    path.join(immutableDirectory, outputName),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  if (result.status === "NOT_CONFIGURED") {
    console.error(`KMA_SUPPLEMENT_NOT_CONFIGURED missing=${result.missing.join(",")}`);
    process.exitCode = 2;
  } else if (result.status === "FAILED") {
    console.error(
      `KMA_SUPPLEMENT_FAILED stage=${result.failureStage} code=${result.failureCode} diagnostic=${result.failureDiagnostic}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `KMA_SUPPLEMENT_PASS observed=${result.highResolutionCandidate.observedAt} snow_points=${result.shortForecastCandidate.points.length} feels_like_points=${result.shortForecastCandidate.points.filter((point) => point.feelsLikeCelsius !== undefined).length}`,
    );
    console.log(
      `KMA_SUPPLEMENT_COVERAGE_BLOCKED fields=${result.coverage.blockingFields.map((item) => `${item.timeScope}:${item.weatherStateField}`).join(",")}`,
    );
  }
  console.log(`JSON: ${outputPath}`);
  console.log(`Immutable run: ${immutableDirectory}`);
} finally {
  await server.close();
}
