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

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

try {
  const module = await server.ssrLoadModule(
    "/scripts/domestic-ai-smoke-entry.ts",
  );
  const mockMode = process.argv.includes("--mock");
  const checkMode = process.argv.includes("--check");
  if (mockMode && checkMode) {
    throw new Error("Choose either --mock or --check, not both");
  }
  const providersArgument = process.argv.find((value) =>
    value.startsWith("--providers="),
  );
  const requestedProviderIds = providersArgument
    ? providersArgument
        .slice("--providers=".length)
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    : [...module.domesticAiProviderIds];
  const invalid = requestedProviderIds.filter(
    (providerId) => !module.domesticAiProviderIds.includes(providerId),
  );
  if (invalid.length > 0 || requestedProviderIds.length === 0) {
    throw new Error(
      `Invalid provider selection: ${invalid.join(", ") || "empty"}`,
    );
  }
  const providerIds = [...new Set(requestedProviderIds)];
  const taskLimitArgument = process.argv.find((value) =>
    value.startsWith("--task-limit="),
  );
  const taskLimit = taskLimitArgument
    ? Number(taskLimitArgument.slice("--task-limit=".length))
    : undefined;
  if (
    taskLimitArgument &&
    (!Number.isInteger(taskLimit) || taskLimit < 1 || taskLimit > 12)
  ) {
    throw new Error("--task-limit must be an integer between 1 and 12");
  }
  const result = checkMode
    ? module.checkDomesticAiLiveConfiguration(environment, providerIds)
    : mockMode
      ? await module.executeDomesticAiMockSmoke(providerIds, taskLimit)
      : await module.executeDomesticAiLiveSmoke(
          environment,
          providerIds,
          taskLimit,
        );
  const outputDirectory = path.join(root, "artifacts", "evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputBaseName = checkMode
    ? "domestic-ai-api-readiness-latest"
    : mockMode
      ? "domestic-ai-api-smoke-mock-latest"
      : "domestic-ai-api-smoke-latest";
  const outputPath = path.join(outputDirectory, `${outputBaseName}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  let immutableRunDirectory;
  if (result.status === "COMPLETED") {
    const runTimestamp = result.run.capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-");
    const runMode = mockMode ? "mock" : "live";
    immutableRunDirectory = path.join(
      outputDirectory,
      "domestic-ai-api-runs",
      `${runTimestamp}-${runMode}-${providerIds.join("-").toLowerCase()}`,
    );
    await mkdir(path.dirname(immutableRunDirectory), { recursive: true });
    await mkdir(immutableRunDirectory, { recursive: false });
    await writeFile(
      path.join(immutableRunDirectory, `${outputBaseName}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
  }

  if (result.status === "NOT_CONFIGURED") {
    console.error(result.message);
    console.error(`Missing: ${result.missing.join(", ")}`);
    console.error(`Readiness artifact: ${outputPath}`);
    process.exitCode = 2;
  } else if (result.status === "READY") {
    for (const provider of result.providers) {
      console.log(
        `${provider.providerId}: READY model=${provider.model} endpoint-contract=verified`,
      );
    }
    console.log("No API request was sent.");
    console.log(`Readiness artifact: ${outputPath}`);
  } else {
    const csvHeader = [
      "providerId",
      "providerMode",
      "protocol",
      "model",
      "taskId",
      "role",
      "status",
      "passed",
      "latencyMs",
      "promptTokens",
      "completionTokens",
      "totalTokens",
      "fallbackCode",
    ];
    const csvRows = result.run.providers.flatMap((provider) =>
      provider.results.map((item) =>
        [
          provider.providerId,
          provider.providerMode,
          provider.protocol,
          provider.model,
          item.taskId,
          item.role,
          item.status,
          item.passed,
          item.latencyMs,
          item.usage.promptTokens,
          item.usage.completionTokens,
          item.usage.totalTokens,
          item.fallbackCode,
        ]
          .map(csvCell)
          .join(","),
      ),
    );
    const csvPath = path.join(outputDirectory, `${outputBaseName}.csv`);
    await writeFile(
      csvPath,
      `${[csvHeader.join(","), ...csvRows].join("\n")}\n`,
      "utf8",
    );
    if (immutableRunDirectory) {
      await writeFile(
        path.join(immutableRunDirectory, `${outputBaseName}.csv`),
        `${[csvHeader.join(","), ...csvRows].join("\n")}\n`,
        "utf8",
      );
    }
    for (const provider of result.run.providers) {
      console.log(
        `${provider.providerId}: ${provider.metrics.passed}/${provider.taskCount} passed, fallback=${provider.metrics.fallback}`,
      );
    }
    console.log(`JSON: ${outputPath}`);
    console.log(`CSV: ${csvPath}`);
    if (immutableRunDirectory) {
      console.log(`Immutable run: ${immutableRunDirectory}`);
    }
    if (result.run.providers.some((provider) => provider.metrics.failed > 0)) {
      process.exitCode = 1;
    }
  }
} finally {
  await server.close();
}
