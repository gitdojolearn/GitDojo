import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitRemoteCommand, type GitRemoteResult } from "../engine/git-engine";
import { readUpstreamConfig, writeUpstreamConfig, clearUpstreamConfig } from "../engine/refs";
import { addSimulatedRemote, migrateRemoteStore, readRemotes } from "../engine/remote-store";
import { isRepository, resolveRefOrNull } from "../engine/repository";
import { isValidBranchName } from "./branch";

/** Remote names follow ref-name rules, without slashes (they become `refs/remotes/<name>/`). */
function isValidRemoteName(name: string): boolean {
  return isValidBranchName(name) && !name.includes("/");
}

function noSuchRemote(name: string): GitRemoteResult {
  return failure(gitError("REMOTE_NOT_FOUND", `error: No such remote: '${name}'`));
}

/** The remote-tracking branches under `refs/remotes/<remote>/`. */
async function trackingBranches(ctx: GitContext, remote: string): Promise<string[]> {
  return (await git.listBranches({ fs: ctx.fs, dir: ctx.dir, remote })).filter(
    (branch) => branch !== "HEAD",
  );
}

/** Local branches whose upstream is on `remote`. */
async function branchesTracking(ctx: GitContext, remote: string) {
  const local = await git.listBranches({ fs: ctx.fs, dir: ctx.dir });
  const tracked: { branch: string; upstream: string }[] = [];
  for (const branch of local) {
    const upstream = await readUpstreamConfig(ctx, branch);
    if (upstream?.remote === remote) tracked.push({ branch, upstream: upstream.branch });
  }
  return tracked;
}

/**
 * `git remote add | remove | rename | set-url | get-url`. Remotes point at simulated servers: a
 * `gitdojo://simulated/...` URL a lesson provides, or any other URL, which starts as an empty
 * repository nothing outside the browser ever sees.
 */
export async function runRemoteCommand(
  ctx: GitContext,
  command: GitRemoteCommand,
): Promise<GitRemoteResult> {
  if (!(await isRepository(ctx))) return notARepository();
  await migrateRemoteStore(ctx);
  const existing = await readRemotes(ctx);
  const find = (name: string) => existing.find((remote) => remote.name === name);
  const done = async (output = "") => success(output, { remotes: await readRemotes(ctx) });

  switch (command.action) {
    case "add": {
      if (!isValidRemoteName(command.name)) {
        return failure(
          gitError("INVALID_ARGUMENT", `fatal: '${command.name}' is not a valid remote name`),
        );
      }
      if (find(command.name)) {
        return failure(
          gitError("INVALID_ARGUMENT", `error: remote ${command.name} already exists.`),
        );
      }
      if (command.url.trim() === "") {
        return failure(gitError("INVALID_ARGUMENT", "usage: git remote add <name> <url>"));
      }
      await addSimulatedRemote(ctx, command.name, command.url);
      return done();
    }
    case "get-url": {
      const remote = find(command.name);
      return remote ? done(remote.url) : noSuchRemote(command.name);
    }
    case "set-url": {
      if (!find(command.name)) return noSuchRemote(command.name);
      await git.setConfig({
        fs: ctx.fs,
        dir: ctx.dir,
        path: `remote.${command.name}.url`,
        value: command.url,
      });
      return done();
    }
    case "remove": {
      if (!find(command.name)) return noSuchRemote(command.name);
      for (const branch of await trackingBranches(ctx, command.name)) {
        await git.deleteRef({
          fs: ctx.fs,
          dir: ctx.dir,
          ref: `refs/remotes/${command.name}/${branch}`,
        });
      }
      // Branches that tracked it have no upstream any more, as in Git.
      for (const { branch } of await branchesTracking(ctx, command.name)) {
        await clearUpstreamConfig(ctx, branch);
      }
      await git.deleteRemote({ fs: ctx.fs, dir: ctx.dir, remote: command.name });
      return done();
    }
    case "rename": {
      const remote = find(command.name);
      if (!remote) return noSuchRemote(command.name);
      if (!isValidRemoteName(command.newName)) {
        return failure(
          gitError("INVALID_ARGUMENT", `fatal: '${command.newName}' is not a valid remote name`),
        );
      }
      if (find(command.newName)) {
        return failure(
          gitError("INVALID_ARGUMENT", `error: remote ${command.newName} already exists.`),
        );
      }
      await git.addRemote({ fs: ctx.fs, dir: ctx.dir, remote: command.newName, url: remote.url });
      for (const branch of await trackingBranches(ctx, command.name)) {
        const from = `refs/remotes/${command.name}/${branch}`;
        const oid = await resolveRefOrNull(ctx, from);
        if (oid !== null) {
          await git.writeRef({
            fs: ctx.fs,
            dir: ctx.dir,
            ref: `refs/remotes/${command.newName}/${branch}`,
            value: oid,
            force: true,
          });
        }
        await git.deleteRef({ fs: ctx.fs, dir: ctx.dir, ref: from });
      }
      for (const { branch, upstream } of await branchesTracking(ctx, command.name)) {
        await writeUpstreamConfig(ctx, branch, command.newName, upstream);
      }
      await git.deleteRemote({ fs: ctx.fs, dir: ctx.dir, remote: command.name });
      return done();
    }
  }
}
