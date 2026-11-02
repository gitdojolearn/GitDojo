import { describe, expect, it } from "vitest";
import { combinedDiffHunks } from "./diff";
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

describe("combined diffs", () => {
  it("are empty when every change comes from one parent", () => {
    expect(combinedDiffHunks(["a\nb\n", "a\nb\n"], "a\nb\n")).toEqual([]);
    expect(combinedDiffHunks(["a\nours\n", "a\nb\n"], "a\nours\n")).toEqual([]);
  });

  it("show a resolution that differs from both parents, one column per parent", () => {
    const [hunk] = combinedDiffHunks(["ours\n", "theirs\n"], "both\n");
    expect(hunk?.lines).toEqual([
      { markers: "- ", text: "ours\n" },
      { markers: " -", text: "theirs\n" },
      { markers: "++", text: "both\n" },
    ]);
    expect(hunk?.parents).toEqual([
      { start: 1, lines: 1 },
      { start: 1, lines: 1 },
    ]);
  });

  it("merge a line both parents had into one removal", () => {
    const [hunk] = combinedDiffHunks(["same\n", "same\n"], "new\n");
    expect(hunk?.lines).toEqual([
      { markers: "--", text: "same\n" },
      { markers: "++", text: "new\n" },
    ]);
  });
});

describe("git show of a merge commit", () => {
  async function merged(resolution: string | null) {
    const ws = await createTestWorkspace();
    await ws.git.init();
    await commit(ws, "Initial commit", { "app.js": "base\n", "README.md": "# App\n" });
    await ws.git.createAndSwitchBranch("feature");
    await commit(ws, "Theirs", { "app.js": "theirs\n", "feature.js": "f\n" });
    await ws.git.switchBranch("main");
    await commit(
      ws,
      "Ours",
      resolution === null ? { "README.md": "# App, ours\n" } : { "app.js": "ours\n" },
    );
    await ws.git.merge("feature");
    if (resolution !== null) {
      await ws.files.writeFile(ws.workspaceId, "app.js", resolution);
      await ws.git.add(["app.js"]);
      await ws.git.commit({ message: "" });
    }
    return ws;
  }

  it("shows only the metadata for a clean merge", async () => {
    const ws = await merged(null);
    const shown = await ws.git.show();
    expect(shown.output).toMatch(
      /^commit [0-9a-f]{40} \(HEAD -> main\)\nMerge: [0-9a-f]{7} [0-9a-f]{7}\n/,
    );
    expect(shown.output).not.toContain("diff --");
  });

  it("shows the conflict resolution as a combined diff", async () => {
    const ws = await merged("ours and theirs\n");
    const { output } = await ws.git.show();
    expect(output).toContain("diff --cc app.js");
    expect(output).toMatch(/index [0-9a-f]{7},[0-9a-f]{7}\.\.[0-9a-f]{7}/);
    expect(output).toContain("@@@ -1 -1 +1 @@@\n- ours\n -theirs\n++ours and theirs");
    // Files that came from one side only are not part of a combined diff.
    expect(output).not.toContain("feature.js");
  });
});
