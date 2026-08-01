import { expect, test } from "@playwright/test";

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => ({
    horizontal:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical:
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}

test("Safety Control Tower는 토큰 기반 관제 화면과 선택 동기화를 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Safety Control Tower" }),
  ).toBeVisible();
  await expect(page.getByText("합성 Demo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Live 0명", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "폐루프 검증" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "검증 상태" })).toHaveCount(0);
  const clock = page.locator(".onepage-header time");
  const firstClockValue = await clock.textContent();
  await expect.poll(() => clock.textContent()).not.toBe(firstClockValue);
  await expect(
    page.getByText("안전 지원 점수", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("순위 아님", { exact: true })).toHaveCount(0);

  const palette = await page.locator("main.onepage-demo").evaluate((main) => {
    const header = main.querySelector(".onepage-header")!;
    const brand = main.querySelector(".onepage-brand-mark")!;
    const action = main.querySelector(".onepage-open-intervention")!;
    return {
      page: getComputedStyle(main).backgroundColor,
      header: getComputedStyle(header).backgroundColor,
      brand: getComputedStyle(brand).backgroundColor,
      action: getComputedStyle(action).backgroundColor,
      font: getComputedStyle(main).fontFamily,
      numeric: getComputedStyle(main).fontVariantNumeric,
    };
  });
  expect(palette.page).toBe("rgb(244, 247, 252)");
  expect(palette.header).toBe("rgb(255, 255, 255)");
  expect(palette.brand).toBe("rgb(37, 99, 235)");
  expect(palette.action).toBe("rgb(37, 99, 235)");
  expect(palette.font).toContain("Pretendard Variable");
  expect(palette.numeric).toContain("tabular-nums");

  await expect(page.locator("[data-courier-card]")).toHaveCount(20);
  await expect(page.locator(".onepage-profile-photo")).toHaveCount(20);
  await expect(page.locator(".onepage-avatar-status")).toHaveCount(20);
  await expect(page.locator(".onepage-state-pill").first()).toContainText("한계 초과");
  await expect(
    page.getByRole("button", {
      name: "강태현 기사, 지정구역 역삼 A, 안전 지원 점수 24.1, 한계 초과, 현재 한계 초과, 기사앱 위험 신호",
    }),
  ).toBeVisible();
  await expect(
    page.locator('[data-courier-card="R-014"] .onepage-card-safety b'),
  ).toHaveText("24.1");

  const dangerCard = page.locator('[data-courier-card="R-014"]');
  const dangerVisual = await dangerCard.evaluate((card) => {
    const score = card.querySelector(".onepage-card-safety b")!;
    const style = getComputedStyle(card);
    return {
      background: style.backgroundColor,
      color: style.color,
      scoreColor: getComputedStyle(score).color,
      scoreSize: Number.parseFloat(getComputedStyle(score).fontSize),
      shadow: style.boxShadow,
      borders: [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ],
    };
  });
  expect(dangerVisual.background).toBe("rgb(253, 238, 236)");
  expect(dangerVisual.color).toBe("rgb(16, 24, 40)");
  expect(dangerVisual.scoreColor).toBe("rgb(220, 38, 38)");
  expect(dangerVisual.scoreSize).toBeCloseTo(29, 0);
  expect(dangerVisual.shadow).not.toBe("none");
  expect(new Set(dangerVisual.borders).size).toBe(1);

  const cardLayout = await dangerCard.evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const photo = card.querySelector(".onepage-profile-photo")!.getBoundingClientRect();
    const score = card.querySelector(".onepage-card-safety")!.getBoundingClientRect();
    const identity = card.querySelector(".onepage-card-identity")!.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      photoWidth: photo.width,
      safetyBelowIdentity: score.top >= identity.bottom,
    };
  });
  expect(cardLayout.height).toBeGreaterThanOrEqual(128);
  expect(cardLayout.photoWidth).toBeGreaterThanOrEqual(56);
  expect(cardLayout.photoWidth).toBeLessThanOrEqual(64);
  expect(cardLayout.safetyBelowIdentity).toBe(true);

  const profileAssetLoaded = await page
    .locator(".onepage-profile-photo")
    .first()
    .evaluate((element) =>
      getComputedStyle(element).backgroundImage.includes(
        "synthetic-courier-profiles-v1",
      ),
    );
  expect(profileAssetLoaded).toBe(true);

  await expect(page.getByText("Demo overlay", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/위치 시뮬레이션/)).toBeVisible();
  await expect(page.locator(".onepage-map-legend")).toContainText("한계 초과 3");
  await expect(page.locator(".onepage-map-legend")).toContainText("지원 필요 6");
  await expect(page.locator(".onepage-map-legend")).toContainText("주의 7");
  await expect(page.locator(".onepage-map-legend")).toContainText("정상 4");
  await expect(page.locator(".onepage-map-marker-photo")).toHaveCount(0);
  await expect(
    page.locator(".onepage-region-capacity").getByText("역삼", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("32%", { exact: true }).first()).toBeVisible();

  const markerVisual = await page
    .locator(".onepage-map-marker")
    .first()
    .evaluate((marker) => {
      const rect = marker.getBoundingClientRect();
      const style = getComputedStyle(marker);
      return {
        width: rect.width,
        height: rect.height,
        background: style.backgroundColor,
        border: style.borderTopColor,
        radius: style.borderRadius,
      };
    });
  expect(markerVisual.width).toBe(24);
  expect(markerVisual.height).toBe(24);
  expect(markerVisual.background).toBe("rgb(220, 38, 38)");
  expect(markerVisual.border).toBe("rgb(255, 255, 255)");
  expect(markerVisual.radius).toBe("999px");

  const firstMovementSecond = await page
    .locator(".onepage-map-canvas")
    .getAttribute("data-movement-second");
  await expect
    .poll(() =>
      page.locator(".onepage-map-canvas").getAttribute("data-movement-second"),
    )
    .not.toBe(firstMovementSecond);
  const movingMarker = page.locator('[data-map-marker="R-014"]');
  await expect(movingMarker).toHaveAttribute("data-road-corridor", "역삼");
  const roadPosition = await movingMarker.evaluate((marker) => ({
    top: Number.parseFloat((marker as HTMLElement).style.top),
    latitude: Number.parseFloat((marker as HTMLElement).dataset.latitude ?? "NaN"),
    longitude: Number.parseFloat((marker as HTMLElement).dataset.longitude ?? "NaN"),
  }));
  expect(roadPosition.top).toBeGreaterThanOrEqual(27);
  expect(roadPosition.latitude).toBeGreaterThanOrEqual(37.46);
  expect(roadPosition.latitude).toBeLessThanOrEqual(37.525);
  expect(roadPosition.longitude).toBeGreaterThanOrEqual(127.018);
  expect(roadPosition.longitude).toBeLessThanOrEqual(127.108);
  const firstMarkerStyle = await movingMarker.getAttribute("style");
  await expect.poll(() => movingMarker.getAttribute("style")).not.toBe(firstMarkerStyle);

  const courierIds = await page.locator("[data-courier-card]").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-courier-card") ?? ""),
  );
  for (const courierId of courierIds) {
    await page.locator(`[data-courier-card="${courierId}"]`).click();
    const routeMarker = page.locator(`[data-map-marker="${courierId}"]`);
    await expect(routeMarker).toBeVisible();
    const position = await routeMarker.evaluate((marker) => ({
      top: Number.parseFloat((marker as HTMLElement).style.top),
      latitude: Number.parseFloat((marker as HTMLElement).dataset.latitude ?? "NaN"),
      longitude: Number.parseFloat((marker as HTMLElement).dataset.longitude ?? "NaN"),
    }));
    expect(position.top).toBeGreaterThanOrEqual(27);
    expect(position.latitude).toBeGreaterThanOrEqual(37.46);
    expect(position.latitude).toBeLessThanOrEqual(37.525);
    expect(position.longitude).toBeGreaterThanOrEqual(127.018);
    expect(position.longitude).toBeLessThanOrEqual(127.108);
  }
  await page.locator('[data-courier-card="R-014"]').click();

  await expect(page.getByText("Safety Margin", { exact: true })).toBeVisible();
  await expect(page.getByText("30(한계)", { exact: true })).toBeVisible();
  await expect(page.getByText("45(기준)", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "안전 지원" })).toBeVisible();
  await expect(page.getByText("9/20", { exact: true })).toBeVisible();
  await expect(page.getByText("현재 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("지원 시점", { exact: true })).toBeVisible();
  await expect(page.getByText("위험", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("지금", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("배송 분담 · 강남", { exact: true })).toBeVisible();
  await expect(page.getByText("수신 가능 4명 · 최대 11건 / 필요 34건", { exact: true })).toBeVisible();
  await expect(page.getByText("동일 강우셀 영향 18명", { exact: true })).toBeVisible();
  await expect(page.getByText(/이관만으로는 해소되지 않음/)).toHaveCount(0);
  await expect(page.getByText("기사 지원 요청", { exact: true })).toBeVisible();
  await expect(page.getByText("배송 14/31 완료", { exact: true })).toBeVisible();
  await expect(page.locator(".onepage-support-list button")).toHaveCount(9);
  await expect(page.locator(".onepage-list-rank")).toHaveCount(0);
  await expect(page.locator(".onepage-eta-pill")).toHaveCount(9);
  await expect(page.locator(".onepage-support-list button").first()).toContainText("24.1");
  await expect(page.locator(".onepage-tint-banner")).toHaveCount(0);

  await page.getByRole("button", { name: "지원 9" }).click();
  await expect(page.locator("[data-courier-card]")).toHaveCount(20);
  await expect(page.locator('[data-courier-card="R-014"]')).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator('[data-courier-card="R-013"]')).toHaveCSS(
    "opacity",
    "0.38",
  );

  await page.getByRole("button", { name: "안정 4" }).click();
  await expect(page.locator("[data-courier-card]")).toHaveCount(20);
  await expect(page.locator('[data-courier-card="R-014"]')).toHaveCSS(
    "opacity",
    "0.38",
  );
  await expect(page.locator('[data-courier-card="R-013"]')).toHaveCSS(
    "opacity",
    "1",
  );

  const queueCourier = page
    .locator(".onepage-support-list button")
    .filter({ hasText: "노현우" });
  await queueCourier.click();
  await expect(page.locator('[data-courier-card="R-027"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-map-marker="R-027"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "안정 4" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("saferoute:rider-danger-signal", {
        detail: {
          courierId: "R-022",
          label: "긴급 지원 요청",
          receivedAt: "14:32",
        },
      }),
    );
  });
  await expect(page.locator('[data-courier-card="R-022"]')).toHaveAttribute(
    "data-rider-danger-signal",
    "active",
  );
  await expect(page.getByRole("button", { name: "위험신호 2" })).toBeVisible();
  await page.getByRole("button", { name: "위험신호 2" }).click();
  await expect(page.locator("[data-courier-card]")).toHaveCount(20);
  await expect(page.locator('[data-courier-card="R-022"]')).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator('[data-courier-card="R-008"]')).toHaveCSS(
    "opacity",
    "0.38",
  );

  await page
    .locator(".onepage-support-list button")
    .filter({ hasText: "강태현" })
    .click();
  const interventionTrigger = page.getByRole("button", { name: "지원 검토" });
  await interventionTrigger.click();
  const dialog = page.getByRole("dialog", { name: "강태현 기사 안전지원" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("지원안 선택")).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-demo-intervention-1280x720.png",
    fullPage: false,
  });
  await dialog.getByRole("button", { name: "기사 확인 요청" }).click();
  await expect(dialog.getByText("R-014 응답을 선택하세요")).toBeVisible();
  await dialog.getByRole("button", { name: "이 조정에 동의" }).click();
  await expect(dialog.getByText("R-024 이어받기 검토")).toBeVisible();
  await dialog.getByRole("button", { name: "이어받기에 동의" }).click();
  await expect(dialog.getByText("두 기사 동의 완료")).toBeVisible();
  await dialog.getByRole("button", { name: "관리자 승인 및 적용" }).click();
  await expect(dialog.getByText("10분 휴식 + 배송 8건 이관 반영")).toBeVisible();
  await expect(
    dialog.getByText("경로·배송순서·ETA·고객 안내를 함께 갱신했습니다."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "완료" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(interventionTrigger).toBeFocused();
  await expect(page.getByText("적용됨 · 10분 휴식 + 배송 8건 이관")).toBeVisible();

  await expectNoPageOverflow(page);
  await page.screenshot({
    path: "test-results/dashboard-demo-1280x720.png",
    fullPage: false,
  });
});

