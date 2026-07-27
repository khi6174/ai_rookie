import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const correctLabels = {
  ADMIN: [
    /향후 지원이 필요한 기사와 실행 가능한 조치/,
    /결정론적 합성 데이터/,
    /계산된 결정 사실을 역할별 문장으로 설명/,
    /별도 기사 화면에서 기록/,
  ],
  RIDER: [
    /동의, 수정 요청, 거절이 모두 제공/,
    /불이익을 의미하지 않으며 현재 계획을 유지/,
    /합성 경로 시각화·ETA 비교 보조/,
    /관리자 승인과 최신 계획 재검증/,
  ],
} as const;

async function completeReview(
  page: Page,
  role: keyof typeof correctLabels,
  reviewerCode: string,
) {
  await page.getByRole("button", {
    name: role === "ADMIN" ? "관리자 검토" : "기사 검토",
  }).click();
  await page.getByLabel("익명 검토 코드").fill(reviewerCode);
  for (const label of correctLabels[role]) {
    await page.getByLabel(label).check();
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "검토 결과 JSON 내려받기" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const result = JSON.parse(await readFile(downloadPath!, "utf8"));

  expect(result).toMatchObject({
    schemaVersion: "operations-service-human-review-result-v1",
    studyId: "operations-service-human-review-v1",
    dataMode: "SYNTHETIC",
    role,
    reviewerCode,
    correctCount: 4,
    criticalMisconceptionCount: 0,
    uploadPerformed: false,
  });
  expect(result.answers).toHaveLength(4);
  expect(download.suggestedFilename()).toBe(
    `operations-service-review-${role.toLowerCase()}-${reviewerCode}.json`,
  );
}

test("합성 운영 서비스 검토 도구는 관리자·기사 결과를 서버 전송 없이 내려받는다", async ({
  page,
}) => {
  const requestedOrigins = new Set<string>();
  page.on("request", (request) => {
    requestedOrigins.add(new URL(request.url()).origin);
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tools/operations-service-review/");
  await expect(
    page.getByRole("heading", { name: "합성 운영 서비스 독립 이해도 검토" }),
  ).toBeVisible();

  await completeReview(page, "ADMIN", "admin-test");
  await completeReview(page, "RIDER", "rider-test");

  await expect(page.getByRole("status")).toHaveText(
    "결과를 내려받았습니다. 파일은 서버로 전송되지 않습니다.",
  );
  expect([...requestedOrigins]).toEqual(["http://127.0.0.1:4173"]);
});
