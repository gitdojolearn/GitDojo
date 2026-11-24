import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExternalRepository, ExternalRepositoryError } from "./external-repository";
import { createReadOnlyGitFs, type ReadOnlyTree } from "./read-only-fs";

/** A folder on disk as the browser's folder picker would present it. */
function nodeTree(root: string): ReadOnlyTree {
  const at = (path: string) => join(root, path);
  return {
    async stat(path) {
      try {
        const info = await stat(at(path));
        return {
          type: info.isDirectory() ? "directory" : "file",
          size: info.size,
          mtimeMs: info.mtimeMs,
        };
      } catch {
        return null;
      }
    },
    async list(path) {
      try {
        return await readdir(at(path));
      } catch {
        return null;
      }
    },
    async read(path) {
      try {
        return new Uint8Array(await readFile(at(path)));
      } catch {
        return null;
      }
    },
  };
}

/** Every file under `dir` with its size, to prove reading changed nothing. */
async function listing(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push(`${path} ${String((await stat(path)).size)}`);
  }
  return files.sort();
}

let root: string;
// Recent: `git gc` expires reflog entries older than 90 days.
let clock = Math.floor(Date.now() / 1000) - 86_400;
const oids: Record<string, string> = {};

function git(...args: string[]): string {
  clock += 60;
  const date = `${String(clock)} +0000`;
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Ada",
      GIT_AUTHOR_EMAIL: "ada@example.com",
      GIT_COMMITTER_NAME: "Ada",
      GIT_COMMITTER_EMAIL: "ada@example.com",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  }).trim();
}

