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

test("공개 관제는 DB의 합성 기사 25명과 3개 허브를 같은 ID로 표시한다", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/operations/days/current/package");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    package: {
      records: Array<{
        courier: { courierId: string; displayLabel: string };
        hub: { hubId: string };
        plan: {
          completedStopCount: number;
          totalStopCount: number;
          stops: Array<{ coarseZone: string }>;
        };
      }>;
    };
    storage: string;
  };

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Safety Control Tower" }),
  ).toBeVisible();
  await expect(
    page.getByText(`${body.storage} · 합성 기사 25명`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-courier-card]")).toHaveCount(25);
  await expect(page.locator(".onepage-courier-card.state-breach")).not.toHaveCount(0);
  await expect(page.locator(".onepage-courier-card.state-support")).not.toHaveCount(0);
  await expect(page.locator(".onepage-courier-card.state-caution")).not.toHaveCount(0);
  await expect(page.locator(".onepage-courier-card.state-stable")).not.toHaveCount(0);
  await expect(page.locator(".onepage-region-capacity > span")).toHaveCount(3);
  await expect(
    page.getByText("합성 운영권역 · 3개 허브", { exact: true }),
  ).toBeVisible();

  for (const record of body.package.records) {
    const card = page.locator(
      `[data-courier-card="${record.courier.courierId}"]`,
    );
    await expect(card).toHaveAttribute(
      "data-area-code",
      record.plan.stops[0].coarseZone,
    );
    await expect(card).toHaveAttribute(
      "data-completed-count",
      String(record.plan.completedStopCount),
    );
    await expect(card).toHaveAttribute(
      "data-total-count",
      String(record.plan.totalStopCount),
    );
    await expect(card).toHaveAccessibleName(
      new RegExp(`^${record.courier.displayLabel} 기사,`),
    );
  }

  expect(
    new Set(body.package.records.map((record) => record.hub.hubId)).size,
  ).toBe(3);
  await expect(page.locator(".onepage-profile-photo").first()).toHaveCSS(
    "background-image",
    /gradient/,
  );
  expect(await page.locator("body").innerText()).toContain("강태현");
  expect(await page.locator("body").innerText()).not.toContain("합성 기사 001");
  expect(await page.locator("body").innerText()).not.toContain("강남 허브");
  await expectNoPageOverflow(page);
});

test("대시보드에서 선택한 합성 기사를 같은 이름·업무의 기사 앱으로 연다", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/operations/days/current/package");
  const body = (await response.json()) as {
    package: {
      records: Array<{
        courier: { courierId: string; displayLabel: string };
        plan: {
          completedStopCount: number;
          totalStopCount: number;
          stops: Array<{ coarseZone: string }>;
        };
      }>;
    };
  };
  const target = body.package.records[8];
  const expectedRate = Math.round(
    (target.plan.completedStopCount / target.plan.totalStopCount) * 100,
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page
    .locator(`[data-courier-card="${target.courier.courierId}"]`)
    .click();
  const riderLink = page.getByRole("link", { name: "기사 앱" });
  await expect(riderLink).toHaveAttribute(
    "href",
    `/rider-demo?courier=${target.courier.courierId}`,
  );
  await riderLink.click();
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page).toHaveURL(
    new RegExp(`/rider-demo\\?courier=${target.courier.courierId}$`),
  );
  await expect(page.locator(".rider-role-menu summary")).toContainText(
    target.courier.displayLabel,
  );
  await expect(
    page.getByRole("heading", { name: target.plan.stops[0].coarseZone }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "오늘 배송률" }),
  ).toHaveAttribute("aria-valuenow", String(expectedRate));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: "test-results/rider-db-linked-390x844.png",
    fullPage: true,
  });
  await page.locator(".rider-role-menu summary").click();
  await expect(page.locator(".rider-profile-options a")).toHaveCount(25);
});

