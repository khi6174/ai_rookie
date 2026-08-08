import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const outputDirectory =
  "artifacts/demo-screenshots/live-operations-storyboard";

async function capture(page: Page, fileName: string) {
  const path = `${outputDirectory}/${fileName}`;
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  return {
    fileName,
    sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
  };
}

test("최신 공개 연속 관제의 다섯 핵심 장면을 같은 기사 ID로 캡처한다", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("[data-courier-card]")).toHaveCount(25);
  await expect(
    page.getByText("합성 운행 중 · 실제 TMS 아님", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "일시정지" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "처음부터" })).toHaveCount(0);

  const frames = [await capture(page, "01-live-fleet-overview.png")];
  const supportCard = page
    .locator('[data-courier-card][data-decision-id]:not([data-decision-id=""])')
    .first();
  const courierId = await supportCard.getAttribute("data-courier-card");
  expect(courierId).toBeTruthy();
  await supportCard.click();
  await page.getByRole("button", { name: "배송구역 확대" }).click();
  await expect(page.locator(".onepage-map-canvas")).toHaveAttribute(
    "data-map-focus-mode",
    "COURIER",
  );
  await expect(page.locator("[data-delivery-stop]")).not.toHaveCount(0);
  frames.push(await capture(page, "02-courier-route-focus.png"));

  await page.getByRole("button", { name: "지원 검토" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("안전한 지원안 비교", { exact: true })).toBeVisible();
  await expect(dialog.getByText("먼저 확인할 결론", { exact: true })).toBeVisible();
  frames.push(await capture(page, "03-support-review.png"));

  await dialog.getByText("AI 근거 설명", { exact: true }).click();
  await dialog.getByRole("button", { name: "근거 설명 생성" }).click();
  await expect(dialog.locator("[data-explanation-status]")).toBeVisible();
  await expect(
    dialog.getByText("AI는 지원안과 실행 여부를 변경하지 않습니다.", {
      exact: false,
    }),
  ).toBeVisible();
  frames.push(await capture(page, "04-ai-evidence-boundary.png"));
  await dialog.getByRole("button", { name: "지원 검토 닫기" }).click();

  const riderHref = await page
    .getByRole("link", { name: "기사 앱" })
    .getAttribute("href");
  expect(riderHref).toBeTruthy();
  const riderPage = await context.newPage();
  await riderPage.setViewportSize({ width: 390, height: 844 });
  await riderPage.goto(riderHref!);
  const riderMap = riderPage.locator(".rider-live-map-fallback");
  await expect(riderMap).toHaveAttribute("data-courier-id", courierId!);
  await expect(riderMap).toHaveAttribute("data-location-source", "ROUTE");
  frames.push(await capture(riderPage, "05-rider-live-route.png"));
  await riderPage.close();

  await writeFile(
    `${outputDirectory}/manifest.json`,
    `${JSON.stringify(
      {
        schemaVersion: "live-operations-storyboard-v1",
        dataMode: "SYNTHETIC",
        actualTmsConnected: false,
        actualGpsUsed: false,
        courierId,
        managerViewport: { width: 1440, height: 900 },
        riderViewport: { width: 390, height: 844 },
        frames,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});
