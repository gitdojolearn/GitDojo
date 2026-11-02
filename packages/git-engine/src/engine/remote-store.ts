import git from "isomorphic-git";
import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";
import { type GitRemoteInfo } from "./git-engine";

/**
 * GitDojo's remotes are simulated, so nothing ever leaves the browser. A remote is:
 *
 * - a normal `[remote "<name>"]` entry in `.git/config` (so `git remote -v` works as usual), and
 * - the branches its pretend server has, kept in `.git/GITDOJO_REMOTES.json`.
 *
 * The server shares the workspace's object database: commits pushed "to the server" are already
 * stored locally, and commits "only on the server" are stored but reachable from no local ref.
 * That is invisible to the learner, because only refs decide what history Git shows: until a
 * `git fetch` moves `origin/main`, nothing in the repository reaches the server's new commits.
 */
interface ServerRecord {
  /** Branch name → commit. */
  branches: Record<string, string>;
  /** Tag name → the tag object for an annotated tag, else the commit. Absent in older records. */
  tags?: Record<string, string>;
}

interface RemoteStoreRecord {
  /** Simulated servers by URL, so several remotes (or a renamed one) can share a server. */
  servers?: Record<string, ServerRecord>;
  /** Older records: servers by remote name. Moved into `servers` the next time one changes. */
  remotes?: Record<string, ServerRecord>;
}

const STORE_FILE = "GITDOJO_REMOTES.json";

/** The URL scheme makes the simulation boundary obvious in every `git remote -v` and fetch. */
export function simulatedRemoteUrl(name: string): string {
  return `gitdojo://simulated/${name}.git`;
}

/** `origin` for `gitdojo://simulated/origin.git`; `null` for any other URL. */
export function simulatedServerName(url: string): string | null {
  const match = /^gitdojo:\/\/simulated\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})(?:\.git)?\/?$/.exec(url);
  return match?.[1] ?? null;
}

function storePath(ctx: GitContext): string {
  return `${ctx.dir}/.git/${STORE_FILE}`;
}

async function readStore(ctx: GitContext): Promise<RemoteStoreRecord> {
  try {
    const raw = await ctx.fs.promises.readFile(storePath(ctx), { encoding: "utf8" });
    return JSON.parse(
      typeof raw === "string" ? raw : new TextDecoder().decode(raw),
    ) as RemoteStoreRecord;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return {};
    throw error;
  }
}

async function writeStore(ctx: GitContext, store: RemoteStoreRecord): Promise<void> {
  await ctx.fs.promises.writeFile(storePath(ctx), JSON.stringify(store), "utf8");
}

/** A copy of `record` without `key`. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

function byName(entries: Record<string, string> | undefined): { name: string; oid: string }[] {
  return Object.entries(entries ?? {})
    .map(([name, oid]) => ({ name, oid }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function serverOf(store: RemoteStoreRecord, remote: string, url: string): ServerRecord | undefined {
  return store.servers?.[url] ?? store.remotes?.[remote];
}

/**
 * Every configured remote with its server's branches and tags, sorted by name. A URL no server
 * has been created for yet is an empty repository: as if it had just been created on a host.
 */
export async function readRemotes(ctx: GitContext): Promise<GitRemoteInfo[]> {
  const [configured, store] = await Promise.all([
    git.listRemotes({ fs: ctx.fs, dir: ctx.dir }),
    readStore(ctx),
  ]);
  return configured
    .map(({ remote, url }) => {
      const server = serverOf(store, remote, url);
      return { name: remote, url, branches: byName(server?.branches), tags: byName(server?.tags) };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function findRemote(ctx: GitContext, name: string): Promise<GitRemoteInfo | null> {
  return (await readRemotes(ctx)).find((remote) => remote.name === name) ?? null;
}

/**
 * Moves servers still filed under their remote's name to their URL, so renaming or re-pointing
 * a remote can never lose one.
 */
export async function migrateRemoteStore(ctx: GitContext): Promise<void> {
  const store = await readStore(ctx);
  if (!store.remotes || Object.keys(store.remotes).length === 0) return;
  for (const { remote, url } of await git.listRemotes({ fs: ctx.fs, dir: ctx.dir })) {
    const legacy = store.remotes[remote];
    if (legacy === undefined) continue;
    (store.servers ??= {})[url] ??= legacy;
    store.remotes = without(store.remotes, remote);
  }
  await writeStore(ctx, store);
}

/** Changes the server that `remote` points at, creating it (empty) if it is new. */
async function updateServer(
  ctx: GitContext,
  remote: string,
  change: (server: ServerRecord) => void,
): Promise<void> {
  const url = (await git.listRemotes({ fs: ctx.fs, dir: ctx.dir })).find(
    (entry) => entry.remote === remote,
  )?.url;
  if (url === undefined) throw new Error(`no remote named ${remote}`);
  const store = await readStore(ctx);
  const server = serverOf(store, remote, url) ?? { branches: {} };
  change(server);
  (store.servers ??= {})[url] = server;
  if (store.remotes) store.remotes = without(store.remotes, remote);
  await writeStore(ctx, store);
}

/** Configures a remote; its server keeps whatever it already has (or starts empty). */
export async function addSimulatedRemote(ctx: GitContext, name: string, url: string) {
  await git.addRemote({ fs: ctx.fs, dir: ctx.dir, remote: name, url, force: true });
  await updateServer(ctx, name, () => undefined);
}

/** Moves, creates or (with `null`) deletes a branch on the simulated server. */
export async function writeRemoteBranch(
  ctx: GitContext,
  remote: string,
  branch: string,
  oid: string | null,
): Promise<void> {
  await updateServer(ctx, remote, (server) => {
    if (oid === null) server.branches = without(server.branches, branch);
    else server.branches[branch] = oid;
  });
}

/** Creates or moves a tag on the simulated server (`oid`: the tag object or the commit). */
export async function writeRemoteTag(
  ctx: GitContext,
  remote: string,
  tag: string,
  oid: string,
): Promise<void> {
  await updateServer(ctx, remote, (server) => {
    (server.tags ??= {})[tag] = oid;
  });
}

/**
 * Servers a lesson provides for `git clone`, before the workspace has a repository of its own:
 * a whole Git directory each, outside every workspace, so nothing a learner types can reach it.
 */
export const SERVERS_ROOT = "/gitdojo-servers";

export function stagedServerDir(workspaceId: string, name: string): string {
  return `${SERVERS_ROOT}/${workspaceId}/${name}.git`;
}
