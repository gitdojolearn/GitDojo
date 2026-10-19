"use client";

import { type ContentRef } from "@gitdojo/progress";
import {
  lessonTypeOf,
  type CompletionEvidence,
  type LessonDefinition,
} from "@gitdojo/shared-types";
import { useCallback, useEffect, useMemo } from "react";
import { recordCompletion, recordProgress } from "../state/use-progress-store";

export interface LessonProgressTracking {
  /** What completing this workspace counts as. */
  content: ContentRef;
  /** Records a hint the moment it is revealed: its objective and position (0 = first). */
  recordHint: (objectiveId: string, index: number) => void;
}

/**
 * Connects a lesson or challenge workspace to local progress: remembers the lesson as the last
 * one visited, and records completion once the validators say every objective is met.
 *
 * A course's challenge lesson is a lesson; only /challenges pages pass `challenge`, so the same
 * work is never rewarded as both.
 */
export function useLessonProgress({
  lesson,
  courseId,
  challenge,
  completed,
  exportCompletionEvidence,
}: {
  lesson: LessonDefinition;
  courseId?: string;
  challenge: boolean;
  /** From validation of repository state, never from the commands typed. */
  completed: boolean;
  exportCompletionEvidence?: () => Promise<CompletionEvidence | null>;
}): LessonProgressTracking {
  const type = lessonTypeOf(lesson);
  const content = useMemo<ContentRef>(
    () =>
      challenge
        ? { kind: "challenge", id: lesson.id }
        : { kind: "lesson", id: lesson.id, type, ...(courseId ? { courseId } : {}) },
    [challenge, lesson.id, type, courseId],
  );

  useEffect(() => {
    if (courseId) void recordProgress({ type: "visit-lesson", courseId, lessonId: lesson.id });
  }, [courseId, lesson.id]);

  useEffect(() => {
    if (!completed) return;
    void (async () => {
      const evidence = await exportCompletionEvidence?.().catch(() => null);
      await recordCompletion(content, evidence ?? undefined);
    })();
  }, [completed, content, exportCompletionEvidence]);

  const recordHint = useCallback(
    (objectiveId: string, index: number) => {
      void recordProgress({ type: "hint", content, objectiveId, index });
    },
    [content],
  );

  return { content, recordHint };
}
