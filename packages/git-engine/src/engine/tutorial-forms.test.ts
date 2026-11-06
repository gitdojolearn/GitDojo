import { describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";
import { layoutGraph } from "./log-graph";

/** Commands beginners copy from GitHub's instructions and older tutorials. */

const NOW = Math.floor(Date.now() / 1000);

async function write(ws: TestWorkspace, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await ws.files.writeFile(ws.workspaceId, path, content);
  }
}

async function commit(
  ws: TestWorkspace,
  message: string,
  files: Record<string, string>,
  timestamp?: number,
) {
  await write(ws, files);
  await ws.git.add(Object.keys(files));
  const result = await ws.git.commit({
    message,
    ...(timestamp === undefined ? {} : { timestamp }),
  });
  expect(result.ok, result.output).toBe(true);
  return result.data?.oid ?? "";
}

const read = (ws: TestWorkspace, path: string) => ws.files.readFile(ws.workspaceId, path);
const short = (output: string) => output.replace(/\b[0-9a-f]{7}\b/g, "abc1234");
/** Paths with any change, as `[path, staged, unstaged]`. */
const changed = async (ws: TestWorkspace) =>
  ((await ws.git.status()).data?.entries ?? [])
    .filter((entry) => entry.staged !== null || entry.unstaged !== null)
    .map((entry) => [entry.path, entry.staged, entry.unstaged]);

async function repo() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  const a = await commit(ws, "A", { "app.txt": "one\ntwo\n" }, NOW - 100);
  const b = await commit(
    ws,
    "B",
    { "app.txt": "one\ntwo\nthree\n", "notes.md": "# Notes\n" },
    NOW - 90,
  );
  return { ws, a, b };
}

