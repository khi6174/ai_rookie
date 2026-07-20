import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const decisionId = "decision-scenario-a-ui-v1";

async function switchDemoRole(page: Page, role: "관리자" | "원 기사" | "수신 기사") {
  const target = page.getByRole("tab", { name: role });
  if (!await target.isVisible()) {
    const menu = page.locator(".rider-role-menu summary");
    await expect(menu).toBeVisible();
    await menu.click();
  }
  await target.click();
}

async function enterRider(page: Page, role: "원 기사" | "수신 기사") {
  await switchDemoRole(page, role);
  const enterButton = page.getByRole("button", { name: "데모 계정으로 시작" });
  if (await enterButton.isVisible()) await enterButton.click();
}

async function expectCleanInitialState(page: Page, expectedDecisionId = decisionId) {
  await expect(page.getByRole("heading", { name: "향후 60분 안에 어떤 지원이 필요한가?" })).toBeVisible();
  await expect(page.getByText("Demo fixture").first()).toBeVisible();
  await expect(page.getByText(expectedDecisionId).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "기사 동의 대기" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "3개 합성 권역의 지원 필요 상황" })).toBeVisible();
  await expect(page.getByRole("img", { name: "3개 합성 권역과 권역별 기사 8명, 지원 decision 4건을 집계한 지도" })).toBeVisible();
  await expect(page.getByText("약 52분 후 · 17번째 배송지", { exact: true })).toBeVisible();
  await expect(page.getByText("12건 이관은 실행할 수 없습니다.")).toBeVisible();
  await expect(page.getByText("휴식 · 물량이관 · 순서변경 · 안전경로 · Safe Delay")).toBeVisible();
}

async function completeDecisionLoop(page: Page, expectedDecisionId = decisionId) {
  await enterRider(page, "원 기사");
  await expect(page.getByRole("heading", { name: "17번째 배송지 전에 지원을 확인해 주세요" })).toBeVisible();
  await expect(page.getByLabel("지원 계획 진행 순서")).toContainText("정차·검토");
  await page.getByRole("tab", { name: "안전지원" }).click();
  await expect(page.getByRole("heading", { name: "10분 쉬고, 배송지 8건을 이관합니다" })).toBeVisible();
  await page.getByRole("button", { name: "이 조정에 동의", exact: true }).click();
  await expect(page.locator(".rider-response-status").getByText("동의가 기록되었습니다. 계획은 아직 변경되지 않았습니다.")).toBeVisible();

  await enterRider(page, "수신 기사");
  await page.getByRole("tab", { name: "안전지원" }).click();
  await expect(page.getByRole("heading", { name: "배송지 8건을 전달받습니다" })).toBeVisible();
  await page.getByRole("button", { name: "이 조정에 동의", exact: true }).click();
  await expect(page.locator(".rider-response-status").getByText("모든 필수 동의가 완료되어 관리자 승인을 기다립니다.")).toBeVisible();

  await switchDemoRole(page, "관리자");
  const reviewButton = page.getByRole("button", { name: "승인 검토" });
  await expect(reviewButton).toBeEnabled();
  await reviewButton.click();

  const dialog = page.getByRole("dialog", { name: "승인 후 계획을 적용할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`Decision ID · ${expectedDecisionId}`)).toBeVisible();
  await dialog.getByRole("button", { name: "승인 및 계획 적용" }).click();

  await expect(page.getByText("결정 완료 · 1건")).toBeVisible();
  await expect(page.getByText("계획·안내 갱신 완료").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "계획 적용 완료" })).toBeDisabled();
  await expect(page.locator("#route-decision").getByText("예상 초과 해소")).toBeVisible();
  await expect(page.getByText("승인된 계획과 ETA가 함께 적용되고 고객안내 미리보기가 기록되었습니다.").first()).toBeVisible();
}

