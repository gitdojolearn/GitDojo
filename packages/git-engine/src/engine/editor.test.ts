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

async function repo() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  await commit(ws, "Initial commit", { "README.md": "# App\n" });
  const head = await commit(ws, "Add login", { "login.js": "export {};\n" });
  return { ws, head };
}

describe("git commit --amend without a message", () => {
  it("opens COMMIT_EDITMSG on the current message and changes nothing yet", async () => {
    const { ws, head } = await repo();
    const result = await ws.git.commit({ message: "", amend: true });
    expect(result).toMatchObject({
      ok: true,
      output: "hint: Waiting for your editor to close the file...",
    });
    const snapshot = await ws.git.snapshot();
    expect(snapshot.head).toBe(head);
    expect(snapshot.editor).toMatchObject({
      file: "COMMIT_EDITMSG",
      purpose: "message",
      operation: "commit",
    });
    expect(snapshot.editor?.content).toMatch(/^Add login\n\n# Please enter the commit message/);
    expect(snapshot.editor?.content).toContain("# On branch main");
  });

  it("amends with the saved message, keeping the commit's parent", async () => {
    const { ws, head } = await repo();
    const parent = (await ws.git.snapshot()).commits[1]?.oid;
    await ws.files.writeFile(ws.workspaceId, "login.js", "export const login = 1;\n");
    await ws.git.add(["login.js"]);
    await ws.git.commit({ message: "", amend: true });

    const closed = await ws.git.closeEditor("Add login form\n\nWith validation.\n# ignored\n");
    expect(closed.ok, closed.output).toBe(true);
    expect(closed.data?.status).toBe("committed");
    expect(closed.output).toMatch(/^\[main [0-9a-f]{7}\] Add login form/);
    const snapshot = await ws.git.snapshot();
    expect(snapshot.editor).toBeNull();
    expect(snapshot.head).not.toBe(head);
    expect(snapshot.commits[0]?.message.trim()).toBe("Add login form\n\nWith validation.");
    expect(snapshot.commits[0]?.parents).toEqual([parent]);
    expect(snapshot.commits).toHaveLength(2);
  });

  it("keeps the editor open on an empty message, and cancelling changes nothing", async () => {
    const { ws, head } = await repo();
    await ws.git.commit({ message: "", amend: true });
    const refused = await ws.git.closeEditor("# only comments\n");
    expect(refused).toMatchObject({ ok: false, data: { status: "editing" } });
    expect(refused.output).toContain("Aborting commit due to empty commit message.");
    expect((await ws.git.snapshot()).editor?.error).toContain("empty commit message");

    const aborted = await ws.git.abortEditor();
    expect(aborted).toMatchObject({
      ok: false,
      output: "Aborting commit due to empty commit message.",
    });
    const snapshot = await ws.git.snapshot();
    expect([snapshot.editor, snapshot.head]).toEqual([null, head]);
  });

  it("refuses other changes while the editor is open, with the right way out", async () => {
    const { ws } = await repo();
    await ws.git.commit({ message: "", amend: true });
    const blocked = await ws.git.createBranch("feature");
    expect(blocked).toMatchObject({ ok: false, error: { code: "EDITOR_OPEN" } });
    expect(blocked.output).toContain("close it without saving to cancel the commit");
    expect(await ws.git.rebaseControl("abort")).toMatchObject({
      ok: false,
      error: { code: "EDITOR_OPEN" },
    });
  });

  it("still amends straight away with -m or --no-edit", async () => {
    const { ws } = await repo();
    expect((await ws.git.commit({ message: "Add login page", amend: true })).ok).toBe(true);
    expect((await ws.git.commit({ message: "", amend: true, noEdit: true })).ok).toBe(true);
    expect((await ws.git.snapshot()).editor).toBeNull();
  });
});

describe("git tag -a without a message", () => {
  it("opens TAG_EDITMSG and creates the annotated tag once it is saved", async () => {
    const { ws, head } = await repo();
    const opened = await ws.git.createTag("v1.0", { annotated: true });
    expect(opened).toMatchObject({
      ok: true,
      output: "hint: Waiting for your editor to close the file...",
    });
    const { editor, tags } = await ws.git.snapshot();
    expect(tags).toEqual([]);
    expect(editor).toMatchObject({ file: "TAG_EDITMSG", purpose: "message", operation: "tag" });
    expect(editor?.content).toContain("#   v1.0");

    const closed = await ws.git.closeEditor("First release\n");
    expect(closed).toMatchObject({ ok: true, data: { status: "tagged", oid: head } });
    expect((await ws.git.snapshot()).tags).toEqual([
      { name: "v1.0", oid: head, annotated: true, message: "First release" },
    ]);
  });

  it("tags the commit named when the editor opened, and can be cancelled", async () => {
    const { ws } = await repo();
    const first = (await ws.git.snapshot()).commits[1]?.oid;
    await ws.git.createTag("v0.1", { annotated: true, target: "HEAD~1" });
    await ws.git.closeEditor("Preview\n");
    expect((await ws.git.snapshot()).tags[0]).toMatchObject({ name: "v0.1", oid: first });

    await ws.git.createTag("v0.2", { annotated: true });
    expect(await ws.git.abortEditor()).toMatchObject({
      ok: false,
      output: "fatal: no tag message?",
    });
    const snapshot = await ws.git.snapshot();
    expect(snapshot.editor).toBeNull();
    expect(snapshot.tags.map((tag) => tag.name)).toEqual(["v0.1"]);
  });

  it("refuses an explicitly empty -m", async () => {
    const { ws } = await repo();
    expect(await ws.git.createTag("v1.0", { annotated: true, message: " " })).toMatchObject({
      ok: false,
      output: "fatal: no tag message?",
    });
  });
});