describe("git branch -m / -M", () => {
  it("renames the current branch with its reflog, like GitHub's git branch -M main", async () => {
    const { ws, b } = await repo();
    expect(await ws.git.renameBranch("trunk", { force: true })).toMatchObject({
      ok: true,
      output: "",
      data: { from: "main", to: "trunk", oid: b },
    });
    expect((await ws.git.showBranches()).output).toBe("* trunk");
    expect((await ws.git.status()).output).toMatch(/^On branch trunk/);
    expect((await ws.git.reflog("trunk")).output).toMatch(
      /^[0-9a-f]{7} \(HEAD -> trunk\) trunk@\{0\}: Branch: renamed refs\/heads\/main to refs\/heads\/trunk\n[0-9a-f]{7} \(HEAD -> trunk\) trunk@\{1\}: commit: B\n/,
    );
    expect((await ws.git.reflog()).output).toContain(
      "Branch: renamed refs/heads/main to refs/heads/trunk",
    );
    // Already called that: nothing to do, as in Git.
    expect(await ws.git.renameBranch("trunk", { force: true })).toMatchObject({ ok: true });
  });

  it("renames a branch before its first commit", async () => {
    const ws = await createTestWorkspace({ "README.md": "# Hi\n" });
    await ws.git.init();
    expect(await ws.git.renameBranch("trunk")).toMatchObject({ ok: true, data: { oid: null } });
    await ws.git.add(["README.md"]);
    expect((await ws.git.commit({ message: "First" })).output).toMatch(/^\[trunk \(root-commit\)/);
  });

  it("renames another branch and moves its upstream", async () => {
    const { ws } = await repo();
    await ws.git.createBranch("feature");
    await ws.git.config({ action: "set", key: "branch.feature.remote", value: "origin" });
    await ws.git.config({
      action: "set",
      key: "branch.feature.merge",
      value: "refs/heads/feature",
    });
    expect(await ws.git.renameBranch("login", { from: "feature" })).toMatchObject({ ok: true });
    expect((await ws.git.showBranches()).output).toBe("  login\n* main");
    expect((await ws.git.config({ action: "get", key: "branch.login.remote" })).output).toBe(
      "origin",
    );
    expect((await ws.git.config({ action: "get", key: "branch.feature.remote" })).ok).toBe(false);
  });

  it("refuses what Git refuses, and -M replaces another branch", async () => {
    const { ws, a } = await repo();
    await ws.git.createBranch("feature", "HEAD~1");
    expect((await ws.git.renameBranch("x", { from: "nope" })).output).toBe(
      "fatal: no branch named 'nope'",
    );
    expect((await ws.git.renameBranch("feature")).output).toBe(
      "fatal: a branch named 'feature' already exists",
    );
    expect((await ws.git.renameBranch("bad name")).error?.code).toBe("INVALID_BRANCH_NAME");
    expect((await ws.git.renameBranch("main/x", { from: "feature" })).output).toBe(
      "error: 'refs/heads/main' exists; cannot create 'refs/heads/main/x'\nfatal: branch rename failed",
    );
    expect((await ws.git.renameBranch("main", { from: "feature", force: true })).error?.code).toBe(
      "BRANCH_CHECKED_OUT",
    );
    expect(await ws.git.renameBranch("feature", { force: true })).toMatchObject({ ok: true });
    expect((await ws.git.listBranches()).map((branch) => [branch.name, branch.current])).toEqual([
      ["feature", true],
    ]);
    expect((await ws.git.snapshot()).head).not.toBe(a);

    await ws.git.detachHead("HEAD");
    expect((await ws.git.renameBranch("x")).output).toBe(
      "fatal: cannot rename the current branch while not on any",
    );
  });
});

describe("git commit -a and the commit editor", () => {
  it("stages edits and deletions of tracked files, never new files", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "changed\n", "new.txt": "new\n" });
    await ws.files.removeFile(ws.workspaceId, "notes.md");
    const result = await ws.git.commit({ message: "Tidy", all: true });
    expect(result.output).toMatch(
      /^\[main [0-9a-f]{7}\] Tidy\n 2 files changed\n delete mode 100644 notes\.md$/,
    );
    expect(await changed(ws)).toEqual([["new.txt", null, "untracked"]]);
  });

  it("opens the editor with Git's status comments, and only stages -a once it is saved", async () => {
    const ws = await createTestWorkspace({ "a.txt": "a\n", "b.txt": "b\n" });
    await ws.git.init();
    await ws.git.add(["a.txt"]);
    expect(await ws.git.commit({ message: "" })).toMatchObject({
      ok: true,
      output: "hint: Waiting for your editor to close the file...",
    });
    expect((await ws.git.snapshot()).editor?.content).toBe(
      [
        "",
        "# Please enter the commit message for your changes. Lines starting",
        "# with '#' will be ignored, and an empty message aborts the commit.",
        "#",
        "# On branch main",
        "#",
        "# Initial commit",
        "#",
        "# Changes to be committed:",
        "#\tnew file:   a.txt",
        "#",
        "# Untracked files:",
        "#\tb.txt",
        "#",
        "",
      ].join("\n"),
    );
    expect((await ws.git.add(["b.txt"])).error?.code).toBe("EDITOR_OPEN");
    expect(await ws.git.abortEditor()).toMatchObject({
      ok: false,
      output: "Aborting commit due to empty commit message.",
    });
    expect((await ws.git.commit({ message: "First" })).ok).toBe(true);

    await write(ws, { "a.txt": "changed\n" });
    await ws.git.commit({ message: "", all: true });
    expect((await ws.git.snapshot()).editor?.content).toContain(
      "# Changes to be committed:\n#\tmodified:   a.txt\n#\n# Untracked files:\n#\tb.txt",
    );
    // Cancelling leaves the staging area as it was, as in Git.
    await ws.git.abortEditor();
    expect(
      (await ws.git.status()).data?.entries.find((entry) => entry.path === "a.txt"),
    ).toMatchObject({
      staged: null,
      unstaged: "modified",
    });
    await ws.git.commit({ message: "", all: true });
    expect((await ws.git.closeEditor("Change a\n")).output).toMatch(
      /^\[main [0-9a-f]{7}\] Change a/,
    );
    expect((await ws.git.log({ maxCount: 1 })).data?.commits[0]?.changedPaths).toEqual(["a.txt"]);
  });

  it("reports nothing to commit instead of opening the editor", async () => {
    const { ws } = await repo();
    expect((await ws.git.commit({ message: "" })).error?.code).toBe("NOTHING_TO_COMMIT");
    expect((await ws.git.commit({ message: "", all: true })).error?.code).toBe("NOTHING_TO_COMMIT");
    expect((await ws.git.snapshot()).editor).toBeNull();
  });
});