function commit(name: string, files: Record<string, string | Uint8Array>, message: string) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git("add", ".");
  git("commit", "-q", "-m", message);
  oids[name] = git("rev-parse", "HEAD");
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "gitdojo-external-"));
  git("init", "-q", "-b", "main");
  commit("readme", { "README.md": "# Demo\n" }, "Add README");
  commit("app", { "src/app.js": "console.log(1);\n" }, "Add app");
  git("tag", "light");
  git("switch", "-q", "-c", "feature/login");
  commit("login", { "src/login.js": "export {};\n" }, "Add login form");
  git("switch", "-q", "main");
  commit("docs", { "README.md": "# Demo\n\nDocs.\n" }, "Document the demo");
  git("merge", "-q", "--no-ff", "feature/login", "-m", "Merge branch 'feature/login'");
  oids.merge = git("rev-parse", "HEAD");
  git("tag", "-a", "v1.0.0", "-m", "First release");
  commit("logo", { "logo.png": new Uint8Array([137, 80, 78, 71, 0, 0, 1, 2]) }, "Add logo");
  commit("oops", { "oops.txt": "mistake\n" }, "Commit by mistake");
  git("reset", "-q", "--hard", "HEAD~1");
  git("remote", "add", "origin", "https://example.invalid/demo.git");
  git("update-ref", "refs/remotes/origin/main", oids.app ?? "");
  // Packfiles and packed refs, as in any repository Git has garbage-collected.
  git("gc", "-q");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("ExternalRepository", () => {
  it("reads branches, tags, remote-tracking branches and every commit from packfiles", async () => {
    const repository = await ExternalRepository.open(nodeTree(root));
    const { snapshot, truncated } = await repository.readHistory();

    expect(truncated).toBe(false);
    expect(snapshot.currentBranch).toBe("main");
    expect(snapshot.head).toBe(oids.logo);
    expect(snapshot.branches).toEqual([
      { name: "feature/login", oid: oids.login },
      { name: "main", oid: oids.logo },
    ]);
    expect(snapshot.tags).toEqual([
      { name: "light", oid: oids.app, annotated: false },
      { name: "v1.0.0", oid: oids.merge, annotated: true, message: "First release" },
    ]);
    expect(snapshot.remoteBranches).toEqual([
      { name: "origin/main", remote: "origin", branch: "main", oid: oids.app },
    ]);
    expect(snapshot.allCommits.map((c) => c.message)).toEqual([
      "Add logo",
      "Merge branch 'feature/login'",
      "Document the demo",
      "Add login form",
      "Add app",
      "Add README",
    ]);
    // The reset-away commit is only in the reflog.
    expect(snapshot.allCommits.some((c) => c.oid === oids.oops)).toBe(false);
    expect(snapshot.commits).toHaveLength(6);
  });

  it("lists the paths each commit changed, including inside folders", async () => {
    const { snapshot } = await (await ExternalRepository.open(nodeTree(root))).readHistory();
    const changed = (oid?: string) => snapshot.allCommits.find((c) => c.oid === oid)?.changedPaths;
    expect(changed(oids.readme)).toEqual(["README.md"]);
    expect(changed(oids.app)).toEqual(["src/app.js"]);
    expect(changed(oids.merge)).toEqual(["src/login.js"]);
  });

  it("reads HEAD's reflog, newest first", async () => {
    const { snapshot } = await (await ExternalRepository.open(nodeTree(root))).readHistory();
    expect(snapshot.reflog[0]).toMatchObject({
      index: 0,
      oid: oids.logo,
      previousOid: oids.oops,
      message: "reset: moving to HEAD~1",
    });
    expect(snapshot.reflog.map((entry) => entry.message)).toContain(
      "checkout: moving from main to feature/login",
    );
    expect(snapshot.reflog.at(-1)?.message).toBe("commit (initial): Add README");
  });

  it("stops at the newest commits and says the history goes on", async () => {
    const repository = await ExternalRepository.open(nodeTree(root));
    const { snapshot, truncated } = await repository.readHistory({ maxCommits: 2 });
    expect(truncated).toBe(true);
    expect(snapshot.allCommits.map((c) => c.oid)).toEqual([oids.logo, oids.merge]);
  });

  it("diffs a commit against its first parent and skips binary files", async () => {
    const repository = await ExternalRepository.open(nodeTree(root));
    const docs = await repository.readCommitDiff(oids.docs ?? "");
    expect(docs.parent).toBe(oids.app);
    expect(docs.files).toMatchObject([
      { path: "README.md", change: "modified", insertions: 2, deletions: 0 },
    ]);
    const logo = await repository.readCommitDiff(oids.logo ?? "");
    expect(logo.files).toEqual([
      expect.objectContaining({ path: "logo.png", change: "added", skipped: "binary", hunks: [] }),
    ]);
  });

  it("opens the .git folder itself", async () => {
    const repository = await ExternalRepository.open(nodeTree(join(root, ".git")));
    const { snapshot } = await repository.readHistory();
    expect(snapshot.head).toBe(oids.logo);
  });

  it("changes nothing on disk", async () => {
    const before = await listing(root);
    const repository = await ExternalRepository.open(nodeTree(root));
    await repository.readHistory();
    await repository.readCommitDiff(oids.merge ?? "");
    expect(await listing(root)).toEqual(before);
  });

  it("refuses a folder that is not a repository", async () => {
    const empty = mkdtempSync(join(tmpdir(), "gitdojo-empty-"));
    try {
      await expect(ExternalRepository.open(nodeTree(empty))).rejects.toMatchObject({
        code: "NOT_A_REPOSITORY",
      });
      await expect(ExternalRepository.open(nodeTree(empty))).rejects.toBeInstanceOf(
        ExternalRepositoryError,
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("createReadOnlyGitFs", () => {
  it("refuses every write and any path outside the folder", async () => {
    const fs = createReadOnlyGitFs(nodeTree(root)).promises;
    await expect(fs.writeFile("/.git/HEAD", "x")).rejects.toMatchObject({ code: "EROFS" });
    await expect(fs.unlink("/.git/HEAD")).rejects.toMatchObject({ code: "EROFS" });
    await expect(fs.readFile("/../etc/passwd")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readFile("/.git")).rejects.toMatchObject({ code: "EISDIR" });
  });
});
