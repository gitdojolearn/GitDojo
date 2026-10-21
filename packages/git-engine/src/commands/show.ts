import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { type GitShowResult } from "../engine/git-engine";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { resolveRevision, unknownRevisionMessage } from "../engine/revisions";
import { branchDecorations, formatCommit, runLog } from "./log";
import { diffFile, formatFileDiff } from "../engine/diff";
import { isRepository, resolveRefOrNull } from "../engine/repository";
import { readBlobText, readTreeFiles } from "../engine/working-tree";

/** `git show [<commit> | <commit>:<path>]`: one commit, its first-parent diff, or a file blob. */
export async function runShow(ctx: GitContext, spec = "HEAD"): Promise<GitShowResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const colon = spec.indexOf(":");
  const revision = colon < 0 ? spec : spec.slice(0, colon);
  const path = colon < 0 ? undefined : spec.slice(colon + 1);
  if (colon >= 0 && revision === "") {
    return failure(gitError("INVALID_REVISION", "fatal: invalid object name ''"));
  }
  const target = await resolveRevision(ctx, revision || "HEAD");
  if (target === null) {
    const head = await resolveRefOrNull(ctx, "HEAD");
    if (head === null) {
      return failure(
        gitError("NO_COMMITS", "fatal: your current branch does not have any commits yet"),
      );
    }
    return failure(gitError("INVALID_REVISION", unknownRevisionMessage(revision)));
  }

  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: target });
  // Keep metadata formatting and commit normalization consistent with `git log`.
  const logged = await runLog(ctx, { revision: target });
  const commitInfo = logged.data?.commits[0];
  if (!commitInfo) return failure(gitError("INVALID_REVISION", unknownRevisionMessage(revision)));

  const tree = await readTreeFiles(ctx, target);
  if (path !== undefined) {
    const blob = tree.get(path);
    if (blob === undefined) {
      return failure(
        gitError("FILE_NOT_FOUND", `fatal: path '${path}' does not exist in '${revision}'`),
      );
    }
    return success(await readBlobText(ctx, blob), { commit: commitInfo, files: [] });
  }

  const parent = await readTreeFiles(ctx, commit.parent[0] ?? null);
  // Read the blob text only for paths whose tree entries differ.
  const actualFiles = [];
  const diffs = [];
  for (const file of [...new Set([...tree.keys(), ...parent.keys()])]
    .filter((name) => tree.get(name) !== parent.get(name))
    .sort()) {
    const before = parent.get(file);
    const after = tree.get(file);
    const change = {
      path: file,
      before: before === undefined ? null : await readBlobText(ctx, before),
      after: after === undefined ? null : await readBlobText(ctx, after),
    };
    const diff = diffFile(change);
    if (diff.hunks.length === 0) continue;
    actualFiles.push(diff);
    diffs.push(
      formatFileDiff(diff, {
        before: before ?? "0000000",
        after: after ?? "0000000",
      }),
    );
  }
  const labels = (await branchDecorations(ctx)).get(target);
  const decoration = labels ? ` (${labels.join(", ")})` : "";
  const output = [formatCommit(commitInfo, decoration, false), ...diffs]
    .filter(Boolean)
    .join("\n\n");
  return success(output, { commit: commitInfo, files: actualFiles });
}
