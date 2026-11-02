import { describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";

async function commit(ws: TestWorkspace, message: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await ws.files.writeFile(ws.workspaceId, path, content);
  }
  await ws.git.add(Object.keys(files));
  const result = await ws.git.commit({ message });
  expect(result.ok, result.output).toBe(true);
  return result.data?.oid ?? "";
}

/** main: Initial commit; feature: Add search, Add sort (two files), wip. */
async function repo() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  const initial = await commit(ws, "Initial commit", { "README.md": "# Library\n" });
  await ws.git.createAndSwitchBranch("feature");
  const search = await commit(ws, "Add search", { "search.js": "export const search = 1;\n" });
  const sort = await commit(ws, "Add sort", {
    "sort.js": "export const sort = 1;\n",
    "order.js": "export const order = 1;\n",
  });
  const wip = await commit(ws, "wip", { "search.js": "export const search = 2;\n" });
  return { ws, initial, search, sort, wip };
}

const subjects = async (ws: TestWorkspace) =>
  (await ws.git.snapshot()).commits.map((commit) => commit.message.split("\n")[0]);

/** Starts `git rebase -i main` and saves `lines` (oldest first) as the plan. */
async function rebaseWith(ws: TestWorkspace, lines: string[]) {
  const opened = await ws.git.rebase("main", { interactive: true });
  expect(opened.data?.status).toBe("editing");
  return ws.git.closeEditor(`${lines.join("\n")}\n`);
}

describe("git rebase -i: edit", () => {
  it("stops at the commit for amending, then replays the rest on top", async () => {
    const { ws, search, sort, wip } = await repo();
    const stopped = await rebaseWith(ws, [`pick ${search}`, `edit ${sort}`, `pick ${wip}`]);
    expect(stopped).toMatchObject({ ok: true, data: { status: "stopped", oid: sort } });
    expect(stopped.output).toContain(`Stopped at ${sort.slice(0, 7)}...  Add sort`);
    expect(stopped.output).toContain("git commit --amend");

    const status = await ws.git.status();
    expect(status.output).toContain("interactive rebase in progress");
    expect(status.output).toContain(
      "You are currently editing a commit while rebasing branch 'feature'",
    );

    expect((await ws.git.commit({ message: "Add sort and order", amend: true })).ok).toBe(true);
    const done = await ws.git.rebaseControl("continue");
    expect(done).toMatchObject({ ok: true, data: { status: "rebased" } });
    expect(await subjects(ws)).toEqual([
      "wip",
      "Add sort and order",
      "Add search",
      "Initial commit",
    ]);
    expect((await ws.git.snapshot()).currentBranch).toBe("feature");
  });

  it("splits a commit: reset while stopped, commit the parts, continue", async () => {
    const { ws, search, sort, wip } = await repo();
    await rebaseWith(ws, [`pick ${search}`, `edit ${sort}`, `pick ${wip}`]);
    const reset = await ws.git.reset({ commit: "HEAD~1" });
    expect(reset.ok, reset.output).toBe(true);
    expect((await ws.git.status()).output).toContain("interactive rebase in progress");

    await ws.git.add(["sort.js"]);
    expect((await ws.git.commit({ message: "Add sort" })).ok).toBe(true);
    // Unfinished work is refused, as Git refuses to continue with it.
    await ws.git.add(["order.js"]);
    const early = await ws.git.rebaseControl("continue");
    expect(early).toMatchObject({ ok: false, error: { code: "LOCAL_CHANGES" } });
    expect(early.output).toContain("you have staged changes");
    expect((await ws.git.commit({ message: "Add order" })).ok).toBe(true);

    expect((await ws.git.rebaseControl("continue")).ok).toBe(true);
    expect(await subjects(ws)).toEqual([
      "wip",
      "Add order",
      "Add sort",
      "Add search",
      "Initial commit",
    ]);
  });

  it("can be aborted, putting the branch back", async () => {
    const { ws, search, sort, wip } = await repo();
    await rebaseWith(ws, [`edit ${search}`, `pick ${sort}`, `pick ${wip}`]);
    await ws.git.commit({ message: "Changed", amend: true });
    expect((await ws.git.rebaseControl("abort")).ok).toBe(true);
    const snapshot = await ws.git.snapshot();
    expect([snapshot.currentBranch, snapshot.head, snapshot.merge]).toEqual(["feature", wip, null]);
  });
});

describe("git rebase -i: break", () => {
  it("stops between steps and resumes with --continue", async () => {
    const { ws, search, sort, wip } = await repo();
    const stopped = await rebaseWith(ws, [
      `pick ${search}`,
      "break",
      `pick ${sort}`,
      `pick ${wip}`,
    ]);
    expect(stopped.data?.status).toBe("stopped");
    expect(await subjects(ws)).toEqual(["Add search", "Initial commit"]);
    // While stopped, the learner may commit something new; the rest goes on top of it.
    await commit(ws, "Add tests", { "test.js": "test();\n" });
    expect((await ws.git.rebaseControl("continue")).ok).toBe(true);
    expect(await subjects(ws)).toEqual([
      "wip",
      "Add sort",
      "Add tests",
      "Add search",
      "Initial commit",
    ]);
  });
});

