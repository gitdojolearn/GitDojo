import git from "isomorphic-git";
import { diffFile } from "../engine/diff";
import {
  type GitBranchInfo,
  type GitCommitInfo,
  type GitFileDiff,
  type GitRemoteTrackingInfo,
  type GitRepositorySnapshot,
  type GitTagInfo,
} from "../engine/git-engine";
import { parseReflog, ZERO_OID } from "../engine/reflog";
import { shortOid, topologicalOrder } from "../engine/repository";
import { hasErrorCode } from "../filesystem/fs-errors";
import { createReadOnlyGitFs, type ReadOnlyGitFs, type ReadOnlyTree } from "./read-only-fs";

export type ExternalRepositoryErrorCode = "NOT_A_REPOSITORY" | "UNSUPPORTED_REPOSITORY";

/** The picked folder cannot be read as a Git repository. The message is safe to show learners. */
export class ExternalRepositoryError extends Error {
  constructor(
    readonly code: ExternalRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExternalRepositoryError";
  }
}

export interface ExternalHistoryOptions {
  /** Read at most this many commits, newest (by committer date) first. */
  maxCommits?: number;
  /** Keep at most this many reflog entries, newest first. */
  maxReflogEntries?: number;
}

export interface ExternalHistory {
  /**
   * The repository as a snapshot, so `toRepositoryState` maps it like any workspace. It has no
   * working tree, stash, simulated remotes or operation in progress: only history and refs.
   */
  snapshot: GitRepositorySnapshot;
  /** Older commits exist that were not read. */
  truncated: boolean;
}

/** A path a commit changed, with its diff, or why the diff was left out. */
export interface ExternalFileDiff extends GitFileDiff {
  /** Binary content, or too large to diff in the browser: `hunks` is empty. */
  skipped?: "binary" | "too-large";
}

export interface ExternalCommitDiff {
  /** The first parent the diff compares with; `null` for a root commit. */
  parent: string | null;
  files: ExternalFileDiff[];
  /** More files changed than were diffed. */
  truncated: boolean;
}

export const DEFAULT_MAX_COMMITS = 300;
const DEFAULT_MAX_REFLOG_ENTRIES = 500;
const MAX_DIFF_FILES = 100;
const MAX_DIFF_BYTES = 256 * 1024;

interface ChangedEntry {
  path: string;
  before: string | null;
  after: string | null;
}

interface LoadedCommit {
  info: GitCommitInfo;
  tree: string;
  committerTimestamp: number;
}

const isMissing = (error: unknown) =>
  hasErrorCode(error, "NotFoundError") || hasErrorCode(error, "ENOENT");

/**
 * Where the Git directory is: the learner may pick the project folder (which holds `.git`) or the
 * `.git` folder itself.
 */
async function findGitdir(tree: ReadOnlyTree): Promise<string> {
  const dotGit = await tree.stat(".git");
  if (dotGit?.type === "directory") return "/.git";
  if (dotGit?.type === "file") {
    throw new ExternalRepositoryError(
      "UNSUPPORTED_REPOSITORY",
      "This folder is a linked worktree or a submodule: its history lives in another folder. Open the main repository instead.",
    );
  }
  const [head, objects] = await Promise.all([tree.stat("HEAD"), tree.stat("objects")]);
  if (head?.type === "file" && objects?.type === "directory") return "/";
  throw new ExternalRepositoryError(
    "NOT_A_REPOSITORY",
    "This folder is not a Git repository: it has no .git folder. Pick the folder you ran git init or git clone in.",
  );
}

/**
 * A repository on the learner's own computer, read in place through a `ReadOnlyTree`. Nothing is
 * copied or uploaded, and every write fails, so reading can never change it.
 */
export class ExternalRepository {
  /** isomorphic-git's object cache: without it every object read re-reads the packfiles. */
  private readonly cache: object = {};

  private constructor(
    private readonly fs: ReadOnlyGitFs,
    private readonly gitdir: string,
  ) {}

  static async open(tree: ReadOnlyTree): Promise<ExternalRepository> {
    return new ExternalRepository(createReadOnlyGitFs(tree), await findGitdir(tree));
  }

  private get git() {
    return { fs: this.fs, gitdir: this.gitdir, cache: this.cache };
  }

  async readHistory({
    maxCommits = DEFAULT_MAX_COMMITS,
    maxReflogEntries = DEFAULT_MAX_REFLOG_ENTRIES,
  }: ExternalHistoryOptions = {}): Promise<ExternalHistory> {
    const head = await this.resolve("HEAD");
    const currentBranch = (await git.currentBranch({ ...this.git, fullname: false })) ?? null;
    const [branches, tags, remoteBranches, reflog] = await Promise.all([
      this.readBranches(),
      this.readTags(),
      this.readRemoteBranches(),
      this.readReflog(maxReflogEntries),
    ]);
    const tips = [
      head,
      ...branches.map((branch) => branch.oid),
      ...tags.map((tag) => tag.oid),
      ...remoteBranches.map((ref) => ref.oid),
    ].filter((oid) => oid !== null);
    const { commits, truncated } = await this.walk(tips, maxCommits);
    const allCommits = topologicalOrder(commits);

    return {
      snapshot: {
        initialized: true,
        currentBranch,
        head,
        branches,
        commits: head === null ? [] : reachable(commits, head),
        allCommits,
        entries: [],
        merge: null,
        reflog,
        stashes: [],
        tags,
        remotes: [],
        remoteBranches,
        editor: null,
      },
      truncated,
    };
  }

