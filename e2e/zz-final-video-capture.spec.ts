import {mkdir} from "node:fs/promises";
import {expect, test, type BrowserContext, type Page} from "@playwright/test";

const outputDirectory = "artifacts/demo-screenshots/final-video-2026";

async function capture(page: Page, fileName: string) {
  await page.screenshot({
    path: `${outputDirectory}/${fileName}`,
    fullPage: false,
    animations: "disabled",
  });
}

async function openRiderSupport(
  context: BrowserContext,
  courierId: string,
  viewport: {width: number; height: number},
) {
  const riderPage = await context.newPage();
  await riderPage.setViewportSize(viewport);
  await riderPage.goto(`/rider-demo?courier=${encodeURIComponent(courierId)}`);
  await riderPage.getByRole("tab", {name: "안전지원"}).click();
  await expect(
    riderPage.getByRole("button", {name: "이 조정에 동의"}),
  ).toBeEnabled();
  return riderPage;
}

test("최종 제출 영상용 최신 서비스 장면을 같은 결정으로 캡처한다", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180_000);
  await mkdir(outputDirectory, {recursive: true});
  await page.setViewportSize({width: 1920, height: 1080});
  await page.goto("/");
  await expect(page.locator("[data-courier-card]")).toHaveCount(25, {
    timeout: 15_000,
  });
  await capture(page, "01-control-tower.png");

  const supportCards = page.locator(
    '[data-courier-card][data-decision-id]:not([data-decision-id=""])',
  );
  let sourceCourierId: string | null = null;
  for (let index = 0; index < await supportCards.count(); index += 1) {
    const card = supportCards.nth(index);
    await card.click();
    await page.getByRole("button", {name: "지원 검토"}).click();
    const candidate = page
      .getByRole("dialog")
      .locator(".onepage-candidate-list button:not([disabled])")
      .filter({hasText: /배송 \d+건 분담/})
      .first();
    const requestButton = page
      .getByRole("dialog")
      .getByRole("button", {name: "기사 확인 요청"});
    if (
      (await candidate.count()) > 0 &&
      (await requestButton.count()) > 0 &&
      await requestButton.isEnabled()
    ) {
      sourceCourierId = await card.getAttribute("data-courier-card");
      await page
        .getByRole("dialog")
        .getByRole("button", {name: "지원 검토 닫기"})
        .click();
      break;
    }
    await page
      .getByRole("dialog")
      .getByRole("button", {name: "지원 검토 닫기"})
      .click();
  }
  expect(sourceCourierId).toBeTruthy();
  await page.getByRole("button", {name: "배송구역 확대"}).click();
  await expect(page.locator(".onepage-map-canvas")).toHaveAttribute(
    "data-map-focus-mode",
    "COURIER",
  );
  await capture(page, "02-courier-route.png");

  await page.getByRole("button", {name: "지원 검토"}).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("안전한 지원안 비교", {exact: true})).toBeVisible();
  const transferCandidate = dialog
    .locator(".onepage-candidate-list button:not([disabled])")
    .filter({hasText: /배송 \d+건 분담/})
    .first();
  await transferCandidate.click();
  await capture(page, "03-support-comparison.png");

  await dialog.getByText("AI 근거 설명", {exact: true}).click();
  await dialog.getByRole("button", {name: "근거 설명 생성"}).click();
  await expect(dialog.locator("[data-explanation-status]")).toBeVisible();
  await dialog.getByText("A.X v2 검증 근거", {exact: true}).click();
  await expect(
    dialog.getByText("A.X Local runtime은 활성화하지 않았습니다."),
  ).toBeVisible();
  await capture(page, "04-ai-evidence.png");
  await dialog.getByText("AI 근거 설명", {exact: true}).click();

  await dialog.getByRole("button", {name: "기사 확인 요청"}).click();
  const riderHref = await page.getByRole("link", {name: "기사 앱"}).getAttribute("href");
  expect(riderHref).toBeTruthy();
  const riderUrl = new URL(riderHref!, page.url());
  const workspaceId = riderUrl.searchParams.get("workspace");
  const decisionId = riderUrl.searchParams.get("decision");
  expect(workspaceId).toBeTruthy();
  expect(decisionId).toBeTruthy();

  const sessionResponse = await request.get(`/api/operations/sessions/${workspaceId}`);
  expect(sessionResponse.ok()).toBe(true);
  const sessionBody = (await sessionResponse.json()) as {
    session: {
      workspace: {
        decisions: Array<{
          decision: {
            decisionId: string;
            consentRequirements: Array<{
              courierId: string;
              required: boolean;
            }>;
          };
        }>;
      };
    };
  };
  const requiredCourierIds = sessionBody.session.workspace.decisions
    .find((item) => item.decision.decisionId === decisionId)!
    .decision.consentRequirements.filter((item) => item.required)
    .map((item) => item.courierId);
  expect(requiredCourierIds.length).toBeGreaterThanOrEqual(1);

  const sourcePage = await openRiderSupport(
    context,
    sourceCourierId!,
    {width: 390, height: 844},
  );
  await capture(sourcePage, "05-source-rider-consent.png");
  await sourcePage.getByRole("button", {name: "이 조정에 동의"}).click();

  const recipientCourierId = requiredCourierIds.find(
    (courierId) => courierId !== sourceCourierId,
  );
  if (recipientCourierId) {
    const recipientPage = await openRiderSupport(
      context,
      recipientCourierId,
      {width: 390, height: 844},
    );
    await capture(recipientPage, "06-recipient-rider-consent.png");
    await recipientPage.getByRole("button", {name: "이 조정에 동의"}).click();
    await recipientPage.close();
  }

  await expect(dialog.getByText("관리자 승인 대기", {exact: true})).toBeVisible();
  await capture(page, "07-admin-approval.png");
  await dialog.getByRole("button", {name: "관리자 승인 및 적용"}).click();
  await expect(
    dialog.getByText("경로 / 배송순서 / ETA / 고객 안내 상태를 갱신했습니다."),
  ).toBeVisible();
  await capture(page, "08-plan-applied.png");
  await sourcePage.close();

  const scenarioPage = await context.newPage();
  await scenarioPage.setViewportSize({width: 1920, height: 1080});
  await scenarioPage.goto("/scenario");
  await expect(
    scenarioPage.getByRole("heading", {name: "날짜·시간과 기상 관측"}),
  ).toBeVisible();
  await expect(
    scenarioPage.getByRole("heading", {name: "업무 및 안전여유 입력"}),
  ).toBeVisible();
  await scenarioPage.locator(".scenario-calendar-days button").nth(10).click();
  await scenarioPage.getByLabel("연속 작업").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "4.2";
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
  });
  await scenarioPage.getByRole("button", {name: "이 조건으로 다시 예측"}).click();
  await expect(scenarioPage.locator(".scenario-recommended-card")).toBeVisible();
  await capture(scenarioPage, "09-scenario-prediction.png");
  await scenarioPage.close();
});