async function focusUsingTab(page: Page, target: Locator, limit = 80) {
  for (let index = 0; index < limit; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab 키로 대상에 포커스하지 못했습니다: ${await target.textContent()}`);
}

async function activateUsingKeyboard(page: Page, target: Locator) {
  await focusUsingTab(page, target);
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
}

async function expectNoPageHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

async function expectMinimumTouchHeight(locator: Locator, minimum = 44) {
  const box = await locator.boundingBox();
  expect(box, "터치 대상이 화면에 렌더링되어야 합니다.").not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minimum);
}

async function expectAboveMobileTabBar(page: Page, locator: Locator, reservedBottom = 72) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, "핵심 행동이 모바일 첫 화면에 렌더링되어야 합니다.").not.toBeNull();
  expect(viewport, "모바일 viewport가 설정되어야 합니다.").not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height - reservedBottom);
}

test("두 기사 동의 후 관리자 승인으로 계획·ETA·안내를 함께 적용한다", async ({ page }) => {
  await page.goto("/");
  await expectCleanInitialState(page);
  await completeDecisionLoop(page);
});

test("Demo 초기화는 같은 fixture를 새 결정 ID와 연결하고 폐루프를 다시 완료한다", async ({ page }) => {
  await page.goto("/");
  await enterRider(page, "원 기사");
  await page.getByRole("tab", { name: "안전지원" }).click();
  await page.getByRole("button", { name: "이 조정에 동의", exact: true }).click();
  await switchDemoRole(page, "관리자");
  await page.getByRole("button", { name: "Demo 초기화" }).click();

  const resetDecisionId = await page.locator(".global-announcement code").textContent();
  expect(resetDecisionId).toMatch(/^decision-scenario-a-ui-reset-[0-9a-f-]{36}$/);
  expect(resetDecisionId).not.toBe(decisionId);
  await expectCleanInitialState(page, resetDecisionId!);
  await completeDecisionLoop(page, resetDecisionId!);
});

test("키보드만으로 역할 전환, 두 기사 동의, 관리자 승인을 완료한다", async ({ page }) => {
  await page.goto("/");

  const sourceTab = page.getByRole("tab", { name: "원 기사" });
  await activateUsingKeyboard(page, sourceTab);
  const enterButton = page.getByRole("button", { name: "데모 계정으로 시작" });
  await focusUsingTab(page, enterButton);
  await expect(enterButton).toBeFocused();
  expect(await enterButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.locator(".rider-role-menu summary")).toHaveAttribute("aria-label", "R-017 · Demo 화면 전환");
  await activateUsingKeyboard(page, page.getByRole("tab", { name: "안전지원" }));
  await activateUsingKeyboard(page, page.getByRole("button", { name: "이 조정에 동의", exact: true }));

  await activateUsingKeyboard(page, page.locator(".rider-role-menu summary"));
  await activateUsingKeyboard(page, page.getByRole("tab", { name: "수신 기사" }));
  await activateUsingKeyboard(page, page.getByRole("button", { name: "데모 계정으로 시작" }));
  await activateUsingKeyboard(page, page.getByRole("tab", { name: "안전지원" }));
  await activateUsingKeyboard(page, page.getByRole("button", { name: "이 조정에 동의", exact: true }));

  await activateUsingKeyboard(page, page.locator(".rider-role-menu summary"));
  await activateUsingKeyboard(page, page.getByRole("tab", { name: "관리자" }));
  await activateUsingKeyboard(page, page.getByRole("button", { name: "승인 검토" }));
  await expect(page.getByRole("dialog", { name: "승인 후 계획을 적용할까요?" })).toBeVisible();
  await activateUsingKeyboard(page, page.getByRole("button", { name: "승인 및 계획 적용" }));
  await expect(page.getByText("계획·안내 갱신 완료").first()).toBeVisible();
});

test("다지역 집계에서 권역·기사·decision으로 좁히고 지원 큐와 동기화한다", async ({ page }) => {
  await page.goto("/");
  const northRegion = page.getByRole("button", {
    name: "합성 북부권역, 기사 8명, 지원 decision 4건",
  });
  await northRegion.click();
  await expect(page.getByRole("heading", { name: "합성 북부권역의 기사와 경로" })).toBeVisible();
  const movingMarker = page.getByRole("button", { name: /courier-01, 지원 필요, 위치 CURRENT/ });
  const staleMarker = page.getByRole("button", { name: /courier-07, 운행 중, 위치 STALE/ });
  const movingStyleAtStart = await movingMarker.getAttribute("style");
  const staleStyleAtStart = await staleMarker.getAttribute("style");
  await page.getByRole("button", { name: "다음 5초" }).click();
  await expect(page.getByText("00:05 / 00:30", { exact: true })).toBeVisible();
  expect(await movingMarker.getAttribute("style")).not.toBe(movingStyleAtStart);
  expect(await staleMarker.getAttribute("style")).toBe(staleStyleAtStart);
  await page.getByRole("button", { name: "Demo 이동 재생" }).click();
  await expect(page.getByText("00:10 / 00:30", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Demo 이동 일시정지" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await expect(page.getByText("00:00 / 00:30", { exact: true })).toBeVisible();
  await movingMarker.click();
  await expect(page.getByRole("heading", { name: "선택한 지원 decision과 계획 경로" })).toBeVisible();
  await expect(page.getByText(decisionId).first()).toBeVisible();
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page.getByRole("heading", { name: "3개 합성 권역의 지원 필요 상황" })).toBeVisible();
  await page.getByRole("link", { name: "지도에서 같은 decision 보기" }).click();
  await expect(page.getByRole("heading", { name: "선택한 지원 decision과 계획 경로" })).toBeVisible();
});

test("합성 지도는 드래그·방향키로 이동하고 중심을 복원한다", async ({ page }) => {
  await page.goto("/");
  const map = page.getByRole("group", { name: "합성 지도 이동 영역" });
  const surface = page.locator(".control-map-pan-surface");
  const background = page.locator(".control-map-pan-background");
  const reset = page.getByRole("button", { name: "지도 중심 복원" });
  await expect(surface).toHaveAttribute("data-pan-x", "0");
  await expect(surface).toHaveAttribute("data-pan-y", "0");
  await expect(reset).toBeDisabled();

  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  const backgroundBeforeBox = await background.boundingBox();
  expect(box).not.toBeNull();
  expect(backgroundBeforeBox).not.toBeNull();
  const startX = box!.x + box!.width * 0.22;
  const startY = box!.y + box!.height * 0.75;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 72, startY + 46, { steps: 5 });
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-pan-x", "0");
  await expect(surface).not.toHaveAttribute("data-pan-y", "0");
  const backgroundAfterBox = await background.boundingBox();
  expect(backgroundAfterBox).not.toBeNull();
  expect(backgroundAfterBox!.x).not.toBe(backgroundBeforeBox!.x);
  expect(backgroundAfterBox!.y).not.toBe(backgroundBeforeBox!.y);
  await expect(page.getByText(decisionId).first()).toBeVisible();

  await reset.click();
  await expect(surface).toHaveAttribute("data-pan-x", "0");
  await expect(surface).toHaveAttribute("data-pan-y", "0");
  await map.focus();
  await page.keyboard.press("ArrowRight");
  await expect(surface).toHaveAttribute("data-pan-x", "24");
  await page.keyboard.press("Home");
  await expect(surface).toHaveAttribute("data-pan-x", "0");
});

test("지도 오류에서는 구조화 목록으로 같은 decision과 배송순서를 확인하고 복구한다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "지도 오류 재현" }).click();
  await expect(page.getByRole("alert").getByText("지도를 불러오지 못했습니다.")).toBeVisible();
  await expect(page.getByRole("img", { name: "3개 합성 권역과 권역별 기사 8명, 지원 decision 4건을 집계한 지도" })).toHaveCount(0);
  await page.getByRole("button", { name: "합성 북부권역 목록 보기" }).click();
  await expect(page.getByRole("list", { name: "합성 북부권역 기사와 위치 상태 목록" })).toBeVisible();
  await page.getByRole("button", { name: "courier-01 decision 선택" }).click();
  const routeOrder = page.getByLabel("지도 없이 확인하는 배송순서와 지원 조치");
  await expect(routeOrder.getByRole("heading", { name: "지도 없이 확인하는 배송순서와 지원 조치" })).toBeVisible();
  await expect(routeOrder.getByText(`Decision ID · ${decisionId}`)).toBeVisible();
  await expect(page.getByText("기사 동의와 관리자 승인 전에는 변경 없음")).toBeVisible();
  await page.getByRole("link", { name: "같은 결정을 지원 큐에서 보기" }).click();
  await expect(page.getByRole("heading", { name: "지금 필요한 결정" })).toBeVisible();
  await page.getByRole("link", { name: "지도에서 같은 decision 보기" }).click();
  await expect(page.getByRole("heading", { name: "선택한 지원 decision과 계획 경로" })).toBeVisible();
  await page.getByRole("button", { name: "지도 복구" }).click();
  await expect(page.getByRole("img", { name: "합성 북부권역의 합성 허브, 기사 위치 상태와 계획 경로 지도" })).toBeVisible();
});

test("키보드로 구조화 지도 대안을 열고 decision을 선택한다", async ({ page }) => {
  await page.goto("/");
  const alternative = page.getByText("지도 없이 배송순서·decision 보기", { exact: true });
  await activateUsingKeyboard(page, alternative);
  await expect(page.getByRole("list", { name: "합성 권역 목록" })).toBeVisible();
  await activateUsingKeyboard(page, page.getByRole("button", { name: "합성 북부권역 목록 보기" }));
  await activateUsingKeyboard(page, page.getByRole("button", { name: "courier-01 decision 선택" }));
  const routeOrder = page.getByLabel("지도 없이 확인하는 배송순서와 지원 조치");
  await expect(routeOrder.getByRole("heading", { name: "지도 없이 확인하는 배송순서와 지원 조치" })).toBeVisible();
  await expect(routeOrder.getByText(`Decision ID · ${decisionId}`)).toBeVisible();
});

for (const viewport of [
  { name: "관리자 1440×900", width: 1440, height: 900 },
  { name: "관리자 1280×720", width: 1280, height: 720 },
]) {
  test(`${viewport.name}에서 핵심 상태와 행동이 가로로 잘리지 않는다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "3개 합성 권역의 지원 필요 상황" })).toBeVisible();
    await expect(page.getByRole("button", { name: "기사 동의 대기" })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });
}

