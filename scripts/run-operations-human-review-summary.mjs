import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}
const inputDirectory = resolve(
  argumentValue("input") ??
    resolve(root, "artifacts/human-review/operations-service"),
);
const outputPath = resolve(
  argumentValue("output") ??
    resolve(root, "artifacts/evals/operations-human-review-summary.json"),
);
const manifestPath = resolve(
  argumentValue("manifest") ??
    resolve(
      root,
      "artifacts/evals/operations-human-review-study-manifest.json",
    ),
);
const stimulusDirectory = resolve(
  argumentValue("stimulus-directory") ??
    resolve(root, "artifacts/evals/human-review-stimuli"),
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const manifestCore = {
  schemaVersion: manifest.schemaVersion,
  studyId: manifest.studyId,
  dataMode: manifest.dataMode,
  development: manifest.development,
  releaseCommit: manifest.releaseCommit,
  stimuli: manifest.stimuli,
};
const computedManifestSha256 = createHash("sha256")
  .update(JSON.stringify(manifestCore))
  .digest("hex");
if (
  manifest.schemaVersion !==
    "operations-service-human-review-study-manifest-v1" ||
  manifest.studyId !== "operations-service-human-review-v2" ||
  manifest.dataMode !== "SYNTHETIC" ||
  manifest.development !== false ||
  !/^[a-f0-9]{40}$/.test(manifest.releaseCommit ?? "") ||
  manifest.manifestSha256 !== computedManifestSha256 ||
  !/^[a-f0-9]{64}$/.test(manifest.stimuli?.ADMIN?.sha256 ?? "") ||
  !/^[a-f0-9]{64}$/.test(manifest.stimuli?.RIDER?.sha256 ?? "")
) {
  throw new Error("Invalid operations human review study manifest");
}
for (const reviewRole of ["ADMIN", "RIDER"]) {
  const screenshotBytes = await readFile(
    resolve(stimulusDirectory, `${manifest.stimuli[reviewRole].sha256}.png`),
  );
  const screenshotSha256 = createHash("sha256")
    .update(screenshotBytes)
    .digest("hex");
  if (manifest.stimuli[reviewRole].sha256 !== screenshotSha256) {
    throw new Error(
      `Operations review stimulus does not match the manifest: ${reviewRole}`,
    );
  }
}
await mkdir(inputDirectory, { recursive: true });
const files = (await readdir(inputDirectory)).filter((file) =>
  file.endsWith(".json"),
);
const expectedAnswers = {
  ADMIN: {
    "admin-purpose": "SUPPORT",
    "admin-data-mode": "SYNTHETIC",
    "admin-metric": "OPERATIONAL",
    "admin-action": "REVIEW_FIRST",
    "admin-map": "SYNTHETIC_MAP",
  },
  RIDER: {
    "rider-choice": "THREE",
    "rider-penalty": "NO_PENALTY",
    "rider-map": "ASSIST",
    "rider-apply": "AFTER_APPROVAL",
  },
};
const results = [];
for (const file of files) {
  const bytes = await readFile(resolve(inputDirectory, file));
  const result = JSON.parse(bytes.toString("utf8"));
  if (
    result.schemaVersion !==
      "operations-service-human-review-result-v1" ||
    result.studyId !== "operations-service-human-review-v2" ||
    result.dataMode !== "SYNTHETIC" ||
    !["ADMIN", "RIDER"].includes(result.role) ||
    !/^[A-Za-z0-9_-]{3,24}$/.test(result.reviewerCode ?? "") ||
    result.releaseCommit !== manifest.releaseCommit ||
    result.studyManifestSha256 !== manifest.manifestSha256 ||
    result.stimulusSha256 !== manifest.stimuli?.[result.role]?.sha256 ||
    !Number.isFinite(Date.parse(result.completedAt ?? "")) ||
    !Array.isArray(result.answers) ||
    result.answers.length !==
      Object.keys(expectedAnswers[result.role] ?? {}).length ||
    result.uploadPerformed !== false
  ) {
    throw new Error(`Invalid operations review result: ${file}`);
  }
  const expected = expectedAnswers[result.role];
  const answerIds = result.answers.map((answer) => answer.questionId);
  if (
    new Set(answerIds).size !== answerIds.length ||
    Object.keys(expected).some((questionId) => !answerIds.includes(questionId))
  ) {
    throw new Error(`Invalid operations review question set: ${file}`);
  }
  const verifiedAnswers = result.answers.map((answer) => {
    const expectedValue = expected[answer.questionId];
    const correct = answer.answer === expectedValue;
    if (
      answer.expected !== expectedValue ||
      answer.correct !== correct ||
      answer.critical !== true
    ) {
      throw new Error(`Tampered operations review answer: ${file}`);
    }
    return { ...answer, correct };
  });
  const verifiedCorrectCount = verifiedAnswers.filter(
    (answer) => answer.correct,
  ).length;
  const verifiedCriticalMisconceptionCount = verifiedAnswers.filter(
    (answer) => !answer.correct,
  ).length;
  if (
    result.correctCount !== verifiedCorrectCount ||
    result.criticalMisconceptionCount !==
      verifiedCriticalMisconceptionCount
  ) {
    throw new Error(`Invalid operations review totals: ${file}`);
  }
  results.push({
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...result,
    answers: verifiedAnswers,
  });
}
const uniqueReviewers = new Set(
  results.map((result) => result.reviewerCode),
);
if (uniqueReviewers.size !== results.length) {
  throw new Error("Duplicate operations review reviewer codes");
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
  studyId: "operations-service-human-review-v2",
  dataMode: "SYNTHETIC",
  capturedAt: new Date().toISOString(),
  releaseCommit: manifest.releaseCommit,
  studyManifestSha256: manifest.manifestSha256,
  stimulusSha256: {
    ADMIN: manifest.stimuli.ADMIN.sha256,
    RIDER: manifest.stimuli.RIDER.sha256,
  },
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
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(
  `Operations human review: ${summary.status} admin=${admin.length}/3 rider=${rider.length}/5 critical=${criticalMisconceptionCount}`,
);
console.log(`JSON: ${outputPath}`);
if (!ready) process.exitCode = 2;
