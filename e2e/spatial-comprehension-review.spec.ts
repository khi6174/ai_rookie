import { expect, test } from "@playwright/test";
import { SpatialComprehensionStudySchema } from "../src/evals/spatialComprehension";

const expected = {
  timeToBreachMinutes: "52",
  breachStopOrdinal: "17",
  restMinutes: "10",
  transferStopCount: "8",
};

async function completeTrial(page: import("@playwright/test").Page) {
  await expect(page.getByText("측정 중")).toBeVisible();
  await page.getByLabel("몇 분 후").fill(expected.timeToBreachMinutes);
  await page.getByLabel("몇 번째 배송지").fill(expected.breachStopOrdinal);
  await page.getByLabel("휴식–예상 초과").check();
  await page.getByLabel("휴식 시간(분)").fill(expected.restMinutes);
  await page.getByLabel("이관 배송 건수").fill(expected.transferStopCount);
  await page.getByLabel("지원받는 기사").selectOption(
    "WORKLOAD_REDUCED_AND_BUDGET_RECOVERS",
  );
  await page.getByLabel("배송을 나눠 맡는 기사").selectOption(
    "TRANSFER_WITHIN_SAFETY_LIMIT",
  );
  await page.getByLabel("휴식 지점이 먼저").check();
  await page.getByLabel("4", { exact: true }).check();
  await page.getByRole("button", { name: "답변 확정" }).click();
}

test("G5-B Round 4 로컬 평가 화면은 3명의 동의·순서 균형·익명 JSON을 완성한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const reviewScriptRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/tools/g5-spatial-review/app.js")) {
      reviewScriptRequests.push(request.url());
    }
  });
  await page.goto("/tools/g5-spatial-review/");
  await expect(page.getByRole("heading", { name: /두 화면을 보고/ })).toBeVisible();
  expect(reviewScriptRequests).toEqual([
    expect.stringContaining("app.js?study=g5-round4-001"),
  ]);
  await page.screenshot({
    path: "artifacts/evals/screenshots/g5-review-facilitator-intro-1280x900.png",
    animations: "disabled",
  });

  for (let reviewer = 0; reviewer < 3; reviewer += 1) {
    const start = page.getByRole("button", { name: "검토 시작" });
    await expect(start).toBeDisabled();
    await page.getByLabel(/익명 응답을 평가 증거로 보존/).check();
    await expect(start).toBeEnabled();
    await start.click();

    await completeTrial(page);
    await completeTrial(page);
    await page.getByLabel("Demo 2.5D").check();
    await page.getByLabel("아니요").check();
    await page.getByLabel(/이유 또는 혼란 지점/).fill("합성 화면 비교 응답");
    await page.getByRole("button", { name: "익명 검토 저장" }).click();

    if (reviewer < 2) {
      await page.getByRole("button", { name: "다음 익명 검토 시작" }).click();
    }
  }

  await expect(
    page.getByRole("heading", { name: "기계 검증용 익명 결과가 준비되었습니다." }),
  ).toBeVisible();
  const result = JSON.parse(
    await page.locator("[data-result-json]").textContent() ?? "{}",
  );
  const parsed = SpatialComprehensionStudySchema.parse(result);
  expect(parsed.reviewers).toHaveLength(3);
  expect(parsed.reviewers.map(({ reviewerId }) => reviewerId)).toEqual([
    "reviewer-01",
    "reviewer-02",
    "reviewer-03",
  ]);
  expect(parsed.reviewers.map(({ trialOrder }) => trialOrder)).toEqual([
    ["TWO_D", "DEMO_TWO_POINT_FIVE_D"],
    ["DEMO_TWO_POINT_FIVE_D", "TWO_D"],
    ["TWO_D", "DEMO_TWO_POINT_FIVE_D"],
  ]);
  expect(JSON.stringify(parsed)).not.toMatch(/name|email|phone|organization/i);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "결과 JSON 다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "g5-spatial-comprehension-round4-results.json",
  );
});
