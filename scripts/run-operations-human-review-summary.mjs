import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const inputDirectory = resolve(
  root,
  "artifacts/human-review/operations-service",
);
const outputPath = resolve(
  root,
  "artifacts/evals/operations-human-review-summary.json",
);
await mkdir(inputDirectory, { recursive: true });
const files = (await readdir(inputDirectory)).filter((file) =>
  file.endsWith(".json"),
);
const results = [];
for (const file of files) {
  const bytes = await readFile(resolve(inputDirectory, file));
  const result = JSON.parse(bytes.toString("utf8"));
  if (
    result.schemaVersion !==
      "operations-service-human-review-result-v1" ||
    result.studyId !== "operations-service-human-review-v1" ||
    result.dataMode !== "SYNTHETIC" ||
    !["ADMIN", "RIDER"].includes(result.role) ||
    !/^[A-Za-z0-9_-]{3,24}$/.test(result.reviewerCode ?? "") ||
    !Array.isArray(result.answers) ||
    result.answers.length !== 4 ||
    result.uploadPerformed !== false
  ) {
    throw new Error(`Invalid operations review result: ${file}`);
  }
  results.push({
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...result,
  });
}
const uniqueReviewers = new Set(
  results.map((result) => `${result.role}:${result.reviewerCode}`),
);
if (uniqueReviewers.size !== results.length) {
  throw new Error("Duplicate operations review role/reviewer codes");
}
const admin = results.filter((result) => result.role === "ADMIN");
const rider = results.filter((result) => result.role === "RIDER");
const criticalMisconceptionCount = results.reduce(
  (total, result) => total + result.criticalMisconceptionCount,
  0,
);
const fullyCorrectReviewerCount = results.filter(
  (result) => result.correctCount === result.answers.length,
).length;
const ready =
  admin.length >= 3 &&
  rider.length >= 5 &&
  criticalMisconceptionCount === 0 &&
  fullyCorrectReviewerCount === results.length;
const summary = {
  schemaVersion: "operations-service-human-review-summary-v1",
  studyId: "operations-service-human-review-v1",
  dataMode: "SYNTHETIC",
  capturedAt: new Date().toISOString(),
  status:
    results.length === 0
      ? "NOT_RUN"
      : ready
        ? "PASSED"
        : "MORE_REVIEW_REQUIRED",
  reviewerCount: results.length,
  adminReviewerCount: admin.length,
  riderReviewerCount: rider.length,
  fullyCorrectReviewerCount,
  criticalMisconceptionCount,
  required: { admin: 3, rider: 5 },
  results: results.map((result) => ({
    file: result.file,
    sha256: result.sha256,
    role: result.role,
    reviewerCode: result.reviewerCode,
    correctCount: result.correctCount,
    criticalMisconceptionCount: result.criticalMisconceptionCount,
  })),
};
await mkdir(resolve(root, "artifacts/evals"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(
  `Operations human review: ${summary.status} admin=${admin.length}/3 rider=${rider.length}/5 critical=${criticalMisconceptionCount}`,
);
console.log(`JSON: ${outputPath}`);
if (!ready) process.exitCode = 2;
