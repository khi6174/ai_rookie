import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer, loadEnv } from "vite";

const mode = process.argv.includes("--live")
  ? "live"
  : process.argv.includes("--mock")
    ? "mock"
    : "check";
const root = process.cwd();
const environment = { ...process.env, ...loadEnv("development", root, "") };
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule("/scripts/taas-smoke-entry.ts");
  const result =
    mode === "live"
      ? await module.executeTaasLiveSmoke(environment)
      : mode === "mock"
        ? await module.executeTaasMockContractSmoke()
        : module.checkTaasLiveConfiguration(environment);
  const outputDirectory = path.join(root, "artifacts", "evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputName = `taas-public-data-${mode}-latest.json`;
  const outputPath = path.join(outputDirectory, outputName);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  if (mode === "live" && ["COMPLETED", "PARTIAL"].includes(result.status)) {
    const runTimestamp = result.capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-");
    const immutableDirectory = path.join(
      outputDirectory,
      "public-data-runs",
      `${runTimestamp}-taas-${result.status.toLowerCase()}`,
    );
    await mkdir(immutableDirectory, { recursive: false });
    await writeFile(
      path.join(immutableDirectory, outputName),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    console.log(`Immutable run: ${immutableDirectory}`);
  }

  if (result.status === "READY") {
    console.log("TAAS_CHECK_PASS shared_approved_key_supported=true");
  } else if (result.status === "COMPLETED") {
    console.log(
      `TAAS_${mode.toUpperCase()}_PASS truck_zones=${result.truckCandidate.zones.length} stats_rows=${result.statsCandidate.statistics.length}`,
    );
  } else if (result.status === "PARTIAL") {
    console.error(
      `TAAS_LIVE_PARTIAL truck_zones=${result.truckCandidate.zones.length} missing=${result.missing.join(",")}`,
    );
    process.exitCode = 2;
  } else if (result.status === "NOT_CONFIGURED") {
    console.error(`TAAS_NOT_CONFIGURED missing=${result.missing.join(",")}`);
    process.exitCode = 2;
  } else {
    console.error(
      `TAAS_LIVE_FAILED code=${result.failureCode} diagnostic=${result.failureDiagnostic}`,
    );
    process.exitCode = 1;
  }
  console.log(`JSON: ${outputPath}`);
} finally {
  await server.close();
}
