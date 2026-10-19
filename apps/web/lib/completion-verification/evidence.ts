import "server-only";

import { createHash } from "node:crypto";
import {
  type AssessmentGitObject,
  type CommitState,
  type CompletionAttemptBinding,
  type CompletionEvidence,
  type FileState,
  type LessonDefinition,
  type LessonValidationResult,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { validateLesson } from "@gitdojo/validator";

export interface CompletionAttemptRecord extends CompletionAttemptBinding {
  userId: string;
  usedAt: Date | null;
  evidenceHash: string | null;
}

const OID = /^[0-9a-f]{40}$/;
const MAX_OBJECTS = 1024;
const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 2048;
const MAX_WORKTREE_BYTES = 2 * 1024 * 1024;
const REF_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

interface ObjectRecord {
  type: AssessmentGitObject["type"];
  bytes: Buffer;
}

interface ParsedCommit {
  oid: string;
  tree: string;
  parents: string[];
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
}

export interface CompletionVerification {
  evidenceHash: string;
  result: LessonValidationResult;
  repository: RepositoryState;
}

function canonicalOid(type: AssessmentGitObject["type"], bytes: Buffer): string {
  return createHash("sha1")
    .update(`${type} ${String(bytes.length)}\0`)
    .update(bytes)
    .digest("hex");
}

function checkedObjects(objectsInput: unknown): Map<string, ObjectRecord> {
  if (!Array.isArray(objectsInput) || objectsInput.length > MAX_OBJECTS)
    throw new Error("invalid object count");
  let total = 0;
  const objects = new Map<string, ObjectRecord>();
  for (const input of objectsInput) {
    if (!input || typeof input !== "object") throw new Error("invalid object");
    const object = input as Record<string, unknown>;
    if (
      typeof object.oid !== "string" ||
      !OID.test(object.oid) ||
      (object.type !== "blob" && object.type !== "tree" && object.type !== "commit") ||
      typeof object.content !== "string"
    )
      throw new Error("invalid object metadata");
    const bytes = Buffer.from(object.content, "base64");
    total += bytes.length;
    if (total > MAX_OBJECT_BYTES || canonicalOid(object.type, bytes) !== object.oid)
      throw new Error("altered object");
    if (objects.has(object.oid)) throw new Error("duplicate object");
    objects.set(object.oid, { type: object.type, bytes });
  }
  return objects;
}

function safePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 500 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === ".." || part === ".git")
  );
}

function treeEntries(object: ObjectRecord): { name: string; oid: string; tree: boolean }[] {
  if (object.type !== "tree") throw new Error("expected tree");
  const entries: { name: string; oid: string; tree: boolean }[] = [];
  let offset = 0;
  while (offset < object.bytes.length) {
    const space = object.bytes.indexOf(0x20, offset);
    const nul = object.bytes.indexOf(0, space + 1);
    if (space < 0 || nul < 0 || nul + 21 > object.bytes.length) throw new Error("invalid tree");
    const mode = object.bytes.toString("ascii", offset, space);
    const name = object.bytes.toString("utf8", space + 1, nul);
    if (!safePath(name) || name.includes("/")) throw new Error("invalid tree path");
    const oid = object.bytes.subarray(nul + 1, nul + 21).toString("hex");
    entries.push({ name, oid, tree: mode === "40000" || mode === "040000" });
    offset = nul + 21;
  }
  return entries;
}

function filesAt(
  objects: ReadonlyMap<string, ObjectRecord>,
  tree: string,
  prefix = "",
  depth = 0,
): Map<string, string> {
  if (depth > 24) throw new Error("tree too deep");
  const object = objects.get(tree);
  if (!object) throw new Error("missing tree");
  const files = new Map<string, string>();
  for (const entry of treeEntries(object)) {
    const child = objects.get(entry.oid);
    if (!child) throw new Error("missing tree object");
    const path = `${prefix}${entry.name}`;
    if (entry.tree) {
      for (const [name, oid] of filesAt(objects, entry.oid, `${path}/`, depth + 1))
        files.set(name, oid);
    } else {
      if (child.type !== "blob") throw new Error("tree entry is not a blob");
      files.set(path, entry.oid);
    }
  }
  return files;
}

