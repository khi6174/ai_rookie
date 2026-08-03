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

test("선택한 DB 지원 decision을 운영 폐루프에 같은 courierId로 전달한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dashboard-demo");
  await expect(page.locator("[data-courier-card]")).toHaveCount(25);

  const supportCard = page
    .locator('[data-courier-card][data-decision-id]:not([data-decision-id=""])')
    .first();
  const courierId = await supportCard.getAttribute("data-courier-card");
  expect(courierId).toBeTruthy();
  await supportCard.click();
  const operationsLink = page.getByRole("link", {
    name: "운영 폐루프에서 검토",
  });
  await expect(operationsLink).toHaveAttribute(
    "href",
    `/operations?courier=${courierId}`,
  );
  await operationsLink.click();
  await expect(page).toHaveURL(
    new RegExp(`/operations\\?courier=${courierId}$`),
  );
  await page
    .getByRole("button", { name: "운영일 확정·전체 계산" })
    .click();
  await expect(
    page.getByRole("tab", { name: "개입 검토" }),
  ).toHaveAttribute("aria-selected", "true");
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
  await page.screenshot({
    path: "test-results/dashboard-demo-1440x900.png",
    fullPage: false,
  });
});
