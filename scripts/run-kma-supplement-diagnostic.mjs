import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnv } from "vite";

const root = process.cwd();
const environment = { ...process.env, ...loadEnv("development", root, "") };
const authKey = environment.KMA_API_HUB_AUTH_KEY?.trim();
if (!authKey) throw new Error("KMA_API_HUB_AUTH_KEY is not configured");

const now = new Date(Date.now() + 9 * 60 * 60 * 1_000 - 20 * 60 * 1_000);
now.setUTCMinutes(now.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
const tm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
const endpoint = new URL(
  "https://apihub.kma.go.kr/api/typ01/url/sfc_nc_var.php",
);
endpoint.searchParams.set("tm1", tm);
endpoint.searchParams.set("tm2", tm);
endpoint.searchParams.set("lon", "126.96579");
endpoint.searchParams.set("lat", "37.57141");
endpoint.searchParams.set("obs", "ta_chi,vs,sd_3hr");
endpoint.searchParams.set("itv", "10");
endpoint.searchParams.set("help", "1");
endpoint.searchParams.set("authKey", authKey);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);
let response;
try {
  response = await fetch(endpoint, {
    headers: { Accept: "text/plain" },
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeout);
}
if (!response.ok) throw new Error(`KMA supplement HTTP ${response.status}`);
const responseBytes = new Uint8Array(await response.arrayBuffer());
if (responseBytes.byteLength > 200_000) {
  throw new Error("KMA supplement diagnostic response is too large");
}
const responseText = new TextDecoder("euc-kr").decode(responseBytes);

const lines = responseText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const requestedLabels = ["TM", "LON", "LAT", "TA_CHI", "VS", "SD_3HR"];
const detectedLabels = requestedLabels.filter((label) =>
  new RegExp(`(^|[^A-Z0-9_])${label}([^A-Z0-9_]|$)`, "i").test(responseText),
);
const dataLines = lines.filter(
  (line) =>
    !line.startsWith("#") &&
    !line.startsWith("=") &&
    /^\d{12}(\s|,)/.test(line),
);
const safeHelpLines = lines
  .filter(
    (line) =>
      line.startsWith("#") && /(^|\s)(TA_CHI|VS|SD_3HR)(\s|$)/i.test(line),
  )
  .map((line) =>
    line
      .replace(/authKey=[^\s&]+/gi, "authKey=[REDACTED]")
      .replace(/https?:\/\/\S+/gi, "[URL_REDACTED]"),
  );
const classifyToken = (token) => {
  if (/^\d{12}$/.test(token)) return "KST_TIMESTAMP_12";
  if (/^-?9{2,}(\.0+)?$/.test(token)) return "MISSING_SENTINEL";
  if (/^-?\d+(\.\d+)?$/.test(token)) return "NUMERIC";
  return "OTHER";
};
const tokenShapes = dataLines.slice(0, 3).map((line) => {
  const tokens = line.split(/[\s,]+/).filter(Boolean);
  return { tokenCount: tokens.length, tokenTypes: tokens.map(classifyToken) };
});
const result = {
  schemaVersion: "kma-supplement-diagnostic-v1",
  capturedAt: new Date().toISOString(),
  status: "COMPLETED",
  request: {
    api: "KMA_HIGH_RESOLUTION_GRID_POINT_MULTI_ELEMENT_1_3",
    timeKst: tm,
    representativePointId: "kma-api-hub-public-example-seoul",
    requestedFields: ["ta_chi", "vs", "sd_3hr"],
    rawCoordinatesStored: false,
  },
  response: {
    contentType: response.headers.get("content-type"),
    byteLength: responseBytes.byteLength,
    lineCount: lines.length,
    dataLineCount: dataLines.length,
    detectedLabels,
    safeHelpLines,
    tokenShapes,
    responseSha256: createHash("sha256").update(responseBytes).digest("hex"),
    rawResponseStored: false,
  },
  credentialsStored: false,
};
const outputDirectory = path.join(root, "artifacts", "evals");
await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(
  outputDirectory,
  "kma-supplement-diagnostic-latest.json",
);
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(
  `KMA_SUPPLEMENT_DIAGNOSTIC_PASS lines=${result.response.lineCount} data=${result.response.dataLineCount} labels=${result.response.detectedLabels.join(",")} shapes=${result.response.tokenShapes.map((item) => item.tokenCount).join(",")}`,
);
console.log(`JSON: ${outputPath}`);
