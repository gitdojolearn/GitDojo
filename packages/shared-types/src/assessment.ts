import { type RepositoryState } from "./repository";

export const CAPSTONE_KEY = "git-skills-capstone";
export const CAPSTONE_RUBRIC_VERSION = 1;

export type GitObjectType = "blob" | "tree" | "commit";

/** Canonical, decompressed Git object bytes. The server verifies every oid before grading. */
export interface AssessmentGitObject {
  oid: string;
  type: GitObjectType;
  content: string;
}

export interface AssessmentEvidence {
  format: "gitdojo-assessment-evidence";
  version: 1;
  attemptId: string;
  head: string;
  /** Reflog tips preserve a reset-away mistake so recovery can be graded. */
  reflog: string[];
  objects: AssessmentGitObject[];
}

export interface AssessmentCriterionResult {
  id: "attempt" | "commits" | "branching" | "conflict" | "recovery";
  passed: boolean;
  feedback: string;
}

export interface AssessmentGrade {
  passed: boolean;
  rubricVersion: number;
  criteria: AssessmentCriterionResult[];
}

export type CompletionKind = "lesson" | "challenge" | "practice";

/** Server-created identity for one hands-on content attempt. */
export interface CompletionAttemptBinding {
  id: string;
  nonce: string;
  kind: CompletionKind;
  contentId: string;
  contentVersion: string;
}

export interface CompletionIndexEntry {
  path: string;
  mode: number;
  oid: string;
  /** Git index stage. Normal entries use 0; unresolved conflicts use 1–3. */
  stage: 0 | 1 | 2 | 3;
}

export interface CompletionWorkingTreeEntry {
  path: string;
  mode: number;
  /** Canonical Git blob id for `content`; independently recomputed by the server. */
  oid: string;
  content: string;
}

export interface CompletionEvidenceCheckpoint {
  objectiveId: string;
  state: RepositoryState;
  index: CompletionIndexEntry[];
  workingTree: CompletionWorkingTreeEntry[];
}

/**
 * Complete repository evidence for replaying lesson objectives on the server. The normalized
 * state is a claim, not trusted input: the server rebuilds and cross-checks it from the canonical
 * objects, index, worktree and refs before passing it to `@gitdojo/validator`.
 */
export interface CompletionEvidence {
  format: "gitdojo-completion-evidence";
  version: 1;
  attemptId: string;
  contentVersion: string;
  binding: CompletionAttemptBinding;
  state: RepositoryState;
  index: CompletionIndexEntry[];
  workingTree: CompletionWorkingTreeEntry[];
  /** First server-replayable state where each sticky lesson objective passed. */
  checkpoints?: CompletionEvidenceCheckpoint[];
  objects: AssessmentGitObject[];
}
