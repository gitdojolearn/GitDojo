import { resetLesson, setupLesson, type LessonEnvironment } from "@gitdojo/lesson-engine";
import {
  type CompletionAttemptBinding,
  type CompletionEvidence,
  type LessonDefinition,
  type LessonValidationResult,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { validateLesson } from "@gitdojo/validator";
import {
  WorkspaceSession,
  type CommandOutcome as WorkspaceCommandOutcome,
} from "./workspace-session";

export interface PracticeSnapshot {
  repository: RepositoryState;
  /** Every check right now; the panel never lists them, only whether all hold. */
  validation: LessonValidationResult;
  /** Every check passes at the same time: the end state the mission describes. */
  solved: boolean;
}

export type PracticeCommandOutcome = WorkspaceCommandOutcome<PracticeSnapshot>;

export function workspaceIdForPractice(taskId: string): string {
  return `practice-${taskId}`;
}

/**
 * One attempt at a Practice mode task. Unlike a lesson, progress is not sticky or ordered: the
 * task is solved when the repository is in the mission's end state, all checks at once, however
 * it got there. Checks are validators over repository state, never over the commands typed.
 */
export class PracticeSession extends WorkspaceSession<PracticeSnapshot> {
  readonly taskId: string;
  private completionAttemptIdValue: string | null;
  private completionAttempt: CompletionAttemptBinding | null;
  private started: Promise<unknown> | null = null;
  private latest: PracticeSnapshot | null = null;

  constructor(
    private readonly task: LessonDefinition,
    env: LessonEnvironment,
    completionAttempt: CompletionAttemptBinding | null = null,
  ) {
    super(workspaceIdForPractice(task.id), env);
    this.taskId = task.id;
    this.completionAttempt = completionAttempt;
    this.completionAttemptIdValue = completionAttempt?.id ?? null;
  }

  get completionAttemptId(): string | null {
    return this.completionAttemptIdValue;
  }

  /** Attach a server attempt after a transient startup failure, without resetting the task. */
  async attachCompletionAttempt(binding: CompletionAttemptBinding): Promise<void> {
    this.completionAttempt = binding;
    this.completionAttemptIdValue = binding.id;
    await this.env.gitFor(this.workspaceId).bindCompletionAttempt(binding);
  }

  async start(): Promise<PracticeSnapshot> {
    this.started ??= this.enqueue(async () => {
      const repository = await setupLesson(this.task, this.workspaceId, this.env);
      return this.evaluate(repository);
    });
    await this.started;
    return this.enqueue(() => {
      if (!this.latest) throw new Error("Practice session has not been set up");
      return Promise.resolve(this.latest);
    });
  }

  /** Back to the task's starting state, for another try. */
  reset(): Promise<PracticeSnapshot> {
    return this.enqueue(async () => {
      const repository = await resetLesson(this.task, this.workspaceId, this.env);
      return this.evaluate(repository);
    });
  }

  exportCompletionEvidence(): Promise<CompletionEvidence | null> {
    return this.enqueue(async () => {
      if (!this.completionAttempt) return null;
      const repository = this.requireLatest().repository;
      if (!repository.initialized) return null;
      const git = this.env.gitFor(this.workspaceId);
      await git.bindCompletionAttempt(this.completionAttempt);
      return git.exportCompletionEvidence(repository);
    });
  }

  exportAssessmentEvidence(attemptId: string) {
    return this.enqueue(() =>
      this.env.gitFor(this.workspaceId).exportAssessmentEvidence(attemptId),
    );
  }

  protected async evaluate(repository: RepositoryState): Promise<PracticeSnapshot> {
    if (this.completionAttempt && repository.initialized)
      await this.env.gitFor(this.workspaceId).bindCompletionAttempt(this.completionAttempt);
    const validation = await validateLesson(this.task, { repository });
    this.latest = { repository, validation, solved: validation.completed };
    return this.latest;
  }

  private requireLatest(): PracticeSnapshot {
    if (!this.latest) throw new Error("Practice session has not been set up");
    return this.latest;
  }
}
