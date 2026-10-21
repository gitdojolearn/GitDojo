import { pathExists } from "../filesystem/fs-helpers";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitCommandResult } from "@gitdojo/shared-types";
import { isRepository } from "../engine/repository";
import { parsePathspecs } from "../engine/pathspec";
import { applyWorkingTreeUpdates, readIndexFiles } from "../engine/working-tree";

export type GitMvResult = GitCommandResult<{ source: string; destination: string }>;

/** Moves one tracked file and stages the deletion/addition, like `git mv <source> <destination>`. */
export async function runMv(ctx: GitContext, rawPaths: string[]): Promise<GitMvResult> {
  if (rawPaths.length !== 2) {
    return failure(gitError("INVALID_ARGUMENT", "usage: git mv <source> <destination>"));
  }
  if (!(await isRepository(ctx))) return notARepository();
  const parsed = parsePathspecs(rawPaths);
  if (!parsed.ok) return failure(parsed.error);
  const [source, destination] = parsed.pathspecs;
  if (!source || !destination || source === destination) {
    return failure(
      gitError("INVALID_ARGUMENT", "fatal: source and destination must be different paths"),
    );
  }

  const index = await readIndexFiles(ctx);
  if (!index.has(source) || !(await pathExists(ctx.fs.promises, `${ctx.dir}/${source}`))) {
    return failure(gitError("FILE_NOT_FOUND", `fatal: '${source}' is not tracked`));
  }
  const caseOnlyRename = source.toLowerCase() === destination.toLowerCase();
  if (
    index.has(destination) ||
    ((await pathExists(ctx.fs.promises, `${ctx.dir}/${destination}`)) && !caseOnlyRename)
  ) {
    return failure(
      gitError("INVALID_ARGUMENT", `fatal: destination '${destination}' already exists`),
    );
  }

  const content = await ctx.fs.promises.readFile(`${ctx.dir}/${source}`);
  await applyWorkingTreeUpdates(ctx, [
    { path: source, content: null },
    {
      path: destination,
      content: content instanceof Uint8Array ? content : new Uint8Array(content),
    },
  ]);
  return success(`Renamed ${source} -> ${destination}`, { source, destination });
}
