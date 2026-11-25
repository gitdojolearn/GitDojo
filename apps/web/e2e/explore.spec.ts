import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

let root: string;

/** A real repository on disk, made with the git CLI: a branch, a merge, an amend, a lost commit. */
function createRepository(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "gitdojo-explore-")), "shop");
  mkdirSync(dir);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Ada",
        GIT_AUTHOR_EMAIL: "ada@example.com",
        GIT_COMMITTER_NAME: "Ada",
        GIT_COMMITTER_EMAIL: "ada@example.com",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });
  const commit = (path: string, content: string, message: string) => {
    writeFileSync(join(dir, path), content);
    git("add", ".");
    git("commit", "-q", "-m", message);
  };
  git("init", "-q", "-b", "main");
  commit("README.md", "# Shop\n", "Add README");
  git("switch", "-q", "-c", "feature/login");
  commit("login.js", "export function login() {}\n", "Add login form");
  git("switch", "-q", "main");
  git("merge", "-q", "--no-ff", "feature/login", "-m", "Merge branch 'feature/login'");
  commit("cart.js", "export const totl = 0;\n", "Add totl");
  git("commit", "-q", "--amend", "-m", "Add cart total");
  commit("debug.log", "debug\n", "Add debug log");
  git("reset", "-q", "--hard", "HEAD~1");
  return dir;
}

test.beforeAll(() => {
  root = createRepository();
});

test.afterAll(() => {
  rmSync(join(root, ".."), { recursive: true, force: true });
});

test("opens a repository from disk and explains what happened in it", async ({ page }) => {
  // Every browser can pick a folder through the directory input; Playwright cannot drive Chrome's
  // native folder picker, so take that path here.
  await page.addInitScript(() => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: /what really happened/ })).toBeVisible();
  await page.getByTestId("explore-folder-input").setInputFiles(root);

  await expect(page.getByTestId("explore-name")).toHaveText("shop");
  await expect(page.getByTestId("commit-graph")).toBeVisible();

  const timeline = page.getByTestId("explore-timeline");
  await expect(timeline).toContainText("Reset the branch to HEAD~1");
  await expect(timeline).toContainText("is now on no branch: only the reflog remembers it");
  await expect(timeline).toContainText("Amended the last commit, now “Add cart total”");
  await expect(timeline).toContainText("Merged feature/login");
  await expect(timeline).toContainText("$ git switch feature/login");

  // A step selects its commit and explains it, with its exact changes.
  await timeline.getByRole("button", { name: /Merged feature\/login/ }).click();
  const commit = page.getByTestId("explore-commit");
  await expect(commit).toContainText(
    "This merge joined feature/login into the branch it was made on.",
  );
  await expect(commit).toContainText("login.js");
  await expect(commit).toContainText("+export function login() {}");
});

test("suggests how to undo a reset and copies the command", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await page.goto("/explore");
  await page.getByTestId("explore-folder-input").setInputFiles(root);

  const lost = execFileSync("git", ["rev-parse", "--short=7", "HEAD@{1}"], { cwd: root })
    .toString()
    .trim();
  const timeline = page.getByTestId("explore-timeline");
  // The newest step is the reset; its panel comes first and starts collapsed.
  const panel = timeline.getByTestId("undo-panel").first();
  await expect(panel.getByTestId("undo-option").first()).toBeHidden();
  await panel.getByText("How to undo this").click();

  const options = panel.getByTestId("undo-option");
  await expect(options.first()).toContainText("Recommended");
  await expect(options.first()).toContainText(`git branch rescue/${lost} ${lost}`);
  await expect(options.nth(1)).toContainText(`git reset --keep ${lost}`);
  await expect(panel).not.toContainText("--hard");

  await options.first().getByRole("button", { name: "Copy command" }).click();
  await expect(panel.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `git branch rescue/${lost} ${lost}`,
  );
});

for (const theme of ["dark", "light"] as const) {
  test(`the open undo panel has no detectable accessibility violations (${theme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((value) => {
      delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      localStorage.setItem("gitdojo:theme", value);
    }, theme);
    await page.goto("/explore");
    await page.getByTestId("explore-folder-input").setInputFiles(root);
    const panels = page.getByTestId("explore-timeline").getByTestId("undo-panel");
    await expect(panels.first()).toBeVisible();
    for (const summary of await panels.getByText("How to undo this").all()) await summary.click();

    const { violations } = await new AxeBuilder({ page })
      .include('[data-testid="explore-timeline"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
  });
}

test("says so when the folder is not a repository", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await page.goto("/explore");
  const plain = mkdtempSync(join(tmpdir(), "gitdojo-plain-"));
  writeFileSync(join(plain, "notes.txt"), "not a repository\n");
  try {
    await page.getByTestId("explore-folder-input").setInputFiles(plain);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("not a Git repository");
  } finally {
    rmSync(plain, { recursive: true, force: true });
  }
});
