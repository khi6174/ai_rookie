import { expect, test } from "@playwright/test";

test("입력 상황을 바꾸면 Safety와 개입 비교를 실제로 다시 계산한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/scenario");
  const heroHeading = page.getByRole("heading", {
    name: "상황에 맞게 현재 계획을 예측합니다.",
  });
  await expect(heroHeading).toBeVisible();
  await expect(page.locator(".scenario-boundary")).toHaveCount(0);
  const headingMetrics = await heroHeading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
  expect(headingMetrics.height).toBeLessThanOrEqual(headingMetrics.lineHeight * 1.2);
  await expect(page.getByRole("link", { name: "고정 폐루프" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "안전 제약 통과안" })).toBeVisible();
  await expect(page.getByText("실제 TMS·기사 계정·GPS·주소·고객 발송은 연결되지 않았습니다.", { exact: false })).toBeVisible();

  const initialScenarioId = await page
    .locator(".scenario-results .scenario-section-heading > small")
    .textContent();
  await page.getByRole("button", { name: "폭염·계단" }).click();
  await expect(page.getByText("입력 변경됨")).toBeVisible();
  await page.getByRole("button", { name: "이 조건으로 다시 예측" }).click();
  await expect(page.getByText("입력 변경됨")).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator(".scenario-results .scenario-section-heading > small").textContent(),
    )
    .not.toBe(initialScenarioId);
  await expect(page.locator(".scenario-recommended-card")).toBeVisible();
  const shadowedElements = await page
    .locator(".scenario-page, .scenario-page *")
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            element: `${element.tagName.toLowerCase()}.${element.className}`,
            boxShadow: style.boxShadow,
            textShadow: style.textShadow,
            filter: style.filter,
          };
        })
        .filter(
          ({ boxShadow, textShadow, filter }) =>
            boxShadow !== "none" ||
            textShadow !== "none" ||
            filter.includes("drop-shadow"),
        ),
    );
  expect(shadowedElements).toEqual([]);
  const asymmetricBorders = await page
    .locator(".scenario-forecast, .scenario-alternative-list article")
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            element: `${element.tagName.toLowerCase()}.${element.className}`,
            widths: [
              style.borderTopWidth,
              style.borderRightWidth,
              style.borderBottomWidth,
              style.borderLeftWidth,
            ],
            colors: [
              style.borderTopColor,
              style.borderRightColor,
              style.borderBottomColor,
              style.borderLeftColor,
            ],
          };
        })
        .filter(
          ({ widths, colors }) =>
            new Set(widths).size !== 1 || new Set(colors).size !== 1,
        ),
    );
  expect(asymmetricBorders).toEqual([]);
  await page.screenshot({
    path: "artifacts/evals/screenshots/scenario-planning-1440x900.png",
    fullPage: true,
  });
});

test("잘못된 작업시간은 차단하고 모바일에서도 핵심 조작이 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scenario");
  await page.getByLabel("총 근무").fill("2");
  await page.getByLabel("연속 작업").fill("3");
  await page.getByRole("button", { name: "이 조건으로 다시 예측" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "연속 작업시간은 총 근무시간을 넘을 수 없습니다.",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const buttonHeights = await page.locator("button").evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height),
  );
  expect(Math.min(...buttonHeights)).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: "artifacts/evals/screenshots/scenario-planning-390x844.png",
    fullPage: true,
  });
});
