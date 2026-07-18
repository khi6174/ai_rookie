import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const hostingPath = resolve(root, ".openai/hosting.json");
const clientDirectory = resolve(root, "dist/client");
const workerDirectory = resolve(root, "dist/server");
const metadataDirectory = resolve(root, "dist/.openai");

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
await mkdir(workerDirectory, { recursive: true });
await mkdir(metadataDirectory, { recursive: true });
await writeFile(resolve(workerDirectory, "index.js"), workerSource, "utf8");
await copyFile(hostingPath, resolve(metadataDirectory, "hosting.json"));

console.log(`SITES_WORKER_BUILD_PASS project=${hosting.project_id}`);
