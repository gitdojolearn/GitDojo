import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
