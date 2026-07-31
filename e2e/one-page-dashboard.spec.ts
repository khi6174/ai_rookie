import { expect, test } from "@playwright/test";

test("단일 대시보드는 합성 프로필 카드와 지도의 선택 상태를 공유한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dashboard-demo");

  await expect(page.getByRole("heading", { name: "향후 60분 지원 관제" })).toBeVisible();
  const dashboardPalette = await page.locator("main.onepage-demo").evaluate((main) => {
    const header = main.querySelector(".onepage-header")!;
    const brandMark = main.querySelector(".onepage-brand-mark")!;
    const action = main.querySelector(".onepage-support-focus > a")!;
    return {
      page: getComputedStyle(main).backgroundColor,
      header: getComputedStyle(header).backgroundColor,
      brand: getComputedStyle(brandMark).backgroundColor,
      action: getComputedStyle(action).backgroundColor,
    };
  });
  expect(dashboardPalette).toEqual({
    page: "rgb(244, 247, 252)",
    header: "rgb(255, 255, 255)",
    brand: "rgb(37, 99, 235)",
    action: "rgb(37, 99, 235)",
  });
  await expect(page.locator("[data-courier-card]")).toHaveCount(20);
  await expect(page.getByRole("heading", { name: "안전지원 판단" })).toBeVisible();
  await expect(page.getByRole("link", { name: "개입 검토 열기" })).toHaveAttribute(
    "href",
    "/operations",
  );
  await expect(
    page.getByRole("heading", { name: "향후 60분 시뮬레이션" }),
  ).toHaveCount(0);
  await expect(page.getByText("합성 위치 · 14:32")).toBeVisible();
  await expect(page.getByText("Live 0")).toBeVisible();
  await expect(
    page.locator('[data-courier-card="R-014"]').getByText("역삼 A"),
  ).toBeVisible();
  await expect(page.locator(".onepage-card-safety small")).toHaveCount(20);
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
  const safetyStyle = await page
    .locator(".onepage-card-safety")
    .first()
    .evaluate((element) => {
      const panel = element.getBoundingClientRect();
      const value = element.querySelector("b")!;
      const card = element.closest(".onepage-courier-card")!;
      return {
        fontSize: Number.parseFloat(getComputedStyle(value).fontSize),
        panelHeight: panel.height,
        cardShadow: getComputedStyle(card).boxShadow,
        panelShadow: getComputedStyle(element).boxShadow,
        panelFilter: getComputedStyle(element).filter,
        panelLeftBorder: getComputedStyle(element).borderLeftWidth,
      };
    });
  expect(safetyStyle.fontSize).toBeGreaterThanOrEqual(34);
  expect(safetyStyle.panelHeight).toBeLessThanOrEqual(100);
  expect(safetyStyle.cardShadow).toBe("none");
  expect(safetyStyle.panelShadow).toBe("none");
  expect(safetyStyle.panelFilter).toBe("none");
  expect(safetyStyle.panelLeftBorder).toBe("0px");
  await expect(
    page.locator('[data-courier-card="R-014"] .onepage-card-safety'),
  ).not.toContainText("!");
  await expect(
    page.locator('[data-courier-card="R-014"] .onepage-card-safety'),
  ).toContainText("초과");
  const cardLayout = await page
    .locator('[data-courier-card="R-014"]')
    .evaluate((card) => {
      const photo = card.querySelector(".onepage-profile-photo")!.getBoundingClientRect();
      const name = card.querySelector(".onepage-card-name")!.getBoundingClientRect();
      const identity = card.querySelector(".onepage-card-identity")!.getBoundingClientRect();
      const safety = card.querySelector(".onepage-card-safety")!.getBoundingClientRect();
      return {
        photoWidth: photo.width,
        photoBeforeName: photo.right < name.left,
        safetyBelowIdentity: safety.top > identity.bottom,
      };
    });
  expect(cardLayout.photoWidth).toBeLessThanOrEqual(74);
  expect(cardLayout.photoBeforeName).toBe(true);
  expect(cardLayout.safetyBelowIdentity).toBe(true);

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
  await expect(sourceCard.locator(".onepage-card-safety")).toContainText(
    /31\.8\s*지원/,
  );
  expect(
    await sourceCard.evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe("none");
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

  const queueCourier = page
    .locator(".onepage-support-list button")
    .filter({ hasText: "노현우" });
  await queueCourier.click();
  const queueSelectionStyle = await queueCourier.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
    };
  });
  expect(queueSelectionStyle.boxShadow).toBe("none");
  expect(await queueCourier.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(234, 240, 255)");
  expect(new Set([
    queueSelectionStyle.borderTopWidth,
    queueSelectionStyle.borderRightWidth,
    queueSelectionStyle.borderBottomWidth,
    queueSelectionStyle.borderLeftWidth,
  ]).size).toBe(1);
  expect(new Set([
    queueSelectionStyle.borderTopColor,
    queueSelectionStyle.borderRightColor,
    queueSelectionStyle.borderBottomColor,
    queueSelectionStyle.borderLeftColor,
  ]).size).toBe(1);
  await expect(page.locator('[data-courier-card="R-027"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-map-marker="R-027"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "지원 9" }).click();
  await expect(page.locator("[data-courier-card]")).toHaveCount(9);
  await page.getByRole("button", { name: "안정 4" }).click();
  await expect(page.locator("[data-courier-card]")).toHaveCount(4);
  await page
    .locator(".onepage-support-list button")
    .filter({ hasText: "강태현" })
    .click();
  await expect(page.locator("[data-courier-card]")).toHaveCount(20);
  await expect(page.locator('[data-courier-card="R-014"]')).toHaveAttribute(
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
  await expect(page.getByRole("heading", { name: "향후 60분 지원 관제" })).toBeVisible();

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
