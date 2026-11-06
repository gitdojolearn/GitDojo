import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { diffFile, formatFileDiff, type FileChange } from "../engine/diff";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitDiffOptions, type GitDiffResult, type GitFileDiff } from "../engine/git-engine";
import { matchesAny, parsePathspecs } from "../engine/pathspec";
import { isRepository, resolveRefOrNull } from "../engine/repository";
import { resolveRevision, unknownRevisionMessage } from "../engine/revisions";
import { readStatusEntries } from "../engine/status-matrix";
import {
  hashText,
  readBlobText,
  readIndexFiles,
  readTreeFiles,
  readWorkingText,
} from "../engine/working-tree";

export const DIFF_USAGE =
  "usage: git diff [--staged] [<commit> [<commit>] | <commit>..<commit>] [--] [<path>...]";

/** Paths whose content differs between two trees (path → blob id), with both texts, by path. */
export async function treeChanges(
  ctx: GitContext,
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): Promise<FileChange[]> {
  const text = async (oid: string | undefined) =>
    oid === undefined ? null : readBlobText(ctx, oid);
  const paths = [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
  return Promise.all(
    paths.map(async (path) => ({
      path,
      before: await text(before.get(path)),
      after: await text(after.get(path)),
    })),
  );
}

/** The changes that differ in content, as diffs with the blob ids for their `index` line. */
export async function fileDiffs(
  changes: readonly FileChange[],
  hash: (text: string) => Promise<string>,
): Promise<{ file: GitFileDiff; oids: { before: string; after: string } }[]> {
  const diffs = [];
  for (const change of changes) {
    const file = diffFile(change);
    if (file.hunks.length === 0) continue;
    diffs.push({
      file,
      oids: {
        before: change.before === null ? "" : await hash(change.before),
        after: change.after === null ? "" : await hash(change.after),
      },
    });
  }
  return diffs;
}

type Comparison =
  { ok: true; commits: string[]; paths: string[] } | { ok: false; result: GitDiffResult };

function refuse(code: "INVALID_ARGUMENT" | "INVALID_REVISION", message: string): Comparison {
  return { ok: false, result: failure(gitError(code, message)) };
}

/**
 * Splits the words typed before `--` into the commits to compare and paths, as Git does: leading
 * words that name commits (at most two, or one `A..B` / `A...B` range), then paths. A word that
 * is neither a commit nor a path Git knows is refused, so a typo is not silently a path.
 */
async function readComparison(ctx: GitContext, options: GitDiffOptions): Promise<Comparison> {
  const words = options.revisions ?? [];
  const commits: string[] = [];
  let index = 0;
  for (; index < words.length; index += 1) {
    const word = words[index] ?? "";
    const dots = word.includes("...") ? "..." : word.includes("..") ? ".." : null;
    if (dots !== null) {
      const sides = word.split(dots);
      if (commits.length > 0 || sides.length !== 2) {
        return refuse(
          "INVALID_ARGUMENT",
          `fatal: GitDojo compares at most two commits\n${DIFF_USAGE}`,
        );
      }
      const [left = "", right = ""] = sides;
      const [from, to] = await Promise.all([
        resolveRevision(ctx, left || "HEAD"),
        resolveRevision(ctx, right || "HEAD"),
      ]);
      if (from === null || to === null)
        return refuse("INVALID_REVISION", unknownRevisionMessage(word));
      if (dots === "..") {
        commits.push(from, to);
        continue;
      }
      // `A...B`: what B changed since it left A, so from their merge base.
      const [base] = (await git.findMergeBase({
        fs: ctx.fs,
        dir: ctx.dir,
        oids: [from, to],
      })) as string[];
      if (base === undefined) {
        return refuse("INVALID_REVISION", `fatal: ${word}: no merge base`);
      }
      commits.push(base, to);
      continue;
    }
    const oid = await resolveRevision(ctx, word);
    // Before `--`, every word is a commit; without it, the first that is not starts the paths.
    if (oid === null && options.separated) {
      return refuse("INVALID_REVISION", `fatal: bad revision '${word}'`);
    }
    if (oid === null) break;
    if (commits.length === 2) {
      return refuse(
        "INVALID_ARGUMENT",
        `fatal: GitDojo compares at most two commits\n${DIFF_USAGE}`,
      );
    }
    commits.push(oid);
  }

  const typedPaths = words.slice(index);
  if (typedPaths.length > 0) {
    const parsed = parsePathspecs(typedPaths);
    if (!parsed.ok) return { ok: false, result: failure(parsed.error) };
    const [entries, head] = await Promise.all([
      readStatusEntries(ctx),
      readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD")),
    ]);
    const known = [...entries.map((entry) => entry.path), ...head.keys()];
    for (const [position, pathspec] of parsed.pathspecs.entries()) {
      if (!known.some((path) => matchesAny(path, [pathspec]))) {
        return refuse("INVALID_REVISION", unknownRevisionMessage(typedPaths[position] ?? pathspec));
      }
    }
  }
  if (options.staged && commits.length > 1) {
    return refuse(
      "INVALID_ARGUMENT",
      `fatal: --staged compares one commit with the staging area\n${DIFF_USAGE}`,
    );
  }
  return { ok: true, commits, paths: [...typedPaths, ...(options.paths ?? [])] };
}

/** What changed since `commit`: in the staging area (`--staged`), or in the working tree. */
async function changesSince(
  ctx: GitContext,
  commit: string,
  staged: boolean,
): Promise<FileChange[]> {
  const [tree, index] = await Promise.all([readTreeFiles(ctx, commit), readIndexFiles(ctx)]);
  if (staged) return treeChanges(ctx, tree, index);
  // Tracked files only: what the commit or the staging area has, as read from disk now.
  const paths = [...new Set([...tree.keys(), ...index.keys()])].sort();
  const changes: FileChange[] = [];
  for (const path of paths) {
    const oid = tree.get(path);
    const before = oid === undefined ? null : await readBlobText(ctx, oid);
    const after = await readWorkingText(ctx, path);
    if (before !== after) changes.push({ path, before, after });
  }
  return changes;
}

/**
 * `git diff` (staging area → working tree) and `git diff --staged` (HEAD → staging area), as
 * unified diffs, or what changed since a commit (`git diff HEAD~1`) or between two
 * (`git diff main feature`, `main..feature`, `main...feature`). Untracked files are never part of
 * it, as in Git.
 */
export async function runDiff(
  ctx: GitContext,
  options: GitDiffOptions = {},
): Promise<GitDiffResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const comparison = await readComparison(ctx, options);
  if (!comparison.ok) return comparison.result;
  const parsed = parsePathspecs(comparison.paths);
  if (!parsed.ok) return failure(parsed.error);
  const { pathspecs } = parsed;
  const selected = (path: string) => pathspecs.length === 0 || matchesAny(path, pathspecs);

  const [from, to] = comparison.commits;
  let changes: FileChange[];
  if (from !== undefined && to !== undefined) {
    changes = await treeChanges(ctx, await readTreeFiles(ctx, from), await readTreeFiles(ctx, to));
  } else if (from !== undefined) {
    changes = await changesSince(ctx, from, options.staged === true);
  } else {
    changes = await uncommittedChanges(ctx, options.staged === true);
  }

  const diffs = await fileDiffs(
    changes.filter((change) => selected(change.path)),
    hashText,
  );
  // Like Git, no differences means no output at all.
  return success(diffs.map((diff) => formatFileDiff(diff.file, diff.oids)).join("\n"), {
    files: diffs.map((diff) => diff.file),
  });
}

/** `git diff` and `git diff --staged`, from the status of each path. */
async function uncommittedChanges(ctx: GitContext, staged: boolean): Promise<FileChange[]> {
  const [entries, index] = await Promise.all([readStatusEntries(ctx), readIndexFiles(ctx)]);
  const head = staged
    ? await readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD"))
    : new Map<string, string>();
  const text = async (oid: string | undefined) =>
    oid === undefined ? null : readBlobText(ctx, oid);

  const changes: FileChange[] = [];
  for (const entry of entries) {
    if (staged) {
      if (entry.staged === null) continue;
      changes.push({
        path: entry.path,
        before: await text(head.get(entry.path)),
        after: await text(index.get(entry.path)),
      });
    } else {
      if (entry.unstaged !== "modified" && entry.unstaged !== "deleted") continue;
      changes.push({
        path: entry.path,
        before: await text(index.get(entry.path)),
        after: await readWorkingText(ctx, entry.path),
      });
    }
  }
  return changes;
}
