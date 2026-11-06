import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  type GitCheckoutFilesOptions,
  type GitRestoreOptions,
  type GitRestoreResult,
} from "../engine/git-engine";
import { readMergeState, unresolvedConflicts } from "../engine/merge-state";
import { matchesPathspec, parsePathspecs } from "../engine/pathspec";
import { isRepository, resolveRefOrNull, shortOid } from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import {
  applyWorkingTreeUpdates,
  readBlob,
  readIndexFiles,
  readTreeFiles,
  resetIndexPaths,
} from "../engine/working-tree";

export const RESTORE_USAGE =
  "usage: git restore [--staged] [--worktree] [--source=<commit>] <pathspec>...";

/**
 * `git restore <path>` puts working-tree files back to their staged version (discarding
 * unstaged edits), `git restore --staged <path>` unstages (the index goes back to HEAD), and
 * `--source <commit>` takes content from another commit.
 */
export async function runRestore(
  ctx: GitContext,
  rawPaths: string[],
  options: GitRestoreOptions = {},
): Promise<GitRestoreResult> {
  if (rawPaths.length === 0) {
    return failure(
      gitError("INVALID_ARGUMENT", `fatal: you must specify path(s) to restore\n${RESTORE_USAGE}`),
    );
  }
  if (!(await isRepository(ctx))) return notARepository();
  const parsed = parsePathspecs(rawPaths);
  if (!parsed.ok) return failure(parsed.error);
  const { pathspecs } = parsed;

  const staged = options.staged ?? false;
  const worktree = options.worktree ?? !staged;

  let source: string | null;
  if (options.source !== undefined) {
    source = await resolveRevision(ctx, options.source);
    if (source === null) {
      return failure(gitError("INVALID_REVISION", `fatal: could not resolve ${options.source}`));
    }
  } else {
    source = await resolveRefOrNull(ctx, "HEAD");
  }
  const sourceTree = await readTreeFiles(ctx, source);
  const index = await readIndexFiles(ctx);

  // The paths each pathspec can restore: Git only knows tracked paths (or the source's).
  const known = new Set([...index.keys(), ...sourceTree.keys()]);
  const selected = new Set<string>();
  for (const [position, pathspec] of pathspecs.entries()) {
    const matches = [...known].filter((path) => matchesPathspec(path, pathspec));
    if (matches.length === 0) {
      return failure(
        gitError(
          "FILE_NOT_FOUND",
          `error: pathspec '${rawPaths[position] ?? pathspec}' did not match any file(s) known to git`,
        ),
      );
    }
    for (const path of matches) selected.add(path);
  }

  const conflicted = unresolvedConflicts(await readMergeState(ctx)).find((conflict) =>
    selected.has(conflict.path),
  );
  if (conflicted && worktree && !staged) {
    return failure(gitError("UNMERGED_PATH", `error: path '${conflicted.path}' is unmerged`));
  }

  const paths = [...selected].sort((a, b) => a.localeCompare(b));
  if (staged) await resetIndexPaths(ctx, paths, sourceTree, source);

  if (worktree) {
    // Without --staged, files come back from the index (or --source); with both, from HEAD.
    const from = staged || options.source !== undefined ? sourceTree : await readIndexFiles(ctx);
    await applyWorkingTreeUpdates(
      ctx,
      await Promise.all(
        paths.map(async (path) => {
          const oid = from.get(path);
          return {
            path,
            content: oid === undefined ? null : await readBlob(ctx, oid),
            stage: false,
          };
        }),
      ),
    );
  }
  // Real `git restore` is silent on success.
  return success("", { restored: paths });
}

/**
 * `git checkout [<commit>] [--] <path>...`, as older tutorials restore files: from the staging
 * area (`git restore <path>`), or from a commit into both the staging area and the working tree
 * (`git restore --source <commit> --staged --worktree <path>`). Without `--`, a first word that
 * names a commit is the source, and Git reports what it updated.
 */
export async function runCheckoutFiles(
  ctx: GitContext,
  { paths: words, source: given, separated }: GitCheckoutFilesOptions,
): Promise<GitRestoreResult> {
  if (!(await isRepository(ctx))) return notARepository();
  let source = given;
  let paths = words;
  const [first, ...rest] = words;
  if (!separated && source === undefined && first !== undefined && rest.length > 0) {
    if ((await resolveRevision(ctx, first)) !== null) {
      source = first;
      paths = rest;
    }
  }
  const result = await runRestore(
    ctx,
    paths,
    source === undefined ? {} : { source, staged: true, worktree: true },
  );
  if (!result.ok || separated) return result;

  // Git counts the updated paths only when no `--` was typed.
  const count = result.data?.restored.length ?? 0;
  let from = "the index";
  if (source !== undefined) {
    const oid = await resolveRevision(ctx, source);
    if (oid !== null) {
      from = shortOid((await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid })).commit.tree);
    }
  }
  return {
    ...result,
    output: `Updated ${String(count)} path${count === 1 ? "" : "s"} from ${from}`,
  };
}