test("허브와 겹친 남기석 기사 지도 마커도 직접 선택할 수 있다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const card = page.locator('[data-courier-card="demo-courier-014"]');
  await card.click();
  const marker = page.locator('[data-map-marker="demo-courier-014"]');
  await expect(marker).toBeVisible();
  await marker.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  const map = page.locator(".onepage-map-canvas");
  const pausedSecond = await map.getAttribute("data-movement-second");
  await page.waitForTimeout(1_200);
  await expect(map).toHaveAttribute("data-movement-second", pausedSecond!);
  await card.click();
  await expect
    .poll(() => map.getAttribute("data-movement-second"))
    .not.toBe(pausedSecond);
  await expect(page.getByText("남기석", { exact: true }).last()).toBeVisible();
  await expect(page.locator(".onepage-hub").first()).toHaveCSS(
    "pointer-events",
    "none",
  );
});

test("별도 기사 앱의 응급 합성 신호가 새로고침 없이 열린 관제에 반영된다", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  const riderContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const riderPage = await riderContext.newPage();
  try {
    await riderPage.goto(
      `${origin}/rider-demo?courier=demo-courier-014`,
    );
    await riderPage.getByRole("tab", { name: "안전지원" }).click();
    await riderPage.getByRole("button", { name: "응급 상황 전송" }).click();

    await expect
      .poll(
        async () =>
          page
            .locator('[data-courier-card="demo-courier-014"]')
            .getAttribute("data-rider-danger-signal"),
        { timeout: 10_000 },
      )
      .toBe("active");
    await expect(
      page.getByRole("button", { name: /위험신호 [1-9]\d*/ }),
    ).toBeVisible();
  } finally {
    await riderContext.close();
  }
});

test("관리자와 기사 지도는 같은 기사 ID의 합성 위치를 매초 함께 갱신한다", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const targetCard = page.locator("[data-courier-card]").first();
  const courierId = await targetCard.getAttribute("data-courier-card");
  expect(courierId).toBeTruthy();
  await targetCard.click();

  const dashboardMap = page.locator(".onepage-map-canvas");
  const dashboardMarker = page.locator(
    `[data-map-marker="${courierId}"]`,
  );
  await expect(dashboardMarker).toBeVisible();
  const firstDashboardPoint = await dashboardMarker.evaluate((marker) => ({
    latitude: marker.getAttribute("data-latitude"),
    longitude: marker.getAttribute("data-longitude"),
  }));
  await expect
    .poll(async () => dashboardMarker.getAttribute("data-latitude"))
    .not.toBe(firstDashboardPoint.latitude);

  const riderPage = await context.newPage();
  await riderPage.setViewportSize({ width: 390, height: 844 });
  await riderPage.goto(
    `/rider-demo?courier=${encodeURIComponent(courierId!)}`,
  );
  const riderMap = riderPage.locator(".rider-live-map-fallback");
  await expect(riderMap).toHaveAttribute("data-courier-id", courierId!);
  await expect(riderMap).toHaveAttribute("data-location-source", "ROUTE");
  const firstRiderPoint = await riderMap.evaluate((map) => ({
    latitude: map.getAttribute("data-latitude"),
    longitude: map.getAttribute("data-longitude"),
  }));
  await expect
    .poll(async () => riderMap.getAttribute("data-latitude"))
    .not.toBe(firstRiderPoint.latitude);

  await expect.poll(async () => {
    const dashboardSecond = await dashboardMap.getAttribute(
      "data-movement-second",
    );
    const riderSecond = await riderMap.getAttribute("data-movement-second");
    if (!dashboardSecond || !riderSecond) return false;
    const [dashboardLatitude, dashboardLongitude, riderLatitude, riderLongitude] =
      await Promise.all([
        dashboardMarker.getAttribute("data-latitude"),
        dashboardMarker.getAttribute("data-longitude"),
        riderMap.getAttribute("data-latitude"),
        riderMap.getAttribute("data-longitude"),
      ]);
    if (
      !dashboardLatitude ||
      !dashboardLongitude ||
      !riderLatitude ||
      !riderLongitude
    ) return false;
    return (
      Math.abs(Number(dashboardSecond) - Number(riderSecond)) <= 1 &&
      Math.abs(Number(dashboardLatitude) - Number(riderLatitude)) <= 0.0015 &&
      Math.abs(Number(dashboardLongitude) - Number(riderLongitude)) <= 0.0015
    );
  }).toBe(true);
});

