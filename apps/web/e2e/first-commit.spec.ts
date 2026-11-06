import { expect, test } from "@playwright/test";
import { run, show } from "./helpers";

test("completes the first-commit lesson end to end", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await expect(page.getByRole("heading", { name: "Your First Commit" })).toBeAttached();

  const terminal = page.getByTestId("terminal");
  await show(page, "Terminal", isMobile);
  await expect(terminal).toContainText("learner@gitdojo");

  // Before `git init` there is no repository.
  await run(page, "git status");
  await expect(terminal).toContainText("fatal: not a git repository");

  await run(page, "git init");
  await expect(terminal).toContainText("Initialized empty Git repository");
  await expect(page.getByTestId("objective-initialize")).toHaveAttribute("data-state", "completed");

  await run(page, "git status");
  await expect(terminal).toContainText("Untracked files:");

  await show(page, "Files", isMobile);
  await expect(
    page.getByTestId("working-tree-panel").getByTestId("file-row").filter({ hasText: "README.md" }),
  ).toHaveAttribute("data-status", "untracked");

  await show(page, "Terminal", isMobile);
  await run(page, "git add README.md");
  await expect(page.getByTestId("objective-stage-readme")).toHaveAttribute(
    "data-state",
    "completed",
  );

  await show(page, "Files", isMobile);
  await expect(page.getByTestId("staging-area-panel")).toContainText("README.md");
  await expect(page.getByTestId("working-tree-panel")).toContainText("No unstaged changes");

  await show(page, "Terminal", isMobile);
  await run(page, 'git commit -m "Initial commit"');
  await expect(terminal).toContainText("(root-commit)");
  await expect(page.getByTestId("objective-first-commit")).toHaveAttribute(
    "data-state",
    "completed",
  );

  // Lesson completion dialog.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lesson Complete");
  await expect(dialog).toContainText("+50 XP");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  // Commit graph shows the commit on main, and clicking it opens the details.
  await show(page, "Graph", isMobile);
  const graph = page.getByTestId("commit-graph");
  await expect(graph.getByTestId("commit-node")).toHaveCount(1);
  await expect(graph).toContainText("Initial commit");
  await expect(graph).toContainText("main");
  await expect(graph).toContainText("HEAD");
  await graph.getByTestId("commit-node").click();
  await expect(page.getByTestId("commit-details")).toContainText("GitDojo Learner");

  await show(page, "Files", isMobile);
  await expect(page.getByTestId("staging-area-panel")).toContainText("No staged changes");
  await expect(page.getByTestId("repository-panel")).toContainText("Initial commit");

  await show(page, "Lesson", isMobile);
  await expect(page.getByTestId("lesson-complete")).toBeVisible();
});

test("validates state, not command text: `git add .` stages README.md", async ({
  page,
  isMobile,
}) => {
  await page.goto("/learn/demo");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");
  await run(page, "git init");
  await run(page, "git add .");
  await expect(page.getByTestId("objective-stage-readme")).toHaveAttribute(
    "data-state",
    "completed",
  );
});

test("reset restores the original lesson state", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");
  await run(page, "git init");
  await expect(page.getByTestId("objective-initialize")).toHaveAttribute("data-state", "completed");

  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset lesson" }).click();
  await expect(page.getByTestId("objective-initialize")).toHaveAttribute("data-state", "current");

  await run(page, "git status");
  await expect(page.getByTestId("terminal")).toContainText("fatal: not a git repository");
});

test("landing page starts a new learner at the first lesson", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Learn Git by doing.");
  await page.getByTestId("hero-start").click();
  await expect(page).toHaveURL(/\/learn\/git-basics\/what-is-git$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What is Git?");
});

test.describe("landing page hero demo", () => {
  test.use({ reducedMotion: "reduce" });

  test("steps through by keyboard and leads to the playground", async ({ page }) => {
    await page.goto("/");
    const demo = page.getByRole("figure", { name: "Demo: Your first commit" });
    const repository = demo.getByRole("group", { name: "Repository" });
    // Reduced motion: it waits for the visitor instead of playing.
    await expect(repository).toContainText("No .git yet");
    await demo.getByRole("button", { name: "Step 4: git commit" }).focus();
    await page.keyboard.press("Enter");
    await expect(repository).toContainText("HEAD");
    await expect(demo.getByRole("region", { name: "Terminal" })).toContainText("Initial commit");
    await page.getByTestId("hero-playground").click();
    await expect(page).toHaveURL(/\/playground$/);
  });
});

test("every landing page link leads somewhere real", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page
    .locator("main a[href^='/'], footer a[href^='/'], header a[href^='/']")
    .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href") ?? ""))]);
  expect(hrefs.length).toBeGreaterThan(10);
  for (const href of hrefs) {
    const response = await request.get(href);
    expect(response.status(), href).toBeLessThan(400);
  }
});

test("a returning learner is offered to continue where they left off", async ({ page }) => {
  await page.goto("/learn/branching/understanding-head");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForSelector('html[data-progress="saved"]');
  await page.goto("/");
  const start = page.getByTestId("hero-start");
  await expect(start).toHaveText(/Continue learning/);
  await expect(start).toHaveAttribute("href", "/learn/branching/understanding-head");
});
