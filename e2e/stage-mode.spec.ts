import { expect, test } from "@playwright/test";

test("제출용 Stage Mode는 한 페이지에서 대표 decision과 데이터 경계를 먼저 보여준다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/stage");

  await expect(
    page.getByRole("heading", {
      name: "52분 후 17번째 배송지 전, 지금 지원이 필요합니다",
    }),
  ).toBeVisible();
  await expect(page.locator(".admin-nav")).toBeHidden();
  await expect(page.getByText("합성 Demo · Simulation result")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "약 52분 후 17번째 배송지 전에, 10분 휴식과 배송 8건 이관이 필요합니다.",
    }),
  ).toBeVisible();
  await expect(page.getByText("지원받는 기사 · 작업이 줄어듭니다")).toBeVisible();
  await expect(
    page.getByText("배송을 나눠 맡는 기사 · 8건을 받습니다"),
  ).toBeVisible();

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.root).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: "artifacts/demo-screenshots/current/00-stage-mode-1280x720.png",
    fullPage: false,
  });
});
