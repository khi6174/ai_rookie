import {
  createUpstageLiveProvider,
  readUpstageLiveConfig,
} from "../src/adapters/upstage/live";
import {
  runUpstageMockBaseline,
  runUpstageSmokeSuite,
} from "../src/evals/upstageSmoke";

const requiredEnvironmentVariables = [
  "UPSTAGE_API_KEY",
  "UPSTAGE_MODEL",
  "UPSTAGE_TIMEOUT_MS",
  "UPSTAGE_MAX_PROMPT_BYTES",
  "UPSTAGE_MAX_RESPONSE_BYTES",
] as const;

export async function executeUpstageSmoke(
  environment: Record<string, string | undefined>,
) {
  const missing = requiredEnvironmentVariables.filter(
    (name) => !environment[name]?.trim(),
  );
  if (missing.length > 0) {
    return {
      status: "NOT_CONFIGURED" as const,
      missing,
      message:
        "Upstage Live smoke was not executed. Configure server-only environment variables locally.",
    };
  }
  const config = readUpstageLiveConfig(environment);
  const run = await runUpstageSmokeSuite({
    provider: createUpstageLiveProvider({ config }),
  });
  return {
    status: "COMPLETED" as const,
    run,
  };
}

export async function executeUpstageMockSmoke() {
  return {
    status: "COMPLETED" as const,
    run: await runUpstageMockBaseline(),
  };
}
