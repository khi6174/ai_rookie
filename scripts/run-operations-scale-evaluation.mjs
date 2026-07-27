import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(".");
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});
try {
  const module = await server.ssrLoadModule(
    "/src/evals/operationsScale.ts",
  );
  const result = await module.runOperationsScaleEvaluation();
  const outputDirectory = resolve(root, "artifacts/evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(
    outputDirectory,
    "operations-scale-summary.json",
  );
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    `Operations scale evaluation: ${result.status} ${result.profiles
      .map(
        (profile) =>
          `${profile.courierCount}=${profile.totalReadyMs}ms`,
      )
      .join(" ")}`,
  );
  console.log(`JSON: ${outputPath}`);
  if (result.status !== "PASSED") process.exitCode = 1;
} finally {
  await server.close();
}
