import { type ReadOnlyTree } from "@gitdojo/git-engine";

type Entry = { type: "file" | "directory"; size: number; mtimeMs: number };

const segmentsOf = (path: string) => path.split("/").filter((segment) => segment !== "");

const isMissing = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "NotFoundError" || error.name === "TypeMismatchError");

/**
 * A folder picked with `showDirectoryPicker` (Chrome, Edge). Files are read only when Git asks for
 * them, so a project with a large working tree costs nothing beyond its `.git` folder.
 */
export function treeFromDirectoryHandle(root: FileSystemDirectoryHandle): ReadOnlyTree {
  const directories = new Map<string, Promise<FileSystemDirectoryHandle | null>>([
    ["", Promise.resolve(root)],
  ]);

  const directory = (path: string): Promise<FileSystemDirectoryHandle | null> => {
    const key = segmentsOf(path).join("/");
    const cached = directories.get(key);
    if (cached) return cached;
    const slash = key.lastIndexOf("/");
    const lookup = directory(key.slice(0, Math.max(slash, 0))).then(async (parent) => {
      if (parent === null) return null;
      try {
        return await parent.getDirectoryHandle(key.slice(slash + 1));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    });
    directories.set(key, lookup);
    return lookup;
  };

  const file = async (path: string): Promise<File | null> => {
    const segments = segmentsOf(path);
    const name = segments.pop();
    if (name === undefined) return null;
    const parent = await directory(segments.join("/"));
    if (parent === null) return null;
    try {
      return await (await parent.getFileHandle(name)).getFile();
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  };

  return {
    async stat(path) {
      if ((await directory(path)) !== null) return { type: "directory", size: 0, mtimeMs: 0 };
      const found = await file(path);
      return found === null
        ? null
        : { type: "file", size: found.size, mtimeMs: found.lastModified };
    },
    async list(path) {
      const handle = await directory(path);
      if (handle === null) return null;
      const names: string[] = [];
      for await (const name of handle.keys()) names.push(name);
      return names;
    },
    async read(path) {
      const found = await file(path);
      return found === null ? null : new Uint8Array(await found.arrayBuffer());
    },
  };
}

/**
 * The files of an `<input type="file" webkitdirectory>` (every browser, including Firefox and
 * Safari). Each `webkitRelativePath` starts with the picked folder's name, which is dropped. Only
 * the Git directory is kept: the working tree is never read.
 */
export function treeFromFiles(files: Iterable<File>): ReadOnlyTree {
  const byPath = new Map<string, File>();
  for (const picked of files) {
    const relative = segmentsOf(picked.webkitRelativePath || picked.name)
      .slice(1)
      .join("/");
    byPath.set(relative, picked);
  }
  // The project folder (with `.git/` inside) or the `.git` folder itself.
  const hasDotGit = [...byPath.keys()].some((path) => path.startsWith(".git/"));
  const kept = new Map([...byPath].filter(([path]) => !hasDotGit || path.startsWith(".git/")));

  const children = new Map<string, Set<string>>([["", new Set()]]);
  for (const path of kept.keys()) {
    const segments = segmentsOf(path);
    for (let depth = 0; depth < segments.length; depth += 1) {
      const parent = segments.slice(0, depth).join("/");
      const set = children.get(parent) ?? new Set<string>();
      set.add(segments[depth] ?? "");
      children.set(parent, set);
    }
  }

  return {
    stat(path) {
      const key = segmentsOf(path).join("/");
      const found = kept.get(key);
      const entry: Entry | null = found
        ? { type: "file", size: found.size, mtimeMs: found.lastModified }
        : children.has(key)
          ? { type: "directory", size: 0, mtimeMs: 0 }
          : null;
      return Promise.resolve(entry);
    },
    list(path) {
      const names = children.get(segmentsOf(path).join("/"));
      return Promise.resolve(names ? [...names] : null);
    },
    async read(path) {
      const found = kept.get(segmentsOf(path).join("/"));
      return found ? new Uint8Array(await found.arrayBuffer()) : null;
    },
  };
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: {
    mode?: "read";
    id?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

/** Chrome and Edge let a page read a folder the learner picks, lazily and without uploading. */
export function canPickDirectory(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Asks the browser for a folder, read-only. `null` when the learner cancels. */
export async function pickDirectory(): Promise<{ name: string; tree: ReadOnlyTree } | null> {
  const picker = (window as Window & DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker.call(window, { mode: "read", id: "gitdojo-explore" });
    return { name: handle.name, tree: treeFromDirectoryHandle(handle) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}
