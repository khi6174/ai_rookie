import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";

const root = process.cwd();
const inputPath = path.join(
  root,
  "artifacts",
  "evals",
  "kma-weather-smoke-live-latest.json",
);
const liveResult = JSON.parse(await readFile(inputPath, "utf8"));
if (liveResult.status !== "COMPLETED") {
  throw new Error("A completed KMA Live artifact is required");
}
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule(
    "/src/adapters/weather/coverage.ts",
  );
  const assessment = module.assessKmaWeatherSafetyCoverage({
    observationCandidate: liveResult.observationCandidate,
    forecastCandidate: liveResult.forecastCandidate,
  });
  const result = {
    capturedAt: new Date().toISOString(),
    inputArtifact: "artifacts/evals/kma-weather-smoke-live-latest.json",
    inputHashes: {
      observationResponseSha256:
        liveResult.observationCandidate.responseSha256,
      forecastResponseSha256: liveResult.forecastCandidate.responseSha256,
    },
    ...assessment,
  };
  const outputDirectory = path.join(root, "artifacts", "evals");
  const outputPath = path.join(
    outputDirectory,
    "kma-weather-coverage-latest.json",
  );
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const runTimestamp = result.capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-");
  const immutableDirectory = path.join(
    outputDirectory,
    "public-data-runs",
    `${runTimestamp}-kma-safety-coverage`,
  );
  await mkdir(path.dirname(immutableDirectory), { recursive: true });
  await mkdir(immutableDirectory, { recursive: false });
  await writeFile(
    path.join(immutableDirectory, "kma-weather-coverage-latest.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `KMA_SAFETY_COVERAGE_BLOCKED fields=${result.blockingFields.map((item) => item.weatherStateField).join(",")} forecast_points=${result.forecastPointCount}`,
  );
  console.log(`JSON: ${outputPath}`);
  console.log(`Immutable run: ${immutableDirectory}`);
} finally {
  await server.close();
}
