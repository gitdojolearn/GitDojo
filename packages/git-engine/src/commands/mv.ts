import git from "isomorphic-git";
import { ensureDirectory, pathExists } from "../filesystem/fs-helpers";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitMvResult } from "../engine/git-engine";
import { isRepository } from "../engine/repository";
import { parsePathspecs } from "../engine/pathspec";
import { readIndexFiles } from "../engine/working-tree";
import { parentPath } from "../filesystem/paths";

export interface GitMvOptions {
  /** `-f`: overwrite an existing destination. */
  force?: boolean;
}

export const MV_USAGE = "usage: git mv [-f] <source>... <destination>";

function refuse(reason: string, source: string, destination: string): GitMvResult {
  return failure(
    gitError(
      reason === "not under version control" ? "FILE_NOT_FOUND" : "INVALID_ARGUMENT",
      `fatal: ${reason}, source=${source}, destination=${destination}`,
    ),
  );
}

async function isDirectory(ctx: GitContext, path: string): Promise<boolean> {
  try {
    return (await ctx.fs.promises.stat(`${ctx.dir}/${path}`)).isDirectory();
  } catch {
    return false;
  }
}

/** Every file under `dir` on disk, workspace-relative. */
async function filesUnder(ctx: GitContext, dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of await ctx.fs.promises.readdir(`${ctx.dir}/${dir}`)) {
    const path = `${dir}/${name}`;
    if (await isDirectory(ctx, path)) found.push(...(await filesUnder(ctx, path)));
    else found.push(path);
  }
  return found;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * `git mv [-f] <source>... <destination>`. A source may be a tracked file or a directory (its
 * tracked files are renamed in the index; untracked files inside move along on disk). With
 * several sources, or when `destination` is a directory, each source moves into it. Staged
 * content moves with the index entry, so unstaged edits stay unstaged, as in Git.
 */
export async function runMv(
  ctx: GitContext,
  rawPaths: string[],
  { force = false }: GitMvOptions = {},
): Promise<GitMvResult> {
  if (rawPaths.length < 2) return failure(gitError("INVALID_ARGUMENT", MV_USAGE));
  if (!(await isRepository(ctx))) return notARepository();
  const parsed = parsePathspecs(rawPaths);
  if (!parsed.ok) return failure(parsed.error);
  const paths = parsed.pathspecs;
  const destination = paths.at(-1) ?? "";
  const sources = paths.slice(0, -1);
  const intoDirectory = await isDirectory(ctx, destination);
  if (sources.length > 1 && !intoDirectory) {
    return failure(
      gitError("INVALID_ARGUMENT", `fatal: destination '${destination}' is not a directory`),
    );
  }

  const index = await readIndexFiles(ctx);
  const moves: { source: string; destination: string; tracked: boolean }[] = [];
  const claimed = new Set<string>();
  for (const source of sources) {
    const target = intoDirectory ? `${destination}/${basename(source)}` : destination;
    if (source === "" || source === target) {
      return refuse("can not move directory into itself", source, target);
    }
    if (await isDirectory(ctx, source)) {
      if (target === source || target.startsWith(`${source}/`)) {
        return refuse("can not move directory into itself", source, target);
      }
      const files = await filesUnder(ctx, source);
      if (!files.some((file) => index.has(file))) {
        return refuse("source directory is empty", source, target);
      }
      if (await pathExists(ctx.fs.promises, `${ctx.dir}/${target}`)) {
        return refuse("destination already exists", source, target);
      }
      for (const file of files) {
        moves.push({
          source: file,
          destination: `${target}${file.slice(source.length)}`,
          tracked: index.has(file),
        });
      }
      continue;
    }
    if (!index.has(source)) return refuse("not under version control", source, target);
    if (!(await pathExists(ctx.fs.promises, `${ctx.dir}/${source}`))) {
      return refuse("bad source", source, target);
    }
    const caseOnlyRename = source.toLowerCase() === target.toLowerCase();
    const occupied =
      (index.has(target) || (await pathExists(ctx.fs.promises, `${ctx.dir}/${target}`))) &&
      !caseOnlyRename;
    if (occupied && (!force || (await isDirectory(ctx, target)))) {
      return refuse("destination exists", source, target);
    }
    moves.push({ source, destination: target, tracked: true });
  }
  for (const move of moves) {
    if (claimed.has(move.destination)) {
      return refuse("multiple sources for the same target", move.source, move.destination);
    }
    claimed.add(move.destination);
  }

  // Read everything first: a case-only rename deletes and writes the same file.
  const contents = await Promise.all(
    moves.map(async (move) => {
      const raw = await ctx.fs.promises.readFile(`${ctx.dir}/${move.source}`);
      return raw instanceof Uint8Array ? raw : new TextEncoder().encode(raw);
    }),
  );
  for (const move of moves) {
    await ctx.fs.promises.unlink(`${ctx.dir}/${move.source}`);
    if (move.tracked) await git.remove({ fs: ctx.fs, dir: ctx.dir, filepath: move.source });
  }
  for (const [index_, move] of moves.entries()) {
    await ensureDirectory(ctx.fs.promises, `${ctx.dir}/${parentPath(move.destination)}`);
    await ctx.fs.promises.writeFile(
      `${ctx.dir}/${move.destination}`,
      contents[index_] ?? new Uint8Array(),
    );
    const oid = move.tracked ? index.get(move.source) : undefined;
    if (oid !== undefined) {
      await git.updateIndex({
        fs: ctx.fs,
        dir: ctx.dir,
        filepath: move.destination,
        oid,
        add: true,
      });
    }
  }
  await removeEmptyDirectories(ctx, sources);

  const [first] = moves;
  return success(
    moves
      .filter((move) => move.tracked)
      .map((move) => `Renamed ${move.source} -> ${move.destination}`)
      .join("\n"),
    { source: first?.source ?? "", destination: first?.destination ?? "", moves },
  );
}

/** A moved directory is gone afterwards, empty subdirectories included. */
async function removeEmptyDirectories(ctx: GitContext, sources: readonly string[]): Promise<void> {
  const remove = async (dir: string): Promise<void> => {
    if (!(await isDirectory(ctx, dir))) return;
    for (const name of await ctx.fs.promises.readdir(`${ctx.dir}/${dir}`)) {
      await remove(`${dir}/${name}`);
    }
    if ((await ctx.fs.promises.readdir(`${ctx.dir}/${dir}`)).length === 0) {
      await ctx.fs.promises.rmdir(`${ctx.dir}/${dir}`);
    }
  };
  for (const source of sources) await remove(source);
  for (const source of sources) {
    for (let dir = parentPath(source); dir !== ""; dir = parentPath(dir)) {
      if (
        !(await isDirectory(ctx, dir)) ||
        (await ctx.fs.promises.readdir(`${ctx.dir}/${dir}`)).length > 0
      )
        break;
      await ctx.fs.promises.rmdir(`${ctx.dir}/${dir}`);
    }
  }
}
