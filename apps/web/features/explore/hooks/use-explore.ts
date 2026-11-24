"use client";

import { type ReadOnlyTree } from "@gitdojo/git-engine";
import { useCallback, useEffect } from "react";
import { useRepositoryStore } from "@/features/repository";
import { pickDirectory, treeFromFiles } from "../services/folder-tree";
import { loadErrorMessage, loadRepository } from "../services/load-repository";
import { buildTimeline } from "../services/timeline";
import { type CommitDiffState, useExploreStore } from "../state/use-explore-store";

type Picked = { name: string; tree: ReadOnlyTree } | null;

async function open(pick: () => Promise<Picked>): Promise<void> {
  const { start, fail, load } = useExploreStore.getState();
  let picked: Picked;
  try {
    picked = await pick();
  } catch (error) {
    fail(loadErrorMessage(error));
    return;
  }
  // Cancelled: leave whatever is open as it is.
  if (picked === null) return;
  start();
  try {
    const repository = await loadRepository(picked.name, picked.tree);
    const graph = useRepositoryStore.getState();
    graph.setWorkspace("explore");
    graph.setRepositoryState(repository.state);
    load(repository, buildTimeline(repository.state, repository.truncated));
  } catch (error) {
    console.error(error);
    fail(loadErrorMessage(error));
  }
}

/** Opens a repository from the browser's folder picker, or from a directory `<input>`'s files. */
export function useOpenRepository() {
  const openPicked = useCallback(() => open(pickDirectory), []);
  const openFiles = useCallback(
    (files: readonly File[]) =>
      open(() => {
        const first = files[0];
        if (first === undefined) return Promise.resolve(null);
        const name = first.webkitRelativePath.split("/")[0] || "repository";
        return Promise.resolve({ name, tree: treeFromFiles(files) });
      }),
    [],
  );
  return { openPicked, openFiles };
}

/** The selected commit's diff, read the first time it is asked for. */
export function useCommitDiff(oid: string | null): CommitDiffState | null {
  const repository = useExploreStore((state) => state.repository);
  const diff = useExploreStore((state) => (oid === null ? undefined : state.diffs[oid]));

  useEffect(() => {
    if (oid === null || repository === null || diff !== undefined) return;
    const { setDiff } = useExploreStore.getState();
    setDiff(oid, { status: "loading" });
    repository.readCommitDiff(oid).then(
      (result) => {
        // Another repository may have been opened meanwhile.
        if (useExploreStore.getState().repository === repository) {
          setDiff(oid, { status: "ready", diff: result });
        }
      },
      (error: unknown) => {
        console.error(error);
        if (useExploreStore.getState().repository === repository) {
          setDiff(oid, { status: "error" });
        }
      },
    );
  }, [oid, repository, diff]);

  return diff ?? null;
}
