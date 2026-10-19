import { type PlayStep } from "@gitdojo/lesson-engine/testing";

/** Reference browser solution for every standalone challenge. Test-only; never in the UI. */
export const CHALLENGE_REFERENCE_SOLUTIONS: Readonly<Record<string, readonly PlayStep[]>> = {
  "first-commit": [
    "git init",
    { write: ".gitignore", content: "debug.log\n" },
    "git add .",
    'git commit -m "Initial commit"',
  ],
  "merge-conflict": [
    "git switch main",
    "git merge release/2.0",
    {
      write: "src/config.js",
      content:
        'export const api = { host: "v2.api.example.com", timeout: 15000 };\nexport const retries = 2;\n',
    },
    "git add src/config.js",
    { delete: "docs/setup.md" },
    "git add docs/setup.md",
    "git commit",
  ],
  "detached-head": ["git switch -c fix/rounding", "git switch main"],
  "wrong-branch": ["git branch feature/login", "git reset --hard HEAD~2"],
  "uncommitted-changes": [
    "git stash",
    "git switch release",
    "git merge hotfix/rounding",
    "git switch main",
    "git stash pop",
  ],
  "recover-stashed-work": [
    "git stash -u",
    "git switch main",
    "git switch feature/invoice-notes",
    "git stash pop",
  ],
  "rebase-feature-branch": ["git rebase main"],
  "revert-shared-change": ["git revert HEAD"],
  "recover-deleted-file": [
    "git restore --source HEAD~2 docs/deploy.md",
    "git add docs/deploy.md",
    'git commit -m "Restore deployment runbook"',
  ],
  "resolve-rebase-conflict": [
    "git rebase main",
    {
      write: "src/settings.js",
      content: 'export const settings = { region: "eu-west", retries: 5 };\n',
    },
    "git add src/settings.js",
    "git rebase --continue",
  ],
  "split-mixed-commit": [
    "git reset HEAD~1",
    "git add src/analytics.js",
    'git commit -m "Add analytics service"',
    "git add docs/analytics.md",
    'git commit -m "Document analytics service"',
  ],
  "repair-reset-branches": ["git reflog", "git reset --hard HEAD@{1}"],
  "undo-last-commit": [
    "git reset HEAD~1",
    { write: ".gitignore", content: "secrets.env\n" },
    "git add config.js .gitignore",
    'git commit -m "Add API config"',
  ],
  "lost-commit": ["git reflog", "git branch feature/payments HEAD@{2}"],
  "cherry-pick-fix": ["git log --oneline main", "git cherry-pick main~1"],
  "clean-up-history": ["git reset --soft HEAD~4", 'git commit -m "Add search"'],
  "repository-recovery": [
    "git reflog",
    "git reset --hard HEAD@{1}",
    "git branch feature/reports HEAD@{5}",
    "git stash pop",
    "git add src/theme.css",
    'git commit -m "Add dark mode"',
  ],
};

/** Reference browser solution for every Practice task. Test-only; never in the UI. */
export const PRACTICE_REFERENCE_SOLUTIONS: Readonly<Record<string, readonly PlayStep[]>> = {
  "commit-one-change": ["git add README.md", 'git commit -m "Fix typo in README"'],
  "start-a-branch": [
    "git switch -c feature/dark-theme",
    "git add theme.css",
    'git commit -m "Add dark theme"',
  ],
  "tag-a-release": ['git tag -a v2.0 -m "Version 2.0"', "git tag -d v2.0-rc"],
  "merge-a-feature": ["git switch main", "git merge feature/search"],
  "resolve-a-conflict": [
    "git merge feature/retries",
    { write: "config.js", content: "export const config = { timeout: 30, retries: 3 };\n" },
    "git add config.js",
    "git commit",
  ],
  "rescue-a-reset": ["git reflog", "git branch rescue HEAD@{1}"],
  "shelve-and-switch": [
    "git stash",
    "git switch main",
    { write: "footer.html", content: '<a href="/about">About</a>\n' },
    "git add footer.html",
    'git commit -m "Fix footer link"',
    "git switch feature/profile",
    "git stash pop",
  ],
  "catch-up-with-origin": ["git pull"],
  "squash-before-review": ["git reset --soft HEAD~3", 'git commit -m "Add charts"'],
  "rebase-onto-main": ["git rebase main"],
  "rejected-push": ["git push", "git pull --rebase", "git push"],
};
