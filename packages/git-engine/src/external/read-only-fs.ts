/**
 * A folder of the learner's own computer, seen read-only. The web app implements it over the
 * browser's folder pickers; the Git engine never learns which one.
 *
 * Paths are relative to the folder the learner picked, `/`-separated, with `""` for the folder
 * itself.
 */
export interface ReadOnlyTree {
  /** What is at `path`, or `null` when nothing is. */
  stat(path: string): Promise<{ type: "file" | "directory"; size: number; mtimeMs: number } | null>;
  /** Names in the directory at `path`; `null` when it is not a directory. */
  list(path: string): Promise<string[] | null>;
  /** The file's bytes; `null` when it is not a file. */
  read(path: string): Promise<Uint8Array | null>;
}

function fsError(code: string, path: string): Error {
  return Object.assign(new Error(`${code}: ${path}`), { code });
}

/** `/a//b/` → `a/b`. A `..` segment is refused rather than resolved, so nothing escapes the tree. */
function relative(path: string): string {
  const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) throw fsError("ENOENT", path);
  return segments.join("/");
}

function statResult(entry: { type: "file" | "directory"; size: number; mtimeMs: number }) {
  return {
    type: entry.type === "file" ? "file" : "dir",
    mode: entry.type === "file" ? 0o100644 : 0o040000,
    size: entry.size,
    ino: 0,
    mtimeMs: entry.mtimeMs,
    ctimeMs: entry.mtimeMs,
    uid: 1,
    gid: 1,
    dev: 1,
    isFile: () => entry.type === "file",
    isDirectory: () => entry.type === "directory",
    isSymbolicLink: () => false,
  };
}

const readOnly = (path: unknown, ..._rest: unknown[]) =>
  Promise.reject(fsError("EROFS", String(path)));

/**
 * The filesystem shape isomorphic-git expects, over a `ReadOnlyTree`. Every write fails with
 * `EROFS`: reading a learner's repository can never change it.
 */
export function createReadOnlyGitFs(tree: ReadOnlyTree) {
  return {
    promises: {
      async readFile(path: string, options?: { encoding?: string } | string) {
        const key = relative(path);
        const bytes = await tree.read(key);
        if (bytes === null) {
          throw fsError((await tree.stat(key)) === null ? "ENOENT" : "EISDIR", path);
        }
        const encoding = typeof options === "string" ? options : options?.encoding;
        return encoding === "utf8" ? new TextDecoder().decode(bytes) : bytes;
      },
      async readdir(path: string) {
        const names = await tree.list(relative(path));
        if (names === null) throw fsError("ENOTDIR", path);
        return names;
      },
      async stat(path: string) {
        const entry = await tree.stat(relative(path));
        if (entry === null) throw fsError("ENOENT", path);
        return statResult(entry);
      },
      async lstat(path: string) {
        const entry = await tree.stat(relative(path));
        if (entry === null) throw fsError("ENOENT", path);
        return statResult(entry);
      },
      readlink: readOnly,
      writeFile: readOnly,
      mkdir: readOnly,
      rmdir: readOnly,
      unlink: readOnly,
      symlink: readOnly,
    },
  };
}

export type ReadOnlyGitFs = ReturnType<typeof createReadOnlyGitFs>;
