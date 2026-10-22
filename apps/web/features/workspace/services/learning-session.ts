import {
  advanceProgress,
  createInitialProgress,
  resetLesson,
  setupLesson,
  type LessonEnvironment,
  type LessonProgress,
} from "@gitdojo/lesson-engine";
import {
  type AdaptiveHintRecommendation,
  type CompletionAttemptBinding,
  type CompletionEvidence,
  type LessonDefinition,
  type LessonValidationResult,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { evaluateAdaptiveHints, evaluateTips, validateLesson } from "@gitdojo/validator";
import {
  WorkspaceSession,
  type CommandOutcome as WorkspaceCommandOutcome,
} from "./workspace-session";

export interface SessionSnapshot {
  repository: RepositoryState;
  validation: LessonValidationResult;
  progress: LessonProgress;
  /** Ids of the lesson's tips whose conditions hold right now, in authored order. */
  tips: string[];
  /** The first adaptive hint rule for the current objective that matches right now. */
  adaptiveHint: AdaptiveHintRecommendation | null;
}

export type CommandOutcome = WorkspaceCommandOutcome<SessionSnapshot>;

export function workspaceIdForLesson(lesson: LessonDefinition): string {
  return `lesson-${lesson.id}`;
}

/**
 * One learner's attempt at one lesson. Implements the core loop:
 * command → Git engine → repository state → validation → progress.
 */
export class LearningSession extends WorkspaceSession<SessionSnapshot> {
  readonly lessonId: string;
  private completionAttemptIdValue: string | null;
  private completionAttempt: CompletionAttemptBinding | null;
  private progress: LessonProgress;
  private started: Promise<unknown> | null = null;
  private latest: SessionSnapshot | null = null;
  private readonly checkpoints = new Map<string, CompletionEvidence>();

  constructor(
    private readonly lesson: LessonDefinition,
    env: LessonEnvironment,
    /** Challenges use their own workspaces, so ids never clash with lessons. */
    workspaceId: string = workspaceIdForLesson(lesson),
    completionAttempt: CompletionAttemptBinding | null = null,
    private readonly captureUnboundCheckpoints = false,
  ) {
    super(workspaceId, env);
    this.lessonId = lesson.id;
    this.completionAttempt = completionAttempt;
    this.completionAttemptIdValue = completionAttempt?.id ?? null;
    this.progress = createInitialProgress(lesson);
  }

  get completionAttemptId(): string | null {
    return this.completionAttemptIdValue;
  }

  /** Attach a server attempt after a transient startup failure, without losing the workspace. */
  async attachCompletionAttempt(binding: CompletionAttemptBinding): Promise<void> {
    this.completionAttempt = binding;
    this.completionAttemptIdValue = binding.id;
    await this.env.gitFor(this.workspaceId).bindCompletionAttempt(binding);
  }

  /**
   * Sets up the lesson workspace once, then resolves to the *latest* snapshot. Calling it again
   * (React effects can re-run) never re-runs setup and never returns stale state.
   */
  async start(): Promise<SessionSnapshot> {
    this.started ??= this.enqueue(() => this.setup());
    await this.started;
    // Wait for any queued commands so the snapshot reflects them.
    return this.enqueue(() => Promise.resolve(this.requireLatest()));
  }

  reset(): Promise<SessionSnapshot> {
    return this.enqueue(async () => {
      this.progress = createInitialProgress(this.lesson);
      this.checkpoints.clear();
      const repository = await resetLesson(this.lesson, this.workspaceId, this.env);
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
      const evidence = await git.exportCompletionEvidence(repository);
      const objects = new Map(evidence.objects.map((object) => [object.oid, object]));
      for (const checkpoint of this.checkpoints.values())
        for (const object of checkpoint.objects) objects.set(object.oid, object);
      return {
        ...evidence,
        checkpoints: [...this.checkpoints.entries()].map(([objectiveId, checkpoint]) => ({
          objectiveId,
          state: checkpoint.state,
          index: checkpoint.index,
          workingTree: checkpoint.workingTree,
        })),
        objects: [...objects.values()].sort((a, b) => a.oid.localeCompare(b.oid)),
      };
    });
  }

  private async setup(): Promise<SessionSnapshot> {
    const repository = await setupLesson(this.lesson, this.workspaceId, this.env);
    return this.evaluate(repository);
  }

  protected async evaluate(repository: RepositoryState): Promise<SessionSnapshot> {
    if (repository.initialized && (this.completionAttempt || this.captureUnboundCheckpoints)) {
      await this.env.gitFor(this.workspaceId).bindCompletionAttempt(
        this.completionAttempt ?? {
          id: "pending-verification",
          nonce: "pending-verification",
          kind: "lesson",
          contentId: this.lesson.id,
          contentVersion: "pending",
        },
      );
    }
    const validation = await validateLesson(this.lesson, { repository });
    if (repository.initialized && (this.completionAttempt || this.captureUnboundCheckpoints)) {
      const missing = validation.objectives.filter(
        (result) => result.passed && !this.checkpoints.has(result.objectiveId),
      );
      if (missing.length > 0) {
        const evidence = await this.env
          .gitFor(this.workspaceId)
          .exportCompletionEvidence(repository);
        for (const result of missing) this.checkpoints.set(result.objectiveId, evidence);
      }
    }
    this.progress = advanceProgress(this.lesson, this.progress, validation);
    // Tips describe the state right now, so they are recomputed rather than accumulated: one
    // stops showing the moment the learner resolves what it describes.
    const tips = this.lesson.tips ? await evaluateTips(this.lesson.tips, { repository }) : [];
    const adaptiveHint = await this.matchAdaptiveHint(repository);
    this.latest = { repository, validation, progress: this.progress, tips, adaptiveHint };
    return this.latest;
  }

  /** Recomputed like tips, and only for the objective that is current after this step. */
  private async matchAdaptiveHint(
    repository: RepositoryState,
  ): Promise<AdaptiveHintRecommendation | null> {
    const rules = this.lesson.adaptiveHints;
    const objectiveId = this.progress.currentObjectiveId;
    if (!rules || objectiveId === null) return null;
    const ruleId = await evaluateAdaptiveHints(rules, objectiveId, { repository });
    return ruleId === null ? null : { lessonId: this.lesson.id, objectiveId, ruleId };
  }

  private requireLatest(): SessionSnapshot {
    if (!this.latest) throw new Error("Learning session has not been set up");
    return this.latest;
  }
}