function parseCommit(oid: string, object: ObjectRecord): ParsedCommit {
  if (object.type !== "commit") throw new Error("expected commit");
  const text = object.bytes.toString("utf8");
  const split = text.indexOf("\n\n");
  if (split < 0) throw new Error("invalid commit");
  const headers = text.slice(0, split).split("\n");
  const tree = headers.find((line) => line.startsWith("tree "))?.slice(5);
  const parents = headers.filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
  const author = headers.find((line) => line.startsWith("author "))?.slice(7) ?? "";
  const match = /^(.*) <([^<>]*)> (\d+) [+-]\d{4}$/.exec(author);
  if (!tree || !OID.test(tree) || parents.some((parent) => !OID.test(parent)) || !match)
    throw new Error("invalid commit links");
  return {
    oid,
    tree,
    parents,
    message: text.slice(split + 2).trim(),
    authorName: match[1] ?? "",
    authorEmail: match[2] ?? "",
    timestamp: Number(match[3]),
  };
}

function changedPaths(
  commit: ParsedCommit,
  commits: ReadonlyMap<string, ParsedCommit>,
  objects: ReadonlyMap<string, ObjectRecord>,
): string[] {
  const current = filesAt(objects, commit.tree);
  const parent = commit.parents[0] ? commits.get(commit.parents[0]) : undefined;
  const before = parent ? filesAt(objects, parent.tree) : new Map<string, string>();
  return [...new Set([...current.keys(), ...before.keys()])]
    .filter((path) => current.get(path) !== before.get(path))
    .sort();
}

function reachable(start: readonly string[], commits: ReadonlyMap<string, ParsedCommit>): string[] {
  const pending = [...start];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const oid = pending.pop();
    if (!oid || seen.has(oid)) continue;
    const commit = commits.get(oid);
    if (!commit) throw new Error("missing commit");
    seen.add(oid);
    pending.push(...commit.parents);
  }
  return [...seen].sort(
    (a, b) => (commits.get(b)?.timestamp ?? 0) - (commits.get(a)?.timestamp ?? 0),
  );
}

function validRefOid(value: string | null, commits: ReadonlyMap<string, ParsedCommit>): void {
  if (value !== null && (!OID.test(value) || !commits.has(value))) throw new Error("invalid ref");
}

function ignoredPath(path: string, worktree: ReadonlyMap<string, { content: string }>): boolean {
  const source = worktree.get(".gitignore")?.content;
  if (!source) return false;
  let ignored = false;
  for (const raw of source.split(/\r?\n/)) {
    let pattern = raw.trim();
    if (!pattern || pattern.startsWith("#")) continue;
    const negated = pattern.startsWith("!");
    if (negated) pattern = pattern.slice(1);
    if (pattern.startsWith("/")) pattern = pattern.slice(1);
    const matches = pattern.endsWith("/")
      ? path.startsWith(pattern)
      : pattern.startsWith("*.")
        ? path.endsWith(pattern.slice(1))
        : path === pattern || path.endsWith(`/${pattern}`);
    if (matches) ignored = !negated;
  }
  return ignored;
}

interface RepositoryEvidenceSnapshot {
  state: CompletionEvidence["state"];
  index: CompletionEvidence["index"];
  workingTree: CompletionEvidence["workingTree"];
}

