import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screenshotDir = resolve("artifacts", "design-preview");

test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});

test("관리자 HTML 디자인 화면을 연결하고 실제 기능 대신 미리보기 상태만 전환한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/design-preview#admin-support");

  await expect(
    page.getByRole("heading", { name: "향후 60분 안에 어떤 지원이 필요한가?" }),
  ).toBeVisible();
  await expect(page.getByText("Kakao 오류 · Fallback map")).toBeVisible();
  await expect(page.getByText("Simulation result")).toBeVisible();

  await page.getByRole("button", { name: "경로", exact: true }).click();
  await expect(page).toHaveURL(/#admin-route$/);
  await expect(page.getByRole("heading", { name: "경로 · 계획 vs 적용" })).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDir, "admin-route-1440x900.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "개입 검토", exact: true }).click();
  await page.getByRole("button", { name: "승인 검토", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "승인 후 계획을 적용할까요?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "승인 및 계획 적용" }).click();
  await expect(page).toHaveURL(/#admin-applied$/);
  await expect(
    page.getByRole("heading", { name: "지원 계획 적용이 완료되었습니다" }),
  ).toBeVisible();
  await expect(page.getByText("실제 배송계획은 변경하지 않습니다.")).toBeVisible();

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
  await page.screenshot({
    path: resolve(screenshotDir, "admin-applied-1440x900.png"),
    fullPage: true,
  });
});

test("기사 화면에서 Kakao 지도와 길찾기를 유지하며 모든 디자인 화면을 왕복한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/design-preview#rider-login");

  await expect(page.getByRole("heading", { name: /안전한 운행을/ })).toBeVisible();
  await page.getByRole("button", { name: "데모 계정으로 시작" }).click();
  await expect(page).toHaveURL(/#rider-route$/);
  await expect(page.getByRole("heading", { name: /R-017 기사님/ })).toBeVisible();
  await expect(page.getByText("Kakao 오류 · Fallback map")).toBeVisible();
  await expect(page.getByRole("link", { name: "카카오맵에서 Demo 길찾기" })).toHaveAttribute(
    "href",
    /map\.kakao\.com/,
  );
  await page.screenshot({
    path: resolve(screenshotDir, "rider-route-390x844.png"),
    fullPage: true,
  });

  await page
    .getByRole("navigation", { name: "기사 화면" })
    .getByRole("button", { name: /안전지원/ })
    .click();
  await expect(page.getByRole("heading", { name: /10분 쉬고/ })).toBeVisible();
  await page.getByRole("button", { name: "이 조정에 동의" }).click();
  await expect(page.getByRole("heading", { name: "배송지 8건을 전달받습니다" })).toBeVisible();
  await page.getByRole("button", { name: "이 조정에 동의" }).click();
  await expect(page).toHaveURL(/#admin-support$/);

  await page.goto("/design-preview#rider-profile");
  await expect(page.getByRole("heading", { name: "필요한 운영 상태만 공유합니다" })).toBeVisible();
  await page.goto("/design-preview#rider-applied");
  await expect(page.getByRole("heading", { name: /10분 휴식 후/ })).toBeVisible();

  const shortControls = await page.locator("button:visible").evaluateAll((buttons) =>
    buttons
      .map((button) => button.getBoundingClientRect().height)
      .filter((height) => height < 44),
  );
  expect(shortControls).toEqual([]);
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
  await page.screenshot({
    path: resolve(screenshotDir, "rider-applied-390x844.png"),
    fullPage: true,
  });
});

test("관리자 미리보기는 1280×720에서도 핵심 행동이 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/design-preview#admin-support");
  await expect(page.getByRole("button", { name: "승인 검토 열기" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("기사 미리보기는 360×800에서도 지도·길찾기와 44px 터치 영역을 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/design-preview#rider-route");
  await expect(page.getByRole("img", { name: /기사의 합성 현재 위치/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "카카오맵에서 Demo 길찾기" })).toHaveAttribute(
    "href",
    /map\.kakao\.com/,
  );
  const shortControls = await page.locator("button:visible").evaluateAll((buttons) =>
    buttons
      .map((button) => button.getBoundingClientRect().height)
      .filter((height) => height < 44),
  );
  expect(shortControls).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
