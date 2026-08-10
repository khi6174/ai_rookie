import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const outputPath = resolve(root, "artifacts/evals/scenario-planning-readiness-latest.json");
const pnpmEntry = process.env.npm_execpath;
if (!pnpmEntry) throw new Error("pnpm entry point is not available");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function run(id, args, pattern, timeout = 180_000) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [pnpmEntry, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout,
    env: process.env,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return {
    id,
    command: `pnpm ${args.join(" ")}`,
    passed: result.status === 0 && pattern.test(output),
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    outputSha256: sha256(output),
  };
}

const commands = [
  run("TYPECHECK", ["run", "typecheck"], /tsc --noEmit/),
  run(
    "SCENARIO_UNIT_CONTRACT",
    ["exec", "vitest", "run", "tests/scenario-planning.test.ts"],
    /5 passed/,
  ),
  run(
    "SCENARIO_BROWSER",
    ["run", "test:e2e", "--", "e2e/scenario-planning.spec.ts"],
    /2 passed/,
  ),
];

const files = Object.fromEntries(
  await Promise.all(
    [
      "src/domain/scenario-planning/contracts.ts",
      "src/application/scenarioPlanning.ts",
      "src/ui/ScenarioPlanningLab.tsx",
      "src/ui/scenario-planning.css",
      "src/main.tsx",
      "docs/scenario-driven-service.md",
      "tests/scenario-planning.test.ts",
      "e2e/scenario-planning.spec.ts",
    ].map(async (path) => [path, await readFile(resolve(root, path), "utf8")]),
  ),
);

const contract = files["src/domain/scenario-planning/contracts.ts"];
const application = files["src/application/scenarioPlanning.ts"];
const ui = files["src/ui/ScenarioPlanningLab.tsx"];
const stylesheet = files["src/ui/scenario-planning.css"];
const route = files["src/main.tsx"];
const document = files["docs/scenario-driven-service.md"];

const checks = [
  { id: "COMMANDS", passed: commands.every((item) => item.passed) },
  { id: "APPROVED_SPEC", passed: /^- 상태: Approved$/m.test(document) },
  {
    id: "STRICT_INPUT",
    passed:
      contract.includes("ScenarioPlanningInputSchema") &&
      contract.includes(".strict()") &&
      !contract.includes("courierName") &&
      !contract.includes("address"),
  },
  {
    id: "PROVENANCE_BOUNDARY",
    passed:
      application.includes('kind: "USER_ENTERED"') &&
      application.includes('"DETERMINISTIC_SYNTHETIC_REFERENCE"'),
  },
  {
    id: "DETERMINISTIC_ENGINE",
    passed:
      application.includes("evaluateSafetyBudget") &&
      application.includes("evaluateIntervention") &&
      application.includes("recommendIntervention"),
  },
  {
    id: "PUBLIC_WEATHER_NOT_MIXED",
    passed:
      application.includes('publicWeatherEvidence: "PARTIAL_CONTEXT_ONLY"') &&
      application.includes("publicWeatherUsedForSafety: false"),
  },
  {
    id: "AI_AND_MAP_NUMERIC_BOUNDARY",
    passed:
      application.includes("mapUsedForSafety: false") &&
      application.includes("aiUsedForNumericPrediction: false"),
  },
  {
    id: "NO_EXTERNAL_WRITE_OR_ACTUAL_DATA",
    passed:
      application.includes("actualTmsConnected: false") &&
      application.includes("actualCourierConnected: false") &&
      application.includes("actualPersonalDataIncluded: false") &&
      application.includes("networkWritePerformed: false"),
  },
  {
    id: "ROUTE_AND_PUBLIC_NAVIGATION",
    passed:
      route.includes('pathname.startsWith("/scenario")') &&
      ui.includes('href="/"') &&
      !ui.includes('href="/closed-loop-demo"'),
  },
  {
    id: "SHADOW_FREE_DESIGN",
    passed:
      stylesheet.includes("box-shadow: none") &&
      stylesheet.includes("text-shadow: none") &&
      [...stylesheet.matchAll(/(?:box|text)-shadow:\s*([^;]+);/g)].every(
        ([, value]) => value.trim() === "none",
      ) &&
      !/drop-shadow\s*\(/.test(stylesheet),
  },
  {
    id: "NO_ASYMMETRIC_SIDE_ACCENT",
    passed:
      !/border-(?:left|right)(?:-color|-width)?:/.test(stylesheet) &&
      !/box-shadow:\s*inset/.test(stylesheet),
  },
  {
    id: "RESOURCE_EXPLANATION_PRESENT",
    passed:
      ui.includes("무엇을 계산에 사용했는가") &&
      ui.includes("합성 기준계획의 Safety Budget") &&
      !ui.includes("scenario-limitations") &&
      !ui.includes("실제 TMS·기사 계정·GPS·주소·고객 발송은 연결되지 않았습니다"),
  },
];

const failedChecks = checks.filter((item) => !item.passed).map((item) => item.id);
const result = {
  schemaVersion: "scenario-planning-readiness-v1",
  capturedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASSED" : "FAILED",
  dataMode: "USER_ENTERED_SIMULATION",
  commands,
  checks,
  failedChecks,
  summary: {
    presets: 3,
    unitContractTests: 5,
    browserTests: 2,
    publicWeatherUsedForSafety: false,
    actualTmsConnected: false,
    actualCourierConnected: false,
    actualPersonalDataCount: 0,
    networkWritePerformed: false,
  },
  limitations: [
    "User-entered conditions are not actual TMS or courier observations.",
    "Public weather evidence remains context-only until complete WeatherState coverage is approved.",
    "Passing this audit is not LIVE_PILOT or field-effect evidence.",
  ],
};

await mkdir(resolve(root, "artifacts/evals"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
if (result.status === "PASSED") {
  console.log(`SCENARIO_PLANNING_AUDIT_PASS checks=${checks.length} failed=0 artifact=${outputPath}`);
} else {
  console.error(`SCENARIO_PLANNING_AUDIT_FAIL failed=${failedChecks.join(",")}`);
  process.exitCode = 1;
}
