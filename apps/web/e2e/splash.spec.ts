import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A first-time visitor: nothing stored (the config marks the intro as seen for every other test).
test.use({ storageState: { cookies: [], origins: [] } });

const intro = (page: Page) => page.locator("html");

test("a first visit opens with the intro, which gives way to the page by itself", async ({
  page,
}) => {
  await page.goto("/");
  await expect(intro(page)).toHaveAttribute("data-splash", "play");
  await expect(page.getByTestId("splash")).toBeVisible();
  await expect(intro(page)).not.toHaveAttribute("data-splash", /.*/, { timeout: 5000 });
  await expect(page.getByTestId("splash")).toBeHidden();
  await page.getByTestId("hero-start").click();
  await expect(page).toHaveURL(/\/learn\//);

  // Returning: straight to the page.
  await page.goto("/");
  await expect(intro(page)).not.toHaveAttribute("data-splash", /.*/);
  await expect(page.getByTestId("splash")).toBeHidden();
});

test("Skip is the first Tab stop, and skipping hands focus to the page", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("button", { name: /Skip intro/ });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("splash")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  // The next Tab carries on into the page.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("hero-start")).toBeFocused();
});

test("Escape skips the intro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("splash")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("splash")).toBeHidden();
  await expect(intro(page)).not.toHaveAttribute("data-splash", /.*/);
});

test("deep links open directly", async ({ page }) => {
  for (const path of ["/#courses", "/learn", "/playground"]) {
    await page.goto(path);
    await expect(intro(page)).not.toHaveAttribute("data-splash", /.*/);
    await expect(page.getByTestId("splash")).toBeHidden();
  }
});

test("the intro can be replayed", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("splash")).toBeHidden();
  await page.getByRole("button", { name: "Replay intro" }).click();
  await expect(page.getByTestId("splash")).toBeVisible();
  // Focus follows to Skip, so it never stays on a control the intro covers.
  await expect(page.getByRole("button", { name: /Skip intro/ })).toBeFocused();
  await expect(page.getByTestId("splash")).toBeHidden({ timeout: 5000 });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  for (const theme of ["dark", "light"] as const) {
    test(`shows the static intro, which passes axe (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem("gitdojo:theme", value);
        // Hold the static frame while it is checked: it only shows for 1.5 s, which a slow
        // test machine can miss.
        const hold = document.createElement("style");
        hold.id = "hold-intro";
        hold.textContent = ".gd-splash { animation-play-state: paused !important; }";
        document.documentElement.append(hold);
      }, theme);
      await page.goto("/");
      await expect(intro(page)).toHaveAttribute("data-splash", "static");
      await expect(page.getByTestId("splash")).toBeVisible();
      // No animated graph: the finished frame only.
      await expect(page.locator(".gd-splash-graph")).toBeHidden();
      const { violations } = await new AxeBuilder({ page })
        .include("[data-testid='splash']")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(violations.map((violation) => violation.id)).toEqual([]);
      await page.evaluate(() => document.getElementById("hold-intro")?.remove());
      await expect(page.getByTestId("splash")).toBeHidden({ timeout: 5000 });
    });
  }
});