function repositoryFrom(
  evidence: RepositoryEvidenceSnapshot,
  objects: ReadonlyMap<string, ObjectRecord>,
): RepositoryState {
  const claim = (evidence as Partial<CompletionEvidence>).state;
  if (!claim || typeof claim !== "object") throw new Error("missing repository state");
  const commits = new Map<string, ParsedCommit>();
  for (const [oid, object] of objects) {
    if (object.type === "commit") commits.set(oid, parseCommit(oid, object));
  }
  validRefOid(claim.head, commits);
  if (claim.currentBranch !== null && !REF_NAME.test(claim.currentBranch))
    throw new Error("invalid current branch");
  for (const branch of claim.branches) {
    if (!REF_NAME.test(branch.name)) throw new Error("invalid branch");
    validRefOid(branch.oid, commits);
    if (branch.current !== (branch.name === claim.currentBranch))
      throw new Error("invalid branch state");
    if (branch.current && branch.oid !== claim.head) throw new Error("HEAD mismatch");
  }
  if (claim.currentBranch !== null && !claim.branches.some((branch) => branch.current))
    throw new Error("missing current branch");

  const index = new Map<string, string>();
  if (!Array.isArray(evidence.index) || evidence.index.length > MAX_FILES)
    throw new Error("invalid index");
  for (const entry of evidence.index) {
    if (!safePath(entry.path) || entry.stage !== 0 || !OID.test(entry.oid) || index.has(entry.path))
      throw new Error("invalid index entry");
    if (objects.get(entry.oid)?.type !== "blob") throw new Error("missing index blob");
    index.set(entry.path, entry.oid);
  }
  const worktree = new Map<string, { oid: string; content: string }>();
  if (!Array.isArray(evidence.workingTree) || evidence.workingTree.length > MAX_FILES)
    throw new Error("invalid working tree");
  let workingBytes = 0;
  for (const entry of evidence.workingTree) {
    if (!safePath(entry.path) || !OID.test(entry.oid) || worktree.has(entry.path))
      throw new Error("invalid working-tree entry");
    const bytes = Buffer.from(entry.content, "base64");
    workingBytes += bytes.length;
    if (workingBytes > MAX_WORKTREE_BYTES || canonicalOid("blob", bytes) !== entry.oid)
      throw new Error("altered working-tree file");
    worktree.set(entry.path, { oid: entry.oid, content: bytes.toString("utf8") });
  }
  const headCommit = claim.head ? commits.get(claim.head) : undefined;
  const headFiles = headCommit ? filesAt(objects, headCommit.tree) : new Map<string, string>();
  const paths = [...new Set([...headFiles.keys(), ...index.keys(), ...worktree.keys()])].sort();
  const unresolved = new Set(
    claim.conflicts.filter((item) => !item.resolved).map((item) => item.path),
  );
  const files: FileState[] = [];
  const stagedFiles: FileState[] = [];
  for (const path of paths) {
    const head = headFiles.get(path);
    const staged = index.get(path);
    const working = worktree.get(path);
    if (head !== staged) {
      stagedFiles.push({
        path,
        status: "staged",
        change: head === undefined ? "added" : staged === undefined ? "deleted" : "modified",
      });
    }
    if (unresolved.has(path)) {
      files.push({ path, status: "conflicted", ...(working ? { content: working.content } : {}) });
    } else if (!working) {
      if (staged !== undefined) files.push({ path, status: "deleted" });
    } else if (staged === undefined) {
      files.push({
        path,
        status: ignoredPath(path, worktree) ? "ignored" : "untracked",
        content: working.content,
      });
    } else if (working.oid !== staged) {
      files.push({ path, status: "modified", content: working.content });
    } else {
      files.push({
        path,
        status: head === staged ? "committed" : "staged",
        content: working.content,
      });
    }
  }

  const toCommitState = (oid: string): CommitState => {
    const commit = commits.get(oid);
    if (!commit) throw new Error("missing commit");
    return {
      oid,
      shortOid: oid.slice(0, 7),
      message: commit.message,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      timestamp: commit.timestamp,
      parents: commit.parents,
      changedPaths: changedPaths(commit, commits, objects),
    };
  };
  const allRoots = [
    claim.head,
    ...claim.branches.map((item) => item.oid),
    ...claim.tags.map((item) => item.oid),
    ...claim.remoteBranches.map((item) => item.oid),
  ].filter((oid): oid is string => oid !== null);
  const headHistory = claim.head ? reachable([claim.head], commits).map(toCommitState) : [];
  const allCommits = allRoots.length > 0 ? reachable(allRoots, commits).map(toCommitState) : [];

  for (const tag of claim.tags) {
    if (!REF_NAME.test(tag.name)) throw new Error("invalid tag");
    validRefOid(tag.oid, commits);
  }
  for (const remote of claim.remotes) {
    if (!REF_NAME.test(remote.name) || remote.url.length > 500) throw new Error("invalid remote");
    for (const branch of remote.branches) validRefOid(branch.oid, commits);
  }
  for (const branch of claim.remoteBranches) validRefOid(branch.oid, commits);
  for (const entry of claim.reflog) validRefOid(entry.oid, commits);
  for (const stash of claim.stashes) if (!OID.test(stash.oid)) throw new Error("invalid stash");
  if (claim.merge) validRefOid(claim.merge.oid, commits);

  return {
    initialized: claim.initialized,
    currentBranch: claim.currentBranch,
    head: claim.head,
    branches: claim.branches,
    commits: headHistory,
    allCommits,
    files,
    stagedFiles,
    conflicts: claim.conflicts,
    merge: claim.merge,
    stashes: claim.stashes,
    reflog: claim.reflog,
    tags: claim.tags,
    remotes: claim.remotes,
    remoteBranches: claim.remoteBranches,
    editor: claim.editor,
  };
}

