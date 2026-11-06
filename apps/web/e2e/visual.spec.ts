import { expect, test, type Page } from "@playwright/test";
import { waitForTerminal } from "./helpers";

/**
 * Screenshot comparisons of the screens that matter most, in both themes, at desktop and phone
 * width. Baselines are rendered in CI's Linux container (fonts differ on other systems), so these
 * run on Linux only; see docs/testing.md#screenshot-tests to update them.
 */
test.skip(process.platform !== "linux", "Screenshot baselines are rendered on Linux.");
test.use({ reducedMotion: "reduce" });

const THEMES = ["dark", "light"] as const;

const PAGES = [
  { name: "course-list", path: "/learn" },
  { name: "settings", path: "/settings" },
  { name: "command-reset", path: "/commands/reset" },
  { name: "docs", path: "/docs" },
  { name: "not-found", path: "/no-such-page" },
];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Let the header's account state and any count-up settle.
  await page.waitForTimeout(300);
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem("gitdojo:theme", value);
      }, theme);
    });

    for (const { name, path } of PAGES) {
      test(`${name} looks as expected`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
          animations: "disabled",
          maxDiffPixelRatio: 0.01,
        });
      });
    }

    test("lesson workspace looks as expected", async ({ page, isMobile }) => {
      await page.goto("/learn/demo");
      await waitForTerminal(page, isMobile);
      await settle(page);
      await expect(page).toHaveScreenshot(`workspace-${theme}.png`, {
        animations: "disabled",
        // The terminal's cursor blinks on its own timer.
        mask: [page.locator(".xterm-cursor-layer, .xterm-helper-textarea")],
        maxDiffPixelRatio: 0.01,
      });
    });
  });
}
