import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["/", "/design"];

for (const path of pages) {
  test.describe(path, () => {
    test("has no accessibility violations (WCAG 2.2 AA)", async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });

    test("sends the security headers", async ({ request }) => {
      const res = await request.get(path);
      const h = res.headers();
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-powered-by"]).toBeUndefined();
    });

    test("does not scroll sideways on a phone", async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test("skip link moves focus to the main content", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard flow");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("the wordmark reads as one word", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Spruce" })).toBeVisible();
});

test("makes no requests to third parties", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") external.push(url.hostname);
  });
  await page.goto("/design");
  await page.waitForLoadState("networkidle");
  expect(external).toEqual([]);
});
