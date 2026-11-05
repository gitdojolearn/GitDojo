import { type CommitState, type RepositoryState } from "@gitdojo/shared-types";
import { type Edge, type Node } from "@xyflow/react";
import { assignLanes, laneColor, tipsInLaneOrder } from "./lanes";
import { type CommitGhost, type RefKey, type RepositoryTransition } from "./transitions";

export const COMMIT_ROW_HEIGHT = 76;
/** Space above each commit card for its branch / HEAD labels. */
export const LABEL_ROW_HEIGHT = 26;
export const COMMIT_CARD_HEIGHT = 44;
export const COMMIT_CARD_WIDTH = 232;
export const LANE_WIDTH = 22;
/** Left edge to the centre of lane 0. */
export const RAIL_PADDING = 12;
/** Vertical centre of the commit dot inside a node; edges attach here. */
export const COMMIT_DOT_CENTER_Y = LABEL_ROW_HEIGHT + COMMIT_CARD_HEIGHT / 2;

export function laneCenterX(lane: number): number {
  return RAIL_PADDING + lane * LANE_WIDTH;
}

export interface CommitNodeData extends Record<string, unknown> {
  commit: CommitState;
  /** HEAD points at this commit (through a branch, or detached). */
  isHead: boolean;
  /** HEAD's branch, when HEAD is attached to one. */
  currentBranch: string | null;
  branches: string[];
  /** Tags naming this commit. */
  tags: string[];
  /** Remote-tracking branches (`origin/main`) at this commit. */
  remoteBranches: string[];
  selected: boolean;
  /** Created by the latest command: it pops into the graph. */
  fresh: boolean;
  /**
   * Labels that just arrived at this commit. A number is how far (in px, up is negative) the
   * label was before, so it glides from there; `"new"` is a label that did not exist.
   */
  refMotion: Partial<Record<RefKey, number | "new">>;
  /** The commit this one replaced or copied, with how far away a copy's original is (px). */
  ghost: (CommitGhost & { fromY: number }) | null;
  lane: number;
  /** Width of the lane rail; commit cards start after it so they line up. */
  railWidth: number;
  /** Has more than one parent. */
  isMerge: boolean;
}

export type CommitFlowNode = Node<CommitNodeData, "commit">;

export interface CommitGraph {
  nodes: CommitFlowNode[];
  edges: Edge[];
  laneCount: number;
}

/**
 * Vertical graph of every commit on every branch: newest on top, one row per commit, one lane
 * (column) per line of work, and edges from each commit to its parents.
 */
export function buildCommitGraph(
  state: RepositoryState,
  selectedOid: string | null,
  /** What the latest command did; omit it (or pass `null`) for a still graph. */
  transition: RepositoryTransition | null = null,
): CommitGraph {
  const commits = state.allCommits;
  const { lanes, laneCount } = assignLanes(
    commits.map((commit) => ({ id: commit.oid, parents: commit.parents })),
    tipsInLaneOrder(
      [
        ...state.branches.map((branch) => ({ name: branch.name, target: branch.oid })),
        // After the local branches, so `origin/main` shares main's lane when they agree.
        ...state.remoteBranches.map((ref) => ({ name: ref.name, target: ref.oid })),
      ],
      state.head,
    ),
  );
  const railWidth = laneCenterX(Math.max(laneCount, 1) - 1) + RAIL_PADDING;
  const laneOf = (oid: string) => lanes.get(oid) ?? 0;
  const rows = new Map(commits.map((commit, index) => [commit.oid, index]));
  /** How far above (negative) or below `oid`'s row the row of `from` is, in px. */
  const offset = (from: string, oid: string) => {
    const was = rows.get(from);
    const now = rows.get(oid);
    return was === undefined || now === undefined ? null : (was - now) * COMMIT_ROW_HEIGHT;
  };
  const motionAt = (oid: string, keys: RefKey[]) => {
    const motion: Partial<Record<RefKey, number | "new">> = {};
    if (!transition) return motion;
    for (const key of keys) {
      if (transition.newRefs.has(key)) motion[key] = "new";
      const from = transition.movedRefs.get(key);
      const distance = from === undefined ? null : offset(from, oid);
      // A label whose old commit left the graph (amend) has no path to travel: the ghost shows it.
      if (distance !== null && distance !== 0) motion[key] = distance;
    }
    return motion;
  };
  const ghostAt = (oid: string) => {
    const ghost = transition?.ghosts.get(oid);
    if (!ghost) return null;
    return { ...ghost, fromY: ghost.from === undefined ? 0 : (offset(ghost.from, oid) ?? 0) };
  };

  const nodes: CommitFlowNode[] = commits.map((commit, index) => {
    const branches = state.branches
      .filter((branch) => branch.oid === commit.oid)
      .map((branch) => branch.name);
    const tags = state.tags.filter((tag) => tag.oid === commit.oid).map((tag) => tag.name);
    const remoteBranches = state.remoteBranches
      .filter((ref) => ref.oid === commit.oid)
      .map((ref) => ref.name);
    const isHead = commit.oid === state.head;
    return {
      id: commit.oid,
      type: "commit",
      position: { x: 0, y: index * COMMIT_ROW_HEIGHT },
      draggable: false,
      selectable: false,
      data: {
        commit,
        isHead,
        currentBranch: state.currentBranch,
        branches,
        tags,
        remoteBranches,
        selected: commit.oid === selectedOid,
        fresh: transition?.freshCommits.has(commit.oid) ?? false,
        refMotion: motionAt(commit.oid, [
          ...(isHead ? (["head"] as const) : []),
          ...branches.map((name) => `branch:${name}` as const),
          ...tags.map((name) => `tag:${name}` as const),
          ...remoteBranches.map((name) => `remote:${name}` as const),
        ]),
        ghost: ghostAt(commit.oid),
        lane: laneOf(commit.oid),
        railWidth,
        isMerge: commit.parents.length > 1,
      },
    };
  });

  const known = new Set(commits.map((commit) => commit.oid));
  const edges: Edge[] = commits.flatMap((commit) =>
    commit.parents
      .filter((parent) => known.has(parent))
      .map((parent, index) => {
        const merge = index > 0;
        return {
          id: `${commit.oid}->${parent}`,
          source: commit.oid,
          target: parent,
          type: "lane",
          data: {
            bend: merge ? "child" : "parent",
            // New links draw themselves in; a merge's second parent reaches over just after.
            fresh: transition?.freshCommits.has(commit.oid) ?? false,
            delay: merge ? 150 : 0,
          },
          // A line takes the color of the branch it belongs to: the child's lane for first
          // parents, the incoming branch's lane for merges.
          style: { stroke: laneColor(laneOf(merge ? parent : commit.oid)), strokeWidth: 2 },
        };
      }),
  );

  return { nodes, edges, laneCount };
}
