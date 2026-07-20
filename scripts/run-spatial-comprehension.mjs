import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const inputArgument = process.argv[2];
if (!inputArgument) {
  console.error(
    "Usage: pnpm run eval:g5:comprehension -- <completed-results.json>",
  );
  process.exit(2);
}

const inputPath = resolve(inputArgument);
const outputPath = resolve(
  "artifacts/evals/g5-spatial-comprehension-summary.json",
);
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const { evaluateSpatialComprehension } = await vite.ssrLoadModule(
    "/src/evals/spatialComprehension.ts",
  );
  const result = evaluateSpatialComprehension(
    JSON.parse(await readFile(inputPath, "utf8")),
  );
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    `G5_SPATIAL_COMPREHENSION_${result.status} reviewers=${result.reviewerCount} accuracy=${result.answerAccuracy}`,
  );
  console.log(`summary=${outputPath}`);
  if (!result.comprehensionPassed) process.exitCode = 1;
} finally {
  await vite.close();
}
