import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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

test("G5-A는 같은 decision의 Demo 2.5D를 성능 예산 안에서 열고 2D로 복귀한다", async ({ browser, page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await selectPrimaryDecision(page);

  const toggle = page.getByRole("button", { name: "입체 경사 보기 · Demo" });
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
  await expect(scene.getByText(`Decision ID · ${decisionId}`)).toBeVisible();

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
  const previousG4BGzipJsBytes = 127_195;
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
  await page.goto("/");
  await selectPrimaryDecision(page);
  await page.getByRole("button", { name: "입체 경사 보기 · Demo" }).click();
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
    page.getByRole("button", { name: "입체 경사 보기 · Demo" }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
});
