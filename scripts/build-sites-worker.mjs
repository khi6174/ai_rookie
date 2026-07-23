import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const hostingPath = resolve(root, ".openai/hosting.json");
const clientDirectory = resolve(root, "dist/client");
const workerDirectory = resolve(root, "dist/server");
const metadataDirectory = resolve(root, "dist/.openai");
const publicReviewDirectory = resolve(clientDirectory, "tools");
const publicReviewEvidenceDirectory = resolve(
  clientDirectory,
  "artifacts/evals",
);
const publicReviewScreenshotDirectory = resolve(
  publicReviewEvidenceDirectory,
  "screenshots",
);

const hosting = JSON.parse(await readFile(hostingPath, "utf8"));
if (typeof hosting.project_id !== "string" || hosting.project_id.length === 0) {
  throw new Error("Sites project_id is missing from .openai/hosting.json");
}

const workerSource = `const securityHeaders = {
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
await mkdir(publicReviewScreenshotDirectory, { recursive: true });
for (const screenshot of [
  "g5-round3-admin-decision-2d-1280x720.png",
  "g5-round3-admin-decision-2-5d-1280x720.png",
  "rider-source-route-round2-390x844.png",
]) {
  await copyFile(
    resolve(root, "artifacts/evals/screenshots", screenshot),
    resolve(publicReviewScreenshotDirectory, screenshot),
  );
}
for (const manifest of [
  "g5-spatial-round3-stimulus-manifest.json",
  "rider-reference-round2-stimulus-manifest.json",
]) {
  await copyFile(
    resolve(root, "artifacts/evals", manifest),
    resolve(publicReviewEvidenceDirectory, manifest),
  );
}
await mkdir(workerDirectory, { recursive: true });
await mkdir(metadataDirectory, { recursive: true });
await writeFile(resolve(workerDirectory, "index.js"), workerSource, "utf8");
await copyFile(hostingPath, resolve(metadataDirectory, "hosting.json"));

console.log(`SITES_WORKER_BUILD_PASS project=${hosting.project_id}`);
