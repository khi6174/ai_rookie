import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.describe("synthetic operations service", () => {
  test("evaluates the full operations day and opens multiple support decisions", async ({
    page,
  }) => {
    await page.goto("/operations");

    await expect(
      page.getByRole("heading", {
        name: "오늘의 운영자료를 확정합니다",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "일일 운영" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tablist", { name: "관리자 운영 화면" }).getByRole("tab"),
    ).toHaveCount(5);
    await expect(page.getByText("활성 기사 25명")).toBeVisible();
    await expect(page.getByText("입력 합성 문서 100개")).toBeVisible();
    const documentAttach = page.getByText("운영 문서 첨부", { exact: true });
    await expect(documentAttach).toBeVisible();
    expect(
      await documentAttach.evaluate(
        (element) => window.getComputedStyle(element).whiteSpace,
      ),
    ).toBe("nowrap");

    const documentBundleLink = page.getByRole("link", {
      name: "합성 문서 번들 내려받기",
    });
    expect(
      await documentBundleLink.evaluate(
        (element) => window.getComputedStyle(element).whiteSpace,
      ),
    ).toBe("nowrap");
    const documentBundleDownload = page.waitForEvent("download");
    await documentBundleLink.click();
    const downloadedBundle = await documentBundleDownload;
    const downloadedBundlePath = await downloadedBundle.path();
    expect(downloadedBundlePath).not.toBeNull();
    const documentBundle = JSON.parse(
      await readFile(downloadedBundlePath!, "utf8"),
    );
    expect(documentBundle).toMatchObject({
      schemaVersion: "daily-operations-document-bundle-v1",
      dataMode: "SYNTHETIC",
      extraction: {
        provider: "SAFEROUTE",
        mode: "DETERMINISTIC",
        validationStatus: "ACCEPTED",
        rawDocumentStored: false,
        rawOutputStored: false,
      },
    });
    expect(documentBundle.documents).toHaveLength(100);
    expect(documentBundle.extractedRecords).toHaveLength(25);
    await page
      .getByLabel("합성 운영 문서 또는 정규화 JSON 첨부")
      .setInputFiles(downloadedBundlePath!);
    await expect(
      page.getByText("추출 상태 SAFEROUTE DETERMINISTIC · strict 추출 통과"),
    ).toBeVisible();
    await expect(page.getByText("출처 사용자 업로드")).toBeVisible();

    await page.getByRole("button", { name: "운영일 확정·전체 계산" }).click();
    await expect(
      page.getByRole("tab", { name: "지원 상황" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("25명", { exact: true }).first()).toBeVisible();
    const supportCount = page.locator(
      ".operations-summary article.support strong",
    );
    await expect(supportCount).toHaveText(/\d+건/);
    expect(Number((await supportCount.textContent())?.replace(/\D/g, ""))).toBeGreaterThan(1);
    await expect(
      page.getByRole("heading", { name: "기사 위치·배송 진행" }),
    ).toBeVisible();
    await expect(
      page.getByText("합성 스냅샷 · Live 0명", { exact: true }),
    ).toBeVisible();
    const courierMarkers = page.locator(".operations-map-courier-marker");
    await expect(courierMarkers).toHaveCount(25);
    await expect(courierMarkers.first()).toHaveAttribute(
      "aria-label",
      /합성 위치 · 배송 \d+\/\d+건 완료/,
    );
    const supportMarkers = page.locator(
      ".operations-map-courier-marker:not([disabled])",
    );
    await expect(supportMarkers).toHaveCount(
      Number((await supportCount.textContent())?.replace(/\D/g, "")),
    );
    await supportMarkers.first().focus();
    await expect(supportMarkers.first()).toBeFocused();
    await supportMarkers.first().press("Enter");
    await expect(
      page.getByRole("tab", { name: "개입 검토" }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "지원 상황" }).click();

    const supportRows = page.locator(
      ".operations-courier-row:not([disabled])",
    );
    await expect(supportRows).toHaveCount(
      Number((await supportCount.textContent())?.replace(/\D/g, "")),
    );
    await supportRows.first().click();
    await expect(
      page.getByRole("tab", { name: "개입 검토" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".operations-candidate-list article").first()).toBeVisible();
    await expect(page.getByText("기사 응답 대기", { exact: true })).toBeVisible();
    await page.route("**/api/upstage-explanation", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "합성 E2E 공급자 제한",
          code: "RATE_LIMITED",
        }),
      });
    });
    const explanationButton = page.getByRole("button", {
      name: "AI 근거 설명 생성",
    });
    expect(
      await explanationButton.evaluate(
        (element) => window.getComputedStyle(element).whiteSpace,
      ),
    ).toBe("nowrap");
    await explanationButton.click();
    await expect(
      page.getByText("Fallback 템플릿 · RATE_LIMITED", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "경로" }).click();
    await expect(
      page.getByText("Schematic Fallback · 합성 좌표", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "개입 검토" }).click();
    await expect(page.locator(".operations-persistence")).toContainText(
      "개발 저장소에 저장됨",
      { timeout: 15_000 },
    );
    const riderLinks = page.getByRole("link", { name: "기사 화면 열기" });
    expect(
      await riderLinks.first().evaluate(
        (element) => window.getComputedStyle(element).whiteSpace,
      ),
    ).toBe("nowrap");
    let responseCount = 0;
    while ((await riderLinks.count()) > 0 && responseCount < 3) {
      const popupPromise = page.waitForEvent("popup");
      await riderLinks.first().click();
      const rider = await popupPromise;
      await rider.setViewportSize({ width: 390, height: 844 });
      await expect(
        rider.getByRole("heading", {
          name: "이 안전지원안을 확인해 주세요",
        }),
      ).toBeVisible();
      await rider
        .getByRole("button", { name: "이 조정안에 동의" })
        .click();
      await expect(
        rider.getByText(
          "동의가 안전하게 기록되었습니다. 관리자 승인 전에는 계획이 변경되지 않습니다.",
          { exact: true },
        ),
      ).toBeVisible();
      await rider.close();
      await page
        .getByRole("button", { name: "최신 응답 불러오기" })
        .first()
        .click();
      await expect(
        page.getByText(
          "기사 응답을 포함한 최신 운영 상태를 다시 불러왔습니다.",
          { exact: true },
        ),
      ).toBeVisible();
      responseCount += 1;
    }
    expect(responseCount).toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: "재검증 후 승인·적용" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "재검증 후 승인·적용" }).click();
    await expect(page.getByText("결정 완료", { exact: true })).toBeVisible();
    await expect(
      page.getByText("계획·안내 갱신 완료", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/발송 안 함 · 초안.*실제 메시지는 발송되지 않습니다/).first(),
    ).toBeVisible();
    await expect(page.locator(".operations-persistence")).toContainText(
      "개발 저장소에 저장됨",
      { timeout: 15_000 },
    );
    await page.getByRole("tab", { name: "감사·내보내기" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "적용 계획 CSV" }).click();
    expect((await downloadPromise).suggestedFilename()).toContain(
      "applied-plan.csv",
    );
    const noticeDownloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "고객안내 초안 CSV" })
      .click();
    expect((await noticeDownloadPromise).suggestedFilename()).toContain(
      "customer-notice-drafts.csv",
    );

    await page.getByRole("tab", { name: "지원 상황" }).click();
    await supportRows.nth(1).click();
    await expect(page.locator(".operations-decision-panel code")).toContainText(
      "decision-",
    );
    await expect(page.locator(".operations-candidate-list article").first()).toBeVisible();

    await expect(page.locator(".operations-persistence")).toContainText(
      "개발 저장소에 저장됨",
      { timeout: 15_000 },
    );
    await page.reload();
    await expect(page.locator(".operations-persistence")).toContainText(
      "개발 저장소에서 복구됨",
      { timeout: 15_000 },
    );
    await page.getByRole("tab", { name: "지원 상황" }).click();
    await expect(page.getByText("25명", { exact: true }).first()).toBeVisible();
    await page.locator(".operations-courier-row:not([disabled])").first().click();
    await expect(page.getByText("결정 완료", { exact: true })).toBeVisible();
  });

  test("keeps the primary operations controls usable at the manager stage size", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/operations");

    const calculate = page.getByRole("button", {
      name: "운영일 확정·전체 계산",
    });
    await expect(calculate).toBeVisible();
    await expect(calculate).toBeEnabled();
    await expect(page.locator("body")).not.toHaveCSS(
      "overflow-x",
      "scroll",
    );
  });

  test("completes the role-separated service loop in three clean browser sessions", async ({
    browser,
  }) => {
    const startedAt = Date.now();
    for (let run = 0; run < 3; run += 1) {
      const context = await browser.newContext();
      const admin = await context.newPage();
      await admin.goto("/operations");
      await admin
        .getByRole("button", { name: "운영일 확정·전체 계산" })
        .click();
      await admin
        .locator(".operations-courier-row:not([disabled])")
        .first()
        .click();
      await expect(admin.locator(".operations-persistence")).toContainText(
        "개발 저장소에 저장됨",
        { timeout: 15_000 },
      );

      let responseCount = 0;
      while (
        (await admin
          .getByRole("link", { name: "기사 화면 열기" })
          .count()) > 0 &&
        responseCount < 3
      ) {
        const href = await admin
          .getByRole("link", { name: "기사 화면 열기" })
          .first()
          .getAttribute("href");
        if (!href) throw new Error("Missing rider link");
        const rider = await context.newPage();
        await rider.goto(href);
        await rider
          .getByRole("button", { name: "이 조정안에 동의" })
          .click();
        await expect(
          rider.getByText(
            "동의가 안전하게 기록되었습니다. 관리자 승인 전에는 계획이 변경되지 않습니다.",
            { exact: true },
          ),
        ).toBeVisible();
        await rider.close();
        await admin
          .getByRole("button", { name: "최신 응답 불러오기" })
          .first()
          .click();
        await expect(
          admin.getByText(
            "기사 응답을 포함한 최신 운영 상태를 다시 불러왔습니다.",
            { exact: true },
          ),
        ).toBeVisible();
        responseCount += 1;
      }
      await admin
        .getByRole("button", { name: "재검증 후 승인·적용" })
        .click();
      await expect(
        admin.getByText("결정 완료", { exact: true }),
      ).toBeVisible();
      await context.close();
    }
    expect(Date.now() - startedAt).toBeLessThan(180_000);
  });
});
