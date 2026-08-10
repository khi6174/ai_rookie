import { expect, test } from "@playwright/test";

test("외부 연결 전 Sandbox 상태는 비활성 경계와 승격 조건을 공개한다", async ({ page }) => {
  await page.goto("/integration-sandbox-status");
  await expect(page.getByRole("heading", { name: "외부 연결 전 운영 준비 상태" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "비활성 · 안전하게 닫힘" })).toBeVisible();
  await expect(page.getByText("실제 TMS", { exact: true })).toBeVisible();
  await expect(page.getByText("실제 인증", { exact: true })).toBeVisible();
  await expect(page.getByText("고객 발송", { exact: true })).toBeVisible();
  await expect(page.getByText("실제 개인정보", { exact: true })).toBeVisible();
  await expect(page.getByText("미연결", { exact: true })).toHaveCount(2);
  await expect(page.getByText("비활성", { exact: true })).toBeVisible();
  await expect(page.getByText("허용 안 함", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adapter 연결 전 기술 Gate" })).toBeVisible();
  await expect(page.getByText("실제 원천·인증·개인정보·보존·TMS 보상 트랜잭션·고객 발송·현장 Pilot이 별도로 승인되고 검증된 뒤에만 LIVE_PILOT로 전환합니다.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/실서비스 완료|실제 TMS 연결 완료/);
});
