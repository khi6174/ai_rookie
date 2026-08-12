import { expect, test } from "@playwright/test";

const asosDays = Array.from({ length: 31 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 12 + index)).toISOString().slice(0, 10);
  return {
    date,
    pointCount: 1,
    summary: {
      averageAirTemperatureCelsius: 26,
      maximumRainfallMmPerHour: 2,
      minimumVisibilityMeters: 10_000,
      maximumWindSpeedMetersPerSecond: 2,
    },
    points: [{
      observedAt: `${date}T09:00:00+09:00`,
      airTemperatureCelsius: 26,
      relativeHumidityPercent: 70,
      rainfallMmPerHour: 2,
      visibilityMeters: 10_000,
      windSpeedMetersPerSecond: 2,
    }],
  };
});

test("입력 상황을 바꾸면 Safety와 개입 비교를 실제로 다시 계산한다", async ({ page }) => {
  await page.route("**/api/kma-asos-calendar", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      schemaVersion: "kma-asos-calendar-v1",
      status: "LIVE",
      provider: "KMA_API_HUB_ASOS",
      station: { id: "108", label: "서울" },
      capturedAt: "2026-08-12T00:00:00+09:00",
      range: { startDate: "2026-07-12", endDate: "2026-08-11", dayCount: 31 },
      days: asosDays,
      isDemo: true,
      use: "HISTORICAL_CONTEXT_FOR_USER_SCENARIO",
      safetyEngineInputApproved: false,
      rawResponseStored: false,
    }),
  }));
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
  await expect(page.getByRole("heading", { name: "날짜·시간과 기상 관측" })).toBeVisible();
  await expect(page.getByText("1-1 · 관측 시점 선택", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "업무·안전여유와 상황 가정" })).toBeVisible();
  await expect(page.getByText("1-2 · 시뮬레이션 조건 설정", { exact: true })).toBeVisible();
  await expect(page.locator(".scenario-calendar-days button")).toHaveCount(31);
  await expect(page.locator(".scenario-calendar-heading > strong")).toContainText("ASOS");
  await expect(page.getByLabel("연속 작업")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("현재 안전여유")).toHaveAttribute("type", "range");
  await page.getByRole("button", { name: /^2026-07-22/ }).click();
  await expect(page.getByRole("button", { name: "우천·경사" })).toHaveAttribute("aria-pressed", "true");
  const applyObservation = page.getByRole("button", { name: "강수·시정을 1-2에 적용" });
  await expect(applyObservation).toBeEnabled();
  await applyObservation.click();
  const observedImpact = page.locator("[data-observed-weather-impact]");
  await expect(observedImpact).toBeVisible();
  await expect(observedImpact).toContainText("시간당 강수");
  await expect(observedImpact).toContainText("시정");
  await expect(observedImpact).toContainText("예상 최저");
  await expect(observedImpact).toContainText("안전한계 시점");
  await expect(observedImpact).toContainText("추천 변화");
  await expect(observedImpact).toContainText("1-2에 반영된 관측 결과");
  await expect(page.getByText("ASOS 관측 적용됨", { exact: true })).toBeVisible();
  await expect(page.getByText("관측 적용됨", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "우천·경사" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("입력 변경됨")).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/evals/screenshots/scenario-observation-impact-1440x900.png",
    fullPage: true,
  });
  await expect(page.locator(".scenario-limitations")).toHaveCount(0);
  await expect(
    page.getByText("실제 TMS·기사 계정·GPS·주소·고객 발송은 연결되지 않았습니다.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(page.getByText("시연 기준계획의", { exact: false })).toBeVisible();

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
  await expect(page.getByText("1-1 · 관측 시점 선택", { exact: true })).toBeVisible();
  await expect(page.getByText("1-2 · 시뮬레이션 조건 설정", { exact: true })).toBeVisible();
  await page.getByLabel("총 근무").fill("2");
  await page.getByLabel("연속 작업").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
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
