import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { type GitEngine } from "@gitdojo/git-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CommandExecutionContext } from "./types";
import { executeCommand, runCommandLine } from "./router";

const WORKSPACE = "router-test";
let dbCounter = 0;

let files: WorkspaceFileSystem;

async function createContext(): Promise<CommandExecutionContext> {
  dbCounter += 1;
  const fs = createLightningFs(`router-test-${String(dbCounter)}`, { wipe: true });
  files = new WorkspaceFileSystem(fs);
  await files.createWorkspace(WORKSPACE);
  await files.writeFile(WORKSPACE, "README.md", "# GitDojo\n");
  return { workspaceId: WORKSPACE, git: createGitEngine({ fs, workspaceId: WORKSPACE }) };
}

describe("command router", () => {
  let context: CommandExecutionContext;

  beforeEach(async () => {
    context = await createContext();
  });

  it("runs the first-commit flow end to end", async () => {
    expect(await runCommandLine("git status", context)).toMatchObject({
      ok: false,
      errorCode: "NOT_A_REPOSITORY",
    });
    expect((await runCommandLine("git init", context)).ok).toBe(true);
    expect((await runCommandLine("git status", context)).output).toContain("\tREADME.md");
    expect(await runCommandLine("git add README.md", context)).toMatchObject({
      ok: true,
      output: "",
    });
    const commit = await runCommandLine('git commit -m "Initial commit"', context);
    expect(commit.ok).toBe(true);
    expect(commit.output).toMatch(/^\[main \(root-commit\) [0-9a-f]{7}\] Initial commit/);
    expect((await runCommandLine("git log --oneline", context)).output).toMatch(
      /^[0-9a-f]{7} \(HEAD -> main\) Initial commit$/,
    );
  });

  it("amends the current commit from the terminal with -m or --no-edit", async () => {
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);
    await files.writeFile(WORKSPACE, "README.md", "# Updated\n");
    await runCommandLine("git add README.md", context);

    const amended = await runCommandLine('git commit --amend -m "Update README"', context);
    expect(amended).toMatchObject({ ok: true, gitCommand: "commit" });
    expect((await runCommandLine("git log --oneline", context)).output).toMatch(
      /^[0-9a-f]{7} \(HEAD -> main\) Update README$/,
    );
    expect(await runCommandLine("git commit --amend --no-edit", context)).toMatchObject({
      ok: true,
      gitCommand: "commit",
    });
  });

  it("opens the editor for git commit --amend without a message", async () => {
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);
    expect(await runCommandLine("git commit --amend", context)).toMatchObject({
      ok: true,
      output: "hint: Waiting for your editor to close the file...",
    });
    expect((await context.git.snapshot()).editor?.content).toMatch(/^Initial commit\n/);
    expect((await context.git.closeEditor("Add README\n")).ok).toBe(true);
    expect((await runCommandLine("git log --oneline", context)).output).toMatch(/ Add README$/);
  });

  it("reads, sets, lists and unsets settings with git config", async () => {
    expect(await runCommandLine("git config user.name", context)).toMatchObject({
      ok: false,
      output: "",
      errorCode: "CONFIG_NOT_SET",
      gitCommand: "config",
    });
    expect(
      await runCommandLine('git config --global user.name "Ada Lovelace"', context),
    ).toMatchObject({ ok: true, output: "" });
    expect((await runCommandLine("git config user.name", context)).output).toBe("Ada Lovelace");
    expect((await runCommandLine("git config --get user.name", context)).output).toBe(
      "Ada Lovelace",
    );
    expect((await runCommandLine("git config -l", context)).output).toBe("user.name=Ada Lovelace");
    expect(await runCommandLine("git config user.email ada@example.com", context)).toMatchObject({
      ok: false,
      output: "fatal: not in a git directory",
    });

    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);
    expect(await runCommandLine('git commit --reset-author -m "Again"', context)).toMatchObject({
      ok: false,
      output: "fatal: --reset-author can be used only with --amend.",
    });
    expect((await runCommandLine("git config --global --unset user.name", context)).ok).toBe(true);
    expect((await runCommandLine("git config user.name", context)).ok).toBe(false);
  });

  it("refuses contradictory git config options", async () => {
    expect((await runCommandLine("git config --global --local user.name", context)).output).toBe(
      "error: only one config file at a time",
    );
    expect((await runCommandLine("git config --list user.name", context)).output).toContain(
      "error: wrong number of arguments",
    );
    expect((await runCommandLine("git config --get user.name Ada", context)).output).toContain(
      "error: wrong number of arguments",
    );
    expect((await runCommandLine("git config --get --unset user.name", context)).output).toContain(
      "error: only one action at a time",
    );
  });

  it("moves a tracked file and stages both sides through git mv", async () => {
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);

    expect(await runCommandLine("git mv README.md docs/README.md", context)).toMatchObject({
      ok: true,
      gitCommand: "mv",
    });
    const status = (await runCommandLine("git status", context)).output;
    expect(status).toContain("new file:   docs/README.md");
    expect(status).toContain("deleted:    README.md");
  });

  it("routes git show to a commit patch", async () => {
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);
    await files.writeFile(WORKSPACE, "README.md", "# Updated\n");
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Update README"', context);

    const shown = await runCommandLine("git show HEAD", context);
    expect(shown).toMatchObject({ ok: true, gitCommand: "show" });
    expect(shown.output).toContain("diff --git a/README.md b/README.md");
  });

  it("runs the branching flow end to end", async () => {
    await runCommandLine("git init", context);
    expect((await runCommandLine("git branch feature/login", context)).output).toBe(
      "fatal: not a valid object name: 'main'",
    );
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);

    expect(await runCommandLine("git branch feature/login", context)).toMatchObject({
      ok: true,
      output: "",
    });
    expect((await runCommandLine("git branch", context)).output).toBe("  feature/login\n* main");
    expect(await runCommandLine("git switch feature/login", context)).toMatchObject({
      ok: true,
      output: "Switched to branch 'feature/login'",
    });
    expect((await runCommandLine("git switch -c bugfix", context)).output).toBe(
      "Switched to a new branch 'bugfix'",
    );
    expect((await runCommandLine("git status", context)).output).toMatch(/^On branch bugfix/);
    expect(await runCommandLine("git switch nope", context)).toMatchObject({
      ok: false,
      output: "fatal: invalid reference: nope",
      errorCode: "BRANCH_NOT_FOUND",
    });
    // An existing name is refused before the start point is even looked at.
    expect((await runCommandLine("git switch -c feature main", context)).errorCode).toBe(
      "BRANCH_EXISTS",
    );
  });

  it("supports git checkout for switching branches", async () => {
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);

    expect((await runCommandLine("git checkout -b feature", context)).output).toBe(
      "Switched to a new branch 'feature'",
    );
    expect((await runCommandLine("git checkout main", context)).output).toBe(
      "Switched to branch 'main'",
    );
    expect(await runCommandLine("git checkout nope", context)).toMatchObject({
      ok: false,
      output: "error: pathspec 'nope' did not match any file(s) known to git",
      errorCode: "BRANCH_NOT_FOUND",
    });
    expect((await runCommandLine("git checkout", context)).errorCode).toBe("INVALID_ARGUMENT");
  });

  it("returns friendly output for unknown git commands", async () => {
    expect(await runCommandLine("git xyz", context)).toMatchObject({
      ok: false,
      output: "git: 'xyz' is not a git command.",
      errorCode: "UNSUPPORTED_GIT_COMMAND",
    });
  });

  it("returns friendly output for unknown commands built by hand", async () => {
    const result = await executeCommand(
      { program: "git", command: "foo", args: [], flags: {}, raw: "git foo" },
      context,
    );
    expect(result.output).toBe("git: 'foo' is not a git command.");
  });

  it("reports nothing to commit", async () => {
    await runCommandLine("git init", context);
    const result = await runCommandLine('git commit -m "Nothing"', context);
    expect(result).toMatchObject({ ok: false, errorCode: "NOTHING_TO_COMMIT" });
  });

  it("opens the editor for git commit without -m, and refuses a blank -m", async () => {
    await runCommandLine("git init", context);
    expect(await runCommandLine("git commit", context)).toMatchObject({
      ok: false,
      errorCode: "NOTHING_TO_COMMIT",
    });
    await runCommandLine("git add README.md", context);
    expect(await runCommandLine('git commit -m "  "', context)).toMatchObject({
      ok: false,
      output: "error: commit message is required",
      errorCode: "INVALID_ARGUMENT",
    });
    expect(await runCommandLine("git commit", context)).toMatchObject({
      ok: true,
      output: "hint: Waiting for your editor to close the file...",
      gitCommand: "commit",
    });
    const editor = (await context.git.snapshot()).editor;
    expect(editor).toMatchObject({ file: "COMMIT_EDITMSG", operation: "commit" });
    expect(editor?.content).toContain("# Changes to be committed:\n#\tnew file:   README.md");
    expect((await context.git.closeEditor("First commit\n# ignored\n")).output).toMatch(
      /^\[main \(root-commit\) [0-9a-f]{7}\] First commit/,
    );
  });

  it("merges, reports conflicts and concludes with a plain git commit", async () => {
    const write = (content: string) => files.writeFile(WORKSPACE, "README.md", content);
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);
    expect((await runCommandLine("git merge", context)).errorCode).toBe("INVALID_ARGUMENT");
    expect(await runCommandLine("git merge nope", context)).toMatchObject({
      ok: false,
      output: "merge: nope - not something we can merge",
      errorCode: "BRANCH_NOT_FOUND",
    });

    await runCommandLine("git switch -c feature", context);
    await write("# From feature\n");
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Feature"', context);
    await runCommandLine("git switch main", context);
    await write("# From main\n");
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Main"', context);

    const merge = await runCommandLine("git merge feature", context);
    expect(merge).toMatchObject({ ok: false, errorCode: "MERGE_CONFLICT" });
    expect(merge.output).toContain("CONFLICT (content): Merge conflict in README.md");
    expect((await runCommandLine("git merge --abort", context)).ok).toBe(true);

    await runCommandLine("git merge feature", context);
    await write("# From both\n");
    await runCommandLine("git add README.md", context);
    expect((await runCommandLine("git commit", context)).output).toMatch(
      /^\[main [0-9a-f]{7}\] Merge branch 'feature'$/,
    );
  });

  it("reports which supported Git command each line ran, for usage counting", async () => {
    const command = async (line: string) => (await runCommandLine(line, context)).gitCommand;
    expect(await command("git init")).toBe("init");
    expect(await command("git status")).toBe("status");
    // Failed commands and bad arguments still name the command the learner tried.
    expect(await command("git commit")).toBe("commit");
    expect(await command('git branch feature <id of "x">')).toBe("branch");
    expect(await command('git commit -m "unclosed')).toBe("commit");
    // Help, clear, other programs and commands GitDojo does not run are not Git usage.
    expect(await command("help")).toBeUndefined();
    expect(await command("clear")).toBeUndefined();
    expect(await command("ls")).toBeUndefined();
    expect(await command("git")).toBeUndefined();
    expect(await command("git push")).toBe("push");
    expect(await command("git clone x")).toBe("clone");
    expect(await command("git frobnicate x")).toBeUndefined();
    expect(await command("git --help")).toBeUndefined();
    expect(await command("   ")).toBeUndefined();
  });

  it("handles built-ins", async () => {
    expect(await runCommandLine("clear", context)).toMatchObject({
      ok: true,
      output: "",
      clearScreen: true,
    });
    const help = await runCommandLine("help", context);
    expect(help.output).toContain(
      'git commit [-a] [-m "<message>"] [--amend [--no-edit] [--reset-author]]',
    );
    expect(help.output).toContain("git config [--global]");
  });

  it("never rejects when the engine throws unexpectedly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exploding: GitEngine = {
      ...context.git,
      workspaceId: WORKSPACE,
      status: () => Promise.reject(new Error("internal detail with stack")),
    };
    const result = await runCommandLine("git status", { workspaceId: WORKSPACE, git: exploding });
    expect(result).toMatchObject({
      ok: false,
      output: "fatal: something went wrong while running that command.",
      errorCode: "INTERNAL",
    });
    expect(result.output).not.toContain("internal detail");
  });

  describe("forms beginners copy from tutorials", () => {
    async function firstCommit() {
      await runCommandLine("git init", context);
      await runCommandLine("git add README.md", context);
      await runCommandLine('git commit -m "Initial commit"', context);
    }

    it("runs GitHub's push-an-existing-repository steps up to the push", async () => {
      await firstCommit();
      expect(await runCommandLine("git branch -M main", context)).toMatchObject({
        ok: true,
        output: "",
        gitCommand: "branch",
      });
      expect((await runCommandLine("git branch -M trunk", context)).ok).toBe(true);
      expect((await runCommandLine("git branch", context)).output).toBe("* trunk");
      expect((await runCommandLine("git branch -m", context)).output).toBe(
        "fatal: branch name required",
      );
      expect((await runCommandLine("git branch -m -d x", context)).errorCode).toBe(
        "INVALID_ARGUMENT",
      );
      await runCommandLine("git branch feature", context);
      expect((await runCommandLine("git branch -m feature login", context)).ok).toBe(true);
      expect((await runCommandLine("git branch", context)).output).toBe("  login\n* trunk");
    });

    it("commits every tracked change with -am", async () => {
      await firstCommit();
      await files.writeFile(WORKSPACE, "README.md", "# Changed\n");
      const result = await runCommandLine('git commit -am "Update README"', context);
      expect(result.output).toMatch(/^\[main [0-9a-f]{7}\] Update README\n 1 file changed$/);
    });

    it("routes git log's graph, count, stat and patch", async () => {
      await firstCommit();
      await files.writeFile(WORKSPACE, "README.md", "# Changed\n");
      await runCommandLine('git commit -am "Second"', context);
      expect((await runCommandLine("git log --oneline -1", context)).output).toMatch(
        /^[0-9a-f]{7} \(HEAD -> main\) Second$/,
      );
      expect((await runCommandLine("git log --graph --oneline", context)).output).toMatch(
        /^\* [0-9a-f]{7} \(HEAD -> main\) Second\n\* [0-9a-f]{7} Initial commit$/,
      );
      expect((await runCommandLine("git log -n 1 --stat --oneline", context)).output).toContain(
        " README.md | 2 +-",
      );
      expect((await runCommandLine("git log -1 -p", context)).output).toContain("+# Changed");
      expect(await runCommandLine("git log -n many", context)).toMatchObject({
        ok: false,
        output: "fatal: 'many': not an integer",
      });
    });

    it("compares commits with git diff, before or after --", async () => {
      await firstCommit();
      await files.writeFile(WORKSPACE, "README.md", "# Changed\n");
      await runCommandLine('git commit -am "Second"', context);
      for (const line of ["git diff HEAD~1", "git diff HEAD~1 HEAD", "git diff HEAD~1..HEAD"]) {
        expect((await runCommandLine(line, context)).output).toContain("-# GitDojo\n+# Changed");
      }
      expect((await runCommandLine("git diff HEAD~1 -- README.md", context)).output).toContain(
        "+# Changed",
      );
      expect((await runCommandLine("git diff nope", context)).errorCode).toBe("INVALID_REVISION");
      // After `--`, a word is a path even when nothing matches it, as in Git.
      expect(await runCommandLine("git diff -- nope", context)).toMatchObject({
        ok: true,
        output: "",
      });
    });

    it("restores files with git checkout, from the index or a commit", async () => {
      await firstCommit();
      await files.writeFile(WORKSPACE, "README.md", "# Oops\n");
      expect(await runCommandLine("git checkout -- README.md", context)).toMatchObject({
        ok: true,
        output: "",
      });
      expect(await files.readFile(WORKSPACE, "README.md")).toBe("# GitDojo\n");
      await files.writeFile(WORKSPACE, "README.md", "# Oops\n");
      expect((await runCommandLine("git checkout README.md", context)).output).toBe(
        "Updated 1 path from the index",
      );
      await files.writeFile(WORKSPACE, "README.md", "# Changed\n");
      await runCommandLine('git commit -am "Second"', context);
      expect((await runCommandLine("git checkout HEAD~1 -- README.md", context)).ok).toBe(true);
      expect(await files.readFile(WORKSPACE, "README.md")).toBe("# GitDojo\n");
      expect((await runCommandLine("git checkout HEAD -- README.md", context)).ok).toBe(true);
      // A name that is no branch, commit or file is still reported as Git does.
      expect(await runCommandLine("git checkout nope", context)).toMatchObject({
        ok: false,
        output: "error: pathspec 'nope' did not match any file(s) known to git",
        errorCode: "BRANCH_NOT_FOUND",
      });
      expect((await runCommandLine("git checkout a b -- README.md", context)).errorCode).toBe(
        "INVALID_ARGUMENT",
      );
    });

    it("refuses a word before -- that names no commit", async () => {
      await firstCommit();
      // Before `--`, every word must be a commit.
      expect(await runCommandLine("git diff README.md -- other.txt", context)).toMatchObject({
        ok: false,
        output: "fatal: bad revision 'README.md'",
        errorCode: "INVALID_REVISION",
      });
    });

    it("shows a command's usage for -h, --help and git help, without running it", async () => {
      const help = await runCommandLine("git commit -h", context);
      expect(help.ok).toBe(true);
      expect(help.output).toMatch(/^usage: git commit \[-a\] \[-m "<message>"\]/);
      expect(help.output).toContain("\nOptions:\n    -m, --message <value>\n    -a, --all\n");
      expect(help).not.toHaveProperty("gitCommand");
      expect((await runCommandLine("git help branch", context)).output).toMatch(
        /^usage: git branch /,
      );
      expect((await runCommandLine("git init --help", context)).output).toBe(
        "usage: git init\n\nCreate an empty Git repository",
      );
      // Nothing ran: there is still no repository.
      expect((await runCommandLine("git status", context)).errorCode).toBe("NOT_A_REPOSITORY");
    });
  });

  describe("recovery commands", () => {
    async function run(line: string) {
      return runCommandLine(line, context);
    }

    beforeEach(async () => {
      await run("git init");
      await run("git add README.md");
      await run('git commit -m "Initial commit"');
      await files.writeFile(WORKSPACE, "README.md", "# GitDojo\n\nLearn Git.\n");
    });

    it("diffs, restores, stages and unstages", async () => {
      expect((await run("git diff")).output).toContain("+Learn Git.");
      expect((await run("git diff --cached")).output).toBe("");
      await run("git add README.md");
      expect((await run("git diff --staged")).output).toContain("+Learn Git.");
      // `git reset <file>` unstages, like `git restore --staged <file>`.
      expect((await run("git reset README.md")).output).toBe(
        "Unstaged changes after reset:\nM\tREADME.md",
      );
      await run("git add README.md");
      expect(await run("git restore --staged README.md")).toMatchObject({ ok: true, output: "" });
      expect(await run("git restore README.md")).toMatchObject({ ok: true, output: "" });
      expect(await files.readFile(WORKSPACE, "README.md")).toBe("# GitDojo\n");
    });

    it("resets, then finds the lost commit in the reflog", async () => {
      await run("git add .");
      await run('git commit -m "Second"');
      expect((await run("git reset --hard HEAD~1")).output).toMatch(
        /^HEAD is now at [0-9a-f]{7} Initial commit$/,
      );
      expect((await run("git reflog")).output.split("\n")[1]).toMatch(
        /HEAD@\{1\}: commit: Second$/,
      );
      expect((await run("git reflog show main")).output).toMatch(
        /main@\{0\}: reset: moving to HEAD~1/,
      );
      expect((await run("git reset --hard HEAD@{1}")).output).toMatch(/Second$/);
      expect((await run("git reset --soft --hard")).errorCode).toBe("INVALID_ARGUMENT");
    });

    it("stashes with subcommands", async () => {
      expect((await run('git stash push -m "docs"')).output).toBe(
        "Saved working directory and index state On main: docs",
      );
      expect((await run("git stash list")).output).toBe("stash@{0}: On main: docs");
      expect((await run("git stash show")).output).toContain("README.md | 2 ++");
      expect((await run("git stash pop stash@{0}")).output).toMatch(/Dropped refs\/stash@\{0\}/);
      expect((await run("git stash frobnicate")).output).toContain("unknown subcommand");
      expect((await run("git stash drop")).output).toBe("No stash entries found.");
    });

    it("reverts and cherry-picks, with sequencer flags", async () => {
      await run("git add .");
      await run('git commit -m "Second"');
      expect((await run("git revert --no-edit HEAD")).output).toMatch(/Revert "Second"/);
      expect((await run("git revert --continue")).errorCode).toBe("NO_OPERATION");
      expect((await run("git cherry-pick --abort --skip")).errorCode).toBe("INVALID_ARGUMENT");
      expect((await run("git cherry-pick HEAD~1")).output).toMatch(/\] Second\n Date: /);
    });

    it("rebases, and opens the editor for interactive rebases", async () => {
      // Local changes block a rebase, interactive or not.
      expect((await run("git rebase -i main")).errorCode).toBe("LOCAL_CHANGES");
      expect((await run("git rebase")).errorCode).toBe("INVALID_ARGUMENT");
      expect((await run("git rebase -i")).errorCode).toBe("INVALID_ARGUMENT");
      expect((await run("git rebase --abort")).output).toBe("fatal: No rebase in progress?");
      await run("git restore README.md");
      expect((await run("git rebase main")).output).toBe("Current branch main is up to date.");
    });

    it("starts an interactive rebase that waits for the editor", async () => {
      await run("git restore README.md");
      expect(await run("git rebase --interactive HEAD")).toMatchObject({
        ok: true,
        output: "hint: Waiting for your editor to close the file...",
        gitCommand: "rebase",
      });
      expect((await run("git status")).ok).toBe(true);
      expect((await run('git commit -m "x"')).errorCode).toBe("EDITOR_OPEN");
      expect((await run("git rebase --abort")).ok).toBe(true);
    });

    it("tags commits: lightweight, annotated, listed and deleted", async () => {
      expect(await run("git tag v1.0")).toMatchObject({ ok: true, output: "" });
      expect((await run('git tag -a v1.1 -m "Second release"')).ok).toBe(true);
      expect((await run("git tag")).output).toBe("v1.0\nv1.1");
      expect((await run("git tag -l v1.1")).output).toBe("v1.1");
      expect((await run("git tag -n")).output).toMatch(
        /^v1\.0\s+Initial commit\nv1\.1\s+Second release$/,
      );
      expect((await run("git log --oneline")).output).toMatch(
        /\(HEAD -> main, tag: v1\.0, tag: v1\.1\)/,
      );
      // Without -m, Git waits for the tag message in the editor.
      expect((await run("git tag -a v2")).output).toContain("Waiting for your editor");
      expect((await context.git.abortEditor()).output).toBe("fatal: no tag message?");
      expect((await run("git tag -d v1.0")).output).toMatch(/^Deleted tag 'v1\.0'/);
      expect((await run("git tag -d v1.0")).errorCode).toBe("TAG_NOT_FOUND");
      expect((await run("git tag -d a b")).errorCode).toBe("INVALID_ARGUMENT");
    });

    it("works with the simulated remote", async () => {
      await run("git restore README.md");
      await context.git.setupRemote("origin", { branches: ["main"] });
      expect((await run("git remote -v")).output).toContain(
        "gitdojo://simulated/origin.git (push)",
      );
      expect(await run("git remote add upstream https://example.com/x.git")).toMatchObject({
        ok: true,
        output: "",
      });
      expect((await run("git remote get-url upstream")).output).toBe("https://example.com/x.git");
      expect((await run("git remote rename upstream fork")).ok).toBe(true);
      expect((await run("git remote remove fork")).ok).toBe(true);
      expect((await run("git remote add only-a-name")).output).toBe(
        "usage: git remote add <name> <url>",
      );
      expect((await run("git remote frob")).output).toContain("error: unknown subcommand: `frob'");
      expect(await run("git fetch")).toMatchObject({ ok: true, output: "", gitCommand: "fetch" });
      expect((await run("git pull")).output).toBe("Already up to date.");
      expect((await run("git pull --rebase --ff-only")).errorCode).toBe("INVALID_ARGUMENT");
      await run("git switch -c feature");
      expect((await run("git push")).errorCode).toBe("NO_UPSTREAM");
      expect((await run("git push -u origin feature")).output).toContain(
        "branch 'feature' set up to track 'origin/feature'.",
      );
      expect((await run("git branch -r")).output).toBe("  origin/feature\n  origin/main");
      expect((await run("git branch -a")).output).toBe(
        "* feature\n  main\n  remotes/origin/feature\n  remotes/origin/main",
      );
      expect((await run("git branch -vv")).output).toMatch(
        /^\* feature [0-9a-f]{7} \[origin\/feature\] Initial commit/,
      );
      expect((await run("git branch -r new")).errorCode).toBe("INVALID_ARGUMENT");
      expect((await run("git push --force --force-with-lease")).output).toBe(
        "fatal: choose one of --force and --force-with-lease",
      );
      expect((await run("git push origin --delete")).output).toBe(
        "fatal: --delete doesn't make sense without any refs",
      );
      expect((await run("git push origin --delete nope")).output).toContain(
        "unable to delete 'nope': remote ref does not exist",
      );
      expect((await run("git push --tags")).output).toBe("Everything up-to-date");
    });

    it("removes files with git rm", async () => {
      expect((await run("git rm README.md")).errorCode).toBe("LOCAL_CHANGES");
      expect((await run("git rm -f README.md")).output).toBe("rm 'README.md'");
    });

    it("refuses a merge that cannot fast-forward with --ff-only", async () => {
      await run("git add .");
      await run('git commit -m "Second"');
      await run("git switch -c side HEAD~1");
      await files.writeFile(WORKSPACE, "side.txt", "s\n");
      await run("git add side.txt");
      await run('git commit -m "Side"');
      expect(await run("git merge --ff-only main")).toMatchObject({
        ok: false,
        output: "fatal: Not possible to fast-forward, aborting.",
        errorCode: "NOT_FAST_FORWARD",
      });
    });
  });
});
