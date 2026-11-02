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

/** `origin` has `main` and a pushed `feature`; locally `feature` is checked out and tracked. */
async function published() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  await commit(ws, "Initial commit", { "README.md": "# Weather\n" });
  expect((await ws.git.setupRemote("origin", { branches: ["main"] })).ok).toBe(true);
  await ws.git.createAndSwitchBranch("feature");
  const pushed = await commit(ws, "Add forcast", { "forecast.js": "export {};\n" });
  expect((await ws.git.push({ remote: "origin", branch: "feature", setUpstream: true })).ok).toBe(
    true,
  );
  return { ws, pushed };
}

const server = async (ws: TestWorkspace) => (await ws.git.snapshot()).remotes[0];
const serverBranch = async (ws: TestWorkspace, name: string) =>
  (await server(ws))?.branches.find((branch) => branch.name === name)?.oid;

describe("git push --force and --force-with-lease", () => {
  it("rejects rewritten history without them", async () => {
    const { ws, pushed } = await published();
    await ws.git.commit({ message: "Add forecast", amend: true });
    const rejected = await ws.git.push();
    expect(rejected).toMatchObject({ ok: false, error: { code: "PUSH_REJECTED" } });
    expect(await serverBranch(ws, "feature")).toBe(pushed);
  });

  it("--force-with-lease replaces the branch when nobody else pushed", async () => {
    const { ws, pushed } = await published();
    const amended = (await ws.git.commit({ message: "Add forecast", amend: true })).data?.oid;
    const result = await ws.git.push({ force: "lease" });
    expect(result).toMatchObject({ ok: true, data: { status: "pushed", forced: true } });
    expect(result.output).toContain(
      `+ ${pushed.slice(0, 7)}...${amended?.slice(0, 7) ?? ""} feature -> feature (forced update)`,
    );
    expect(await serverBranch(ws, "feature")).toBe(amended);
    const snapshot = await ws.git.snapshot();
    expect(snapshot.remoteBranches.find((ref) => ref.name === "origin/feature")?.oid).toBe(amended);
  });

  it("--force-with-lease refuses when the remote moved since the last fetch", async () => {
    const { ws, pushed } = await published();
    await ws.git.setupRemoteCommit("origin", {
      branch: "feature",
      message: "Teammate fix",
      files: { "fix.js": "fix\n" },
    });
    await ws.git.commit({ message: "Add forecast", amend: true });
    const refused = await ws.git.push({ force: "lease" });
    expect(refused).toMatchObject({ ok: false, error: { code: "PUSH_REJECTED" } });
    expect(refused.output).toContain("feature -> feature (stale info)");
    expect(await serverBranch(ws, "feature")).not.toBe(pushed);

    // --force does not check, and throws the teammate's commit away.
    const forced = await ws.git.push({ force: "force" });
    expect(forced.ok, forced.output).toBe(true);
    expect(await serverBranch(ws, "feature")).toBe((await ws.git.snapshot()).head);
  });

  it("pushes a fast-forward normally even with --force-with-lease", async () => {
    const { ws } = await published();
    await commit(ws, "Add tests", { "test.js": "test\n" });
    const result = await ws.git.push({ force: "lease" });
    expect(result.ok).toBe(true);
    expect(result.data?.forced).toBeUndefined();
  });
});

describe("git push --delete", () => {
  it("deletes the branch on the remote and its remote-tracking branch", async () => {
    const { ws } = await published();
    const deleted = await ws.git.push({ remote: "origin", branch: "feature", delete: true });
    expect(deleted).toMatchObject({ ok: true, data: { status: "deleted", branch: "feature" } });
    expect(deleted.output).toBe("To gitdojo://simulated/origin.git\n - [deleted]         feature");
    expect(await serverBranch(ws, "feature")).toBeUndefined();
    const snapshot = await ws.git.snapshot();
    expect(snapshot.remoteBranches.map((ref) => ref.name)).toEqual(["origin/main"]);
    expect(snapshot.branches.find((b) => b.name === "feature")?.upstream?.gone).toBe(true);
  });

  it("accepts the :branch refspec and refuses branches the remote does not have", async () => {
    const { ws } = await published();
    expect((await ws.git.push({ remote: "origin", branch: ":feature" })).ok).toBe(true);
    const missing = await ws.git.push({ remote: "origin", branch: "feature", delete: true });
    expect(missing.ok).toBe(false);
    expect(missing.output).toContain("unable to delete 'feature': remote ref does not exist");
  });
});

describe("pushing tags", () => {
  it("pushes every tag with --tags, and a teammate's clone fetches them", async () => {
    const { ws } = await published();
    await ws.git.createTag("v1.0", { message: "First release" });
    await ws.git.createTag("preview", { target: "HEAD~1" });
    const pushed = await ws.git.push({ remote: "origin", tags: true });
    expect(pushed.ok, pushed.output).toBe(true);
    expect(pushed.output).toContain("* [new tag]         v1.0    -> v1.0");
    expect((await server(ws))?.tags.map((tag) => tag.name)).toEqual(["preview", "v1.0"]);
    expect((await ws.git.push({ remote: "origin", tags: true })).output).toBe(
      "Everything up-to-date",
    );

    // Deleting the tag locally, then fetching, brings it back from the server.
    await ws.git.deleteTag("v1.0");
    const fetched = await ws.git.fetch("origin");
    expect(fetched.output).toContain("* [new tag]");
    const tags = (await ws.git.snapshot()).tags;
    expect(tags.find((tag) => tag.name === "v1.0")).toMatchObject({
      annotated: true,
      message: "First release",
    });
  });

  it("pushes one tag by name and refuses to move an existing one without --force", async () => {
    const { ws } = await published();
    await ws.git.createTag("v1.0");
    expect((await ws.git.push({ remote: "origin", branch: "v1.0" })).ok).toBe(true);
    await ws.git.deleteTag("v1.0");
    await ws.git.createTag("v1.0", { target: "HEAD~1" });
    const rejected = await ws.git.push({ remote: "origin", branch: "v1.0" });
    expect(rejected).toMatchObject({ ok: false, error: { code: "PUSH_REJECTED" } });
    expect(rejected.output).toContain("v1.0 -> v1.0 (already exists)");
    const forced = await ws.git.push({ remote: "origin", branch: "v1.0", force: "force" });
    expect(forced.ok, forced.output).toBe(true);
    expect(forced.output).toContain("(forced update)");
  });
});

describe("git pull with pull.rebase and pull.ff", () => {
  async function diverged() {
    const { ws } = await published();
    await ws.git.setupRemoteCommit("origin", {
      branch: "feature",
      message: "Teammate fix",
      files: { "fix.js": "fix\n" },
    });
    await commit(ws, "Mine", { "mine.js": "mine\n" });
    return ws;
  }

  it("refuses divergent branches by default, and rebases with pull.rebase=true", async () => {
    const ws = await diverged();
    expect((await ws.git.pull()).error?.code).toBe("DIVERGENT_BRANCHES");
    await ws.git.config({ action: "set", key: "pull.rebase", value: "true" });
    const pulled = await ws.git.pull();
    expect(pulled).toMatchObject({ ok: true, data: { status: "rebased" } });
  });

  it("merges with pull.rebase=false and refuses with pull.ff=only", async () => {
    const ws = await diverged();
    await ws.git.config({ action: "set", key: "pull.ff", value: "only", scope: "global" });
    expect((await ws.git.pull()).ok).toBe(false);
    await ws.git.config({ action: "set", key: "pull.rebase", value: "false" });
    expect((await ws.git.pull()).data?.status).toBe("merge-commit");
  });
});
