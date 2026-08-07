import { expect, test } from "@playwright/test";

test("Shadow Live 준비 화면은 가명 이벤트를 브라우저에서만 검증한다", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "fetch" || request.resourceType() === "xhr") {
      requests.push(request.url());
    }
  });

  await page.goto("/shadow-live-setup");
  await expect(
    page.getByRole("heading", {
      name: "실제 운영 진행 이벤트를 안전하게 연결합니다.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "연결 전", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "합성 예시 불러오기" }).click();
  await page.getByRole("button", { name: "로컬에서 검증" }).click();
  await expect(
    page.getByRole("heading", { name: "계약 검증 통과", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2건", { exact: true })).toBeVisible();
  await expect(page.getByText("2명", { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test("이름과 GPS가 포함된 입력을 차단하고 원문을 저장하지 않는다", async ({
  page,
}) => {
  await page.goto("/shadow-live-setup");
  await page.getByLabel("JSON 이벤트 묶음").fill(
    JSON.stringify({
      schemaVersion: "shadow-live-progress-batch-v1",
      dataMode: "LIVE_PILOT",
      source: {
        kind: "READ_ONLY_CONNECTOR",
        connectionId: "shadow-pilot-01",
        generatedAt: "2026-08-07T12:00:10+09:00",
      },
      events: [
        {
          eventId: "event-0001",
          sequence: 1,
          occurredAt: "2026-08-07T12:00:00+09:00",
          eventType: "STOP_PROGRESS",
          courierRef: "anon-rider-001",
          planRef: "plan-route-001",
          completedStopCount: 6,
          totalStopCount: 14,
          name: "실제 이름",
          gps: { lat: 37.55, lng: 126.98 },
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "로컬에서 검증" }).click();
  await expect(
    page.getByRole("heading", { name: "입력 차단", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("events.0.name", { exact: true })).toBeVisible();
  await expect(page.getByText("events.0.gps", { exact: true })).toBeVisible();
});

test("공개 관제에서 Shadow Live 준비 화면으로 이동할 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("link", { name: "Shadow Live 준비" }).click();
  await expect(page).toHaveURL(/\/shadow-live-setup$/);
});
