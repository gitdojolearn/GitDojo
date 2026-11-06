import { expect, test } from "@playwright/test";
import { show, waitForTerminal } from "./helpers";

test("the command palette finds a command and opens its reference page", async ({ page }) => {
  await page.goto("/learn");
  await page.getByTestId("palette-button").click();
  await page.getByRole("combobox", { name: "Search" }).fill("cherry");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/commands\/cherry-pick$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("git cherry-pick");
});

test("a command page shows what it changes, real examples and where it is taught", async ({
  page,
}) => {
  await page.goto("/commands/reset");
  const areas = page.getByTestId("areas-diagram");
  await expect(areas.locator('[data-area="repository"]')).toHaveAttribute("data-effect", "always");
  await expect(areas.locator('[data-area="remote"]')).toHaveAttribute("data-effect", "none");
  await expect(page.getByTestId("modes-table")).toContainText("git reset --hard <commit>");
  await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Undo Commits with git reset/ }).first(),
  ).toBeVisible();
});

test("Try in Playground puts the command on the prompt without running it", async ({
  page,
  isMobile,
}) => {
  await page.goto("/commands/status");
  await page.getByTestId("try-in-playground").click();
  await expect(page).toHaveURL(/\/playground$/);
  await waitForTerminal(page, isMobile);
  await expect(page.getByTestId("terminal")).toContainText("$ git status");
  // Typed, not run: Git's output is not there yet.
  await expect(page.getByTestId("terminal")).not.toContainText("On branch");
  await page.getByTestId("terminal").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("terminal")).toContainText("On branch");
});

test("animation speed is saved, applied before the first paint, and followed after reload", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Slow" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "slow");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "slow");
  await expect(page.getByRole("radio", { name: "Slow" })).toBeChecked();

  await page.getByRole("radio", { name: "Off" }).check({ force: true });
  const duration = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "animate-gd-glide";
    document.body.append(probe);
    return getComputedStyle(probe).animationDuration;
  });
  expect(Number.parseFloat(duration)).toBeLessThan(0.001);
});

test("the System theme follows the operating system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/settings");
  await page.getByRole("radio", { name: "System" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("terminal settings apply to the workspace terminal", async ({ page, isMobile }) => {
  await page.goto("/settings");
  await page.getByTestId("setting-terminal-font-size").fill("17");
  await page.goto("/learn/demo");
  await waitForTerminal(page, isMobile);
  const size = await page
    .locator(".xterm-rows")
    .evaluate((rows) => getComputedStyle(rows).fontSize);
  expect(size).toBe("17px");
});

test("an unknown page is a 404 with somewhere to go", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
  await page
    .getByRole("link", { name: /Git commands/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/commands$/);
});

test("docs are rendered from the repository, and links between them stay on the site", async ({
  page,
}) => {
  await page.goto("/docs/architecture");
  await expect(page.getByTestId("doc-content").getByRole("heading", { level: 1 })).toHaveText(
    "Architecture",
  );
  await page
    .getByTestId("doc-content")
    .getByRole("link", { name: "assessment.md" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/docs\/assessment$/);
});

test("workspace columns resize from the keyboard and keep their width", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Phones show one panel at a time; there is nothing to resize.");
  await page.goto("/learn/demo");
  await waitForTerminal(page, isMobile);
  const handle = page.getByRole("separator", { name: "Resize the lesson and terminal panels" });
  const lesson = page
    .getByRole("region", { name: "Lesson" })
    .or(page.locator('[aria-label="Lesson"]'))
    .first();
  const before = (await lesson.boundingBox())?.width ?? 0;
  await handle.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect
    .poll(async () => (await lesson.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before + 40);
  await page.reload();
  await waitForTerminal(page, isMobile);
  await expect
    .poll(async () => (await lesson.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before + 40);
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await lesson.boundingBox())?.width ?? 0).toBeLessThan(before + 5);
});

test("resetting a lesson confirms it on screen", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await waitForTerminal(page, isMobile);
  await show(page, "Terminal", isMobile);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("toast")).toContainText("Lesson reset");
});
