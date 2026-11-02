import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, success } from "../engine/errors";
import { type GitCloneResult } from "../engine/git-engine";
import { logHeadMove } from "../engine/reflog";
import { writeUpstreamConfig } from "../engine/refs";
import {
  addSimulatedRemote,
  findRemote,
  simulatedServerName,
  stagedServerDir,
  writeRemoteBranch,
  writeRemoteTag,
} from "../engine/remote-store";
import { isRepository, shortOid } from "../engine/repository";
import { emptyDirectory, ensureDirectory, pathExists } from "../filesystem/fs-helpers";
import { copyDirectory } from "../filesystem/copy";
import { fetchRemote, NO_NETWORK } from "./remote";
import { forceCheckout } from "./reset";

export const CLONE_USAGE = "usage: git clone <repository> [.]";

/**
 * Lesson setup only: the history built in the workspace so far becomes a simulated server named
 * `name`, and the workspace is emptied, so the learner starts with `git clone`.
 */
export async function runSetupCloneSource(ctx: GitContext, name: string) {
  if (!(await isRepository(ctx))) {
    return failure(gitError("NOT_A_REPOSITORY", "setup: build the server's history first"));
  }
  const target = stagedServerDir(ctx.workspaceId, name);
  if (await pathExists(ctx.fs.promises, target)) {
    await emptyDirectory(ctx.fs.promises, target);
  } else {
    await ensureDirectory(ctx.fs.promises, target);
  }
  await copyDirectory(ctx.fs.promises, `${ctx.dir}/.git`, target);
  await emptyDirectory(ctx.fs.promises, ctx.dir);
  return success("", {});
}

async function isEmptyDirectory(ctx: GitContext): Promise<boolean> {
  try {
    return (await ctx.fs.promises.readdir(ctx.dir)).length === 0;
  } catch {
    return true;
  }
}

/**
 * `git clone <url> [.]`: copies a simulated server into this (empty) workspace. `origin` points at
 * it, every server branch becomes `origin/<branch>`, tags come along, and the server's current
 * branch is checked out, tracking its `origin` counterpart.
 */
export async function runClone(
  ctx: GitContext,
  url: string,
  directory?: string,
): Promise<GitCloneResult> {
  if (url === "") {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        `fatal: You must specify a repository to clone.\n\n${CLONE_USAGE}`,
      ),
    );
  }
  if (directory !== undefined && directory !== "." && directory !== "./") {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        `fatal: GitDojo clones into this workspace itself: git clone ${url} .\nhint: Each GitDojo workspace holds exactly one repository.`,
      ),
    );
  }
  if ((await isRepository(ctx)) || !(await isEmptyDirectory(ctx))) {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        "fatal: destination path '.' already exists and is not an empty directory.",
      ),
    );
  }
  const name = simulatedServerName(url);
  const source = name === null ? null : stagedServerDir(ctx.workspaceId, name);
  if (source === null || !(await pathExists(ctx.fs.promises, `${source}/HEAD`))) {
    return failure(
      gitError(
        "REMOTE_NOT_FOUND",
        name === null
          ? `fatal: unable to access '${url}': GitDojo has no network access.\nhint: Lessons give you a simulated repository to clone, such as gitdojo://simulated/origin.git.`
          : `fatal: repository '${url}' does not exist\n${NO_NETWORK}`,
      ),
    );
  }

  const read = { fs: ctx.fs, gitdir: source };
  const head =
    (await git.currentBranch({ ...read, fullname: false }).catch(() => undefined)) ?? "main";
  const branches = await git.listBranches(read);
  const tags = await git.listTags(read);

  await git.init({ fs: ctx.fs, dir: ctx.dir, defaultBranch: head });
  await copyDirectory(ctx.fs.promises, `${source}/objects`, `${ctx.dir}/.git/objects`);
  await addSimulatedRemote(ctx, "origin", url);
  for (const branch of branches) {
    await writeRemoteBranch(
      ctx,
      "origin",
      branch,
      await git.resolveRef({ ...read, ref: `refs/heads/${branch}` }),
    );
  }
  for (const tag of tags) {
    await writeRemoteTag(
      ctx,
      "origin",
      tag,
      await git.resolveRef({ ...read, ref: `refs/tags/${tag}` }),
    );
  }
  const remote = await findRemote(ctx, "origin");
  if (remote === null) throw new Error("clone lost origin");
  await fetchRemote(ctx, remote);

  const lines = ["Cloning into '.'...", "done."];
  const checkout = branches.includes(head) ? head : branches[0];
  if (checkout === undefined) {
    lines.splice(1, 1, "warning: You appear to have cloned an empty repository.");
    return success(lines.join("\n"), { remote: "origin", branch: null, oid: null });
  }
  const oid = await git.resolveRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: `refs/remotes/origin/${checkout}`,
  });
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: `refs/heads/${checkout}`,
    value: oid,
    force: true,
  });
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: "HEAD",
    value: `refs/heads/${checkout}`,
    symbolic: true,
    force: true,
  });
  await writeUpstreamConfig(ctx, checkout, "origin", checkout);
  await forceCheckout(ctx, oid);
  await logHeadMove(ctx, { from: null, to: oid, message: `clone: from ${url}`, branch: checkout });
  return success(lines.join("\n"), {
    remote: "origin",
    branch: checkout,
    oid,
    shortOid: shortOid(oid),
  });
}
