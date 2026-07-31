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
    const action = main.querySelector(".onepage-open-intervention")!;
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
  const interventionTrigger = page.getByRole("button", { name: "개입 검토 열기" });
  await expect(interventionTrigger).toBeVisible();
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
  await expect(page.locator(".onepage-map-marker-photo").first()).toBeVisible();
  const mapMarkerStyle = await page.locator(".onepage-map-marker").first().evaluate(
    (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: rect.width,
        height: rect.height,
        borderColor: style.borderTopColor,
        borderWidths: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
      };
    },
  );
  expect(mapMarkerStyle.width).toBe(42);
  expect(mapMarkerStyle.height).toBe(42);
  expect(mapMarkerStyle.borderColor).toBe("rgb(255, 255, 255)");
  expect(new Set(mapMarkerStyle.borderWidths).size).toBe(1);
  expect(mapMarkerStyle.borderRadius).toBe("50%");
  expect(mapMarkerStyle.boxShadow).toBe("none");

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

  await interventionTrigger.click();
  const dialog = page.getByRole("dialog", { name: "강태현 기사 안전지원" });
  await expect(dialog).toBeVisible();
  const dialogRect = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  });
  expect(dialogRect.left).toBeGreaterThanOrEqual(0);
  expect(dialogRect.top).toBeGreaterThanOrEqual(0);
  expect(dialogRect.right).toBeLessThanOrEqual(1280);
  expect(dialogRect.bottom).toBeLessThanOrEqual(720);
  await expect(dialog.getByText("개입안 선택")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /10분 휴식/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: "기사 확인 요청" }).click();
  await expect(dialog.getByText("응답을 선택하세요")).toBeVisible();
  await dialog.getByRole("button", { name: "동의 확인" }).click();
  await expect(dialog.getByText("기사 동의 확인")).toBeVisible();
  await dialog.getByRole("button", { name: "관리자 승인 및 적용" }).click();
  await expect(dialog.getByText("10분 휴식 반영")).toBeVisible();
  await expect(dialog.getByText("경로·배송순서·ETA·고객 안내를 함께 갱신했습니다."))
    .toBeVisible();
  await dialog.getByRole("button", { name: "완료" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(interventionTrigger).toBeFocused();
  await expect(page.getByText("적용 완료 · 10분 휴식")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/dashboard-demo");

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
