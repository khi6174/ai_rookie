import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer, loadEnv } from "vite";

const root = process.cwd();
const environment = { ...process.env, ...loadEnv("development", root, "") };
const mockMode = process.argv.includes("--mock");
const checkMode = process.argv.includes("--check");
const liveMode = process.argv.includes("--live");

if ([mockMode, checkMode, liveMode].filter(Boolean).length !== 1) {
  throw new Error("Choose exactly one mode: --mock, --check, or --live");
}

const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule("/scripts/kma-weather-smoke-entry.ts");
  const result = checkMode
    ? module.checkKmaLiveConfiguration(environment)
    : liveMode
      ? await module.executeKmaLiveSmoke(environment)
      : await module.executeKmaMockContractSmoke();
  const outputDirectory = path.join(root, "artifacts", "evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputBaseName = checkMode
    ? "kma-weather-readiness-latest"
    : liveMode
      ? "kma-weather-smoke-live-latest"
      : "kma-weather-smoke-mock-latest";
  const outputPath = path.join(outputDirectory, `${outputBaseName}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  if (result.status === "NOT_CONFIGURED") {
    console.error(result.message);
    console.error(`Missing: ${result.missing.join(", ")}`);
    console.error(`Readiness artifact: ${outputPath}`);
    process.exitCode = 2;
  } else if (result.status === "READY") {
    console.log(`KMA: READY host=${result.allowedHost} endpoint-contract=verified`);
    console.log("No API request was sent.");
    console.log(`Readiness artifact: ${outputPath}`);
  } else {
    const runTimestamp = result.capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-");
    const runMode = liveMode ? "live-kma-api-hub" : "mock-kma-contract";
    const immutableDirectory = path.join(
      outputDirectory,
      "public-data-runs",
      `${runTimestamp}-${runMode}`,
    );
    await mkdir(path.dirname(immutableDirectory), { recursive: true });
    await mkdir(immutableDirectory, { recursive: false });
    await writeFile(
      path.join(immutableDirectory, `${outputBaseName}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    if (result.status === "FAILED") {
      console.error(
        `KMA LIVE SMOKE: FAILED stage=${result.failureStage} code=${result.failureCode} diagnostic=${result.failureDiagnostic}`,
      );
      process.exitCode = 1;
    } else if (liveMode) {
      console.log(
        `KMA LIVE SMOKE: PASS observation=${result.observationCandidate.observedAt} forecast_points=${result.forecastCandidate.points.length}`,
      );
      console.log("Safety-engine input approved: false");
    } else {
      console.log("KMA MOCK CONTRACT: PASS");
      console.log("Public-data claim: false; Safety-engine input approved: false");
    }
    console.log(`JSON: ${outputPath}`);
    console.log(`Immutable run: ${immutableDirectory}`);
  }
} finally {
  await server.close();
}