  /** What `oid` changed compared with its first parent, file by file. */
  async readCommitDiff(oid: string): Promise<ExternalCommitDiff> {
    const commit = await this.readCommit(oid);
    if (commit === null) throw new Error(`Commit ${shortOid(oid)} is not in this repository.`);
    const parentOid = commit.info.parents[0] ?? null;
    const parent = parentOid === null ? null : await this.readCommit(parentOid);
    const changes = await this.changedEntries(parent?.tree ?? null, commit.tree);
    const files: ExternalFileDiff[] = [];
    for (const change of changes.slice(0, MAX_DIFF_FILES)) {
      files.push(await this.diffEntry(change));
    }
    return { parent: parentOid, files, truncated: changes.length > MAX_DIFF_FILES };
  }

  private async resolve(ref: string): Promise<string | null> {
    try {
      return await git.resolveRef({ ...this.git, ref });
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private async readBranches(): Promise<GitBranchInfo[]> {
    const names = await git.listBranches(this.git);
    const branches = await Promise.all(
      names.map(async (name) => ({ name, oid: await this.resolve(`refs/heads/${name}`) })),
    );
    return branches.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async readRemoteBranches(): Promise<GitRemoteTrackingInfo[]> {
    const branches: GitRemoteTrackingInfo[] = [];
    for (const { remote } of await git.listRemotes(this.git)) {
      for (const branch of await git.listBranches({ ...this.git, remote })) {
        if (branch === "HEAD") continue;
        const oid = await this.resolve(`refs/remotes/${remote}/${branch}`);
        if (oid !== null) branches.push({ name: `${remote}/${branch}`, remote, branch, oid });
      }
    }
    return branches.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every tag, peeled to the commit it names; tags of trees or blobs are left out. */
  private async readTags(): Promise<GitTagInfo[]> {
    const tags: GitTagInfo[] = [];
    for (const name of (await git.listTags(this.git)).sort()) {
      let oid = await this.resolve(`refs/tags/${name}`);
      let message: string | undefined;
      // Tags can point at tags; Git peels any number of them.
      for (let depth = 0; oid !== null && depth < 10; depth += 1) {
        const tag = await this.readTag(oid);
        if (tag !== null) {
          message ??= tag.message.trimEnd();
          oid = tag.object;
          continue;
        }
        if ((await this.readCommit(oid)) !== null) {
          tags.push({
            name,
            oid,
            ...(message === undefined ? { annotated: false } : { annotated: true, message }),
          });
        }
        break;
      }
    }
    return tags;
  }

  /** The annotated tag object at `oid`, or `null` for anything else. */
  private async readTag(oid: string) {
    try {
      return (await git.readTag({ ...this.git, oid })).tag;
    } catch (error) {
      if (isMissing(error) || hasErrorCode(error, "ObjectTypeError")) return null;
      throw error;
    }
  }

  private async readReflog(limit: number) {
    let raw: string | Uint8Array;
    try {
      raw = await this.fs.promises.readFile(`${this.gitdir}/logs/HEAD`, { encoding: "utf8" });
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return [];
      throw error;
    }
    return parseReflog(typeof raw === "string" ? raw : new TextDecoder().decode(raw))
      .slice(0, limit)
      .map((entry, index) => ({
        index,
        oid: entry.newOid,
        previousOid: entry.oldOid === ZERO_OID ? null : entry.oldOid,
        message: entry.message,
        timestamp: entry.timestamp,
      }));
  }

  /**
   * The commit, or `null` when its object is missing (a shallow clone's boundary) or is not a
   * commit.
   */
  private async readCommit(oid: string): Promise<LoadedCommit | null> {
    let result;
    try {
      result = await git.readCommit({ ...this.git, oid });
    } catch (error) {
      if (isMissing(error) || hasErrorCode(error, "ObjectTypeError")) return null;
      throw error;
    }
    const { commit } = result;
    return {
      info: {
        oid,
        shortOid: shortOid(oid),
        message: commit.message.trimEnd(),
        author: {
          name: commit.author.name,
          email: commit.author.email,
          timestamp: commit.author.timestamp,
          timezoneOffset: commit.author.timezoneOffset,
        },
        parents: commit.parent,
        changedPaths: [],
      },
      tree: commit.tree,
      committerTimestamp: commit.committer.timestamp,
    };
  }

  /**
   * The newest `limit` commits reachable from `tips`, by committer date, as `git log --all -n`
   * picks them. Each commit's changed paths are filled in from a tree diff with its first parent.
   */
  private async walk(
    tips: readonly string[],
    limit: number,
  ): Promise<{ commits: GitCommitInfo[]; truncated: boolean }> {
    const seen = new Set<string>();
    // Oldest first, so the newest commit is popped from the end.
    const queue: LoadedCommit[] = [];
    const enqueue = async (oid: string) => {
      if (seen.has(oid)) return;
      seen.add(oid);
      const commit = await this.readCommit(oid);
      if (commit === null) return;
      const at = queue.findIndex((other) => other.committerTimestamp > commit.committerTimestamp);
      queue.splice(at === -1 ? queue.length : at, 0, commit);
    };
    for (const tip of tips) await enqueue(tip);

    const loaded: LoadedCommit[] = [];
    while (queue.length > 0 && loaded.length < limit) {
      const commit = queue.pop();
      if (commit === undefined) break;
      loaded.push(commit);
      for (const parent of commit.info.parents) await enqueue(parent);
    }

    const commits: GitCommitInfo[] = [];
    for (const commit of loaded) {
      const parentOid = commit.info.parents[0];
      const parent = parentOid === undefined ? null : await this.readCommit(parentOid);
      const changedPaths =
        parentOid !== undefined && parent === null
          ? // The parent is missing (a shallow clone): there is nothing to compare with.
            []
          : (await this.changedEntries(parent?.tree ?? null, commit.tree)).map((c) => c.path);
      commits.push({ ...commit.info, changedPaths });
    }
    return { commits, truncated: queue.length > 0 };
  }

  /**
   * Paths whose blobs differ between two trees, sorted. Subtrees with the same oid are skipped
   * without being read, so a commit touching one file in a large repository reads a few trees.
   */
  private async changedEntries(
    before: string | null,
    after: string | null,
    prefix = "",
  ): Promise<ChangedEntry[]> {
    if (before === after) return [];
    const [left, right] = await Promise.all([this.readTree(before), this.readTree(after)]);
    const names = [...new Set([...left.keys(), ...right.keys()])].sort();
    const changes: ChangedEntry[] = [];
    for (const name of names) {
      const a = left.get(name);
      const b = right.get(name);
      if (a?.oid === b?.oid && a?.type === b?.type) continue;
      const path = `${prefix}${name}`;
      const aTree = a?.type === "tree" ? a.oid : null;
      const bTree = b?.type === "tree" ? b.oid : null;
      if (aTree !== null || bTree !== null) {
        changes.push(...(await this.changedEntries(aTree, bTree, `${path}/`)));
      }
      const aFile = a !== undefined && a.type !== "tree" ? a.oid : null;
      const bFile = b !== undefined && b.type !== "tree" ? b.oid : null;
      if (aFile !== bFile) changes.push({ path, before: aFile, after: bFile });
    }
    return changes.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  }

  private async readTree(oid: string | null): Promise<Map<string, { oid: string; type: string }>> {
    if (oid === null) return new Map();
    const { tree } = await git.readTree({ ...this.git, oid });
    return new Map(tree.map((entry) => [entry.path, { oid: entry.oid, type: entry.type }]));
  }

  private async readBlob(oid: string): Promise<Uint8Array> {
    return (await git.readBlob({ ...this.git, oid })).blob;
  }

  private async diffEntry(change: ChangedEntry): Promise<ExternalFileDiff> {
    const kind = change.before === null ? "added" : change.after === null ? "deleted" : "modified";
    const skipped = (reason: "binary" | "too-large"): ExternalFileDiff => ({
      path: change.path,
      change: kind,
      hunks: [],
      insertions: 0,
      deletions: 0,
      skipped: reason,
    });
    const [before, after] = await Promise.all([
      change.before === null ? null : this.readBlob(change.before),
      change.after === null ? null : this.readBlob(change.after),
    ]);
    if ((before?.length ?? 0) > MAX_DIFF_BYTES || (after?.length ?? 0) > MAX_DIFF_BYTES) {
      return skipped("too-large");
    }
    if ((before && isBinary(before)) || (after && isBinary(after))) return skipped("binary");
    const text = (bytes: Uint8Array | null) =>
      bytes === null ? null : new TextDecoder().decode(bytes);
    return diffFile({ path: change.path, before: text(before), after: text(after) });
  }
}

/** Git's heuristic: a NUL byte in the first 8000 bytes means binary. */
function isBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 8000).includes(0);
}

/** The commits reachable from `head`, keeping `commits`' order. */
function reachable(commits: readonly GitCommitInfo[], head: string): GitCommitInfo[] {
  const byOid = new Map(commits.map((commit) => [commit.oid, commit]));
  const reached = new Set<string>();
  const pending = [head];
  for (let oid = pending.pop(); oid !== undefined; oid = pending.pop()) {
    if (reached.has(oid) || !byOid.has(oid)) continue;
    reached.add(oid);
    pending.push(...(byOid.get(oid)?.parents ?? []));
  }
  return commits.filter((commit) => reached.has(commit.oid));
}
