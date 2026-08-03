import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const hostingPath = resolve(root, ".openai/hosting.json");
const clientDirectory = resolve(root, "dist/client");
const workerDirectory = resolve(root, "dist/server");
const directionsProxySource = resolve(
  root,
  "server/kakao-directions-proxy.mjs",
);
const operationsSessionStoreSource = resolve(
  root,
  "server/operations-session-store.mjs",
);
const syntheticOperationsStoreSource = resolve(
  root,
  "server/synthetic-operations-store.mjs",
);
const syntheticCourierDirectorySource = resolve(
  root,
  "server/synthetic-courier-directory.mjs",
);
const riderProfileStoreSource = resolve(root, "server/rider-profile-store.mjs");
const riderProfilesSource = resolve(root, "server/rider-profiles.mjs");
const upstageExplanationProxySource = resolve(
  root,
  "server/upstage-explanation-proxy.mjs",
);
const metadataDirectory = resolve(root, "dist/.openai");
const drizzleDirectory = resolve(metadataDirectory, "drizzle");
const publicReviewDirectory = resolve(clientDirectory, "tools");
const publicReviewEvidenceDirectory = resolve(
  clientDirectory,
  "artifacts/evals",
);
const publicReviewScreenshotDirectory = resolve(
  publicReviewEvidenceDirectory,
  "screenshots",
);
const operationsReviewDirectory = resolve(
  publicReviewDirectory,
  "operations-service-review",
);
const operationsReviewManifestArtifactPath = resolve(
  root,
  "artifacts/evals/operations-human-review-study-manifest.json",
);
const operationsReviewStimulusEvidenceDirectory = resolve(
  root,
  "artifacts/evals/human-review-stimuli",
);

const hosting = JSON.parse(await readFile(hostingPath, "utf8"));
if (typeof hosting.project_id !== "string" || hosting.project_id.length === 0) {
  throw new Error("Sites project_id is missing from .openai/hosting.json");
}

const workerSource = `import { handleKakaoDirectionsRequest } from "./kakao-directions-proxy.mjs";
import { handleOperationsSessionRequest } from "./operations-session-store.mjs";
import { handleRiderProfileRequest } from "./rider-profile-store.mjs";
import { handleSyntheticOperationsRequest } from "./synthetic-operations-store.mjs";
import { handleUpstageExplanationRequest } from "./upstage-explanation-proxy.mjs";

let bundledSyntheticOperationsDocument;

async function loadBundledSyntheticOperationsDocument(request, env) {
  if (bundledSyntheticOperationsDocument) {
    return bundledSyntheticOperationsDocument;
  }
  const assetUrl = new URL(
    "/templates/daily-operations-documents-2026-07-25-bundled-v1.json",
    request.url,
  );
  const response = await env.ASSETS.fetch(
    new Request(assetUrl, { headers: { Accept: "application/json" } }),
  );
  if (!response.ok) {
    throw new Error("승인된 합성 운영 seed asset을 불러오지 못했습니다.");
  }
  bundledSyntheticOperationsDocument = await response.json();
  return bundledSyntheticOperationsDocument;
}

const securityHeaders = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const riderProfileResponse = await handleRiderProfileRequest(request, {
      database: env.DB,
    });
    if (riderProfileResponse) {
      return secure(riderProfileResponse);
    }
    if (
      url.pathname === "/api/operations/days/current" ||
      url.pathname === "/api/operations/days/current/package"
    ) {
      const syntheticOperationsResponse =
        await handleSyntheticOperationsRequest(request, {
          database: env.DB,
          bundle: await loadBundledSyntheticOperationsDocument(request, env),
        });
      if (syntheticOperationsResponse) {
        return secure(syntheticOperationsResponse);
      }
    }
    const operationsResponse = await handleOperationsSessionRequest(request, {
      database: env.DB,
    });
    if (operationsResponse) {
      return secure(operationsResponse);
    }
    const upstageResponse = await handleUpstageExplanationRequest(request, {
      apiKey: env.UPSTAGE_API_KEY,
      model: env.UPSTAGE_MODEL,
      timeoutMs: env.UPSTAGE_TIMEOUT_MS,
    });
    if (upstageResponse) {
      return secure(upstageResponse);
    }
    if (url.pathname === "/api/kakao-directions") {
      return secure(await handleKakaoDirectionsRequest(request, {
        apiKey: env.KAKAO_MOBILITY_REST_API_KEY,
        enabled: env.KAKAO_DIRECTIONS_ENABLED !== "false",
      }));
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return secure(response);
    }

    const indexRequest = new Request(new URL("/index.html", request.url), {
      method: "GET",
      headers: request.headers,
    });
    return secure(await env.ASSETS.fetch(indexRequest));
  },
};

export default worker;
`;

