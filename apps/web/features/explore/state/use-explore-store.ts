import { type ExternalCommitDiff } from "@gitdojo/git-engine";
import { create } from "zustand";
import { type LoadedRepository } from "../services/load-repository";
import { type TimelineEvent } from "../services/timeline";

export type CommitDiffState =
  { status: "loading" } | { status: "ready"; diff: ExternalCommitDiff } | { status: "error" };

interface ExploreStore {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  repository: LoadedRepository | null;
  timeline: TimelineEvent[];
  /** Diffs read so far for this repository, by commit. */
  diffs: Record<string, CommitDiffState>;
  start: () => void;
  fail: (error: string) => void;
  load: (repository: LoadedRepository, timeline: TimelineEvent[]) => void;
  setDiff: (oid: string, diff: CommitDiffState) => void;
}

/**
 * The repository being explored. It lives in memory only: nothing about it is saved, so closing
 * the tab forgets it. The graph reads its state from the repository feature's store.
 */
export const useExploreStore = create<ExploreStore>()((set) => ({
  status: "idle",
  error: null,
  repository: null,
  timeline: [],
  diffs: {},
  start: () => {
    set({ status: "loading", error: null });
  },
  fail: (error) => {
    // A failed pick keeps the repository already open, if any.
    set((current) => ({ status: current.repository ? "ready" : "error", error }));
  },
  load: (repository, timeline) => {
    set({ status: "ready", error: null, repository, timeline, diffs: {} });
  },
  setDiff: (oid, diff) => {
    set((current) => ({ diffs: { ...current.diffs, [oid]: diff } }));
  },
}));
