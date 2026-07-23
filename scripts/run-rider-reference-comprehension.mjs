import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const inputArgument = process.argv.slice(2).find((argument) => argument !== "--");
if (!inputArgument) {
  console.error(
    "Usage: pnpm run eval:rider-reference:comprehension -- <completed-results.json>",
  );
  process.exit(2);
}

const inputPath = resolve(inputArgument);
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const { evaluateRiderReferenceComprehension } = await vite.ssrLoadModule(
    "/src/evals/riderReferenceComprehension.ts",
  );
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = evaluateRiderReferenceComprehension(input);
  const outputPath = resolve(
    input.schemaVersion === "rider-reference-comprehension-v2"
      ? "artifacts/evals/rider-reference-comprehension-round2-summary.json"
      : "artifacts/evals/rider-reference-comprehension-summary.json",
  );
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    `RIDER_REFERENCE_COMPREHENSION_${result.status} reviewers=${result.reviewerCount} accuracy=${result.taskAccuracy}`,
  );
  console.log(`summary=${outputPath}`);
  if (!result.comprehensionPassed) process.exitCode = 1;
} finally {
  await vite.close();
}
