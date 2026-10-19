// @vitest-environment node
import "fake-indexeddb/auto";

import {
  CHALLENGE_REFERENCE_SOLUTIONS,
  PRACTICE_REFERENCE_SOLUTIONS,
} from "@gitdojo/challenge-engine/testing";
import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { LESSON_REFERENCE_SOLUTIONS, type PlayStep } from "@gitdojo/lesson-engine/testing";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type CompletionKind, type LessonDefinition } from "@gitdojo/shared-types";
import { describe, expect, it, vi } from "vitest";
import { LearningSession } from "@/features/workspace/services/learning-session";
import { PracticeSession } from "@/features/workspace/services/practice-session";
import { loadCompletionContent } from "./content";
import { verifyCompletionEvidence, type CompletionAttemptRecord } from "./evidence";

vi.mock("server-only", () => ({}));

let sequence = 0;

function environment(): LessonEnvironment {
  const fs = createLightningFs(`server-replay-${String(sequence)}`, { wipe: true });
  const gitFor = (workspaceId: string) => createGitEngine({ fs, workspaceId });
  return {
    files: new WorkspaceFileSystem(fs),
    gitFor,
    stateReader: createRepositoryStateReader(gitFor),
  };
}

async function runSteps(
  kind: CompletionKind,
  lesson: LessonDefinition,
  steps: readonly PlayStep[],
  attempt: CompletionAttemptRecord,
) {
  const session =
    kind === "practice"
      ? new PracticeSession(lesson, environment(), attempt)
      : new LearningSession(lesson, environment(), undefined, attempt);
  let snapshot = await session.start();
  for (const step of steps) {
    if (typeof step === "string") snapshot = (await session.execute(step)).snapshot;
    else if ("write" in step) snapshot = await session.writeFile(step.write, step.content);
    else if ("delete" in step) snapshot = await session.deleteFile(step.delete);
    else {
      const editor = snapshot.repository.editor;
      if (!editor) throw new Error(`${lesson.id}: Git is not waiting for an editor`);
      snapshot = (await session.closeEditor(step.editor(editor.content))).snapshot;
    }
  }
  const completed = "solved" in snapshot ? snapshot.solved : snapshot.progress.completed;
  expect(completed, `${kind}:${lesson.id} browser result`).toBe(true);
  const evidence = await session.exportCompletionEvidence();
  if (!evidence) throw new Error(`${lesson.id} produced no completion evidence`);
  return evidence;
}

async function replay(kind: CompletionKind, contentId: string, steps: readonly PlayStep[]) {
  const content = await loadCompletionContent(kind, contentId);
  if (!content) throw new Error(`missing ${kind} ${contentId}`);
  sequence += 1;
  const attempt: CompletionAttemptRecord = {
    id: `reference-${String(sequence)}-${contentId}`,
    userId: "reference-user",
    nonce: `nonce-${String(sequence)}-${contentId}`,
    kind,
    contentId,
    contentVersion: content.version,
    usedAt: null,
    evidenceHash: null,
  };
  const evidence = await runSteps(kind, content.lesson, steps, attempt);
  const started = performance.now();
  const verified = await verifyCompletionEvidence(evidence, attempt, content.lesson);
  const elapsed = performance.now() - started;
  expect(verified.result.completed, `${kind}:${contentId} server result`).toBe(true);
  expect(elapsed, `${kind}:${contentId} verification time`).toBeLessThan(250);
}

describe("server replay of authored reference solutions", () => {
  it.each(Object.entries(LESSON_REFERENCE_SOLUTIONS))(
    "verifies lesson %s exactly as the browser does",
    async (id, steps) => replay("lesson", id, steps),
  );

  it.each(Object.entries(CHALLENGE_REFERENCE_SOLUTIONS))(
    "verifies challenge %s exactly as the browser does",
    async (id, steps) => replay("challenge", id, steps),
  );

  it.each(Object.entries(PRACTICE_REFERENCE_SOLUTIONS))(
    "verifies Practice task %s exactly as the browser does",
    async (id, steps) => replay("practice", id, steps),
  );

  it("accepts an alternative valid route through a lesson", async () => {
    await replay("lesson", "git-commit", ["git add .", 'git commit -m "Add README"']);
  });
});