describe("git rebase -i: fixup -C and -c", () => {
  it("fixup -C keeps the fixup's message instead of the previous one", async () => {
    const { ws, search, sort, wip } = await repo();
    const done = await rebaseWith(ws, [`pick ${search}`, `fixup -C ${wip}`, `pick ${sort}`]);
    expect(done.ok, done.output).toBe(true);
    expect(await subjects(ws)).toEqual(["Add sort", "wip", "Initial commit"]);
    const [, folded] = (await ws.git.snapshot()).commits;
    expect(folded?.changedPaths).toEqual(["search.js"]);
  });

  it("fixup -c opens the editor on the kept message", async () => {
    const { ws, search, sort, wip } = await repo();
    const waiting = await rebaseWith(ws, [`pick ${search}`, `fixup -c ${wip}`, `pick ${sort}`]);
    expect(waiting.data?.status).toBe("editing");
    expect((await ws.git.snapshot()).editor?.content).toMatch(/^wip\n/);
    expect((await ws.git.closeEditor("Add search, version 2\n")).ok).toBe(true);
    expect(await subjects(ws)).toEqual(["Add sort", "Add search, version 2", "Initial commit"]);
  });
});

describe("git rebase -i: label, reset and merge", () => {
  it("rebuilds a merge of two lines of work", async () => {
    const { ws, search, sort, wip } = await repo();
    const done = await rebaseWith(ws, [
      "label onto",
      `pick ${search}`,
      "label search",
      "reset onto",
      `pick ${sort}`,
      "merge search # Merge search into sort",
      `pick ${wip}`,
    ]);
    expect(done.ok, done.output).toBe(true);
    const { commits } = await ws.git.snapshot();
    const merge = commits.find((c) => c.parents.length === 2);
    expect(merge?.message.trim()).toBe("Merge search into sort");
    expect(commits[0]?.message.trim()).toBe("wip");
    expect((await ws.git.reflog()).output).toContain("rebase (reset): 'onto'");
  });

  it("reuses a merge commit's message and author with merge -C", async () => {
    const { ws, initial, search, sort } = await repo();
    // An older merge whose message the plan recreates.
    await ws.git.createAndSwitchBranch("old", initial);
    await commit(ws, "Old work", { "old.js": "old\n" });
    await ws.git.switchBranch("feature");
    const merged = await ws.git.merge("old", { message: "Merge old work" });
    expect(merged.ok, merged.output).toBe(true);
    const mergeOid = merged.data?.oid ?? "";

    const done = await rebaseWith(ws, [
      `pick ${search}`,
      "label here",
      "reset onto",
      `pick ${sort}`,
      `merge -C ${mergeOid} here`,
    ]);
    expect(done.ok, done.output).toBe(true);
    expect((await subjects(ws))[0]).toBe("Merge old work");
  });

  it("stops for merge conflicts and records the merge on --continue", async () => {
    const ws = await createTestWorkspace();
    await ws.git.init();
    await commit(ws, "Initial commit", { "app.js": "base\n" });
    await ws.git.createAndSwitchBranch("feature");
    const ours = await commit(ws, "Ours", { "app.js": "ours\n" });
    await ws.git.createAndSwitchBranch("side", "main");
    const theirs = await commit(ws, "Theirs", { "app.js": "theirs\n" });
    await ws.git.switchBranch("feature");
    await ws.git.rebase("main", { interactive: true });
    const stopped = await ws.git.closeEditor(
      [`pick ${theirs}`, "label side", "reset onto", `pick ${ours}`, "merge side"].join("\n"),
    );
    expect(stopped).toMatchObject({ ok: false, error: { code: "MERGE_CONFLICT" } });
    expect(stopped.output).toContain("error: could not merge 'side'");

    await ws.files.writeFile(ws.workspaceId, "app.js", "both\n");
    await ws.git.add(["app.js"]);
    expect((await ws.git.rebaseControl("continue")).ok).toBe(true);
    const [tip] = (await ws.git.snapshot()).commits;
    expect([tip?.message.trim(), tip?.parents.length]).toEqual(["Merge branch 'side'", 2]);
  });

  it("refuses labels it cannot resolve before anything happens", async () => {
    const { ws, search, wip } = await repo();
    await ws.git.rebase("main", { interactive: true });
    const refused = await ws.git.closeEditor(`pick ${search}\nreset nowhere\npick ${wip}\n`);
    expect(refused).toMatchObject({ ok: false, error: { code: "INVALID_TODO" } });
    expect(refused.output).toContain("could not resolve 'nowhere'");
    expect((await ws.git.snapshot()).head).toBe(wip);
  });
});