describe("git log --graph, -n, --stat and -p", () => {
  /** main: base → main work ─ merge ─ after merge; feature: feature work; topic off the merge. */
  async function branchy() {
    const ws = await createTestWorkspace();
    await ws.git.init();
    await commit(ws, "base", { "a.txt": "base\n" }, NOW - 100);
    await ws.git.createAndSwitchBranch("feature");
    await commit(ws, "feature work", { "f.txt": "f\n" }, NOW - 90);
    await ws.git.switchBranch("main");
    await commit(ws, "main work", { "a.txt": "base\nmore\n" }, NOW - 80);
    expect((await ws.git.merge("feature")).ok).toBe(true);
    await ws.git.createAndSwitchBranch("topic");
    await commit(ws, "topic work", { "t.txt": "t\n" }, NOW + 10);
    await ws.git.switchBranch("main");
    await commit(ws, "after merge", { "a.txt": "base\nmore\nagain\n" }, NOW + 20);
    return ws;
  }

  it("draws branches and merges next to one-line commits", async () => {
    const ws = await branchy();
    expect(short((await ws.git.log({ graph: true, oneline: true, all: true })).output)).toBe(
      [
        "* abc1234 (HEAD -> main) after merge",
        "| * abc1234 (topic) topic work",
        "|/",
        "*   abc1234 Merge branch 'feature'",
        "|\\",
        "* | abc1234 main work",
        "| * abc1234 (feature) feature work",
        "|/",
        "* abc1234 base",
      ].join("\n"),
    );
    expect((await ws.git.log({ graph: true, oneline: true })).output).not.toContain("topic");
  });

  it("puts the graph in front of every line of the long format", async () => {
    const ws = await branchy();
    const lines = (await ws.git.log({ graph: true, all: true })).output.split("\n");
    const merge = lines.findIndex((line) => line.startsWith("*   commit "));
    expect(lines[merge + 1]).toMatch(/^\|\\ {2}Merge: [0-9a-f]{7} [0-9a-f]{7}$/);
    expect(lines[merge + 2]).toMatch(/^\| \| Author: /);
    expect(lines[merge + 5]).toBe("| |     Merge branch 'feature'");
    expect(lines.at(-1)).toBe("      base");
    expect(lines.at(-4)).toMatch(/^ {2}Author: /);
  });

  it("limits the count, and shows each commit's stat or patch (none for merges)", async () => {
    const ws = await branchy();
    expect(short((await ws.git.log({ oneline: true, maxCount: 2 })).output)).toBe(
      "abc1234 (HEAD -> main) after merge\nabc1234 Merge branch 'feature'",
    );
    expect(short((await ws.git.log({ oneline: true, maxCount: 2, stat: true })).output)).toBe(
      [
        "abc1234 (HEAD -> main) after merge",
        " a.txt | 1 +",
        " 1 file changed, 1 insertion(+)",
        "abc1234 Merge branch 'feature'",
      ].join("\n"),
    );
    const patch = (await ws.git.log({ maxCount: 1, patch: true })).output;
    expect(patch).toMatch(/\n {4}after merge\n\ndiff --git a\/a\.txt b\/a\.txt\n/);
    expect(patch.endsWith("@@ -1,2 +1,3 @@\n base\n more\n+again")).toBe(true);
    // The root commit's patch adds its files.
    const root = (await ws.git.log({ revision: "main~2", patch: true, stat: true })).output;
    expect(root).toContain(
      " a.txt | 1 +\n 1 file changed, 1 insertion(+)\n\ndiff --git a/a.txt b/a.txt\nnew file mode 100644",
    );
    expect((await ws.git.log({ maxCount: 0 })).output).toBe("");
  });

  it("lays out lanes that join from further right", () => {
    // x and y both wait for a, with z's lane between them.
    const rows = layoutGraph([
      { oid: "x", parents: ["a"] },
      { oid: "z", parents: ["q"] },
      { oid: "y", parents: ["a"] },
      { oid: "q", parents: [] },
      { oid: "a", parents: [] },
    ]);
    expect(rows.map((row) => [row.commit.trimEnd(), ...row.after])).toEqual([
      ["*"],
      ["| *"],
      ["| | *", "| |/"],
      ["| *"],
      ["*"],
    ]);
  });
});

