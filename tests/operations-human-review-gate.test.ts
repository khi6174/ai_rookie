// @ts-nocheck -- Node CLI integration fixture; application tsconfig is browser-only.
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = resolve(".");
let testDirectory: string;
let inputDirectory: string;
let manifestPath: string;
let outputPath: string;
let stimulusDirectory: string;

const expectedAnswers = {
  ADMIN: {
    "admin-purpose": "SUPPORT",
    "admin-data-mode": "SYNTHETIC",
    "admin-ai": "EXPLAIN",
    "admin-consent": "RIDER",
    "admin-documents": "VALIDATED",
  },
  RIDER: {
    "rider-choice": "THREE",
    "rider-penalty": "NO_PENALTY",
    "rider-map": "ASSIST",
    "rider-apply": "AFTER_APPROVAL",
  },
} as const;

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function prepareManifest() {
  const core = {
    schemaVersion: "operations-service-human-review-study-manifest-v1",
    studyId: "operations-service-human-review-v1",
    dataMode: "SYNTHETIC",
    development: false,
    releaseCommit: "a".repeat(40),
    stimuli: {
      ADMIN: {
        path: "/artifacts/evals/screenshots/operations-service-1440x900.png",
        sha256: await sha256(
          resolve(
            root,
            "artifacts/evals/screenshots/operations-service-1440x900.png",
          ),
        ),
      },
      RIDER: {
        path: "/artifacts/evals/screenshots/operations-rider-390x844.png",
        sha256: await sha256(
          resolve(
            root,
            "artifacts/evals/screenshots/operations-rider-390x844.png",
          ),
        ),
      },
    },
  };
  const manifest = {
    ...core,
    manifestSha256: createHash("sha256")
      .update(JSON.stringify(core))
      .digest("hex"),
  };
  await mkdir(stimulusDirectory, { recursive: true });
  await Promise.all(
    [
      ["ADMIN", "operations-service-1440x900.png"],
      ["RIDER", "operations-rider-390x844.png"],
    ].map(async ([role, screenshotName]) =>
      writeFile(
        resolve(stimulusDirectory, `${manifest.stimuli[role].sha256}.png`),
        await readFile(
          resolve(root, "artifacts/evals/screenshots", screenshotName),
        ),
      ),
    ),
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

function resultFor(
  role: keyof typeof expectedAnswers,
  reviewerCode: string,
  manifest: Awaited<ReturnType<typeof prepareManifest>>,
) {
  const answers = Object.entries(expectedAnswers[role]).map(
    ([questionId, answer]) => ({
      questionId,
      answer,
      expected: answer,
      correct: true,
      critical: true,
    }),
  );
  return {
    schemaVersion: "operations-service-human-review-result-v1",
    studyId: "operations-service-human-review-v1",
    dataMode: "SYNTHETIC",
    role,
    reviewerCode,
    releaseCommit: manifest.releaseCommit,
    studyManifestSha256: manifest.manifestSha256,
    stimulusSha256: manifest.stimuli[role].sha256,
    completedAt: "2026-07-27T12:00:00.000Z",
    answers,
    correctCount: answers.length,
    criticalMisconceptionCount: 0,
    uploadPerformed: false,
  };
}

async function writeCompleteStudy(
  manifest: Awaited<ReturnType<typeof prepareManifest>>,
) {
  const results = [
    ...[1, 2, 3].map((index) =>
      resultFor("ADMIN", `admin-${index}`, manifest),
    ),
    ...[1, 2, 3, 4, 5].map((index) =>
      resultFor("RIDER", `rider-${index}`, manifest),
    ),
  ];
  await Promise.all(
    results.map((result) =>
      writeFile(
        resolve(inputDirectory, `${result.reviewerCode}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8",
      ),
    ),
  );
  return results;
}

function runGate() {
  return spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/run-operations-human-review-summary.mjs"),
      `--input=${inputDirectory}`,
      `--manifest=${manifestPath}`,
      `--output=${outputPath}`,
      `--stimulus-directory=${stimulusDirectory}`,
    ],
    { cwd: root, encoding: "utf8" },
  );
}

beforeEach(async () => {
  testDirectory = await mkdtemp(resolve(tmpdir(), "saferoute-human-review-"));
  inputDirectory = resolve(testDirectory, "input");
  manifestPath = resolve(testDirectory, "manifest.json");
  outputPath = resolve(testDirectory, "summary.json");
  stimulusDirectory = resolve(testDirectory, "stimuli");
  await mkdir(inputDirectory, { recursive: true });
});

afterEach(async () => {
  await rm(testDirectory, { recursive: true, force: true });
});

describe("operations human review release gate", () => {
  it("accepts only a complete 3-admin and 5-rider independent study", async () => {
    const manifest = await prepareManifest();
    await writeCompleteStudy(manifest);

    const completed = runGate();
    expect(completed.status, completed.stderr).toBe(0);
    const summary = JSON.parse(await readFile(outputPath, "utf8"));
    expect(summary).toMatchObject({
      status: "PASSED",
      adminReviewerCount: 3,
      riderReviewerCount: 5,
      criticalMisconceptionCount: 0,
      releaseCommit: manifest.releaseCommit,
      studyManifestSha256: manifest.manifestSha256,
    });
  });

  it("rejects one person reused across administrator and rider roles", async () => {
    const manifest = await prepareManifest();
    const results = await writeCompleteStudy(manifest);
    const duplicate = {
      ...results.find((result) => result.reviewerCode === "rider-1")!,
      reviewerCode: "admin-1",
    };
    await writeFile(
      resolve(inputDirectory, "rider-1.json"),
      `${JSON.stringify(duplicate, null, 2)}\n`,
      "utf8",
    );

    const completed = runGate();
    expect(completed.status).not.toBe(0);
    expect(completed.stderr).toContain(
      "Duplicate operations review reviewer codes",
    );
  });

  it("rejects a result bound to another stimulus", async () => {
    const manifest = await prepareManifest();
    const results = await writeCompleteStudy(manifest);
    const stale = {
      ...results.find((result) => result.reviewerCode === "rider-1")!,
      stimulusSha256: "b".repeat(64),
    };
    await writeFile(
      resolve(inputDirectory, "rider-1.json"),
      `${JSON.stringify(stale, null, 2)}\n`,
      "utf8",
    );

    const completed = runGate();
    expect(completed.status).not.toBe(0);
    expect(completed.stderr).toContain("Invalid operations review result");
  });
});
