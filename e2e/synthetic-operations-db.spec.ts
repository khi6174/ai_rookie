import { expect, test } from "@playwright/test";

test("검증된 합성 기사 25명을 DB API에서 운영 화면으로 전달한다", async ({
  page,
}) => {
  const response = await page.request.get(
    "/api/operations/days/current/package",
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    package: {
      dataMode: string;
      records: Array<{ courier: { courierId: string } }>;
    };
    storage: string;
    rawDocumentsStored: boolean;
  };

  expect(body.storage).toBe("MEMORY_DEV");
  expect(body.rawDocumentsStored).toBe(false);
  expect(body.package.dataMode).toBe("SYNTHETIC");
  expect(body.package.records).toHaveLength(25);
  expect(
    new Set(body.package.records.map((record) => record.courier.courierId))
      .size,
  ).toBe(25);

  await page.goto("/operations");
  await expect(
    page.getByText(
      "추출 상태 MEMORY_DEV · 검증된 합성 기사 25명",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "운영일 확정·전체 계산" })
    .click();
  await expect(
    page.getByRole("tab", { name: "지원 상황" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("25명", { exact: true }).first()).toBeVisible();
});
