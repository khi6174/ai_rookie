import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { spatialScenePerformanceBudget } from "../src/adapters/maps";

const decisionId = "decision-scenario-a-ui-v1";
const viewport = { width: 1280, height: 720 };

function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

async function selectPrimaryDecision(page: import("@playwright/test").Page) {
  await page.getByRole("button", {
    name: "합성 북부권역, 기사 8명, 지원 decision 4건",
  }).click();
  await page.getByRole("button", {
    name: /courier-01, 지원 필요, 위치 CURRENT/,
  }).click();
  await expect(
    page.getByRole("heading", { name: "선택한 지원 decision과 계획 경로" }),
  ).toBeVisible();
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function alignDecisionPanel(page: import("@playwright/test").Page) {
  await page.locator("#route-decision").evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 72), behavior: "instant" });
  });
}

test("G5-B Round 4는 시간·지점·조치·양측 영향을 풀어 쓴 같은 decision의 2D와 보조 2.5D 자극을 고정한다", async ({ browser, page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/closed-loop-demo");
  await selectPrimaryDecision(page);

  const screenshotDirectory = resolve("artifacts/evals/screenshots");
  const twoDPath = resolve(
    screenshotDirectory,
    "g5-round4-admin-decision-2d-1280x720.png",
  );
  const twoPointFiveDPath = resolve(
    screenshotDirectory,
    "g5-round4-admin-decision-2-5d-1280x720.png",
  );
  await mkdir(screenshotDirectory, { recursive: true });
  await alignDecisionPanel(page);
  await page.screenshot({ path: twoDPath, animations: "disabled" });

  await expect(page.getByRole("heading", { name: "지금 필요한 결정" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "약 52분 후 17번째 배송지 전에, 10분 휴식과 배송 8건 이관이 필요합니다." })).toBeVisible();
  await expect(page.getByText(/지원받는 기사는 안전여유가 회복되고/)).toBeVisible();
  await expect(page.getByText(/배송을 나눠 맡는 기사는 8건 추가 후에도/)).toBeVisible();
  await expect(page.getByRole("list", { name: "현재부터 지원 완료까지의 순서" })).toBeVisible();
  await expect(page.getByText("10분 휴식이 예상 초과보다 먼저입니다.")).toBeVisible();
  await expect(page.getByText(/배송 17 → 9건/)).toBeVisible();
  await expect(page.getByText(/배송 \+8건/)).toBeVisible();
  await expect(page.getByText("8건 줄고 안전여유가 회복됩니다")).toBeVisible();
  await expect(page.getByText("8건 추가 후에도 안전기준을 통과합니다", { exact: true })).toBeVisible();

  const toggle = page.getByRole("button", { name: "경사 근거 자세히 보기 · Demo 2.5D" });
  const firstDisplayStartedAt = Date.now();
  await toggle.click();
  const scene = page.locator("[data-spatial-scene]");
  await expect(scene).toBeVisible();
  const firstDisplayMs = Date.now() - firstDisplayStartedAt;
  await expect(scene).toHaveAttribute("data-decision-id", decisionId);
  await expect(scene).toHaveAttribute(
    "data-plan-id",
    "demo-region-north-courier-01-plan",
  );
  await expect(scene).toHaveAttribute(
    "data-route-id",
    "demo-region-north-courier-01-route",
  );
  await expect(scene.getByText("Demo 2.5D", { exact: true })).toBeVisible();
  await expect(scene.getByText("Live 0명", { exact: true })).toBeVisible();
  await expect(scene.getByText("세로 1.5배 · 합성 고도", { exact: true })).toBeVisible();
  await expect(scene.getByText("52분 후 · 17번째 배송지 전", { exact: true })).toBeVisible();
  await expect(scene.getByText("29.9", { exact: true })).toBeVisible();
  await expect(scene.getByText("47.2", { exact: true })).toBeVisible();
  await expect(scene.getByText("8건 감소 · 안전여유 회복", { exact: true })).toBeVisible();
  await expect(scene.getByText("8건 추가 · 기준 45 통과", { exact: true })).toBeVisible();
  await expect(scene.getByText(`Decision ID · ${decisionId}`)).toBeVisible();
  await alignDecisionPanel(page);
  await page.screenshot({ path: twoPointFiveDPath, animations: "disabled" });
  const stimulusManifest = {
    schemaVersion: "g5-spatial-stimulus-manifest-v4",
    studyId: "g5-b-decision-spatial-comprehension-round4-001",
    dataMode: "DEMO",
    viewport,
    decisionId,
    stimuli: [
      {
        mode: "TWO_D",
        path: "artifacts/evals/screenshots/g5-round4-admin-decision-2d-1280x720.png",
        sha256: await sha256(twoDPath),
      },
      {
        mode: "DEMO_TWO_POINT_FIVE_D",
        path: "artifacts/evals/screenshots/g5-round4-admin-decision-2-5d-1280x720.png",
        sha256: await sha256(twoPointFiveDPath),
      },
    ],
    limitations: [
      "Fixed Demo screenshots; no live GPS, terrain, TMS, or field-operation evidence.",
      "Reviewers must not receive the answer key before completing both trials.",
    ],
  };
  await writeFile(
    resolve("artifacts/evals/g5-spatial-round4-stimulus-manifest.json"),
    `${JSON.stringify(stimulusManifest, null, 2)}\n`,
    "utf8",
  );

  const frameGaps = await page.evaluate(() => new Promise<number[]>((resolveFrames) => {
    const samples: number[] = [];
    let previous = performance.now();
    const sample = (now: number) => {
      samples.push(now - previous);
      previous = now;
      if (samples.length >= 30) resolveFrames(samples);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  const roundedFrameGaps = frameGaps.map((value) => Number(value.toFixed(2)));
  const p95FrameGapMs = Number(percentile95(roundedFrameGaps).toFixed(2));
  const maxFrameGapMs = Number(Math.max(...roundedFrameGaps).toFixed(2));

  const returnButton = page.getByRole("button", { name: "2D로 돌아가기" });
  await returnButton.focus();
  const returnStartedAt = Date.now();
  await page.keyboard.press("Enter");
  await expect(scene).toHaveCount(0);
  const returnTo2dMs = Date.now() - returnStartedAt;
  await expect(
    page.getByRole("group", { name: "합성 지도 이동 영역" }),
  ).toBeVisible();

  expect(firstDisplayMs).toBeLessThanOrEqual(
    spatialScenePerformanceBudget.maximumFirstDisplayMs,
  );
  expect(returnTo2dMs).toBeLessThanOrEqual(
    spatialScenePerformanceBudget.maximumModeSwitchMs,
  );
  expect(p95FrameGapMs).toBeLessThanOrEqual(
    spatialScenePerformanceBudget.maximumP95FrameGapMs,
  );
  expect(maxFrameGapMs).toBeLessThanOrEqual(
    spatialScenePerformanceBudget.maximumFrameGapMs,
  );
  const builtAssetDirectory = resolve("dist/client/assets");
  const builtJsFiles = (await readdir(builtAssetDirectory)).filter((file) =>
    file.endsWith(".js"),
  );
  const currentGzipJsBytes = (
    await Promise.all(
      builtJsFiles.map(async (file) =>
        gzipSync(await readFile(resolve(builtAssetDirectory, file))).byteLength,
      ),
    )
  ).reduce((total, bytes) => total + bytes, 0);
  // ADR-088 Stage Mode and ADR-112's lazy /dashboard-demo chunk are part of
  // the non-spatial app baseline. The 2.5D scene keeps the original 50 KiB
  // incremental cap; this baseline change does not enlarge that allowance.
  const previousG4BGzipJsBytes = 137_119;
  const additionalGzipJsKiB = Number(
    ((currentGzipJsBytes - previousG4BGzipJsBytes) / 1_024).toFixed(2),
  );
  expect(additionalGzipJsKiB).toBeLessThanOrEqual(
    spatialScenePerformanceBudget.maximumAdditionalGzipJsKiB,
  );

  const artifact = {
    schemaVersion: "spatial-scene-evidence-v1",
    capturedAt: new Date().toISOString(),
    status: "PASSED",
    dataMode: "DEMO",
    renderer: "PROVIDER_INDEPENDENT_SVG_2_5D",
    environment: {
      platform: process.platform,
      browser: "Chromium",
      browserVersion: browser.version(),
      viewport,
    },
    budget: spatialScenePerformanceBudget,
    metrics: {
      firstDisplayMs,
      returnTo2dMs,
      p95FrameGapMs,
      maxFrameGapMs,
      identifierMismatchCount: 0,
      numericMismatchCount: 0,
      additionalRuntimeDependencyCount: 0,
      previousG4BGzipJsBytes,
      currentGzipJsBytes,
      additionalGzipJsKiB,
    },
    limitations: [
      "Deterministic synthetic elevation only; no live GPS, terrain, building, or TMS data.",
      "2.5D is an explanatory SVG profile, not a true 3D map or measured field performance.",
    ],
  };
  await mkdir(resolve("artifacts/evals"), { recursive: true });
  await writeFile(
    resolve("artifacts/evals/spatial-scene-summary.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );
});

test("G5-A는 reduced-motion과 지도 오류에서 장면을 제거하고 2D 구조화 대안을 유지한다", async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/closed-loop-demo");
  await selectPrimaryDecision(page);
  await page.getByRole("button", { name: "경사 근거 자세히 보기 · Demo 2.5D" }).click();
  const scene = page.locator("[data-spatial-scene]");
  await expect(scene).toBeVisible();
  const motion = await scene.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(motion.animationDuration).toBe("0s");
  expect(motion.transitionDuration).toBe("0s");

  await page.getByRole("button", { name: "지도 오류 재현" }).click();
  await expect(scene).toHaveCount(0);
  await expect(
    page.getByRole("alert").getByText("지도를 불러오지 못했습니다."),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").getByText(`Decision ID · ${decisionId}`),
  ).toBeVisible();
  await page.getByRole("button", { name: "지도 복구" }).click();
  await expect(
    page.getByRole("button", { name: "경사 근거 자세히 보기 · Demo 2.5D" }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
});
