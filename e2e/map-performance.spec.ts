import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { mapPerformanceBudget } from "../src/adapters/maps";

const viewport = { width: 1440, height: 900 };

function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

test("G4-B는 24·96·240명 Fallback 2D 부하에서 승인된 반응 예산을 지킨다", async ({ browser, page }) => {
  await page.setViewportSize(viewport);
  const profiles = [];

  // Vite transforms application modules on the first request in the test server.
  // Warm that server-only work in a separate context so the measured context
  // still has a cold browser cache and includes download, parse, and render time.
  const warmupContext = await browser.newContext({ viewport });
  const warmupPage = await warmupContext.newPage();
  await warmupPage.goto(`/closed-loop-demo?map-load-test=${mapPerformanceBudget.loadProfiles[0]}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(warmupPage.getByRole("heading", { name: "3개 권역의 지원 필요 상황" })).toBeVisible();
  await warmupContext.close();

  for (const totalCouriers of mapPerformanceBudget.loadProfiles) {
    const regionCouriers = totalCouriers / 3;
    const readyStartedAt = Date.now();
    await page.goto(`/closed-loop-demo?map-load-test=${totalCouriers}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "3개 권역의 지원 필요 상황" })).toBeVisible();
    const initialMapReadyMs = Date.now() - readyStartedAt;

    const routePanel = page.locator("#route-decision");
    await expect(routePanel).toHaveAttribute("data-map-total-couriers", String(totalCouriers));
    const drilldownStartedAt = Date.now();
    await page.getByRole("button", {
      name: `북부권역, 기사 ${regionCouriers}명, 지원 decision 4건`,
    }).click();
    await expect(page.getByRole("heading", { name: "북부권역의 기사와 경로" })).toBeVisible();
    await expect(routePanel).toHaveAttribute("data-map-visible-couriers", String(regionCouriers));
    const expectedRoutes = Math.min(
      regionCouriers,
      mapPerformanceBudget.maxRenderedRegionRoutes,
    );
    await expect(routePanel).toHaveAttribute("data-map-rendered-routes", String(expectedRoutes));
    const regionDrilldownMs = Date.now() - drilldownStartedAt;

    const movingMarker = page.getByRole("button", {
      name: /courier-01, 지원 필요, 위치 CURRENT/,
    });
    const previousStyle = await movingMarker.getAttribute("style");
    const frameStartedAt = Date.now();
    await page.getByRole("button", { name: "다음 5초" }).click();
    await expect(page.getByText("00:05 / 00:30", { exact: true })).toBeVisible();
    await expect.poll(() => movingMarker.getAttribute("style")).not.toBe(previousStyle);
    const frameUpdateMs = Date.now() - frameStartedAt;

    const map = page.getByRole("group", { name: "지도 이동 영역" });
    const surface = page.locator(".control-map-pan-surface");
    await map.scrollIntoViewIfNeeded();
    await map.focus();
    const panStartedAt = Date.now();
    await page.keyboard.press("ArrowRight");
    await expect(surface).toHaveAttribute("data-pan-x", "24");
    const panResponseMs = Date.now() - panStartedAt;

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
    const usedJsHeapMiB = await page.evaluate(() => {
      const memory = (performance as Performance & {
        memory?: { usedJSHeapSize: number };
      }).memory;
      return memory ? Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(2)) : null;
    });

    const passed =
      initialMapReadyMs <= mapPerformanceBudget.maximumInitialMapReadyMs &&
      regionDrilldownMs <= mapPerformanceBudget.maximumRegionDrilldownMs &&
      frameUpdateMs <= mapPerformanceBudget.maximumFrameUpdateMs &&
      panResponseMs <= mapPerformanceBudget.maximumPanResponseMs &&
      p95FrameGapMs <= mapPerformanceBudget.maximumP95FrameGapMs &&
      maxFrameGapMs <= mapPerformanceBudget.maximumFrameGapMs;

    expect(initialMapReadyMs).toBeLessThanOrEqual(mapPerformanceBudget.maximumInitialMapReadyMs);
    expect(regionDrilldownMs).toBeLessThanOrEqual(mapPerformanceBudget.maximumRegionDrilldownMs);
    expect(frameUpdateMs).toBeLessThanOrEqual(mapPerformanceBudget.maximumFrameUpdateMs);
    expect(panResponseMs).toBeLessThanOrEqual(mapPerformanceBudget.maximumPanResponseMs);
    expect(p95FrameGapMs).toBeLessThanOrEqual(mapPerformanceBudget.maximumP95FrameGapMs);
    expect(maxFrameGapMs).toBeLessThanOrEqual(mapPerformanceBudget.maximumFrameGapMs);

    profiles.push({
      totalCouriers,
      visibleRegionCouriers: regionCouriers,
      renderedRegionRoutes: expectedRoutes,
      initialMapReadyMs,
      regionDrilldownMs,
      frameUpdateMs,
      panResponseMs,
      p95FrameGapMs,
      maxFrameGapMs,
      usedJsHeapMiB,
      passed,
    });
  }

  const artifact = {
    schemaVersion: "map-performance-evidence-v1",
    capturedAt: new Date().toISOString(),
    status: profiles.every((profile) => profile.passed) ? "PASSED" : "FAILED",
    dataMode: "DEMO",
    renderer: "FALLBACK_2D",
    environment: {
      platform: process.platform,
      browser: "Chromium",
      browserVersion: browser.version(),
      viewport,
      reducedMotion: false,
    },
    budget: mapPerformanceBudget,
    profiles,
    limitations: [
      "Local Windows headless Chromium baseline; not a claim for every presentation or field device.",
      "Vite on-demand module transformation is warmed in a separate browser context; the measured context keeps a cold browser cache and includes download, parse, and render time.",
      "Fallback schematic 2D only; Kakao SDK network, tile, quota, and provider latency are excluded.",
      "Deterministic synthetic Demo positions only; no GPS, TMS, personal data, battery, or field network measurement.",
      "usedJsHeapMiB is observational and is not a hard gate because browser support varies.",
    ],
  };
  await mkdir(resolve("artifacts/evals"), { recursive: true });
  await writeFile(
    resolve("artifacts/evals/map-performance-summary.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );
  expect(artifact.status).toBe("PASSED");
});
