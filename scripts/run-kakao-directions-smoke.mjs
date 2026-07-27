import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { loadEnv } from "vite";
import { handleKakaoDirectionsRequest } from "../server/kakao-directions-proxy.mjs";

const root = process.cwd();
const environment = {
  ...process.env,
  ...loadEnv("development", root, ""),
};
const response = await handleKakaoDirectionsRequest(
  new Request(
    "https://local.test/api/kakao-directions?profile=rider-demo",
  ),
  {
    apiKey: environment.KAKAO_MOBILITY_REST_API_KEY,
    enabled: environment.KAKAO_DIRECTIONS_ENABLED !== "false",
  },
);
const body = await response.json();
const artifact = {
  schemaVersion: "kakao-directions-smoke-v1",
  checkedAt: new Date().toISOString(),
  httpStatus: response.status,
  status: body.status,
  provider: body.provider,
  profile: body.profile,
  distanceMeters: body.distanceMeters,
  durationSeconds: body.durationSeconds,
  pathPointCount: Array.isArray(body.path) ? body.path.length : 0,
  fallbackCode: body.code,
  isDemo: body.isDemo,
  safetyEngineInputApproved: body.safetyEngineInputApproved,
};
const outputDirectory = resolve(root, "artifacts/evals");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(
  outputDirectory,
  "kakao-directions-smoke-latest.json",
);
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(
  `Kakao directions smoke: ${artifact.status} status=${response.status} points=${artifact.pathPointCount}`,
);
console.log(`JSON: ${outputPath}`);
if (response.status !== 200 || body.status !== "LIVE") process.exitCode = 1;
