import { type CommitState } from "@gitdojo/shared-types";

export interface Ancestry {
  /** True when `ancestor` is `oid` or one of its ancestors, among the commits read. */
  contains(oid: string, ancestor: string): boolean;
  /** The commits read, by oid. */
  commit(oid: string): CommitState | undefined;
}

/** Ancestry questions over the commits the explorer read; each tip's history is walked once. */
export function createAncestry(commits: readonly CommitState[]): Ancestry {
  const byOid = new Map(commits.map((commit) => [commit.oid, commit]));
  const reachable = new Map<string, Set<string>>();

  const from = (tip: string): Set<string> => {
    const cached = reachable.get(tip);
    if (cached) return cached;
    const reached = new Set<string>();
    const pending = [tip];
    for (let oid = pending.pop(); oid !== undefined; oid = pending.pop()) {
      if (reached.has(oid)) continue;
      reached.add(oid);
      pending.push(...(byOid.get(oid)?.parents ?? []));
    }
    reachable.set(tip, reached);
    return reached;
  };

  return {
    contains: (oid, ancestor) => from(oid).has(ancestor),
    commit: (oid) => byOid.get(oid),
  };
}

export const short = (oid: string) => oid.slice(0, 7);

export const subjectOf = (message: string) => message.split("\n")[0] ?? "";
