import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const imagePath = resolve(
  "artifacts/evals/screenshots/rider-source-route-390x844.png",
);
const outputPath = resolve(
  "artifacts/evals/rider-reference-stimulus-manifest.json",
);
const image = await readFile(imagePath);

if (image.toString("ascii", 1, 4) !== "PNG") {
  throw new Error("Rider reference stimulus must be a PNG image");
}

const width = image.readUInt32BE(16);
const height = image.readUInt32BE(20);
if (width !== 390 || height !== 844) {
  throw new Error(`Unexpected rider stimulus size: ${width}x${height}`);
}

const manifest = {
  schemaVersion: "rider-reference-stimulus-manifest-v1",
  studyId: "rider-route-product-boundary-001",
  dataMode: "DEMO",
  stimulus: {
    path: "artifacts/evals/screenshots/rider-source-route-390x844.png",
    width,
    height,
    sha256: createHash("sha256").update(image).digest("hex"),
  },
  questions: [
    "current delivery segment",
    "next safety stop",
    "support boundary",
    "SafeRoute product role",
    "human approval rule",
    "Demo versus Live boundary",
  ],
  note:
    "Fixed deterministic Demo stimulus; no live GPS, navigation, sensor, or personal data.",
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `RIDER_REFERENCE_STIMULUS_PASS size=${width}x${height} sha256=${manifest.stimulus.sha256}`,
);
console.log(`manifest=${outputPath}`);