describe("git diff between commits", () => {
  it("compares a commit with the working tree or the staging area", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "one\ntwo\nthree\nfour\n" });
    const since = await ws.git.diff({ revisions: ["HEAD~1"] });
    expect(since.data?.files.map((file) => [file.path, file.change])).toEqual([
      ["app.txt", "modified"],
      ["notes.md", "added"],
    ]);
    expect(since.output).toContain("+three\n+four");
    expect((await ws.git.diff({ revisions: ["HEAD~1"], staged: true })).output).not.toContain(
      "+four",
    );
    // A path after the commit narrows it, with or without `--`.
    expect((await ws.git.diff({ revisions: ["HEAD~1", "notes.md"] })).data?.files).toHaveLength(1);
    expect(
      (await ws.git.diff({ revisions: ["HEAD~1"], paths: ["notes.md"] })).data?.files,
    ).toHaveLength(1);
  });

  it("compares two commits, a range and the changes since a branch split", async () => {
    const { ws, a, b } = await repo();
    await ws.git.createAndSwitchBranch("feature", "HEAD~1");
    await commit(ws, "F", { "feature.txt": "f\n" }, NOW - 50);
    const paths = async (revisions: string[]) =>
      (await ws.git.diff({ revisions })).data?.files.map((file) => file.path);
    expect(await paths([a, b])).toEqual(["app.txt", "notes.md"]);
    expect(await paths(["main..feature"])).toEqual(["app.txt", "feature.txt", "notes.md"]);
    expect(await paths(["main...feature"])).toEqual(["feature.txt"]);
    expect(await paths(["feature", "main"])).toEqual(["app.txt", "feature.txt", "notes.md"]);
  });

  it("refuses a word that is neither a commit nor a known path", async () => {
    const { ws } = await repo();
    const result = await ws.git.diff({ revisions: ["nope"] });
    expect(result.error?.code).toBe("INVALID_REVISION");
    expect(result.output).toMatch(/^fatal: ambiguous argument 'nope': unknown revision or path/);
    expect((await ws.git.diff({ revisions: ["main..nope"] })).error?.code).toBe("INVALID_REVISION");
    expect((await ws.git.diff({ revisions: ["HEAD", "HEAD~1", "HEAD"] })).output).toMatch(
      /^fatal: GitDojo compares at most two commits/,
    );
    expect((await ws.git.diff({ revisions: ["HEAD", "HEAD~1"], staged: true })).error?.code).toBe(
      "INVALID_ARGUMENT",
    );
  });
});

describe("git checkout with paths", () => {
  it("puts files back from the staging area, reporting the count only without --", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "edited\n", "notes.md": "edited\n" });
    expect(await ws.git.checkoutFiles({ paths: ["app.txt"], separated: true })).toMatchObject({
      ok: true,
      output: "",
    });
    expect(await read(ws, "app.txt")).toBe("one\ntwo\nthree\n");
    expect(await ws.git.checkoutFiles({ paths: ["notes.md"], separated: false })).toMatchObject({
      ok: true,
      output: "Updated 1 path from the index",
    });
  });

  it("takes files from a commit and stages them", async () => {
    const { ws } = await repo();
    const result = await ws.git.checkoutFiles({ paths: ["HEAD~1", "app.txt"], separated: false });
    expect(result.output).toMatch(/^Updated 1 path from [0-9a-f]{7}$/);
    expect(await read(ws, "app.txt")).toBe("one\ntwo\n");
    expect(await changed(ws)).toEqual([["app.txt", "modified", null]]);
    expect((await ws.git.checkoutFiles({ paths: ["nope.txt"], separated: true })).output).toBe(
      "error: pathspec 'nope.txt' did not match any file(s) known to git",
    );
  });
});
