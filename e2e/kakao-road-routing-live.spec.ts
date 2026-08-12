import { expect, test } from "@playwright/test";

test.skip(process.env.KAKAO_LIVE_E2E !== "true", "requires configured Kakao Maps and Mobility APIs");

test("25명 기사 마커가 Kakao Mobility 도로 경로 위에서 독립 이동한다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".onepage-map-canvas")).toHaveClass(/has-kakao-map/, { timeout: 30_000 });
  const routeStatus = page.locator(".onepage-road-route-status");
  await expect(routeStatus).toHaveAttribute("data-road-route-status", "LIVE", { timeout: 90_000 });
  await expect(routeStatus).toHaveAttribute("data-road-route-count", "25");
  const roadMarkers = page.locator('[data-map-marker][data-route-geometry="KAKAO_MOBILITY"]');
  await expect(roadMarkers).toHaveCount(25);

  const first = page.locator('[data-map-marker="demo-courier-001"]');
  const second = page.locator('[data-map-marker="demo-courier-002"]');
  const initial = await Promise.all([
    first.getAttribute("data-latitude"),
    first.getAttribute("data-longitude"),
    second.getAttribute("data-latitude"),
    second.getAttribute("data-longitude"),
  ]);
  await expect.poll(async () => Promise.all([
    first.getAttribute("data-latitude"),
    first.getAttribute("data-longitude"),
    second.getAttribute("data-latitude"),
    second.getAttribute("data-longitude"),
  ]), { timeout: 15_000 }).not.toEqual(initial);
  const current = await Promise.all([
    first.getAttribute("data-latitude"),
    first.getAttribute("data-longitude"),
    second.getAttribute("data-latitude"),
    second.getAttribute("data-longitude"),
  ]);
  expect(current.slice(0, 2)).not.toEqual(current.slice(2));
});
