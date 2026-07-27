import { expect, test, type Page } from "@playwright/test";

async function createRiderReviewLink(page: Page) {
  await page.goto("/operations");
  await page
    .getByRole("button", { name: "운영일 확정·전체 계산" })
    .click();
  const firstSupport = page
    .locator(".operations-courier-row:not([disabled])")
    .first();
  await firstSupport.click();
  await expect(
    page.getByRole("link", { name: "기사 화면 열기" }).first(),
  ).toBeVisible();
  await expect(page.locator(".operations-persistence")).toContainText(
    "개발 저장소에 저장됨",
    { timeout: 15_000 },
  );
  const href = await page
    .getByRole("link", { name: "기사 화면 열기" })
    .first()
    .getAttribute("href");
  if (!href) throw new Error("Rider review link is missing");
  return href;
}
for (const viewport of [
  { width: 390, height: 844, label: "390x844" },
  { width: 360, height: 800, label: "360x800" },
] as const) {
  test(`rider can understand and respond without overflow at ${viewport.label}`, async ({
    page,
  }) => {
    const href = await createRiderReviewLink(page);
    await page.setViewportSize(viewport);
    await page.goto(href);
    await expect(
      page.getByRole("heading", {
        name: "이 안전지원안을 확인해 주세요",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "수정 요청이나 거절을 선택해도 불이익을 의미하지 않습니다.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Kakao 지도·길찾기" }),
    ).toBeVisible();
    await expect(
      page.getByText("Schematic Fallback · 합성 좌표", { exact: true }),
    ).toBeVisible();

    const metrics = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      h1Count: document.querySelectorAll("h1").length,
      responseButtonSizes: [
        ...document.querySelectorAll<HTMLElement>(
          ".operations-rider-response button",
        ),
      ].map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(
      metrics.viewportWidth + 1,
    );
    expect(metrics.h1Count).toBe(1);
    expect(
      metrics.responseButtonSizes.every(
        (box) => box.width >= 44 && box.height >= 44,
      ),
    ).toBe(true);

    await page.screenshot({
      path: `artifacts/evals/screenshots/operations-rider-${viewport.label}.png`,
      fullPage: true,
    });

    if (viewport.width === 390) {
      await page.getByRole("button", { name: "수정 요청" }).click();
      await expect(
        page.getByText(
          "수정 요청이 기록되었습니다. 현재 계획을 유지합니다.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "응답 완료 · 관리자 운영 화면으로 돌아가기",
        }),
      ).toBeVisible();
    }
  });
}
