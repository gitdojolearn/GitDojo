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

const URL = "gitdojo://simulated/origin.git";

/** A server `origin` with main (2 commits), feature/radar and a v1.0 tag; an empty workspace. */
async function served() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  await commit(ws, "Initial commit", { "README.md": "# Weather\n" });
  const main = await commit(ws, "Add forecast", { "src/forecast.js": "export {};\n" });
  await ws.git.createTag("v1.0", { message: "First release" });
  await ws.git.createAndSwitchBranch("feature/radar");
  const radar = await commit(ws, "Add radar", { "radar.js": "radar\n" });
  await ws.git.switchBranch("main");
  expect((await ws.git.setupCloneSource("origin")).ok).toBe(true);
  return { ws, main, radar };
}

describe("git clone", () => {
  it("starts from an empty workspace once the history is on the server", async () => {
    const { ws } = await served();
    const snapshot = await ws.git.snapshot();
    expect([snapshot.initialized, snapshot.entries]).toEqual([false, []]);
  });

  it("copies every branch and tag, checks out main and tracks origin/main", async () => {
    const { ws, main, radar } = await served();
    const cloned = await ws.git.clone(URL, ".");
    expect(cloned).toMatchObject({
      ok: true,
      output: "Cloning into '.'...\ndone.",
      data: { remote: "origin", branch: "main", oid: main },
    });
    const snapshot = await ws.git.snapshot();
    expect(snapshot.currentBranch).toBe("main");
    expect(snapshot.branches.map((b) => [b.name, b.upstream?.name])).toEqual([
      ["main", "origin/main"],
    ]);
    expect(snapshot.remoteBranches.map((ref) => [ref.name, ref.oid])).toEqual([
      ["origin/feature/radar", radar],
      ["origin/main", main],
    ]);
    expect(snapshot.tags).toMatchObject([
      { name: "v1.0", annotated: true, message: "First release" },
    ]);
    expect(snapshot.entries.map((entry) => [entry.path, entry.unstaged, entry.staged])).toEqual([
      ["README.md", null, null],
      ["src/forecast.js", null, null],
    ]);
    expect((await ws.git.status()).output).toContain(
      "Your branch is up to date with 'origin/main'.",
    );
    expect((await ws.git.reflog()).output).toContain(`clone: from ${URL}`);
  });

  it("works with the rest of the remote commands afterwards", async () => {
    const { ws, radar } = await served();
    await ws.git.clone(URL);
    const switched = await ws.git.switchBranch("feature/radar");
    expect(switched.ok, switched.output).toBe(true);
    expect(switched.output).toContain("set up to track 'origin/feature/radar'");
    expect((await ws.git.snapshot()).head).toBe(radar);
    await commit(ws, "Draw the map", { "radar.js": "map\n" });
    const pushed = await ws.git.push();
    expect(pushed.ok, pushed.output).toBe(true);
    expect(
      (await ws.git.snapshot()).remotes[0]?.branches.find((b) => b.name === "feature/radar")?.oid,
    ).toBe((await ws.git.snapshot()).head);
  });

  it("refuses non-empty workspaces, other folders, and servers that do not exist", async () => {
    const { ws } = await served();
    expect((await ws.git.clone(URL, "weather")).output).toContain(
      "GitDojo clones into this workspace itself",
    );
    expect((await ws.git.clone("gitdojo://simulated/nope.git")).output).toContain(
      "repository 'gitdojo://simulated/nope.git' does not exist",
    );
    expect((await ws.git.clone("https://github.com/example/weather.git")).output).toContain(
      "GitDojo has no network access",
    );
    await ws.files.writeFile(ws.workspaceId, "notes.txt", "x\n");
    expect((await ws.git.clone(URL)).output).toBe(
      "fatal: destination path '.' already exists and is not an empty directory.",
    );
  });
});

describe("git remote add, rename, remove and set-url", () => {
  async function cloned() {
    const { ws, main } = await served();
    await ws.git.clone(URL);
    return { ws, main };
  }

  it("adds a remote for a URL that starts as an empty repository, and pushes to it", async () => {
    const { ws, main } = await cloned();
    const added = await ws.git.remote({
      action: "add",
      name: "backup",
      url: "https://example.com/weather.git",
    });
    expect(added).toMatchObject({ ok: true, output: "" });
    expect((await ws.git.listRemotes({ verbose: true })).output).toContain(
      "backup\thttps://example.com/weather.git (fetch)",
    );
    expect((await ws.git.fetch("backup")).output).toBe("");
    const pushed = await ws.git.push({ remote: "backup", branch: "main" });
    expect(pushed.ok).toBe(true);
    expect(pushed.output).toContain("hint: GitDojo has no network access");
    const backup = (await ws.git.snapshot()).remotes.find((remote) => remote.name === "backup");
    expect(backup?.branches).toEqual([{ name: "main", oid: main }]);
    expect((await ws.git.remote({ action: "add", name: "backup", url: "x" })).output).toBe(
      "error: remote backup already exists.",
    );
  });

  it("renames a remote with its remote-tracking branches and upstreams", async () => {
    const { ws } = await cloned();
    expect((await ws.git.remote({ action: "rename", name: "origin", newName: "team" })).ok).toBe(
      true,
    );
    const snapshot = await ws.git.snapshot();
    expect(snapshot.remotes.map((remote) => remote.name)).toEqual(["team"]);
    expect(snapshot.remoteBranches.map((ref) => ref.name)).toEqual([
      "team/feature/radar",
      "team/main",
    ]);
    expect(snapshot.branches[0]?.upstream?.name).toBe("team/main");
    // The server came along with its new name.
    expect(snapshot.remotes[0]?.branches.map((b) => b.name)).toEqual(["feature/radar", "main"]);
    expect((await ws.git.fetch("team")).ok).toBe(true);
  });

  it("removes a remote, its remote-tracking branches and the upstreams pointing at it", async () => {
    const { ws } = await cloned();
    expect((await ws.git.remote({ action: "remove", name: "origin" })).ok).toBe(true);
    const snapshot = await ws.git.snapshot();
    expect([snapshot.remotes, snapshot.remoteBranches, snapshot.branches[0]?.upstream]).toEqual([
      [],
      [],
      undefined,
    ]);
    expect((await ws.git.remote({ action: "remove", name: "origin" })).output).toBe(
      "error: No such remote: 'origin'",
    );
  });

  it("re-points a remote with set-url and reads it back with get-url", async () => {
    const { ws } = await cloned();
    await ws.git.remote({ action: "set-url", name: "origin", url: "https://example.com/new.git" });
    expect((await ws.git.remote({ action: "get-url", name: "origin" })).output).toBe(
      "https://example.com/new.git",
    );
    // A new URL is a different (empty) server.
    expect((await ws.git.snapshot()).remotes[0]?.branches).toEqual([]);
  });
});
