import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1280, height: 720, label: "1280x720" },
] as const) {
  test(`operations manager flow remains accessible at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/operations");
    await expect(
      page.getByRole("heading", {
        name: "오늘의 운영자료를 확정합니다",
      }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeFocused();
    await page.getByRole("link", { name: "본문으로 건너뛰기" }).press("Enter");
    await expect(page.locator("#operations-main")).toBeFocused();

    const dayTab = page.getByRole("tab", { name: "일일 운영" });
    await dayTab.focus();
    await dayTab.press("ArrowDown");
    await expect(
      page.getByRole("tab", { name: "지원 상황" }),
    ).toBeFocused();
    await page.getByRole("tab", { name: "지원 상황" }).press("Home");
    await expect(dayTab).toBeFocused();

    await page
      .getByRole("button", { name: "운영일 확정·전체 계산" })
      .click();
    await expect(
      page.getByRole("tab", { name: "지원 상황" }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "경로" }).click();
    await expect(
      page.getByRole("heading", { name: "기사 위치·배송 진행" }),
    ).toBeVisible();
    await expect(
      page.getByText("합성 스냅샷 · Live 0명", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "지원 상황" }).click();
    await expect(
      page.getByRole("heading", { name: "안전지원 큐" }),
    ).toBeVisible();

    const documentMetrics = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      h1Count: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main").length,
      unlabeledControls: [...document.querySelectorAll("button, a, input")]
        .filter((element) => {
          const html = element as HTMLElement;
          if (
            html.hidden ||
            html.getAttribute("aria-hidden") === "true" ||
            (element as HTMLButtonElement).disabled
          ) {
            return false;
          }
          const style = window.getComputedStyle(html);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }
          return !(
            html.innerText.trim() ||
            html.getAttribute("aria-label")?.trim() ||
            html.getAttribute("title")?.trim()
          );
        })
        .map((element) => element.outerHTML.slice(0, 160)),
    }));
    expect(documentMetrics.scrollWidth).toBeLessThanOrEqual(
      documentMetrics.viewportWidth + 1,
    );
    expect(documentMetrics.h1Count).toBe(1);
    expect(documentMetrics.mainCount).toBe(1);
    expect(documentMetrics.unlabeledControls).toEqual([]);

    const supportRow = page
      .locator(".operations-courier-row:not([disabled])")
      .first();
    await supportRow.focus();
    await expect(supportRow).toBeFocused();
    await supportRow.press("Enter");
    await expect(
      page.getByRole("tab", { name: "개입 검토" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("기사 응답 대기", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upstage 근거 설명 생성" }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/evals/screenshots/operations-service-${viewport.label}.png`,
      fullPage: true,
    });

    const statusTexts = await page
      .locator('[role="status"]')
      .allTextContents();
    expect(statusTexts.some((text) => text.trim().length > 0)).toBe(true);
  });
}
