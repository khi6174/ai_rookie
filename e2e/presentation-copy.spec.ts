import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/rider-demo",
  "/closed-loop-demo",
  "/stage",
  "/operations",
  "/operations/rider",
  "/shadow-live-setup",
  "/integration-sandbox-status",
  "/scenario",
  "/design-preview",
] as const;

for (const route of publicRoutes) {
  test(`발표 화면 ${route}에 내부 합성 용어를 노출하지 않는다`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(".app-loading")).toHaveCount(0, { timeout: 15_000 });
    const publicCopy = await page.evaluate(() => {
      const attributes = Array.from(
        document.querySelectorAll<HTMLElement>("[aria-label], [title], [alt]"),
      ).flatMap((element) => [
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
        element.getAttribute("alt") ?? "",
      ]);
      return `${document.body.textContent ?? ""}\n${attributes.join("\n")}`;
    });
    expect(publicCopy.replaceAll("적합성", "")).not.toContain("합성");
  });
}
