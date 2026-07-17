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
  const { demoWeatherRuntime } = await server.ssrLoadModule(
    "/src/ui/demoSession.ts",
  );
  const activeProvenanceKinds = [
    ...new Set(
      demoWeatherRuntime.active.data.map(
        (weather) => weather.provenance.kind,
      ),
    ),
  ];
  const result = {
    schemaVersion: demoWeatherRuntime.schemaVersion,
    capturedAt: new Date().toISOString(),
    status: demoWeatherRuntime.active.status,
    displayLabel: demoWeatherRuntime.displayLabel,
    safetyEngineInputSource: "DEMO_FIXTURE_ONLY",
    fixtureId: demoWeatherRuntime.active.fixtureId,
    fallbackReason: demoWeatherRuntime.active.fallbackReason,
    activeWeatherPointCount: demoWeatherRuntime.active.data.length,
    activeProvenanceKinds,
    liveEvidence: demoWeatherRuntime.liveEvidence,
    audit: demoWeatherRuntime.audit,
    privacy: {
      rawResponsesStored: false,
      credentialsStored: false,
      personalDataIncluded: false,
    },
  };
  if (
    result.status !== "FALLBACK" ||
    result.safetyEngineInputSource !== "DEMO_FIXTURE_ONLY" ||
    activeProvenanceKinds.length !== 1 ||
    activeProvenanceKinds[0] !== "MOCK" ||
    result.audit.liveEvidenceUsedForSafety ||
    !result.audit.fallbackTimelineUsedForSafety ||
    result.audit.mixedLiveAndDemoFields
  ) {
    throw new Error("Weather runtime audit invariant failed");
  }

  const outputDirectory = path.join(root, "artifacts", "evals");
  const outputPath = path.join(
    outputDirectory,
    "weather-runtime-selection-latest.json",
  );
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, serialized, "utf8");

  const runTimestamp = result.capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-");
  const immutableDirectory = path.join(
    outputDirectory,
    "weather-runtime-runs",
    `${runTimestamp}-fallback-selection`,
  );
  await mkdir(path.dirname(immutableDirectory), { recursive: true });
  await mkdir(immutableDirectory, { recursive: false });
  await writeFile(
    path.join(immutableDirectory, "weather-runtime-selection.json"),
    serialized,
    "utf8",
  );

  console.log(
    `WEATHER_RUNTIME_FALLBACK_PASS points=${result.activeWeatherPointCount} blockers=${result.liveEvidence.blockingFields.length} mixed=${result.audit.mixedLiveAndDemoFields}`,
  );
  console.log(`JSON: ${outputPath}`);
  console.log(`Immutable run: ${immutableDirectory}`);
} finally {
  await server.close();
}