test("이관 여력이 없으면 이관 후보를 차단하고 비이관 대안을 남긴다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard-demo");
  await page.getByRole("button", { name: "지원 검토" }).click();

  const dialog = page.getByRole("dialog", { name: "강태현 기사 안전지원" });
  await dialog.getByRole("button", { name: "이관 여력 부족 보기" }).click();

  await expect(
    dialog.getByRole("button", { name: /10분 휴식 \+ 배송 8건 이관/ }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: /배송 12건 이관/ }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: /10분 휴식 \+ 배송 순서 변경/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText("추천 순위가 아니라 안전한 대안이 남는 순서입니다.")).toBeVisible();

  await dialog.getByRole("button", { name: "기사 확인 요청" }).click();
  await dialog.getByRole("button", { name: "이 조정에 동의" }).click();
  await expect(dialog.getByText("기사 동의 완료")).toBeVisible();
  await expect(dialog.getByText("R-024 이어받기 검토")).toHaveCount(0);
});

test("1920 데스크톱은 62px 헤더·384px 패널·16px 간격을 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/dashboard-demo");
  await expect(
    page.getByRole("heading", { name: "Safety Control Tower" }),
  ).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect();
    const header = rect(".onepage-header");
    const map = rect(".onepage-map-section");
    const panel = rect(".onepage-support-panel");
    const workspace = rect(".onepage-workspace");
    return {
      headerHeight: header.height,
      mapWidth: map.width,
      panelWidth: panel.width,
      gap: panel.left - map.right,
      workspaceBottom: workspace.bottom,
    };
  });
  expect(layout.headerHeight).toBe(62);
  expect(layout.panelWidth).toBe(384);
  expect(layout.gap).toBe(16);
  expect(layout.mapWidth).toBeGreaterThan(1200);
  expect(layout.workspaceBottom).toBeLessThanOrEqual(1080);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: "test-results/dashboard-demo-1920x1080.png",
    fullPage: false,
  });
});

test("1440×900에서도 카드·지도·지원 패널이 한 화면에 유지된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard-demo");
  await expect(
    page.getByRole("heading", { name: "Safety Control Tower" }),
  ).toBeVisible();
  await expect(page.locator(".onepage-support-panel")).toBeVisible();
  await expect(page.locator(".onepage-map-section")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: "test-results/dashboard-demo-1440x900.png",
    fullPage: false,
  });
});