for (const viewport of [
  { name: "기사 390×844", width: 390, height: 844 },
  { name: "기사 360×800", width: 360, height: 800 },
]) {
  test(`${viewport.name}에서 핵심 문구와 44px 터치 대상을 유지한다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await enterRider(page, "원 기사");
    await expect(page.locator(".stopped-badge")).toHaveText("정차 확인");
    await expect(page.locator(".stopped-badge > *")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "17번째 배송지 전에 지원을 확인해 주세요" })).toBeVisible();
    await expect(page.getByLabel("현재 위치, 휴식 지점과 다음 배송지를 나타내는 합성 경로 요약")).toBeVisible();
    await expect(page.getByText("Fallback map", { exact: true })).toBeVisible();
    await expect(page.getByText("합성 현재 위치", { exact: false })).toBeVisible();
    await expect(page.getByText("14번째 · 약 6분", { exact: true })).toBeVisible();
    await expectAboveMobileTabBar(page, page.getByRole("button", { name: "안전지원 검토" }));
    for (const tabName of ["운행", "안전지원", "내 정보"]) {
      await expectMinimumTouchHeight(page.getByRole("tab", { name: tabName }));
    }
    await page.getByRole("tab", { name: "안전지원" }).click();
    await expect(page.getByRole("heading", { name: "10분 쉬고, 배송지 8건을 이관합니다" })).toBeVisible();
    await expect(page.getByLabel("조정 전후와 내 작업 변화 요약")).toBeVisible();
    await expectAboveMobileTabBar(page, page.getByRole("button", { name: "이 조정에 동의", exact: true }));
    await expect(page.getByText("수정하거나 거절해도 불이익은 없습니다.", { exact: false })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
    await expectMinimumTouchHeight(page.locator(".rider-role-menu summary"));
    await expectMinimumTouchHeight(page.getByRole("button", { name: "이 조정에 동의", exact: true }));
    await expectMinimumTouchHeight(page.getByRole("button", { name: "다른 방법 요청" }));
    await expectMinimumTouchHeight(page.getByRole("button", { name: "지금은 거절" }));
  });
}

test("저장 상태가 없는 독립 브라우저 세션 3회에서 같은 폐루프를 180초 안에 재현한다", async ({ browser }) => {
  const startedAt = Date.now();
  for (let run = 1; run <= 3; run += 1) {
    await runFreshSession(browser, run);
  }
  expect(Date.now() - startedAt).toBeLessThan(180_000);
});

test("설치형 앱 셸은 오프라인에서 마지막 승인 Demo 계획만 읽기 전용으로 제공한다", async ({ context, page }) => {
  await page.goto("/?pwa-test=1");
  await completeDecisionLoop(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("saferoute.approved-demo-plan.v1") !== null)).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  await page.reload();
  await expectCleanInitialState(page);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await enterRider(page, "원 기사");
    await expect(page.getByText("오프라인 · 마지막 승인 Demo 계획")).toBeVisible();
    await expect(page.getByText("읽기 전용", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "조정된 계획으로 운행합니다" })).toBeVisible();
    await page.getByRole("tab", { name: "안전지원" }).click();
    await expect(page.getByText("오프라인에서는 동의·수정·거절을 기록하지 않습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "이 조정에 동의", exact: true })).toBeDisabled();
    await expectNoPageHorizontalOverflow(page);
  } finally {
    await context.setOffline(false);
  }
});

test("만료된 오프라인 계획을 최신 계획으로 표시하거나 행동에 사용하지 않는다", async ({ context, page }) => {
  await page.goto("/?pwa-test=1");
  await page.evaluate(() => {
    const storedAt = new Date(Date.now() - 60 * 60 * 1_000);
    localStorage.setItem("saferoute.approved-demo-plan.v1", JSON.stringify({
      schemaVersion: "cached-approved-demo-plan-v1",
      dataMode: "DEMO",
      approvalState: "APPROVED_APPLIED",
      decisionId: "decision-expired-demo-v1",
      planId: "plan-expired-demo-v1",
      planVersion: "1.0.1",
      storedAt: storedAt.toISOString(),
      expiresAt: new Date(storedAt.getTime() + 30 * 60 * 1_000).toISOString(),
      couriers: [{ courierId: "courier-scenario-a-source", remainingStopCount: 9 }],
    }));
  });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await enterRider(page, "원 기사");
    await expect(page.getByText("캐시 만료 · 최신 계획 아님")).toBeVisible();
    await expect(page.getByRole("heading", { name: "17번째 배송지 전에 지원을 확인해 주세요" })).toBeVisible();
    await page.getByRole("tab", { name: "안전지원" }).click();
    await expect(page.getByRole("button", { name: "이 조정에 동의", exact: true })).toBeDisabled();
  } finally {
    await context.setOffline(false);
  }
});

test("내 정보에서 설치 가능 상태와 실제 미구현 권한 경계를 구분한다", async ({ page }) => {
  await page.goto("/?pwa-test=1");
  await enterRider(page, "원 기사");
  await page.getByRole("tab", { name: "내 정보" }).click();
  await expect(page.getByText("기기 설치와 오프라인")).toBeVisible();
  await expect(page.getByText("마지막 승인·적용 Demo 계획만 30분 동안", { exact: false })).toBeVisible();
  await expect(page.getByText("실제 인증·위치 권한·푸시 알림은 포함하지 않습니다.")).toBeVisible();
  await expectMinimumTouchHeight(page.locator(".rider-pwa-card button"));
});

test("발표용 네 해상도 스크린샷과 SHA-256 manifest를 생성한다", async ({ browser, page }) => {
  const outputDirectory = resolve("artifacts/evals/screenshots");
  const accessibilityOutput = resolve("artifacts/evals/accessibility-summary.json");
  await mkdir(outputDirectory, { recursive: true });
  const files: Array<{
    file: string;
    width: number;
    height: number;
    role: string;
    state: string;
    sha256: string;
  }> = [];
  const accessibilityChecks: Array<{
    viewport: string;
    role: string;
    state: string;
    horizontalOverflow: boolean;
    demoModeLabelVisible: boolean;
    checkedTouchTargets: number;
    minimumTouchHeightPx?: number;
    requiredTouchHeightPx?: number;
    passed: boolean;
  }> = [];

  const capture = async (input: {
    file: string;
    width: number;
    height: number;
    role: string;
    state: string;
  }) => {
    await page.setViewportSize({ width: input.width, height: input.height });
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expectNoPageHorizontalOverflow(page);
    const demoModeLabelVisible = await page.locator(".mode-badge:visible, .fixture-pill:visible").filter({ hasText: "Demo" }).first().isVisible();
    expect(demoModeLabelVisible).toBe(true);
    const touchTargets = input.state === "LOGIN"
      ? [
          page.getByRole("button", { name: "데모 계정으로 시작" }),
          page.getByRole("button", { name: "관리자 화면으로 돌아가기" }),
        ]
      : input.state === "RIDER_ROUTE"
        ? [
            page.getByRole("tab", { name: "운행" }),
            page.getByRole("tab", { name: "안전지원" }),
            page.getByRole("tab", { name: "내 정보" }),
            page.getByRole("button", { name: "안전지원 검토" }),
          ]
        : input.role === "SOURCE" || input.role === "RECIPIENT"
      ? [
          page.locator(".rider-role-menu summary"),
          page.getByRole("button", { name: "이 조정에 동의", exact: true }),
          page.getByRole("button", { name: "다른 방법 요청" }),
          page.getByRole("button", { name: "지금은 거절" }),
        ]
      : [];
    const touchHeights = await Promise.all(touchTargets.map(async (target) => {
      await expectMinimumTouchHeight(target);
      return (await target.boundingBox())!.height;
    }));
    const bytes = await page.screenshot({
      path: resolve(outputDirectory, input.file),
      fullPage: false,
      animations: "disabled",
    });
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    files.push({
      ...input,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    accessibilityChecks.push({
      viewport: `${input.width}x${input.height}`,
      role: input.role,
      state: input.state,
      horizontalOverflow: false,
      demoModeLabelVisible,
      checkedTouchTargets: touchHeights.length,
      minimumTouchHeightPx: touchHeights.length ? Math.min(...touchHeights) : undefined,
      requiredTouchHeightPx: touchHeights.length ? 44 : undefined,
      passed: true,
    });
  };

  await page.goto("/");
  await expectCleanInitialState(page);
  await capture({
    file: "admin-initial-1440x900.png",
    width: 1440,
    height: 900,
    role: "ADMIN",
    state: "RIDER_RESPONSE_PENDING",
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await completeDecisionLoop(page);
  await capture({
    file: "admin-applied-1280x720.png",
    width: 1280,
    height: 720,
    role: "ADMIN",
    state: "NOTICE_RECORDED",
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "원 기사" }).click();
  await capture({
    file: "rider-login-390x844.png",
    width: 390,
    height: 844,
    role: "SOURCE",
    state: "LOGIN",
  });
  await page.getByRole("button", { name: "데모 계정으로 시작" }).click();
  await capture({
    file: "rider-source-route-390x844.png",
    width: 390,
    height: 844,
    role: "SOURCE",
    state: "RIDER_ROUTE",
  });
  await page.getByRole("tab", { name: "안전지원" }).click();
  await capture({
    file: "rider-source-review-390x844.png",
    width: 390,
    height: 844,
    role: "SOURCE",
    state: "RIDER_RESPONSE_PENDING",
  });

  await page.goto("/");
  await enterRider(page, "수신 기사");
  await page.getByRole("tab", { name: "안전지원" }).click();
  await capture({
    file: "rider-recipient-review-360x800.png",
    width: 360,
    height: 800,
    role: "RECIPIENT",
    state: "RIDER_RESPONSE_PENDING",
  });

  await writeFile(
    resolve(outputDirectory, "ui-screenshot-manifest.json"),
    `${JSON.stringify({
      schemaVersion: "ui-screenshot-manifest-v1",
      dataMode: "Demo fixture",
      browser: `Chromium ${browser.version()}`,
      files,
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    accessibilityOutput,
    `${JSON.stringify({
      schemaVersion: "accessibility-summary-v1",
      capturedAt: new Date().toISOString(),
      dataMode: "Demo fixture",
      browser: `Chromium ${browser.version()}`,
      scope: [
        "horizontal overflow at four required viewports",
        "44px minimum touch height for login, route and decision controls in rider views",
        "visible Demo fixture provenance label",
        "map error fallback with structured region, courier, decision and delivery-order navigation",
        "keyboard-only structured map alternative navigation",
        "pointer-drag and keyboard map panning with bounded position and center reset",
        "rider current-position context, next delivery and primary support action above the mobile tab bar",
        "rider decision summary and consent action above the mobile tab bar",
      ],
      excluded: [
        "automated WCAG rule scan",
        "screen-reader announcement audit",
        "Lighthouse score",
      ],
      checks: accessibilityChecks,
      passed: accessibilityChecks.length === 6 && accessibilityChecks.every((check) => check.passed),
    }, null, 2)}\n`,
    "utf8",
  );
});

async function runFreshSession(browser: Browser, run: number) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expectCleanInitialState(page);
    await completeDecisionLoop(page);
    await test.info().attach(`clean-session-${run}`, {
      body: Buffer.from(JSON.stringify({ run, decisionId, status: "NOTICE_RECORDED" }, null, 2)),
      contentType: "application/json",
    });
  } finally {
    await context.close();
  }
}
