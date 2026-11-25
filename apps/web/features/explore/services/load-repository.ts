import {
  type ExternalCommitDiff,
  ExternalRepository,
  ExternalRepositoryError,
  type ReadOnlyTree,
} from "@gitdojo/git-engine";
import { toRepositoryState } from "@gitdojo/repository-state";
import { type RepositoryState } from "@gitdojo/shared-types";

export interface LoadedRepository {
  /** The picked folder's name. */
  name: string;
  state: RepositoryState;
  /** Older commits exist than the graph shows. */
  truncated: boolean;
  readCommitDiff(oid: string): Promise<ExternalCommitDiff>;
}

/** Why a folder could not be opened, in words a learner can act on. */
export function loadErrorMessage(error: unknown): string {
  if (error instanceof ExternalRepositoryError) return error.message;
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "The browser did not allow GitDojo to read that folder. Try again and allow access.";
  }
  return "GitDojo could not read this repository. It may use a Git feature the explorer does not support yet.";
}

/**
 * Reads a repository from the learner's computer, in place: nothing is copied, stored or uploaded,
 * and every write is refused.
 */
export async function loadRepository(name: string, tree: ReadOnlyTree): Promise<LoadedRepository> {
  const repository = await ExternalRepository.open(tree);
  const { snapshot, truncated } = await repository.readHistory();
  return {
    name,
    state: toRepositoryState(snapshot),
    truncated,
    readCommitDiff: (oid) => repository.readCommitDiff(oid),
  };
}
