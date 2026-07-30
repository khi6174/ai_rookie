import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const outputDirectory = "artifacts/demo-screenshots/submission-storyboard";

async function capture(page: Page, fileName: string) {
  await page.screenshot({
    path: `${outputDirectory}/${fileName}`,
    fullPage: false,
  });
}

async function switchRole(page: Page, role: "관리자" | "원 기사" | "수신 기사") {
  const roleTab = page.getByRole("tab", { name: role });
  if (!await roleTab.isVisible()) {
    const menu = page.locator(".rider-role-menu summary");
    await expect(menu).toBeVisible();
    await menu.click();
  }
  await roleTab.click();
}

async function enterRider(page: Page, role: "원 기사" | "수신 기사") {
  await switchRole(page, role);
  const enterButton = page.getByRole("button", { name: "데모 계정으로 시작" });
  if (await enterButton.isVisible()) await enterButton.click();
  await page.getByRole("tab", { name: "안전지원" }).click();
}

test("3분 제출 영상의 일곱 핵심 장면을 같은 decision에서 캡처한다", async ({ page }) => {
  test.setTimeout(60_000);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/stage");

  await expect(
    page.getByRole("heading", {
      name: "52분 후 17번째 배송지 전, 지금 지원이 필요합니다",
    }),
  ).toBeVisible();
  await capture(page, "01-stage-opening.png");

  const comparison = page.getByRole("region", { name: "개입안 비교" });
  await comparison.scrollIntoViewIfNeeded();
  await expect(comparison.getByText("12건 이관은 실행할 수 없습니다.")).toBeVisible();
  await capture(page, "02-risk-transfer-guard.png");

  await enterRider(page, "원 기사");
  await expect(
    page.getByRole("heading", { name: "10분 쉬고, 배송지 8건을 이관합니다" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "지금은 거절" }).scrollIntoViewIfNeeded();
  await capture(page, "03-source-rider-consent.png");
  await page.getByRole("button", { name: "이 조정에 동의", exact: true }).click();

  await enterRider(page, "수신 기사");
  await expect(
    page.getByRole("heading", { name: "배송지 8건을 전달받습니다" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "지금은 거절" }).scrollIntoViewIfNeeded();
  await capture(page, "04-recipient-rider-consent.png");
  await page.getByRole("button", { name: "이 조정에 동의", exact: true }).click();

  await switchRole(page, "관리자");
  const reviewButton = page.getByRole("button", { name: "승인 검토" });
  await expect(reviewButton).toBeEnabled();
  await reviewButton.click();

  const dialog = page.getByRole("dialog", { name: "승인 후 계획을 적용할까요?" });
  await expect(dialog.getByText("원 기사 동의 완료")).toBeVisible();
  await expect(dialog.getByText("수신 기사 동의 완료")).toBeVisible();
  await capture(page, "05-admin-approval.png");
  await dialog.getByRole("button", { name: "승인 및 계획 적용" }).click();

  await expect(page.getByText("결정 완료 · 1건")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, "06-plan-applied.png");

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.root).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    document.title = "SafeRoute AI - 제출 영상 엔드 카드";
    document.body.innerHTML = `
      <main aria-label="SafeRoute AI 제출 영상 엔드 카드" style="
        box-sizing:border-box;min-height:100vh;padding:88px 112px;
        display:flex;flex-direction:column;justify-content:space-between;
        color:#f7fbff;background:
          radial-gradient(circle at 82% 18%, rgba(36,187,166,.24), transparent 31%),
          linear-gradient(145deg,#071d35 0%,#0b2948 56%,#0d3d55 100%);
        font-family:Pretendard,'Noto Sans KR',system-ui,sans-serif;">
        <section>
          <p style="margin:0 0 18px;color:#6ee7d8;font-size:24px;font-weight:800;letter-spacing:.06em;">
            LAST-MILE SAFETY OPERATIONS COPILOT
          </p>
          <h1 style="margin:0;font-size:84px;line-height:1;font-weight:900;letter-spacing:-.045em;">
            SafeRoute AI
          </h1>
          <p style="max-width:880px;margin:34px 0 0;font-size:40px;line-height:1.35;font-weight:750;letter-spacing:-.03em;">
            더 빠른 길보다 먼저,<br>끝까지 안전한 계획.
          </p>
        </section>
        <footer style="display:flex;align-items:flex-end;justify-content:space-between;gap:32px;">
          <p style="margin:0;color:#b8cada;font-size:20px;line-height:1.5;">
            미래 임계치 예측 · 위험전가 차단 · 기사 동의 · 관리자 승인 · 계획 갱신
          </p>
          <p style="margin:0;padding:12px 16px;border:1px solid rgba(255,255,255,.2);border-radius:12px;
            color:#d7e6f1;background:rgba(255,255,255,.06);font-size:16px;">
            합성 Demo · 실제 사고확률·사고감소 효과 주장 아님
          </p>
        </footer>
      </main>`;
    document.body.style.margin = "0";
  });
  await expect(
    page.getByRole("main", { name: "SafeRoute AI 제출 영상 엔드 카드" }),
  ).toBeVisible();
  await capture(page, "07-closing.png");
});
