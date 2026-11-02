import { ensureDirectory } from "./fs-helpers";
import { type GitDojoFs } from "./types";

type Promises = GitDojoFs["promises"];

/** `cp -R source/. target`: copies a directory's contents, merging into `target`. */
export async function copyDirectory(fs: Promises, source: string, target: string): Promise<void> {
  await ensureDirectory(fs, target);
  for (const name of await fs.readdir(source)) {
    const from = `${source}/${name}`;
    const to = `${target}/${name}`;
    if ((await fs.lstat(from)).isDirectory()) {
      await copyDirectory(fs, from, to);
    } else {
      await fs.writeFile(to, await fs.readFile(from));
    }
  }
}
