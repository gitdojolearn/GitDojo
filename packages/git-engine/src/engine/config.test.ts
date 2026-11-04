import { describe, expect, it } from "vitest";
import { createGitEngine } from "./isomorphic-git-engine";
import { DEFAULT_AUTHOR } from "./git-engine";
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

async function readText(ws: TestWorkspace, path: string): Promise<string> {
  const raw = await ws.fs.promises.readFile(path, { encoding: "utf8" });
  return typeof raw === "string" ? raw : new TextDecoder().decode(raw);
}

describe("git config", () => {
  it("sets and reads a global setting, even outside a repository", async () => {
    const ws = await createTestWorkspace();
    const set = await ws.git.config({
      action: "set",
      key: "user.name",
      value: "Ada Lovelace",
      scope: "global",
    });
    expect(set).toMatchObject({ ok: true, output: "" });
    expect(await ws.git.config({ action: "get", key: "user.name" })).toMatchObject({
      ok: true,
      output: "Ada Lovelace",
    });
    expect((await ws.git.config({ action: "list" })).output).toBe("user.name=Ada Lovelace");
  });

  it("shares global settings between workspaces, like ~/.gitconfig", async () => {
    const ws = await createTestWorkspace();
    await ws.git.config({
      action: "set",
      key: "user.email",
      value: "ada@example.com",
      scope: "global",
    });
    await ws.files.createWorkspace("other");
    const other = createGitEngine({ fs: ws.fs, workspaceId: "other" });
    expect((await other.config({ action: "get", key: "user.email" })).output).toBe(
      "ada@example.com",
    );
  });

  it("prints nothing and fails for a setting with no value", async () => {
    const ws = await createTestWorkspace();
    expect(await ws.git.config({ action: "get", key: "user.name" })).toMatchObject({
      ok: false,
      output: "",
      error: { code: "CONFIG_NOT_SET" },
    });
  });

  it("writes the repository's own config without --global, and it wins there", async () => {
    const ws = await createTestWorkspace();
    expect(
      await ws.git.config({ action: "set", key: "user.email", value: "work@example.com" }),
    ).toMatchObject({ ok: false, output: "fatal: not in a git directory" });

    await ws.git.init();
    await ws.git.config({
      action: "set",
      key: "user.email",
      value: "home@example.com",
      scope: "global",
    });
    await ws.git.config({ action: "set", key: "user.email", value: "work@example.com" });
    expect((await ws.git.config({ action: "get", key: "user.email" })).output).toBe(
      "work@example.com",
    );
    // Global settings first, then the repository's (which include Git's own core.* ones).
    const lines = (await ws.git.config({ action: "list" })).output.split("\n");
    expect(lines[0]).toBe("user.email=home@example.com");
    expect(lines.at(-1)).toBe("user.email=work@example.com");
  });

  it("keeps the rest of .git/config intact when it edits a setting", async () => {
    const ws = await createTestWorkspace();
    await ws.git.init();
    const before = await readText(ws, "/gitdojo/test-workspace/.git/config");
    await ws.git.config({ action: "set", key: "user.name", value: "Ada" });
    await ws.git.config({ action: "set", key: "user.name", value: "Ada Lovelace" });
    const after = await readText(ws, "/gitdojo/test-workspace/.git/config");
    expect(after.startsWith(before.trimEnd())).toBe(true);
    expect(after.match(/name = /g)).toHaveLength(1);
    expect(after).toContain("[user]\n\tname = Ada Lovelace\n");

    expect(await ws.git.config({ action: "unset", key: "user.name" })).toMatchObject({ ok: true });
    expect(await ws.git.config({ action: "get", key: "user.name" })).toMatchObject({ ok: false });
    expect(await ws.git.config({ action: "unset", key: "user.name" })).toMatchObject({
      ok: false,
      output: "",
      error: { code: "CONFIG_NOT_SET" },
    });
  });

  it("reads keys case-insensitively and values with quotes and spaces", async () => {
    const ws = await createTestWorkspace();
    await ws.git.config({
      action: "set",
      key: "user.name",
      value: " Ada # Lovelace ",
      scope: "global",
    });
    expect((await ws.git.config({ action: "get", key: "User.Name" })).output).toBe(
      " Ada # Lovelace ",
    );
  });

  it("refuses keys without a section and identities that would corrupt a commit", async () => {
    const ws = await createTestWorkspace();
    expect(
      await ws.git.config({ action: "set", key: "name", value: "x", scope: "global" }),
    ).toMatchObject({
      ok: false,
      output: "error: key does not contain a section: name",
    });
    const bad = await ws.git.config({
      action: "set",
      key: "user.email",
      value: "<ada@example.com>",
      scope: "global",
    });
    expect(bad.ok).toBe(false);
    expect(bad.output).toContain("cannot contain '<', '>'");
  });

  it("uses user.name and user.email for commits, tags and the reflog", async () => {
    const ws = await createTestWorkspace();
    await ws.git.init();
    await commit(ws, "Before", { "a.txt": "a\n" });
    await ws.git.config({
      action: "set",
      key: "user.name",
      value: "Ada Lovelace",
      scope: "global",
    });
    await ws.git.config({
      action: "set",
      key: "user.email",
      value: "ada@example.com",
      scope: "global",
    });
    await commit(ws, "After", { "b.txt": "b\n" });
    await ws.git.createTag("v1", { message: "Release" });

    const snapshot = await ws.git.snapshot();
    expect(snapshot.commits.map((c) => [c.message.trim(), c.author.name, c.author.email])).toEqual([
      ["After", "Ada Lovelace", "ada@example.com"],
      ["Before", DEFAULT_AUTHOR.name, DEFAULT_AUTHOR.email],
    ]);
    expect(await readText(ws, "/gitdojo/test-workspace/.git/logs/HEAD")).toContain(
      "Ada Lovelace <ada@example.com>",
    );
  });

  it("re-authors the latest commit with --amend --reset-author", async () => {
    const ws = await createTestWorkspace();
    await ws.git.init();
    await commit(ws, "Add README", { "README.md": "# App\n" });
    await ws.git.config({ action: "set", key: "user.name", value: "Ada Lovelace" });
    await ws.git.config({ action: "set", key: "user.email", value: "ada@example.com" });

    await ws.git.commit({ message: "", amend: true, noEdit: true });
    expect((await ws.git.snapshot()).commits[0]?.author.name).toBe(DEFAULT_AUTHOR.name);
    await ws.git.commit({ message: "", amend: true, noEdit: true, resetAuthor: true });
    const [head] = (await ws.git.snapshot()).commits;
    expect([head?.message.trim(), head?.author.name]).toEqual(["Add README", "Ada Lovelace"]);
  });

  it("names the first branch after init.defaultBranch, unless told otherwise", async () => {
    const ws = await createTestWorkspace();
    await ws.git.config({
      action: "set",
      key: "init.defaultBranch",
      value: "trunk",
      scope: "global",
    });
    expect((await ws.git.init()).data?.defaultBranch).toBe("trunk");

    await ws.files.createWorkspace("setup");
    const setup = createGitEngine({ fs: ws.fs, workspaceId: "setup" });
    expect((await setup.init({ defaultBranch: "main" })).data?.defaultBranch).toBe("main");
  });
});
