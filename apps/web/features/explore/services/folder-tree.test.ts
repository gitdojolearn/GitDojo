import { describe, expect, it } from "vitest";
import { treeFromDirectoryHandle, treeFromFiles } from "./folder-tree";

function picked(path: string, content: string): File {
  const file = new File([content], path.split("/").at(-1) ?? path);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

const notFound = () => new DOMException("missing", "NotFoundError");
const mismatch = () => new DOMException("wrong kind", "TypeMismatchError");

type FakeEntry = string | { [name: string]: FakeEntry };

/** The parts of `FileSystemDirectoryHandle` the tree uses, over plain objects. */
function fakeHandle(name: string, entries: Record<string, FakeEntry>): FileSystemDirectoryHandle {
  const handle = {
    name,
    getDirectoryHandle(child: string) {
      const entry = entries[child];
      if (entry === undefined) return Promise.reject(notFound());
      if (typeof entry === "string") return Promise.reject(mismatch());
      return Promise.resolve(fakeHandle(child, entry));
    },
    getFileHandle(child: string) {
      const entry = entries[child];
      if (entry === undefined) return Promise.reject(notFound());
      if (typeof entry !== "string") return Promise.reject(mismatch());
      return Promise.resolve({ getFile: () => Promise.resolve(new File([entry], child)) });
    },
    async *keys() {
      yield* await Promise.resolve(Object.keys(entries));
    },
  };
  return handle as unknown as FileSystemDirectoryHandle;
}

const decode = (bytes: Uint8Array | null) =>
  bytes === null ? null : new TextDecoder().decode(bytes);

describe("treeFromFiles", () => {
  it("keeps only the Git directory of a picked project folder", async () => {
    const tree = treeFromFiles([
      picked("demo/README.md", "# Demo"),
      picked("demo/.git/HEAD", "ref: refs/heads/main\n"),
      picked("demo/.git/refs/heads/main", "abc\n"),
    ]);
    expect(await tree.list("")).toEqual([".git"]);
    expect(await tree.list(".git")).toEqual(["HEAD", "refs"]);
    expect(await tree.stat(".git/refs")).toMatchObject({ type: "directory" });
    expect(await tree.stat(".git/HEAD")).toMatchObject({ type: "file", size: 21 });
    expect(decode(await tree.read(".git/refs/heads/main"))).toBe("abc\n");
    expect(await tree.read("README.md")).toBeNull();
    expect(await tree.stat("README.md")).toBeNull();
  });

  it("reads a picked .git folder as the Git directory itself", async () => {
    const tree = treeFromFiles([picked(".git/HEAD", "ref: refs/heads/main\n")]);
    expect(await tree.list("")).toEqual(["HEAD"]);
    expect(await tree.read(".git")).toBeNull();
  });
});

describe("treeFromDirectoryHandle", () => {
  const tree = treeFromDirectoryHandle(
    fakeHandle("demo", {
      "README.md": "# Demo",
      ".git": { HEAD: "ref: refs/heads/main\n", refs: { heads: { main: "abc\n" } } },
    }),
  );

  it("tells files from folders and reads them", async () => {
    expect(await tree.stat("")).toMatchObject({ type: "directory" });
    expect(await tree.stat(".git/refs/heads")).toMatchObject({ type: "directory" });
    expect(await tree.stat(".git/HEAD")).toMatchObject({ type: "file", size: 21 });
    expect(decode(await tree.read("/.git/refs/heads/main"))).toBe("abc\n");
    expect(await tree.list(".git")).toEqual(["HEAD", "refs"]);
  });

  it("answers null for anything that is not there or not of that kind", async () => {
    expect(await tree.stat(".git/missing")).toBeNull();
    expect(await tree.list(".git/HEAD")).toBeNull();
    expect(await tree.read(".git/refs")).toBeNull();
    expect(await tree.read("nope/at/all")).toBeNull();
  });
});
