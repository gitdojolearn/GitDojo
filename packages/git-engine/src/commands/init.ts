import git from "isomorphic-git";
import { configuredDefaultBranch } from "../engine/config";
import { type GitContext } from "../engine/context";
import { success } from "../engine/errors";
import { type GitInitOptions, type GitInitResult } from "../engine/git-engine";
import { isRepository } from "../engine/repository";
import { isValidBranchName } from "./branch";

export async function runInit(
  ctx: GitContext,
  options: GitInitOptions = {},
): Promise<GitInitResult> {
  const reinitialized = await isRepository(ctx);
  const defaultBranch =
    options.defaultBranch ?? (await configuredDefaultBranch(ctx, isValidBranchName));
  if (!reinitialized) {
    await git.init({ fs: ctx.fs, dir: ctx.dir, defaultBranch });
  }
  const verb = reinitialized ? "Reinitialized existing" : "Initialized empty";
  return success(`${verb} Git repository in ${ctx.displayDir}/.git/`, {
    reinitialized,
    defaultBranch,
  });
}
