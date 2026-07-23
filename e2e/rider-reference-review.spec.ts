import { expect, test } from "@playwright/test";
import { RiderReferenceComprehensionStudySchema } from "../src/evals/riderReferenceComprehension";

async function completeReview(page: import("@playwright/test").Page) {
  await expect(page.getByText("측정 중")).toBeVisible();
  await page.getByLabel("14번째 배송지 구간").check();
  await page.getByLabel("10분 휴식 지점").check();
  await page.getByLabel("17번째 배송지 전").check();
  await page.getByLabel(/미래 위험을 예측하고 지원계획을 합의/).check();
  await page.getByLabel(/필요한 기사 동의와 관리자 승인 후/).check();
  await page.getByLabel(/합성 Demo 경로이며 실제 GPS/).check();
  await page.getByLabel("4", { exact: true }).check();
  await page.getByLabel(/이유 또는 혼란 지점/).fill("합성 화면 이해도 검토");
  await page.getByRole("button", { name: "익명 답변 저장" }).click();
}

test("기사 경로·제품 경계 검토 도구는 5명의 동의와 익명 JSON을 완성한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tools/rider-reference-review/");
  await expect(page.getByRole("heading", { name: /기사 운행 화면을 보고/ })).toBeVisible();
  await page.screenshot({
    path: "artifacts/evals/screenshots/rider-reference-review-intro-1280x900.png",
    animations: "disabled",
  });

  for (let reviewer = 0; reviewer < 5; reviewer += 1) {
    const start = page.getByRole("button", { name: "검토 시작" });
    await expect(start).toBeDisabled();
    await page.getByLabel(/익명 응답을 평가 증거로 보존/).check();
    await expect(start).toBeEnabled();
    await start.click();
    await completeReview(page);
    if (reviewer < 4) {
      await page.getByRole("button", { name: "다음 익명 검토 시작" }).click();
    }
  }

  await expect(
    page.getByRole("heading", { name: "기계 검증용 익명 결과가 준비되었습니다." }),
  ).toBeVisible();
  const result = JSON.parse(
    await page.locator("[data-result-json]").textContent() ?? "{}",
  );
  const parsed = RiderReferenceComprehensionStudySchema.parse(result);
  expect(parsed.reviewers).toHaveLength(5);
  expect(parsed.reviewers.map(({ reviewerId }) => reviewerId)).toEqual([
    "reviewer-01",
    "reviewer-02",
    "reviewer-03",
    "reviewer-04",
    "reviewer-05",
  ]);
  expect(JSON.stringify(parsed)).not.toMatch(/name|email|phone|organization/i);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "결과 JSON 다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "rider-reference-comprehension-round2-results.json",
  );
});