function evidenceDigest(evidence: CompletionEvidence): string {
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

/** Verify all hashes and attempt metadata, rebuild repository state, then run shared objectives. */
export async function verifyCompletionEvidence(
  input: unknown,
  attempt: CompletionAttemptRecord,
  lesson: LessonDefinition,
): Promise<CompletionVerification> {
  if (!input || typeof input !== "object") throw new Error("invalid evidence");
  const candidate = input as Partial<CompletionEvidence>;
  if (
    candidate.format !== "gitdojo-completion-evidence" ||
    candidate.version !== 1 ||
    candidate.attemptId !== attempt.id ||
    candidate.contentVersion !== attempt.contentVersion ||
    candidate.binding?.id !== attempt.id ||
    candidate.binding.nonce !== attempt.nonce ||
    candidate.binding.kind !== attempt.kind ||
    candidate.binding.contentId !== attempt.contentId ||
    candidate.binding.contentVersion !== attempt.contentVersion
  )
    throw new Error("attempt binding mismatch");
  const evidence = candidate as CompletionEvidence;
  const digest = evidenceDigest(evidence);
  if (attempt.usedAt && attempt.evidenceHash !== digest)
    throw new Error("completion attempt was already used");
  const objects = checkedObjects(evidence.objects);
  const repository = repositoryFrom(evidence, objects);
  const finalResult = await validateLesson(lesson, { repository });
  const passed = new Map(
    finalResult.objectives
      .filter((result) => result.passed)
      .map((result) => [result.objectiveId, result]),
  );
  const checkpoints = evidence.checkpoints ?? [];
  if (checkpoints.length > lesson.objectives.length) throw new Error("too many checkpoints");
  const checkpointIds = new Set<string>();
  for (const checkpoint of checkpoints) {
    if (checkpointIds.has(checkpoint.objectiveId)) throw new Error("duplicate checkpoint");
    checkpointIds.add(checkpoint.objectiveId);
    if (!lesson.objectives.some((objective) => objective.id === checkpoint.objectiveId))
      throw new Error("unknown checkpoint objective");
    const checked = await validateLesson(lesson, {
      repository: repositoryFrom(checkpoint, objects),
    });
    const result = checked.objectives.find(
      (candidate) => candidate.objectiveId === checkpoint.objectiveId,
    );
    if (!result?.passed) throw new Error("invalid objective checkpoint");
    passed.set(checkpoint.objectiveId, result);
  }
  const objectives = finalResult.objectives.map(
    (result) => passed.get(result.objectiveId) ?? result,
  );
  const passedCount = objectives.filter((result) => result.passed).length;
  const result: LessonValidationResult = {
    lessonId: lesson.id,
    objectives,
    passedCount,
    totalCount: objectives.length,
    completed: passedCount === objectives.length,
  };
  if (!result.completed) throw new Error("objectives not complete");
  return { evidenceHash: digest, result, repository };
}
