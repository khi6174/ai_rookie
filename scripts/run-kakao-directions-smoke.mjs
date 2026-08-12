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
const fleetResponse = await handleKakaoDirectionsRequest(
  new Request(
    "https://local.test/api/kakao-directions?profile=fleet-demo&source=deterministic-synthetic-fleet&origin=127.0225%2C37.4968&waypoints=127.0395%2C37.4968%7C127.0395%2C37.5007&destination=127.0275%2C37.5007",
  ),
  {
    apiKey: environment.KAKAO_MOBILITY_REST_API_KEY,
    enabled: environment.KAKAO_DIRECTIONS_ENABLED !== "false",
  },
);
const fleetBody = await fleetResponse.json();
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
  fleetRoadRoute: {
    httpStatus: fleetResponse.status,
    status: fleetBody.status,
    profile: fleetBody.profile,
    distanceMeters: fleetBody.distanceMeters,
    durationSeconds: fleetBody.durationSeconds,
    pathPointCount: Array.isArray(fleetBody.path) ? fleetBody.path.length : 0,
    fallbackCode: fleetBody.code,
    safetyEngineInputApproved: fleetBody.safetyEngineInputApproved,
  },
};
const outputDirectory = resolve(root, "artifacts/evals");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(
  outputDirectory,
  "kakao-directions-smoke-latest.json",
);
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(
  `Kakao directions smoke: ${artifact.status} status=${response.status} points=${artifact.pathPointCount} fleet=${artifact.fleetRoadRoute.status} fleet_points=${artifact.fleetRoadRoute.pathPointCount}`,
);
console.log(`JSON: ${outputPath}`);
if (
  response.status !== 200 ||
  body.status !== "LIVE" ||
  fleetResponse.status !== 200 ||
  fleetBody.status !== "LIVE" ||
  artifact.fleetRoadRoute.pathPointCount < 2
) process.exitCode = 1;
