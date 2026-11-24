/** Minimal commit shape for lane layout; works for real commits and hand-authored demo graphs. */
export interface LaneCommit {
  id: string;
  parents: readonly string[];
}

export interface LaneLayout {
  /** Commit id → lane (column), starting at 0. */
  lanes: Map<string, number>;
  laneCount: number;
}

/**
 * Assigns each commit a lane, git-graph style. Each tip (in priority order) claims its
 * first-parent chain down to the first commit already claimed, so the default branch keeps a
 * straight line in lane 0 and every branch with commits of its own gets one extra lane.
 * A branch pointing at a commit that is already claimed (e.g. just created) needs no lane.
 *
 * `compact` reuses a lane once the line of work in it has joined another, as `git log --graph`
 * does. A real repository's history holds many merged (and since deleted) branches; without it,
 * each would keep a lane of its own all the way down.
 *
 * `commits` must list children before parents.
 */
export function assignLanes(
  commits: readonly LaneCommit[],
  tips: readonly string[],
  { compact = false }: { compact?: boolean } = {},
): LaneLayout {
  const byId = new Map(commits.map((commit) => [commit.id, commit]));
  const rows = new Map(commits.map((commit, index) => [commit.id, index]));
  // A merge edge leaves the merge commit and runs down its other parent's lane from that row.
  const mergedAt = new Map<string, number>();
  for (const [index, commit] of commits.entries()) {
    for (const parent of commit.parents.slice(1)) {
      mergedAt.set(parent, Math.min(mergedAt.get(parent) ?? index, index));
    }
  }
  const lanes = new Map<string, number>();
  /** Rows each lane is drawn over, as `[first, last]` spans. */
  const spans: [number, number][][] = [];

  const claim = (tip: string) => {
    if (!byId.has(tip) || lanes.has(tip)) return;
    const chain: string[] = [];
    let id: string | undefined = tip;
    while (id !== undefined && byId.has(id) && !lanes.has(id)) {
      chain.push(id);
      id = byId.get(id)?.parents[0];
    }
    const rowOf = (commit: string) => rows.get(commit) ?? 0;
    const first = Math.min(
      ...chain.map((commit) => Math.min(rowOf(commit), mergedAt.get(commit) ?? Infinity)),
    );
    // The line runs on down to the commit it joins, if that one is in the graph.
    const last = id !== undefined && byId.has(id) ? rowOf(id) : rowOf(chain.at(-1) ?? tip);
    const free = compact
      ? spans.findIndex((taken) => taken.every(([start, end]) => first > end || last < start))
      : -1;
    const lane = free === -1 ? spans.length : free;
    if (lane === spans.length) spans.push([]);
    spans[lane]?.push([first, last]);
    for (const commit of chain) lanes.set(commit, lane);
  };

  for (const tip of tips) claim(tip);
  // Anything left (e.g. second parents of merges) gets its own lane.
  for (const commit of commits) claim(commit.id);
  return { lanes, laneCount: spans.length };
}

const DEFAULT_BRANCHES = ["main", "master"];

/**
 * Branch tips in lane priority order: the default branch first, then the others by name. The
 * order ignores which branch is checked out, so switching never reshuffles the graph.
 */
export function tipsInLaneOrder(
  branches: readonly { name: string; target: string | null }[],
  head: string | null,
): string[] {
  const rank = (name: string) => {
    const index = DEFAULT_BRANCHES.indexOf(name);
    return index === -1 ? DEFAULT_BRANCHES.length : index;
  };
  const ordered = [...branches].sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
  );
  const tips = ordered.map((branch) => branch.target).filter((target) => target !== null);
  return head === null ? tips : [...tips, head];
}

/** One color per lane. Lane 0 is neutral; branches use Git accents from docs/ui.md. */
export const LANE_COLORS = [
  "var(--text-muted)",
  "var(--accent-secondary)",
  "var(--purple)",
  "var(--success)",
  "var(--info)",
] as const;

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0];
}

/**
 * SVG path for an edge from a child commit down to its parent.
 *
 * - `"parent"` (first parents): stays in the child's lane and bends into the parent's lane just
 *   above the parent, so a branch visibly splits off where it started.
 * - `"child"` (merge parents): bends out of the child's lane right away and runs down the
 *   parent's lane, so a merge visibly joins at the merge commit.
 *
 * Either way the line never crosses the commits in between.
 */
export function laneEdgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rowHeight: number,
  bend: "parent" | "child" = "parent",
): string {
  const f = (value: number) => String(value);
  if (from.x === to.x) return `M ${f(from.x)} ${f(from.y)} L ${f(to.x)} ${f(to.y)}`;
  if (bend === "child") {
    const bendEnd = Math.min(to.y, from.y + rowHeight);
    const middle = (from.y + bendEnd) / 2;
    return [
      `M ${f(from.x)} ${f(from.y)}`,
      `C ${f(from.x)} ${f(middle)} ${f(to.x)} ${f(middle)} ${f(to.x)} ${f(bendEnd)}`,
      `L ${f(to.x)} ${f(to.y)}`,
    ].join(" ");
  }
  const bendStart = Math.max(from.y, to.y - rowHeight);
  const middle = (bendStart + to.y) / 2;
  return [
    `M ${f(from.x)} ${f(from.y)}`,
    `L ${f(from.x)} ${f(bendStart)}`,
    `C ${f(from.x)} ${f(middle)} ${f(to.x)} ${f(middle)} ${f(to.x)} ${f(to.y)}`,
  ].join(" ");
}

/** Accent for merge commits (docs/ui.md: merges are purple). */
export const MERGE_COLOR = "var(--purple)";
