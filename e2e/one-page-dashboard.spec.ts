import { expect, test } from "@playwright/test";

test("단일 대시보드는 합성 프로필 카드와 지도의 선택 상태를 공유한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dashboard-demo");

  await expect(page.getByRole("heading", { name: "Safety Control Tower" })).toBeVisible();
  await expect(page.locator("[data-courier-card]")).toHaveCount(20);
  await expect(page.getByRole("heading", { name: "향후 60분" })).toHaveCount(0);
  await expect(page.getByText("합성 위치 · 14:32")).toBeVisible();
  await expect(page.getByText("Live 0")).toBeVisible();
  await expect(page.getByText("역삼 A")).toBeVisible();
  await expect(page.getByText("안전여유")).toHaveCount(20);
  await expect(
    page.getByRole("button", {
      name: "강태현 기사, 지정구역 역삼 A, 안전여유 24.1, 초과",
    }),
  ).toBeVisible();
  await expect(page.locator(".onepage-profile-photo")).toHaveCount(20);

  const profileAssetLoaded = await page
    .locator(".onepage-profile-photo")
    .first()
    .evaluate((element) => {
      const image = getComputedStyle(element).backgroundImage;
      return image.includes("synthetic-courier-profiles-v1");
    });
  expect(profileAssetLoaded).toBe(true);

  const firstCardSize = await page
    .locator("[data-courier-card]")
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
  expect(firstCardSize.height).toBeGreaterThan(190);
  expect(firstCardSize.height).toBeGreaterThan(firstCardSize.width);
  const safetyValueFontSize = await page
    .locator(".onepage-card-safety b")
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(safetyValueFontSize).toBeGreaterThanOrEqual(24);
  await expect(
    page.locator('[data-courier-card="R-014"] .onepage-card-safety'),
  ).not.toContainText("!");
  await expect(
    page.locator('[data-courier-card="R-014"] .onepage-card-safety'),
  ).toContainText("초과");

  const openOverflow = await page.evaluate(() => ({
    horizontal:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical:
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(openOverflow.horizontal).toBeLessThanOrEqual(1);
  expect(openOverflow.vertical).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "test-results/dashboard-demo-1280x720.png",
    fullPage: false,
  });

  const sourceCard = page.locator('[data-courier-card="R-008"]');
  await sourceCard.click();
  await expect(sourceCard).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-map-marker="R-008"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "백승기 기사 외 1명 묶음" }).click();
  await expect(page.locator('[data-courier-card="R-011"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-map-marker="R-011"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const overflow = await page.evaluate(() => ({
    horizontal:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical:
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
});

test("1440×900에서도 프로필과 지도가 한 화면에 유지된다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard-demo");
  await expect(page.getByRole("heading", { name: "Safety Control Tower" })).toBeVisible();

  const regions = await page.locator("main.onepage-demo > section").evaluateAll(
    (sections) =>
      sections.map((section) => {
        const rect = section.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
  );
  expect(regions).toHaveLength(2);
  expect(regions.every((region) => region.top >= 0 && region.bottom <= 900)).toBe(
    true,
  );

  const overflow = await page.evaluate(() => ({
    horizontal:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical:
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "test-results/dashboard-demo-1440x900.png",
    fullPage: false,
  });
});