test("지원 검토 모달에서 같은 decision과 기사 본인 응답으로 폐루프를 완료한다", async ({
  page,
  context,
  request,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.locator("[data-courier-card]")).toHaveCount(25);

  const supportCard = page
    .locator('[data-courier-card][data-decision-id]:not([data-decision-id=""])')
    .first();
  const courierId = await supportCard.getAttribute("data-courier-card");
  expect(courierId).toBeTruthy();
  await supportCard.click();
  const dashboardUrl = page.url();
  const reviewButton = page.getByRole("button", { name: "지원 검토" });
  await reviewButton.click();
  await expect(page).toHaveURL(dashboardUrl);

  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /기사$/ })).toBeVisible();
  await expect(dialog.getByText("지원 선택", { exact: true })).toBeVisible();
  await expect(dialog.getByText("선택 사항", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "지원 검토 닫기" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "기사 확인 요청" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "지원 검토 닫기" }),
  ).toBeFocused();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(dashboardUrl);
  await expect(reviewButton).toBeFocused();
  await reviewButton.click();
  dialog = page.getByRole("dialog");

  const transferCandidate = dialog
    .locator(".onepage-candidate-list button:not([disabled])")
    .filter({ hasText: /배송 \d+건 분담/ })
    .first();
  await expect(transferCandidate).toBeVisible();
  await transferCandidate.click();
  await expect(transferCandidate).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText(/현재 선택 \d+건 \/ 가능/)).toBeVisible();
  await dialog.getByRole("button", { name: "기사 확인 요청" }).click();
  await expect(
    dialog.getByRole("button", { name: "기사 응답 기다리는 중" }),
  ).toBeVisible();
  await expect(page).toHaveURL(dashboardUrl);

  await page.reload();
  await page
    .locator(`[data-courier-card="${courierId}"]`)
    .click();
  await page.getByRole("button", { name: "지원 검토" }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "기사 응답 기다리는 중" }),
  ).toBeVisible();
  await expect(page).toHaveURL(dashboardUrl);

  const riderHref = await page
    .getByRole("link", { name: "기사 앱" })
    .getAttribute("href");
  expect(riderHref).toBeTruthy();
  const riderUrl = new URL(riderHref!, page.url());
  const workspaceId = riderUrl.searchParams.get("workspace");
  const decisionId = riderUrl.searchParams.get("decision");
  expect(workspaceId).toBeTruthy();
  expect(decisionId).toBeTruthy();
  expect(riderUrl.searchParams.get("courier")).toBe(courierId);

  const persistedResponse = await request.get(
    `/api/operations/sessions/${workspaceId}`,
  );
  expect(persistedResponse.ok()).toBe(true);
  const persisted = (await persistedResponse.json()) as {
    session: {
      workspace: {
        decisions: Array<{
          decision: {
            decisionId: string;
            selectedCandidateId: string;
          };
          selectedCandidate: {
            candidateId: string;
            actions: Array<{
              type: string;
              recipientCourierId?: string;
            }>;
          };
        }>;
      };
    };
  };
  const persistedDecision = persisted.session.workspace.decisions.find(
    (item) => item.decision.decisionId === decisionId,
  )!;
  expect(persistedDecision.selectedCandidate.candidateId).toBe(
    persistedDecision.decision.selectedCandidateId,
  );
  const recipientId = persistedDecision.selectedCandidate.actions.find(
    (action) => action.type === "TRANSFER_STOPS",
  )?.recipientCourierId;
  expect(recipientId).toBeTruthy();

  const sourcePage = await context.newPage();
  await sourcePage.setViewportSize({ width: 390, height: 844 });
  await sourcePage.goto(
    `/rider-demo?courier=${encodeURIComponent(courierId!)}`,
  );
  await sourcePage.getByRole("tab", { name: "안전지원" }).click();
  await expect(sourcePage.getByText("운영 지표", { exact: true })).toBeVisible();
  await expect(
    sourcePage.getByText("사고확률이 아닌 운영 지표", { exact: true }),
  ).toHaveCount(0);
  await expect(
    sourcePage.getByText(
      "수정하거나 거절해도 불이익은 없습니다. 다른 안전한 방법을 다시 검토합니다.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    sourcePage.getByRole("button", { name: "이 조정에 동의" }),
  ).toBeEnabled();
  await sourcePage.screenshot({
    path: "test-results/rider-shared-source-390x844.png",
    fullPage: true,
  });
  await sourcePage.getByRole("button", { name: "이 조정에 동의" }).click();
  await expect(sourcePage.getByText("내 동의 기록됨", { exact: true })).toBeVisible();

  await expect(dialog.getByText("수신 기사 응답 대기", { exact: true })).toBeVisible();
  const recipientPage = await context.newPage();
  await recipientPage.setViewportSize({ width: 360, height: 800 });
  await recipientPage.goto(
    `/rider-demo?courier=${encodeURIComponent(recipientId!)}`,
  );
  await recipientPage.getByRole("tab", { name: "안전지원" }).click();
  await expect(
    recipientPage.getByRole("button", { name: "이 조정에 동의" }),
  ).toBeEnabled();
  await recipientPage.screenshot({
    path: "test-results/rider-shared-recipient-360x800.png",
    fullPage: true,
  });
  await recipientPage.getByRole("button", { name: "이 조정에 동의" }).click();
  await expect(
    recipientPage.getByText("내 동의 기록됨", { exact: true }),
  ).toBeVisible();

  await expect(dialog.getByText("관리자 승인 대기", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "관리자 승인 및 적용" })
    .click();
  await expect(
    dialog.getByText("경로 / 배송순서 / ETA / 고객 안내 상태를 갱신했습니다."),
  ).toBeVisible();
  await expect(
    sourcePage.getByRole("heading", { name: "조정된 계획이 적용되었습니다" }),
  ).toBeVisible();
  await expectNoPageOverflow(sourcePage);
  expect(
    await recipientPage.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(361);
  await expect(page).toHaveURL(dashboardUrl);
  await expect(
    page.getByRole("link", { name: "운영 폐루프에서 검토" }),
  ).toHaveCount(0);
  expect(browserErrors).toEqual([]);
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

test("1440×900에서도 25명 카드·지도·지원 패널이 한 화면에 유지된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard-demo");
  await expect(
    page.getByRole("heading", { name: "Safety Control Tower" }),
  ).toBeVisible();
  await expect(page.locator("[data-courier-card]")).toHaveCount(25);
  await expect(page.locator(".onepage-support-panel")).toBeVisible();
  await expect(page.locator(".onepage-map-section")).toBeVisible();
  await expectNoPageOverflow(page);
  const supportCard = page
    .locator('[data-courier-card][data-decision-id]:not([data-decision-id=""])')
    .first();
  await supportCard.click();
  await page.getByRole("button", { name: "지원 검토" }).click();
  const dialog = page.getByRole("dialog");
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(1440);
  expect(dialogBounds!.y + dialogBounds!.height).toBeLessThanOrEqual(900);
  const dialogButtonHeights = await dialog.getByRole("button").evaluateAll(
    (buttons) => buttons.map((button) => button.getBoundingClientRect().height),
  );
  expect(dialogButtonHeights.every((height) => height >= 44)).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-demo-1440x900.png",
    fullPage: false,
  });
});
