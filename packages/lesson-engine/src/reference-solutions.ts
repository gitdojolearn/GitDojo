import { type PlayStep } from "./test-utils";

function rewriteTodo(actions: Record<string, string | null>): PlayStep {
  return {
    editor: (todo) =>
      todo
        .split("\n")
        .flatMap((line) => {
          const match = /^pick (\S+) (.*)$/.exec(line);
          if (!match) return [line];
          const [, oid = "", subject = ""] = match;
          const action = Object.hasOwn(actions, subject) ? actions[subject] : "pick";
          return action === null ? [] : [`${action ?? "pick"} ${oid} ${subject}`];
        })
        .join("\n"),
  };
}

const saveMessage = (message: string): PlayStep => ({ editor: () => `${message}\n` });

const AUTH_RESOLVED = [
  'export const provider = "password";',
  "// Session settings",
  "export const timeout = 60;",
  "export const rememberMe = true;",
  "",
].join("\n");

/** Reference browser solution for every hands-on curriculum lesson. Test-only; never in the UI. */
export const LESSON_REFERENCE_SOLUTIONS: Readonly<Record<string, readonly PlayStep[]>> = {
  "git-init": ["git init"],
  "git-status": [
    "git status",
    "git add README.md",
    "git add todo.txt",
    'git commit -m "Update README and add todo list"',
  ],
  "git-add": ["git add README.md", "git add index.js", "git add ."],
  "git-commit": [
    "git add README.md",
    'git commit -m "Add README"',
    "git add index.js",
    'git commit -m "Add app entry point"',
  ],
  "git-log": ["git log", "git add CHANGELOG.md", 'git commit -m "Add changelog"'],
  "first-repository-challenge": ["git init", "git add .", 'git commit -m "Initial commit"'],
  "git-branch": ["git branch feature/login", "git branch bugfix/header", "git branch"],
  "git-switch": ["git switch feature/login", "git switch main", "git switch -c bugfix/header"],
  "commit-on-branch": [
    "git switch -c feature/login",
    "git add login.js",
    'git commit -m "Add login page"',
    "git switch main",
  ],
  "branching-challenge": [
    "git branch feature/search",
    "git switch feature/search",
    "git add search.js",
    'git commit -m "Add search"',
    "git switch main",
  ],
  "fast-forward-merge": ["git merge feature/login", "git log --oneline"],
  "three-way-merge": ["git switch main", "git merge feature/login"],
  "merge-feature-into-main": [
    "git switch -c feature/search",
    "git add search.js",
    'git commit -m "Add city search"',
    "git switch main",
    "git merge feature/search",
  ],
  "merge-challenge": ["git merge feature/profile", "git merge bugfix/typo"],
  "resolve-first-conflict": [
    "git merge feature/login",
    { write: "src/auth.ts", content: AUTH_RESOLVED },
    "git add src/auth.ts",
    "git commit",
  ],
  "multiple-file-conflict": [
    "git merge feature/checkout",
    {
      write: "src/auth.ts",
      content:
        'export const provider = "password";\n// Session settings\nexport const timeout = 15;\n',
    },
    "git add src/auth.ts",
    {
      write: "src/config.ts",
      content: 'export const config = {\n  region: "eu-west",\n  // Network\n  retries: 5,\n};\n',
    },
    "git add src/config.ts",
    "git status",
    "git commit",
  ],
  "conflict-challenge": [
    "git switch main",
    "git merge feature/tax",
    {
      write: "src/pricing.ts",
      content: [
        "export function total(subtotal: number): number {",
        "  const discount = subtotal * 0.1;",
        "  return (subtotal - discount) * 1.08;",
        "}",
        "",
      ].join("\n"),
    },
    {
      write: "src/cart.ts",
      content: 'export const currency = "USD";\n// Limits\nexport const maxItems = 50;\n',
    },
    "git add .",
    'git commit -m "Merge feature/tax"',
  ],
  "git-diff": [
    "git diff",
    "git add src/price.js",
    "git diff --staged",
    'git commit -m "Fix total for empty carts"',
  ],
  "git-restore": ["git restore --staged notes.md", "git restore index.html"],
  "git-reset": ["git reset HEAD~1", "git add src/login.js", 'git commit -m "Add login form"'],
  "git-revert": ["git log --oneline", "git revert HEAD~1"],
  "git-stash": ["git stash", "git switch main", "git switch feature/profile", "git stash pop"],
  "git-cherry-pick": ["git log --oneline feature/charts", "git cherry-pick feature/charts~1"],
  "git-reflog": ["git reflog", "git reset --hard HEAD@{1}"],
  "git-rebase": ["git rebase main"],
  "git-rebase-interactive": [
    "git log --oneline",
    "git rebase -i main",
    rewriteTodo({ "Fix typo in search box": "fixup", "Add debug logging": "drop", wip: "reword" }),
    saveMessage("Highlight search matches"),
  ],
  "git-tag": [
    "git tag v0.9 HEAD~1",
    'git tag -a v1.0 -m "Version 1.0"',
    "git tag -n",
    "git tag -d temp-release",
  ],
  "push-a-branch": [
    "git remote -v",
    "git push -u origin feature/alerts",
    "git branch -vv",
    "git add alerts.css",
    'git commit -m "Style weather alerts"',
    "git push",
  ],
  "sync-with-remote": ["git push", "git fetch", "git status", "git pull --rebase", "git push"],
  gitignore: [
    { write: ".gitignore", content: "node_modules/\n*.log\n.env\n" },
    "git add .gitignore",
    'git commit -m "Ignore logs, node_modules and .env"',
  ],
  "recovery-challenge": [
    "git reflog",
    "git reset --hard HEAD@{1}",
    "git stash pop",
    "git add src/app.js",
    'git commit -m "Add export button"',
  ],
};