await rm(clientDirectory, { recursive: true, force: true });
await mkdir(clientDirectory, { recursive: true });
await copyFile(
  resolve(root, "dist/index.html"),
  resolve(clientDirectory, "index.html"),
);
await cp(resolve(root, "dist/assets"), resolve(clientDirectory, "assets"), {
  recursive: true,
});
await copyFile(
  resolve(root, "dist/manifest.webmanifest"),
  resolve(clientDirectory, "manifest.webmanifest"),
);
await copyFile(resolve(root, "dist/sw.js"), resolve(clientDirectory, "sw.js"));
await cp(resolve(root, "dist/icons"), resolve(clientDirectory, "icons"), {
  recursive: true,
});
await cp(
  resolve(root, "dist/templates"),
  resolve(clientDirectory, "templates"),
  { recursive: true },
);
await mkdir(publicReviewDirectory, { recursive: true });
await cp(
  resolve(root, "tools/g5-spatial-review"),
  resolve(publicReviewDirectory, "g5-spatial-review"),
  { recursive: true },
);
await cp(
  resolve(root, "tools/rider-reference-review"),
  resolve(publicReviewDirectory, "rider-reference-review"),
  { recursive: true },
);
await cp(
  resolve(root, "tools/operations-service-review"),
  operationsReviewDirectory,
  { recursive: true },
);
await mkdir(publicReviewScreenshotDirectory, { recursive: true });
for (const screenshot of [
  "g5-round4-admin-decision-2d-1280x720.png",
  "g5-round4-admin-decision-2-5d-1280x720.png",
  "rider-source-route-round2-390x844.png",
  "operations-service-1440x900.png",
  "operations-service-1280x720.png",
  "operations-rider-390x844.png",
  "operations-rider-360x800.png",
]) {
  await copyFile(
    resolve(root, "artifacts/evals/screenshots", screenshot),
    resolve(publicReviewScreenshotDirectory, screenshot),
  );
}
for (const manifest of [
  "g5-spatial-round4-stimulus-manifest.json",
  "rider-reference-round2-stimulus-manifest.json",
]) {
  await copyFile(
    resolve(root, "artifacts/evals", manifest),
    resolve(publicReviewEvidenceDirectory, manifest),
  );
}

const releaseCommit = execFileSync(
  "git",
  [
    "-c",
    `safe.directory=${root.replaceAll("\\", "/")}`,
    "rev-parse",
    "HEAD",
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    },
  },
).trim();
if (!/^[a-f0-9]{40}$/.test(releaseCommit)) {
  throw new Error("Operations review release commit is invalid");
}
const operationsReviewManifestCore = {
  schemaVersion: "operations-service-human-review-study-manifest-v1",
  studyId: "operations-service-human-review-v1",
  dataMode: "SYNTHETIC",
  development: false,
  releaseCommit,
  stimuli: {
    ADMIN: {
      path: "/artifacts/evals/screenshots/operations-service-1440x900.png",
      sha256: createHash("sha256")
        .update(
          await readFile(
            resolve(
              root,
              "artifacts/evals/screenshots/operations-service-1440x900.png",
            ),
          ),
        )
        .digest("hex"),
    },
    RIDER: {
      path: "/artifacts/evals/screenshots/operations-rider-390x844.png",
      sha256: createHash("sha256")
        .update(
          await readFile(
            resolve(
              root,
              "artifacts/evals/screenshots/operations-rider-390x844.png",
            ),
          ),
        )
        .digest("hex"),
    },
  },
};
const operationsReviewManifest = {
  ...operationsReviewManifestCore,
  manifestSha256: createHash("sha256")
    .update(JSON.stringify(operationsReviewManifestCore))
    .digest("hex"),
};
const operationsReviewManifestText = `${JSON.stringify(
  operationsReviewManifest,
  null,
  2,
)}\n`;
await writeFile(
  resolve(operationsReviewDirectory, "study-manifest.json"),
  operationsReviewManifestText,
  "utf8",
);
if (process.env.SAFEROUTE_PERSIST_REVIEW_MANIFEST === "true") {
  await mkdir(operationsReviewStimulusEvidenceDirectory, {
    recursive: true,
  });
  await writeFile(
    operationsReviewManifestArtifactPath,
    operationsReviewManifestText,
    "utf8",
  );
  for (const [role, screenshotName] of [
    ["ADMIN", "operations-service-1440x900.png"],
    ["RIDER", "operations-rider-390x844.png"],
  ]) {
    await copyFile(
      resolve(root, "artifacts/evals/screenshots", screenshotName),
      resolve(
        operationsReviewStimulusEvidenceDirectory,
        `${operationsReviewManifest.stimuli[role].sha256}.png`,
      ),
    );
  }
}
await copyFile(
  resolve(operationsReviewDirectory, "study-manifest.json"),
  resolve(
    publicReviewEvidenceDirectory,
    "operations-human-review-study-manifest.json",
  ),
);
await mkdir(workerDirectory, { recursive: true });
await mkdir(metadataDirectory, { recursive: true });
await cp(resolve(root, ".openai/drizzle"), drizzleDirectory, {
  recursive: true,
});
await writeFile(resolve(workerDirectory, "index.js"), workerSource, "utf8");
await copyFile(
  directionsProxySource,
  resolve(workerDirectory, "kakao-directions-proxy.mjs"),
);
await copyFile(
  operationsSessionStoreSource,
  resolve(workerDirectory, "operations-session-store.mjs"),
);
await copyFile(
  syntheticOperationsStoreSource,
  resolve(workerDirectory, "synthetic-operations-store.mjs"),
);
await copyFile(
  syntheticCourierDirectorySource,
  resolve(workerDirectory, "synthetic-courier-directory.mjs"),
);
await copyFile(
  riderProfileStoreSource,
  resolve(workerDirectory, "rider-profile-store.mjs"),
);
await copyFile(
  riderProfilesSource,
  resolve(workerDirectory, "rider-profiles.mjs"),
);
await copyFile(
  upstageExplanationProxySource,
  resolve(workerDirectory, "upstage-explanation-proxy.mjs"),
);
await copyFile(hostingPath, resolve(metadataDirectory, "hosting.json"));

console.log(`SITES_WORKER_BUILD_PASS project=${hosting.project_id}`);
